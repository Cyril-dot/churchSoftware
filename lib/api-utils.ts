import { z } from 'zod';

export const money = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

export const num = (v: unknown): number => Number(v);

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePagination(searchParams: URLSearchParams): {
  limit: number;
  cursorTs: string | null;
  cursorId: string | null;
} {
  const raw = Number(searchParams.get('limit'));
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 200) : 50;
  let cursorTs: string | null = null;
  let cursorId: string | null = null;
  const cursor = searchParams.get('cursor');
  if (cursor) {
    try {
      const [ts, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (ts && id && UUID_RE.test(id)) {
        cursorTs = ts;
        cursorId = id;
      }
    } catch {
      // invalid cursor → start from the beginning
    }
  }
  return { limit, cursorTs, cursorId };
}

export function encodeCursor(ts: string | Date, id: string): string {
  const iso = ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString();
  return Buffer.from(`${iso}|${id}`, 'utf8').toString('base64url');
}

export interface CursorRow {
  id: string;
  created_at: string | Date;
  [key: string]: unknown;
}

export function pageEnvelope<T extends CursorRow>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

export function cursorCondition(
  conditions: string[],
  params: unknown[],
  cursorTs: string | null,
  cursorId: string | null,
  tsColumn = 'created_at'
): void {
  if (cursorTs && cursorId) {
    params.push(cursorTs, cursorId);
    conditions.push(`(${tsColumn}, id) < ($${params.length - 1}, $${params.length})`);
  }
}

export const idParamSchema = z.object({ id: z.string().uuid() });

export function dateRange(searchParams: URLSearchParams, defaultDays = 30): {
  from: string;
  to: string;
} {
  const now = new Date();
  const to = searchParams.get('to');
  const from = searchParams.get('from');
  return {
    from: from ?? new Date(now.getTime() - defaultDays * 86400_000).toISOString(),
    to: to ?? now.toISOString(),
  };
}
