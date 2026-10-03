import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  handle,
  ok,
  requireUser,
  verifyPassword,
  hashPassword,
  HttpError,
} from '@/lib/auth';
import { getSql } from '@/lib/db';

const schema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
});

export const POST = handle(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = schema.parse(await req.json());

  const sql = getSql();
  const rows = (await sql`SELECT password_hash FROM users WHERE id = ${user.id}`) as { password_hash: string }[];
  const row = rows[0] as { password_hash: string } | undefined;

  if (!row || !(await verifyPassword(body.currentPassword, row.password_hash))) {
    throw HttpError.badRequest('INVALID_PASSWORD', 'Your current password is incorrect.');
  }

  const hash = await hashPassword(body.newPassword);
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${user.id}`;

  return ok({ changed: true });
});
