import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

const patchUserSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    role: z.enum(['admin', 'manager', 'cashier']).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const PATCH = handle(async (req, ctx) => {
  const actor = await requireUser(req, ['admin']);
  const { id } = await ctx.params;
  const body = patchUserSchema.parse(await req.json());
  const sql = getSql();

  const rows = (await sql`
    SELECT id, name, email, role, active FROM users WHERE id = ${id}
  `) as { id: string; name: string; email: string; role: string; active: boolean }[];
  const target = rows[0];
  if (!target) throw HttpError.notFound('That user no longer exists.');

  const newRole = body.role ?? target.role;
  const newActive = body.active ?? target.active;
  const roleChanged = newRole !== target.role;
  const deactivated = target.active && !newActive;

  if (target.role === 'admin' && target.active && (newRole !== 'admin' || !newActive)) {
    const others = (await sql`
      SELECT COUNT(*)::int AS n FROM users
      WHERE role = 'admin' AND active AND id <> ${id}
    `) as { n: number }[];
    if (others[0].n === 0) {
      throw HttpError.conflict(
        'LAST_ADMIN',
        'You cannot demote or deactivate the last active admin.'
      );
    }
  }

  if (id === actor.id && (newRole !== 'admin' || !newActive)) {
    throw HttpError.conflict('SELF_LOCKOUT', 'You cannot demote or deactivate your own account.');
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.name !== undefined) {
    params.push(body.name);
    sets.push(`name = $${params.length}`);
  }
  if (body.email !== undefined) {
    params.push(body.email);
    sets.push(`email = $${params.length}`);
  }
  if (roleChanged || deactivated) {
    sets.push('session_version = session_version + 1');
  }
  params.push(newRole, newActive, id);
  const rows2 = (await sql.query(
    `UPDATE users SET ${sets.length ? sets.join(', ') + ', ' : ''}role = $${params.length - 2}, active = $${params.length - 1}
     WHERE id = $${params.length}
     RETURNING id, name, email, role, active, last_login_at, must_change_password, created_at`,
    params
  )) as Record<string, unknown>[];
  const u = rows2[0];
  return ok({
    id: u.id as string,
    name: u.name as string,
    email: u.email as string,
    role: u.role as string,
    active: u.active as boolean,
    lastLoginAt: u.last_login_at as string | null,
    mustChangePassword: u.must_change_password as boolean,
    createdAt: u.created_at as string,
  });
});
