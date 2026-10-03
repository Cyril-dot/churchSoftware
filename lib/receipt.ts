import { num } from './api-utils';

type Sql = ReturnType<typeof import('./db').getSql>;

export interface ReceiptItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  lineTotal: number;
}

export async function getReceipt(sql: Sql, saleId: string, includeCost: boolean) {
  const sales = (await sql`
    SELECT s.id, s.receipt_number, s.payment_method, s.subtotal, s.discount, s.total,
           s.amount_tendered, s.payment_reference, s.note, s.status, s.sold_by,
           u.name AS sold_by_name, s.sold_at, s.voided_at, s.voided_by,
           v.name AS voided_by_name, s.void_reason
    FROM sales s
    JOIN users u ON u.id = s.sold_by
    LEFT JOIN users v ON v.id = s.voided_by
    WHERE s.id = ${saleId}
  `) as Record<string, unknown>[];
  const sale = sales[0];
  if (!sale) return null;

  const itemRows = (await sql`
    SELECT si.id, si.product_id, p.name AS product_name, si.quantity,
           si.unit_price, si.unit_cost
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = ${saleId}
    ORDER BY p.name ASC
  `) as Record<string, unknown>[];

  const settings = (await sql`
    SELECT shop_name, currency_code, currency_symbol, receipt_footer, timezone
    FROM settings WHERE id = 1
  `) as Record<string, unknown>[];

  const total = num(sale.total);
  const tendered = sale.amount_tendered == null ? null : num(sale.amount_tendered);

  const items: ReceiptItem[] = itemRows.map((i) => ({
    id: i.id as string,
    productId: i.product_id as string,
    productName: i.product_name as string,
    quantity: i.quantity as number,
    unitPrice: num(i.unit_price),
    unitCost: includeCost ? num(i.unit_cost) : null,
    lineTotal: num(i.unit_price) * (i.quantity as number),
  }));

  const s = settings[0] ?? {};
  return {
    sale: {
      id: sale.id as string,
      receiptNumber: sale.receipt_number as string,
      paymentMethod: sale.payment_method as string,
      subtotal: sale.subtotal == null ? null : num(sale.subtotal),
      discount: num(sale.discount),
      total,
      amountTendered: tendered,
      change: tendered == null ? null : tendered - total,
      paymentReference: sale.payment_reference as string | null,
      note: sale.note as string | null,
      status: sale.status as string,
      soldBy: sale.sold_by as string,
      soldByName: sale.sold_by_name as string,
      soldAt: sale.sold_at as string,
      voidedAt: sale.voided_at as string | null,
      voidedBy: sale.voided_by as string | null,
      voidedByName: sale.voided_by_name as string | null,
      voidReason: sale.void_reason as string | null,
    },
    items,
    settings: {
      shopName: (s.shop_name as string) ?? 'Church Bookshop',
      currencyCode: (s.currency_code as string) ?? 'GHS',
      currencySymbol: (s.currency_symbol as string) ?? '₵',
      receiptFooter: (s.receipt_footer as string) ?? '',
      timezone: (s.timezone as string) ?? 'Africa/Accra',
    },
  };
}
