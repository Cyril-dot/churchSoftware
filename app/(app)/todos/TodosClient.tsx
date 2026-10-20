'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { SessionUser } from '@/lib/auth';
import Icon from '@/components/Icon';
import {
  api,
  listVariants,
  riseVariants,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Field,
  inputClass,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonRows,
} from '@/components/ui';

interface Todo {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TodosClient({ user }: { user: SessionUser }) {
  void user;
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [adding, setAdding] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Todo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: Todo[] }>('/api/v1/todos');
      setTodos(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the to-do list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addTodo = async () => {
    if (!title.trim()) {
      toast.error('Type a task first.');
      return;
    }
    setAdding(true);
    try {
      await api('/api/v1/todos', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim() || undefined,
          dueDate: dueDate || undefined,
        }),
      });
      setTitle('');
      setNotes('');
      setDueDate('');
      fetchTodos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add task.');
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (t: Todo) => {
    // Optimistic update, then confirm with the server
    setTodos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x))
    );
    try {
      await api(`/api/v1/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !t.completed }),
      });
      fetchTodos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update task.');
      fetchTodos();
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api(`/api/v1/todos/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Task deleted.');
      setDeleteTarget(null);
      fetchTodos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete task.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const open = todos.filter((t) => !t.completed);
  const done = todos.filter((t) => t.completed);
  const today = todayISO();

  const renderTodo = (t: Todo) => {
    const overdue = !t.completed && t.dueDate != null && t.dueDate < today;
    return (
      <li
        key={t.id}
        className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={t.completed}
          aria-label={t.completed ? `Reopen “${t.title}”` : `Complete “${t.title}”`}
          onClick={() => toggle(t)}
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition ${
            t.completed
              ? 'border-[var(--success)] bg-[var(--success)] text-white'
              : 'border-[var(--border-input)] bg-white hover:border-[var(--wine)]'
          }`}
        >
          {t.completed && <Icon name="check" size={18} />}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[15px] font-semibold ${
              t.completed ? 'text-[var(--ink-muted)] line-through' : 'text-[var(--ink)]'
            }`}
          >
            {t.title}
          </p>
          {t.notes && (
            <p className={`mt-0.5 text-sm ${t.completed ? 'text-[var(--ink-muted)]/70' : 'text-[var(--ink-muted)]'}`}>
              {t.notes}
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Added by {t.createdByName ?? 'staff'}
            {t.dueDate && (
              <>
                {' · Due '}
                <span className={overdue ? 'font-bold text-[var(--danger)]' : 'font-semibold'}>
                  {fmtDate(t.dueDate)}{overdue ? ' (overdue)' : ''}
                </span>
              </>
            )}
            {t.completed && t.completedAt && <> · Done {fmtDate(t.completedAt.slice(0, 10))}</>}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Delete “${t.title}”`}
          onClick={() => setDeleteTarget(t)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
        >
          <Icon name="delete" size={20} />
        </button>
      </li>
    );
  };

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      <PageHeader
        title="To-Do List"
        subtitle="Shared task list for all bookshop staff"
      />

      {/* Add task */}
      <motion.div
        variants={riseVariants}
        className="paper-texture mb-5 rounded-2xl border border-[var(--border)] p-4 shadow-[var(--shadow)] sm:p-5"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px]">
          <Field label="Task" htmlFor="todo-title">
            <input
              id="todo-title"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTodo();
              }}
              placeholder="e.g. Restock the Bibles shelf"
              maxLength={300}
            />
          </Field>
          <Field label="Due date (optional)" htmlFor="todo-due">
            <input
              id="todo-due"
              type="date"
              className={inputClass}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Notes (optional)" htmlFor="todo-notes">
              <input
                id="todo-notes"
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra detail…"
                maxLength={2000}
              />
            </Field>
          </div>
          <PrimaryButton onClick={addTodo} disabled={adding}>
            <Icon name="add_task" size={20} /> {adding ? 'Adding…' : 'Add task'}
          </PrimaryButton>
        </div>
      </motion.div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchTodos} />
      ) : todos.length === 0 ? (
        <EmptyState
          icon="checklist"
          title="Nothing on the list"
          body="Add the first task above — everyone on staff can see and tick off tasks."
        />
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <motion.section
              variants={riseVariants}
              aria-label="Open tasks"
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"
            >
              <h2 className="border-b border-[var(--border)] bg-[var(--surface-alt)]/60 px-4 py-3 font-display text-base text-[var(--ink)] sm:px-5">
                To do · {open.length}
              </h2>
              <ul className="divide-y divide-[var(--border)]">{open.map(renderTodo)}</ul>
            </motion.section>
          )}
          {done.length > 0 && (
            <motion.section
              variants={riseVariants}
              aria-label="Completed tasks"
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] opacity-90"
            >
              <h2 className="border-b border-[var(--border)] bg-[var(--surface-alt)]/60 px-4 py-3 font-display text-base text-[var(--ink)] sm:px-5">
                Done · {done.length}
              </h2>
              <ul className="divide-y divide-[var(--border)]">{done.map(renderTodo)}</ul>
            </motion.section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title="Delete this task?"
        body={<>“{deleteTarget?.title}” will be removed from the shared list.</>}
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
      />

      <div className="mt-4 flex justify-end">
        <SecondaryButton onClick={fetchTodos}>
          <Icon name="refresh" size={20} /> Refresh
        </SecondaryButton>
      </div>
    </motion.div>
  );
}
