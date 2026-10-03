import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, hashPassword, setSessionCookie, HttpError } from '@/lib/auth';

const setupSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(200),
});

export const POST = handle(async (req) => {
  const body = setupSchema.parse(await req.json());

  const expected = process.env.SETUP_TOKEN;
  if (!expected) throw HttpError.badRequest('SETUP_DISABLED', 'Initial setup is not enabled.');
  const a = Buffer.from(body.token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw HttpError.forbidden('That setup token is not valid.');
  }

  const sql = getSql();
  const userId = randomUUID();
  const passwordHash = await hashPassword(body.password);

  /* Race-safe: the INSERT only happens if no admin exists yet, atomically. */
  const inserted = (await sql`
    INSERT INTO users (id, name, email, password_hash, role)
    SELECT ${userId}, ${body.name}, ${body.email}, ${passwordHash}, 'admin'
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
    RETURNING id
  `) as { id: string }[];
  if (inserted.length === 0) {
    throw HttpError.conflict('ALREADY_SETUP', 'An admin account already exists.');
  }

  await setSessionCookie(userId, 1);
  return ok({ id: userId, name: body.name, email: body.email, role: 'admin' }, 201);
});
