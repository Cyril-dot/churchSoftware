import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { getSql } from './db';
import type { Role } from './rbac';

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

const COOKIE_NAME = '__Host-bookshop_session';
const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// ── Password hashing (same scrypt format as the legacy server) ──

export async function hashPassword(pw: string): Promise<string> {
  if (pw.length < 8) throw new Error('Password must be at least 8 characters.');
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(pw, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(pw: string, saved: string): Promise<boolean> {
  try {
    const [salt, hash] = saved.split(':');
    const expected = Buffer.from(hash, 'hex');
    const actual = await scryptAsync(pw, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ── Session JWT ──

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set.');
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string, sessionVersion: number): Promise<string> {
  return await new jose.SignJWT({ sub: userId, v: sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function setSessionCookie(userId: string, sessionVersion: number) {
  const token = await createSession(userId, sessionVersion);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    const userId = payload.sub as string;
    const version = payload.v as number;
    const sql = getSql();
    const rows = (await sql`
      SELECT id, name, email, role, active, session_version
      FROM users WHERE id = ${userId}
    `) as Record<string, any>[];
    const user = rows[0] as any;
    if (!user || !user.active || user.session_version !== version) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
  } catch {
    return null;
  }
}

export async function requireUser(req: NextRequest, roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) {
    throw HttpError.unauthorized('Your session has expired. Please sign in again.');
  }
  if (roles && !roles.includes(user.role)) {
    throw HttpError.forbidden('You do not have permission to do that.');
  }
  return user;
}

// ── HTTP error helper ──

export class HttpError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
  static badRequest(code: string, message: string, fields?: Record<string, string>) {
    return new HttpError(400, code, message, fields);
  }
  static unauthorized(message = 'Please sign in.') {
    return new HttpError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to do that.') {
    return new HttpError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Not found.') {
    return new HttpError(404, 'NOT_FOUND', message);
  }
  static conflict(code: string, message: string) {
    return new HttpError(409, code, message);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof z.ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || 'body';
      if (!fields[path]) fields[path] = issue.message;
    }
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Please check the highlighted fields.', fields } },
      { status: 400 }
    );
  }
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, fields: err.fields } },
      { status: err.status }
    );
  }
  // Map Postgres function error codes
  if (err instanceof Error) {
    const msg = err.message;
    const code = msg.split(':')[0].trim();
    const detail = msg.includes(':') ? msg.split(':').slice(1).join(':').trim() : '';
    const map: Record<string, [number, string, string]> = {
      EMPTY_CART: [400, 'EMPTY_CART', 'Your cart is empty.'],
      INVALID_QUANTITY: [400, 'INVALID_QUANTITY', 'Please check the quantities.'],
      INVALID_DISCOUNT: [400, 'INVALID_DISCOUNT', 'That discount is not valid.'],
      TENDERED_TOO_LOW: [400, 'TENDERED_TOO_LOW', 'The amount tendered is less than the total.'],
      INVALID_TYPE: [400, 'INVALID_TYPE', 'Invalid adjustment type.'],
      INSUFFICIENT_STOCK: [409, 'INSUFFICIENT_STOCK', detail ? `Only limited stock left of ${detail}.` : 'Not enough stock.'],
      ITEM_NOT_FOUND: [404, 'ITEM_NOT_FOUND', 'That item no longer exists.'],
      SALE_NOT_FOUND: [404, 'SALE_NOT_FOUND', 'That sale no longer exists.'],
      ALREADY_VOIDED: [409, 'ALREADY_VOIDED', 'This sale has already been voided.'],
      PURCHASE_NOT_RECEIVABLE: [409, 'PURCHASE_NOT_RECEIVABLE', 'This order cannot be received.'],
    };
    if (map[code]) {
      const [status, errCode, message] = map[code];
      return NextResponse.json({ error: { code: errCode, message } }, { status });
    }
    // Unique violation
    if ((err as any).code === '23505') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE', message: 'That value is already in use.' } },
        { status: 409 }
      );
    }
  }
  console.error('Unhandled API error:', err);
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } },
    { status: 500 }
  );
}

// Route handler wrapper: auth → role check → zod → query → ok()
export function handle(
  fn: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      // Demo mode: no DATABASE_URL → serve mock data
      if (!process.env.DATABASE_URL) {
        const { demoDispatch } = await import('./demo-api');
        return await demoDispatch(req);
      }
      // CSRF: mutations need JSON content-type + same-origin
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const ct = req.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          return NextResponse.json(
            { error: { code: 'BAD_REQUEST', message: 'Content-Type must be application/json.' } },
            { status: 400 }
          );
        }
      }
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

// ── Server-component session helper (no NextRequest available) ──

async function lookupSessionUser(userId: string, version: number): Promise<SessionUser | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, name, email, role, active, session_version
    FROM users WHERE id = ${userId}
  `) as Record<string, any>[];
  const user = rows[0] as any;
  if (!user || !user.active || user.session_version !== version) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
}

/** Read + verify the session cookie via next/headers. For use in Server Components. */
export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  const store = await cookies();
  // Demo mode: mock session from demo cookie
  if (!process.env.DATABASE_URL) {
    const demoId = store.get('bookshop_demo_session')?.value;
    if (demoId) {
      const { DEMO_USERS } = await import('./demo-data');
      const u = DEMO_USERS.find((x) => x.id === demoId);
      if (u) return { id: u.id, name: u.name, email: u.email, role: u.role };
    }
    return null;
  }
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    return await lookupSessionUser(payload.sub as string, payload.v as number);
  } catch {
    return null;
  }
}

/** Name of the session cookie (also used by middleware). */
export const SESSION_COOKIE_NAME = COOKIE_NAME;
