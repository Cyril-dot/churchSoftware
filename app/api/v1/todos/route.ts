import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { handle, ok, requireUser } from '@/lib/auth';

function toTodo(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    title: r.title as string,
    notes: r.notes as string | null,
    dueDate: (r.due_date as string | null) ?? null,
    completed: r.completed as boolean,
    completedAt: r.completed_at as string | null,
    createdBy: r.created_by as string,
    createdByName: r.created_by_name as string | null,
    createdAt: r.created_at as string,
  };
}

/* Shared staff to-do list — open tasks first, then recently completed. */
export const GET = handle(async (req) => {
  await requireUser(req);
  const sql = getSql();
  const rows = (await sql`
    SELECT t.id, t.title, t.notes, t.due_date::text AS due_date, t.completed,
           t.completed_at, t.created_by, u.name AS created_by_name, t.created_at
      FROM todos t
      JOIN users u ON u.id = t.created_by
     ORDER BY t.completed ASC, t.due_date ASC NULLS LAST, t.created_at DESC
     LIMIT 200
  `) as Record<string, unknown>[];
  return ok({ items: rows.map(toTodo), nextCursor: null });
});

const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(2000).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').nullish(),
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = createTodoSchema.parse(await req.json());
  const sql = getSql();
  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO todos (id, title, notes, due_date, created_by)
    VALUES (${id}, ${body.title}, ${body.notes ?? null}, ${body.dueDate ?? null}::date, ${user.id})
    RETURNING id, title, notes, due_date::text AS due_date, completed, completed_at,
              created_by, created_at
  `) as Record<string, unknown>[];
  return ok({ ...toTodo(rows[0]), createdByName: user.name }, 201);
});
