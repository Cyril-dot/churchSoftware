import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import {
  handle,
  ok,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  HttpError,
} from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(24).toString('hex'));
  return dummyHashPromise;
}

export const POST = handle(async (req) => {
  const body = loginSchema.parse(await req.json());
  const sql = getSql();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const windowStart = new Date(Date.now() - 15 * 60_000).toISOString();

  const attempts = (await sql`
    SELECT COUNT(*)::int AS n FROM login_attempts
    WHERE NOT succeeded AND created_at > ${windowStart}
      AND (email = ${body.email} OR (${ip}::text IS NOT NULL AND ip = ${ip}))
  `) as { n: number }[];
  if ((attempts[0] as { n: number }).n >= 5) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please try again later.');
  }

  const rows = (await sql`
    SELECT id, name, email, role, password_hash, active, session_version
    FROM users WHERE email = ${body.email}
  `) as Record<string, any>[];
  const user = rows[0] as
    | {
        id: string;
        name: string;
        email: string;
        role: 'admin' | 'manager' | 'cashier';
        password_hash: string;
        active: boolean;
        session_version: number;
      }
    | undefined;

  const authenticated =
    user && user.active
      ? await verifyPassword(body.password, user.password_hash)
      : await verifyPassword(body.password, await getDummyHash()).then(() => false);

  await sql`
    INSERT INTO login_attempts (email, ip, succeeded)
    VALUES (${body.email}, ${ip}, ${authenticated})
  `;

  if (!authenticated || !user) {
    throw HttpError.unauthorized('Incorrect email or password.');
  }

  await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
  await setSessionCookie(user.id, user.session_version);
  return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
});
