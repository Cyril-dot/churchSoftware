import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';

/* Delivery order detail — header, lines and shop settings for the invoice. */
export const GET = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();

  const rows = (await sql`
    SELECT o.id, o.invoice_number, o.customer_name, o.contact_name, o.phone, o.address,
           o.status, o.total, o.notes, o.created_by, u.name AS created_by_name,
           o.created_at, o.delivered_at, d.name AS delivered_by_name
      FROM delivery_orders o
      JOIN users u ON u.id = o.created_by
      LEFT JOIN users d ON d.id = o.delivered_by
     WHERE o.id = ${id}
  `) as Record<string, unknown>[];
  const order = rows[0];
  if (!order) throw HttpError.notFound('That delivery order no longer exists.');

  const items = (await sql`
    SELECT i.id, i.product_id, p.name AS product_name, p.sku,
           i.quantity, i.unit_price
      FROM delivery_order_items i
      JOIN products p ON p.id = i.product_id
     WHERE i.order_id = ${id}
     ORDER BY p.name ASC
  `) as Record<string, unknown>[];

  const settings = (await sql`
    SELECT shop_name, currency_code, currency_symbol, receipt_footer, timezone
      FROM settings WHERE id = 1
  `) as Record<string, unknown>[];
  const s = settings[0] ?? {};

  return ok({
    id: order.id as string,
    invoiceNumber: order.invoice_number as string,
    customerName: order.customer_name as string,
    contactName: order.contact_name as string | null,
    phone: order.phone as string | null,
    address: order.address as string | null,
    status: order.status as string,
    total: num(order.total),
    notes: order.notes as string | null,
    createdBy: order.created_by as string,
    createdByName: order.created_by_name as string | null,
    createdAt: order.created_at as string,
    deliveredAt: order.delivered_at as string | null,
    deliveredByName: order.delivered_by_name as string | null,
    items: items.map((i) => ({
      id: i.id as string,
      productId: i.product_id as string,
      productName: i.product_name as string,
      sku: i.sku as string | null,
      quantity: i.quantity as number,
      unitPrice: num(i.unit_price),
      lineTotal: num(i.unit_price) * (i.quantity as number),
    })),
    settings: {
      shopName: (s.shop_name as string) ?? 'Church Bookshop',
      currencyCode: (s.currency_code as string) ?? 'GHS',
      currencySymbol: (s.currency_symbol as string) ?? '₵',
      receiptFooter: (s.receipt_footer as string) ?? '',
      timezone: (s.timezone as string) ?? 'Africa/Accra',
    },
  });
});
