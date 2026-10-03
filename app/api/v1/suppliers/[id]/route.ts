import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

function toSupplier(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    contactPerson: row.contact_person as string | null,
    phone: row.phone as string | null,
    email: row.email as string | null,
    address: row.address as string | null,
    active: row.active as boolean,
    createdAt: row.created_at as string,
  };
}

const patchSupplierSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    contactPerson: z.string().trim().max(200).nullish(),
    phone: z.string().trim().max(50).nullish(),
    email: z.string().trim().email().max(255).nullish(),
    address: z.string().trim().max(1000).nullish(),
  })
  .strict();

const COL_MAP: Record<string, string> = {
  name: 'name',
  contactPerson: 'contact_person',
  phone: 'phone',
  email: 'email',
  address: 'address',
};

export const PATCH = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const body = patchSupplierSchema.parse(await req.json());
  const sql = getSql();

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(COL_MAP)) {
    const value = (body as Record<string, unknown>)[key];
    if (value !== undefined) {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (!sets.length) throw HttpError.badRequest('EMPTY_PATCH', 'Nothing to update.');
  params.push(id);
  const rows = (await sql.query(
    `UPDATE suppliers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING
     id, name, contact_person, phone, email, address, active, created_at`,
    params
  )) as Record<string, unknown>[];
  if (!rows[0]) throw HttpError.notFound('That supplier no longer exists.');
  return ok(toSupplier(rows[0]));
});

export const DELETE = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();
  const rows = (await sql`
    UPDATE suppliers SET active = false WHERE id = ${id} AND active RETURNING id
  `) as { id: string }[];
  if (!rows[0]) throw HttpError.notFound('That supplier no longer exists.');
  return ok({ id, archived: true });
});
