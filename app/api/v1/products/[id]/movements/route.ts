import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { money, parsePagination, pageEnvelope, cursorCondition, type CursorRow } from '@/lib/api-utils';

export const GET = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const { limit, cursorTs, cursorId } = parsePagination(req.nextUrl.searchParams);
  const sql = getSql();

  const product = (await sql`SELECT id FROM products WHERE id = ${id}`) as { id: string }[];
  if (!product[0]) throw HttpError.notFound('That product no longer exists.');

  const conditions = ['m.product_id = $1'];
  const params: unknown[] = [id];
  cursorCondition(conditions, params, cursorTs, cursorId);
  params.push(limit + 1);

  const rows = (await sql.query(
    `SELECT m.id, m.movement_type, m.quantity_change, m.unit_cost,
            m.reference_type, m.reference_id, m.notes, m.created_by,
            u.name AS created_by_name, m.created_at
     FROM stock_movements m
     LEFT JOIN users u ON u.id = m.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $${params.length}`,
    params
  )) as Record<string, unknown>[];

  const page = pageEnvelope(rows as unknown as CursorRow[], limit);
  return ok({
    items: page.items.map((r) => {
      const m = r as Record<string, unknown>;
      return {
        id: m.id as string,
        movementType: m.movement_type as string,
        quantityChange: m.quantity_change as number,
        unitCost: money(m.unit_cost),
        referenceType: m.reference_type as string | null,
        referenceId: m.reference_id as string | null,
        notes: m.notes as string | null,
        createdBy: m.created_by as string,
        createdByName: m.created_by_name as string | null,
        createdAt: m.created_at as string,
      };
    }),
    nextCursor: page.nextCursor,
  });
});
