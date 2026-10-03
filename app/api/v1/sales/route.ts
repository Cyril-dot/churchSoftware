import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { getReceipt } from '@/lib/receipt';
import { num, parsePagination, pageEnvelope, cursorCondition, type CursorRow } from '@/lib/api-utils';

const PAYMENT_METHODS = ['cash', 'card', 'mobile_money', 'bank_transfer', 'other'] as const;
const STATUSES = ['completed', 'voided'] as const;

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const sp = req.nextUrl.searchParams;
  const { limit, cursorTs, cursorId } = parsePagination(sp);
  const from = sp.get('from');
  const to = sp.get('to');
  const paymentMethod = sp.get('paymentMethod');
  const status = sp.get('status');

  if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    throw HttpError.badRequest('INVALID_PAYMENT_METHOD', 'Unknown payment method.');
  }
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    throw HttpError.badRequest('INVALID_STATUS', 'Unknown sale status.');
  }

  const sql = getSql();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (user.role === 'cashier') {
    params.push(user.id);
    conditions.push(`s.sold_by = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`s.sold_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`s.sold_at <= $${params.length}`);
  }
  if (paymentMethod) {
    params.push(paymentMethod);
    conditions.push(`s.payment_method = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }
  cursorCondition(conditions, params, cursorTs, cursorId, 's.sold_at');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit + 1);

  const rows = (await sql.query(
    `SELECT s.id, s.receipt_number, s.payment_method, s.subtotal, s.discount, s.total,
            s.amount_tendered, s.payment_reference, s.status, s.sold_by,
            u.name AS sold_by_name, s.sold_at,
            (SELECT COUNT(*)::int FROM sale_items WHERE sale_id = s.id) AS item_count
     FROM sales s
     JOIN users u ON u.id = s.sold_by
     ${where}
     ORDER BY s.sold_at DESC, s.id DESC
     LIMIT $${params.length}`,
    params
  )) as Record<string, unknown>[];

  const page = pageEnvelope(rows as unknown as CursorRow[], limit);
  return ok({
    items: page.items.map((r) => {
      const s = r as Record<string, unknown>;
      const total = num(s.total);
      const tendered = s.amount_tendered == null ? null : num(s.amount_tendered);
      return {
        id: s.id as string,
        receiptNumber: s.receipt_number as string,
        paymentMethod: s.payment_method as string,
        subtotal: s.subtotal == null ? null : num(s.subtotal),
        discount: num(s.discount),
        total,
        amountTendered: tendered,
        change: tendered == null ? null : tendered - total,
        paymentReference: s.payment_reference as string | null,
        status: s.status as string,
        soldBy: s.sold_by as string,
        soldByName: s.sold_by_name as string,
        soldAt: s.sold_at as string,
        itemCount: s.item_count as number,
      };
    }),
    nextCursor: page.nextCursor,
  });
});

const createSaleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(10_000),
      })
    )
    .min(1)
    .max(500),
  paymentMethod: z.enum(PAYMENT_METHODS),
  discount: z.number().min(0).default(0),
  amountTendered: z.number().min(0).nullish(),
  paymentReference: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(2000).nullish(),
  idempotencyKey: z.string().uuid().nullish(),
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = createSaleSchema.parse(await req.json());
  const sql = getSql();

  const itemsJson = body.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
  const rows = (await sql`
    SELECT record_sale(
      ${user.id},
      ${JSON.stringify(itemsJson)}::jsonb,
      ${body.paymentMethod},
      ${body.discount},
      ${body.amountTendered ?? null},
      ${body.paymentReference ?? null},
      ${body.note ?? null},
      ${body.idempotencyKey ?? null}
    ) AS id
  `) as { id: string }[];

  const receipt = await getReceipt(sql, rows[0].id, user.role !== 'cashier');
  return ok(receipt, 201);
});
