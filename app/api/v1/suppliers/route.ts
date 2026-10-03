import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';
import { parsePagination, pageEnvelope, cursorCondition, type CursorRow } from '@/lib/api-utils';

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

export const GET = handle(async (req) => {
  await requireUser(req);
  const sp = req.nextUrl.searchParams;
  const { limit, cursorTs, cursorId } = parsePagination(sp);
  const search = sp.get('search')?.trim() || null;
  const includeInactive = sp.get('includeInactive') === 'true';

  const sql = getSql();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (!includeInactive) conditions.push('active');
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  cursorCondition(conditions, params, cursorTs, cursorId);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit + 1);

  const rows = (await sql.query(
    `SELECT id, name, contact_person, phone, email, address, active, created_at
     FROM suppliers ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  )) as Record<string, unknown>[];

  const page = pageEnvelope(rows as unknown as CursorRow[], limit);
  return ok({ items: page.items.map((r) => toSupplier(r as Record<string, unknown>)), nextCursor: page.nextCursor });
});

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(300),
  contactPerson: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(50).nullish(),
  email: z.string().trim().email().max(255).nullish(),
  address: z.string().trim().max(1000).nullish(),
});

export const POST = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const body = supplierSchema.parse(await req.json());
  const sql = getSql();
  const id = randomUUID();
  await sql`
    INSERT INTO suppliers (id, name, contact_person, phone, email, address)
    VALUES (${id}, ${body.name}, ${body.contactPerson ?? null}, ${body.phone ?? null},
            ${body.email ?? null}, ${body.address ?? null})
  `;
  const rows = (await sql`
    SELECT id, name, contact_person, phone, email, address, active, created_at
    FROM suppliers WHERE id = ${id}
  `) as Record<string, unknown>[];
  return ok(toSupplier(rows[0]), 201);
});
