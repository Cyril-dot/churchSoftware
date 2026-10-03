import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

function toCategory(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    parentId: row.parent_id as string | null,
    parentName: row.parent_name as string | null,
    productCount: Number(row.product_count ?? 0),
    createdAt: row.created_at as string,
  };
}

export const GET = handle(async (req) => {
  await requireUser(req);
  const sql = getSql();
  const rows = (await sql`
    SELECT c.id, c.name, c.parent_id, p.name AS parent_name, c.created_at,
           (SELECT COUNT(*)::int FROM products WHERE category_id = c.id AND active) AS product_count
    FROM categories c
    LEFT JOIN categories p ON p.id = c.parent_id
    ORDER BY c.name ASC
  `) as Record<string, unknown>[];
  return ok(rows.map(toCategory));
});

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.string().uuid().nullish(),
});

export const POST = handle(async (req) => {
  await requireUser(req, ['admin', 'manager']);
  const body = createCategorySchema.parse(await req.json());
  const sql = getSql();

  if (body.parentId) {
    const parent = (await sql`SELECT id FROM categories WHERE id = ${body.parentId}`) as { id: string }[];
    if (!parent[0]) throw HttpError.badRequest('INVALID_PARENT', 'That parent category does not exist.');
  }

  const id = randomUUID();
  await sql`
    INSERT INTO categories (id, name, parent_id)
    VALUES (${id}, ${body.name}, ${body.parentId ?? null})
  `;
  const rows = (await sql`
    SELECT c.id, c.name, c.parent_id, p.name AS parent_name, c.created_at,
           0 AS product_count
    FROM categories c
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE c.id = ${id}
  `) as Record<string, unknown>[];
  return ok(toCategory(rows[0]), 201);
});
