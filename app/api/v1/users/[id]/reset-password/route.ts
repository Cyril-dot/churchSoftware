import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, hashPassword, HttpError } from '@/lib/auth';

const resetSchema = z.object({
  password: z.string().min(8).max(200),
});

export const POST = handle(async (req, ctx) => {
  await requireUser(req, ['admin']);
  const { id } = await ctx.params;
  const body = resetSchema.parse(await req.json());
  const sql = getSql();

  const passwordHash = await hashPassword(body.password);
  const rows = (await sql`
    UPDATE users
    SET password_hash = ${passwordHash},
        session_version = session_version + 1,
        must_change_password = true
    WHERE id = ${id}
    RETURNING id
  `) as { id: string }[];
  if (!rows[0]) throw HttpError.notFound('That user no longer exists.');
  return ok({ id, passwordReset: true });
});
