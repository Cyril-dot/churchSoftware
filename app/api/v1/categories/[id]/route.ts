import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

const patchCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .strict();

async function ancestors(sql: ReturnType<typeof getSql>, startId: string): Promise<Set<string>> {
  const seen = new Set<string>();
  let current: string | null = startId;
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    const rows = (await sql`SELECT parent_id FROM categories WHERE id = ${current}`) as {
      parent_id: string | null;
    }[];
    current = rows[0]?.parent_id ?? null;
  }
  return seen;
}

export const PATCH = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const body = patchCategorySchema.parse(await req.json());
  const sql = getSql();

  const existing = (await sql`SELECT id FROM categories WHERE id = ${id}`) as { id: string }[];
  if (!existing[0]) throw HttpError.notFound('That category no longer exists.');

  if (body.parentId !== undefined) {
    if (body.parentId === id) {
      throw HttpError.badRequest('CYCLE', 'A category cannot be its own parent.');
    }
    if (body.parentId) {
      const parent = (await sql`SELECT id FROM categories WHERE id = ${body.parentId}`) as {
        id: string;
      }[];
      if (!parent[0]) throw HttpError.badRequest('INVALID_PARENT', 'That parent category does not exist.');
      const ups = await ancestors(sql, body.parentId);
      if (ups.has(id)) {
        throw HttpError.badRequest('CYCLE', 'That would create a circular category hierarchy.');
      }
    }
    await sql`UPDATE categories SET parent_id = ${body.parentId} WHERE id = ${id}`;
  }
  if (body.name !== undefined) {
    await sql`UPDATE categories SET name = ${body.name} WHERE id = ${id}`;
  }

  const rows = (await sql`
    SELECT c.id, c.name, c.parent_id, p.name AS parent_name, c.created_at
    FROM categories c
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE c.id = ${id}
  `) as Record<string, unknown>[];
  const row = rows[0];
  return ok({
    id: row.id as string,
    name: row.name as string,
    parentId: row.parent_id as string | null,
    parentName: row.parent_name as string | null,
    createdAt: row.created_at as string,
  });
});

export const DELETE = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();

  const children = (await sql`SELECT COUNT(*)::int AS n FROM categories WHERE parent_id = ${id}`) as {
    n: number;
  }[];
  if (children[0].n > 0) {
    throw HttpError.conflict('HAS_CHILDREN', 'Remove or reassign the sub-categories first.');
  }
  const rows = (await sql`DELETE FROM categories WHERE id = ${id} RETURNING id`) as {
    id: string;
  }[];
  if (!rows[0]) throw HttpError.notFound('That category no longer exists.');
  return ok({ id, deleted: true });
});
