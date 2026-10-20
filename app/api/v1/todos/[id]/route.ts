import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser, HttpError } from '@/lib/auth';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  notes: z.string().trim().max(2000).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').nullish(),
  completed: z.boolean().optional(),
});

/* Update a to-do (tick complete / edit). */
export const PATCH = handle(async (req, ctx) => {
  await requireUser(req);
  const { id } = await ctx.params;
  const body = patchSchema.parse(await req.json().catch(() => ({})));
  const sql = getSql();

  const rows = (await sql`
    UPDATE todos SET
      title = COALESCE(${body.title ?? null}, title),
      notes = CASE WHEN ${body.notes !== undefined} THEN ${body.notes ?? null} ELSE notes END,
      due_date = CASE WHEN ${body.dueDate !== undefined} THEN ${body.dueDate ?? null}::date ELSE due_date END,
      completed = COALESCE(${body.completed ?? null}, completed),
      completed_at = CASE
        WHEN ${body.completed ?? null} IS NULL THEN completed_at
        WHEN ${body.completed ?? false} THEN NOW()
        ELSE NULL
      END
    WHERE id = ${id}
    RETURNING id, title, notes, due_date::text AS due_date, completed, completed_at,
              created_by, created_at
  `) as Record<string, unknown>[];
  if (!rows[0]) throw HttpError.notFound('That task no longer exists.');
  const r = rows[0];
  return ok({
    id: r.id as string,
    title: r.title as string,
    notes: r.notes as string | null,
    dueDate: (r.due_date as string | null) ?? null,
    completed: r.completed as boolean,
    completedAt: r.completed_at as string | null,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
  });
});

export const DELETE = handle(async (req, ctx) => {
  await requireUser(req);
  const { id } = await ctx.params;
  const sql = getSql();
  const rows = (await sql`DELETE FROM todos WHERE id = ${id} RETURNING id`) as { id: string }[];
  if (!rows[0]) throw HttpError.notFound('That task no longer exists.');
  return ok({ id, deleted: true });
});
