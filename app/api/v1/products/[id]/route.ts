import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';
import { num } from '@/lib/api-utils';

const MANAGER_COLS = `
  p.id, p.name, p.author_or_brand, p.sku, p.product_type, p.category_id,
  c.name AS category_name, p.supplier_id, s.name AS supplier_name,
  p.cost_price, p.selling_price, p.quantity_on_hand, p.reorder_level,
  p.active, p.created_at, p.updated_at
`;
const CASHIER_COLS = `
  p.id, p.name, p.author_or_brand, p.sku, p.product_type, p.category_id,
  c.name AS category_name,
  p.selling_price, p.quantity_on_hand, p.reorder_level,
  p.active, p.created_at, p.updated_at
`;

function toProduct(row: Record<string, unknown>, full: boolean) {
  const base = {
    id: row.id as string,
    name: row.name as string,
    authorOrBrand: row.author_or_brand as string | null,
    sku: row.sku as string | null,
    productType: row.product_type as string,
    categoryId: row.category_id as string | null,
    categoryName: row.category_name as string | null,
    sellingPrice: num(row.selling_price),
    quantityOnHand: row.quantity_on_hand as number,
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

async function fetchProduct(id: string, full: boolean, includeArchived: boolean) {
  const sql = getSql();
  const rows = await sql`
    SELECT ${sql.unsafe(full ? MANAGER_COLS : CASHIER_COLS)}
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ${id} AND (p.active OR ${includeArchived})
  `;
  return (rows as Record<string, unknown>[])[0] as Record<string, unknown> | undefined;
}

export const GET = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const full = user.role !== 'cashier';
  const product = await fetchProduct(id, full, full);
  if (!product) throw HttpError.notFound('That product no longer exists.');
  return ok(toProduct(product, full));
});

const patchProductSchema = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    authorOrBrand: z.string().trim().max(500).nullish(),
    sku: z
      .string()
      .trim()
      .max(100)
      .nullish()
      .transform((v) => (v === '' ? null : v))
      .optional(),
    barcode: z
      .string()
      .trim()
      .max(100)
      .nullish()
      .transform((v) => (v === '' ? null : v))
      .optional(),
    coverPhotoUrl: z.string().trim().max(2000000).nullish(),
    reference: z.string().trim().max(200).nullish()
      .transform((v) => (v === '' ? null : v))
      .optional(),
    productType: z.string().trim().max(50).optional(),
    categoryId: z.string().uuid().nullish(),
    supplierId: z.string().uuid().nullish(),
    costPrice: z.number().min(0).optional(),
    sellingPrice: z.number().min(0).optional(),
    priceBishop: z.number().min(0).nullish(),
    priceSonsOfProphet: z.number().min(0).nullish(),
    pricePastorDeji: z.number().min(0).nullish(),
    reorderLevel: z.number().int().min(0).optional(),
    quantityOnHand: z.never().optional(),
    quantity_on_hand: z.never().optional(),
  })
  .strict();

const COL_MAP: Record<string, string> = {
  name: 'name',
  authorOrBrand: 'author_or_brand',
  sku: 'sku',
  barcode: 'barcode',
  coverPhotoUrl: 'cover_photo_url',
  reference: 'reference',
  productType: 'product_type',
  categoryId: 'category_id',
  supplierId: 'supplier_id',
  costPrice: 'cost_price',
  sellingPrice: 'selling_price',
  priceBishop: 'price_bishop',
  priceSonsOfProphet: 'price_sons_of_prophet',
  pricePastorDeji: 'price_pastor_deji',
  reorderLevel: 'reorder_level',
};

export const PATCH = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const body = patchProductSchema.parse(await req.json());
  const sql = getSql();

  const existing = await fetchProduct(id, true, true);
  if (!existing) throw HttpError.notFound('That product no longer exists.');

  if (body.categoryId) {
    const cat = (await sql`SELECT id FROM categories WHERE id = ${body.categoryId}`) as { id: string }[];
    if (!cat[0]) throw HttpError.badRequest('INVALID_CATEGORY', 'That category does not exist.');
  }
  if (body.supplierId) {
    const sup = (await sql`SELECT id FROM suppliers WHERE id = ${body.supplierId} AND active`) as { id: string }[];
    if (!sup[0]) throw HttpError.badRequest('INVALID_SUPPLIER', 'That supplier does not exist.');
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(COL_MAP)) {
    const value = (body as Record<string, unknown>)[key];
    if (value !== undefined) {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length) {
    params.push(id);
    await sql.query(
      `UPDATE products SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    );
  }

  const product = await fetchProduct(id, true, true);
  return ok(toProduct(product!, true));
});

export const DELETE = handle(async (req, ctx) => {
  await requireUser(req, ['admin', 'manager']);
  const { id } = await ctx.params;
  const sql = getSql();
  const rows = await sql`
    UPDATE products SET active = false, updated_at = NOW()
    WHERE id = ${id} AND active
    RETURNING id
  `;
  if (!(rows as Record<string, unknown>[])[0]) throw HttpError.notFound('That product no longer exists.');
  return ok({ id, archived: true });
});
