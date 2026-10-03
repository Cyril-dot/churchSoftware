import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';

function toSettings(row: Record<string, unknown>) {
  return {
    shopName: row.shop_name as string,
    currencyCode: row.currency_code as string,
    currencySymbol: row.currency_symbol as string,
    receiptFooter: row.receipt_footer as string,
    timezone: row.timezone as string,
    updatedAt: row.updated_at as string,
  };
}

export const GET = handle(async (req) => {
  await requireUser(req);
  const sql = getSql();
  const rows = (await sql`
    SELECT shop_name, currency_code, currency_symbol, receipt_footer, timezone, updated_at
    FROM settings WHERE id = 1
  `) as Record<string, unknown>[];
  return ok(toSettings(rows[0]));
});

const patchSettingsSchema = z
  .object({
    shopName: z.string().trim().min(1).max(200).optional(),
    currencyCode: z.string().trim().min(1).max(10).optional(),
    currencySymbol: z.string().trim().min(1).max(10).optional(),
    receiptFooter: z.string().trim().max(2000).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

const COL_MAP: Record<string, string> = {
  shopName: 'shop_name',
  currencyCode: 'currency_code',
  currencySymbol: 'currency_symbol',
  receiptFooter: 'receipt_footer',
  timezone: 'timezone',
};

export const PATCH = handle(async (req) => {
  await requireUser(req, ['admin']);
  const body = patchSettingsSchema.parse(await req.json());
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
  const rows = (await sql.query(
    `UPDATE settings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = 1
     RETURNING shop_name, currency_code, currency_symbol, receipt_footer, timezone, updated_at`,
    params
  )) as Record<string, unknown>[];
  return ok(toSettings(rows[0]));
});
