import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { money, num, parsePagination, pageEnvelope, cursorCondition, type CursorRow } from '@/lib/api-utils';

const MANAGER_COLS = `
  p.id, p.name, p.author_or_brand, p.sku, p.barcode, p.cover_photo_url, p.reference,
  p.product_type, p.category_id,
  c.name AS category_name, p.supplier_id, s.name AS supplier_name,
  p.cost_price, p.selling_price,
  p.price_bishop, p.price_sons_of_prophet, p.price_pastor_deji,
  p.quantity_on_hand,
  p.quantity_shop, p.quantity_warehouse, p.reorder_level,
  p.active, p.created_at, p.updated_at
`;
const CASHIER_COLS = `
  p.id, p.name, p.author_or_brand, p.sku, p.barcode, p.cover_photo_url, p.reference,
  p.product_type, p.category_id,
  c.name AS category_name,
  p.selling_price,
  p.price_bishop, p.price_sons_of_prophet, p.price_pastor_deji,
  p.quantity_on_hand,
  p.quantity_shop, p.quantity_warehouse, p.reorder_level,
  p.active, p.created_at, p.updated_at
`;

function toProduct(row: Record<string, unknown>, full: boolean) {
  const base = {
    id: row.id as string,
    name: row.name as string,
    authorOrBrand: row.author_or_brand as string | null,
    sku: row.sku as string | null,
    barcode: row.barcode as string | null,
    coverPhotoUrl: row.cover_photo_url as string | null,
    reference: row.reference as string | null,
    productType: row.product_type as string,
    categoryId: row.category_id as string | null,
    categoryName: row.category_name as string | null,
    sellingPrice: num(row.selling_price),
    priceBishop: row.price_bishop != null ? num(row.price_bishop) : null,
    priceSonsOfProphet: row.price_sons_of_prophet != null ? num(row.price_sons_of_prophet) : null,
    pricePastorDeji: row.price_pastor_deji != null ? num(row.price_pastor_deji) : null,
    quantityOnHand: row.quantity_on_hand as number,
    quantityShop: row.quantity_shop as number,
    quantityWarehouse: row.quantity_warehouse as number,
    reorderLevel: row.reorder_level as number,
    active: row.active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
  return full
    ? {
        ...base,
        supplierId: row.supplier_id as string | null,
        supplierName: row.supplier_name as string | null,
        costPrice: num(row.cost_price),
      }
    : base;
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const full = user.role !== 'cashier';
  const sp = req.nextUrl.searchParams;
  const { limit, cursorTs, cursorId } = parsePagination(sp);
  const search = sp.get('search')?.trim() || null;
  const categoryId = sp.get('categoryId') || null;
  const lowStock = sp.get('lowStock') === 'true';
  const includeArchived = sp.get('includeArchived') === 'true' && full;

  const sql = getSql();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!includeArchived) conditions.push('p.active');
  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(p.name ILIKE $${params.length} OR p.author_or_brand ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`
    );
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`p.category_id = $${params.length}`);
  }
  if (lowStock) conditions.push('p.quantity_on_hand <= p.reorder_level');
  cursorCondition(conditions, params, cursorTs, cursorId);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit + 1);
  const text = `
    SELECT ${full ? MANAGER_COLS : CASHIER_COLS}
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ${where}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT $${params.length}
  `;
  const rows = (await sql.query(text, params)) as Record<string, unknown>[];
  const page = pageEnvelope(rows as unknown as CursorRow[], limit);
  return ok({ items: page.items.map((r) => toProduct(r as Record<string, unknown>, full)), nextCursor: page.nextCursor });
});

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(500),
  authorOrBrand: z.string().trim().max(500).nullish(),
  sku: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => (v === '' ? null : v)),
  barcode: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => (v === '' ? null : v)),
  coverPhotoUrl: z.string().trim().max(2000000).nullish(),
  reference: z.string().trim().max(200).nullish()
    .transform((v) => (v === '' ? null : v)),
  productType: z.string().trim().max(50).default('book'),
  categoryId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  costPrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  priceBishop: z.number().min(0).nullish(),
  priceSonsOfProphet: z.number().min(0).nullish(),
  pricePastorDeji: z.number().min(0).nullish(),
  quantityShop: z.number().int().min(0).default(0),
  quantityWarehouse: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(0),
});

export const POST = handle(async (req) => {
  const user = await requireUser(req, ['admin', 'manager']);
  const body = createProductSchema.parse(await req.json());
  const sql = getSql();

  if (body.categoryId) {
    const cat = (await sql`SELECT id FROM categories WHERE id = ${body.categoryId}`) as { id: string }[];
    if (!cat[0]) throw HttpError.badRequest('INVALID_CATEGORY', 'That category does not exist.');
  }
  if (body.supplierId) {
    const sup = (await sql`SELECT id FROM suppliers WHERE id = ${body.supplierId} AND active`) as { id: string }[];
    if (!sup[0]) throw HttpError.badRequest('INVALID_SUPPLIER', 'That supplier does not exist.');
  }

  const id = randomUUID();
  const totalOpening = body.quantityShop + body.quantityWarehouse;
  /* Non-interactive transaction: product + opening-stock movement atomically. */
  await sql.transaction([
    sql`
      INSERT INTO products
        (id, name, author_or_brand, sku, barcode, cover_photo_url, reference, product_type, category_id, supplier_id,
         cost_price, selling_price, price_bishop, price_sons_of_prophet, price_pastor_deji,
         quantity_shop, quantity_warehouse,
         quantity_on_hand, reorder_level)
      VALUES
        (${id}, ${body.name}, ${body.authorOrBrand ?? null}, ${body.sku ?? null},
         ${body.barcode ?? null}, ${body.coverPhotoUrl ?? null}, ${body.reference ?? null},
         ${body.productType}, ${body.categoryId ?? null}, ${body.supplierId ?? null},
         ${body.costPrice}, ${body.sellingPrice},
         ${body.priceBishop ?? body.sellingPrice}, ${body.priceSonsOfProphet ?? body.sellingPrice}, ${body.pricePastorDeji ?? body.sellingPrice},
         ${body.quantityShop}, ${body.quantityWarehouse},
         ${totalOpening}, ${body.reorderLevel})
    `,
    ...(totalOpening > 0
      ? [sql`
        INSERT INTO stock_movements
          (id, product_id, movement_type, quantity_change, unit_cost, notes, created_by)
        VALUES
          (${randomUUID()}, ${id}, 'adjustment', ${totalOpening},
           ${body.costPrice}, 'Opening stock', ${user.id})
      `]
      : []),
  ]);

  const rows = await sql`
    SELECT ${sql.unsafe(MANAGER_COLS)}
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ${id}
  `;
  const created = (rows as Record<string, unknown>[])[0];
  return ok(toProduct(created, true), 201);
});
