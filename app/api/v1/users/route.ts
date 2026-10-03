import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { hashPassword } from '@/lib/auth';
import { parsePagination, pageEnvelope, cursorCondition, type CursorRow } from '@/lib/api-utils';

function toUser(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as string,
    active: row.active as boolean,
    lastLoginAt: row.last_login_at as string | null,
    mustChangePassword: row.must_change_password as boolean,
    createdAt: row.created_at as string,
  };
}

export const GET = handle(async (req) => {
  await requireUser(req, ['admin']);
  const sp = req.nextUrl.searchParams;
  const { limit, cursorTs, cursorId } = parsePagination(sp);
  const role = sp.get('role');
  const includeInactive = sp.get('includeInactive') === 'true';

  const sql = getSql();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (!includeInactive) conditions.push('active');
  if (role && ['admin', 'manager', 'cashier'].includes(role)) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }
  cursorCondition(conditions, params, cursorTs, cursorId);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit + 1);

  const rows = (await sql.query(
    `SELECT id, name, email, role, active, last_login_at, must_change_password, created_at
     FROM users ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  )) as Record<string, unknown>[];

  const page = pageEnvelope(rows as unknown as CursorRow[], limit);
  return ok({ items: page.items.map((r) => toUser(r as Record<string, unknown>)), nextCursor: page.nextCursor });
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'manager', 'cashier']),
});

export const POST = handle(async (req) => {
  await requireUser(req, ['admin']);
  const body = createUserSchema.parse(await req.json());
  const sql = getSql();
  const id = randomUUID();
  const passwordHash = await hashPassword(body.password);
  await sql`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (${id}, ${body.name}, ${body.email}, ${passwordHash}, ${body.role})
  `;
  const rows = (await sql`
    SELECT id, name, email, role, active, last_login_at, must_change_password, created_at
    FROM users WHERE id = ${id}
  `) as Record<string, unknown>[];
  return ok(toUser(rows[0]), 201);
});
