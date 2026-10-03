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
  DangerButton,
  Badge,
  Field,
  inputClass,
  Modal,
  Sheet,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonRows,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface ShopUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
}

const ROLE_TONES: Record<string, 'wine' | 'blue' | 'green'> = {
  admin: 'wine',
  manager: 'blue',
  cashier: 'green',
};

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function lastLoginLabel(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ═══════════════════════ Main component ═══════════════════════ */

export default function UsersClient({ user: me }: { user: SessionUser }) {
  const [users, setUsers] = useState<ShopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Add / edit sheet */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ShopUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('cashier');
  const [formBusy, setFormBusy] = useState(false);

  /* Deactivate / reactivate */
  const [toggleTarget, setToggleTarget] = useState<ShopUser | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  /* Reset password */
  const [resetTarget, setResetTarget] = useState<ShopUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: ShopUser[] }>('/api/v1/users?limit=200');
      setUsers(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ── Add / edit ── */
  const openCreate = () => {
    setEditing(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('cashier');
    setSheetOpen(true);
  };

  const openEdit = (u: ShopUser) => {
    setEditing(u);
    setName(u.name);
    setEmail(u.email);
    setPassword('');
    setRole(u.role);
    setSheetOpen(true);
  };

  const submitForm = async () => {
    if (!name.trim()) return toast.error('Name is required.');
    if (!editing && !/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error('Enter a valid email address.');
    if (!editing && password.length < 8) return toast.error('Password must be at least 8 characters.');
    setFormBusy(true);
    try {
      if (editing) {
        await api(`/api/v1/users/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        });
        toast.success(`${editing.name}'s role updated to ${role}.`);
      } else {
        await api('/api/v1/users', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password, role }),
        });
        toast.success(`${name.trim()} added as ${role}.`);
      }
      setSheetOpen(false);
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setFormBusy(false);
    }
  };

  /* ── Deactivate / reactivate ── */
  const confirmToggle = async () => {
    if (!toggleTarget) return;
    setToggleBusy(true);
    try {
      await api(`/api/v1/users/${toggleTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !toggleTarget.active }),
      });
      toast.success(
        toggleTarget.active
          ? `${toggleTarget.name} deactivated.`
          : `${toggleTarget.name} reactivated.`
      );
      setToggleTarget(null);
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setToggleBusy(false);
    }
  };

  /* ── Reset password ── */
  const submitReset = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters.');
    setResetBusy(true);
    try {
      await api(`/api/v1/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
      toast.success(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
      setNewPassword('');
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reset failed.');
    } finally {
      setResetBusy(false);
    }
  };

  const Row = ({ u }: { u: ShopUser }) => (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            u.active ? 'bg-[var(--wine-tint)] text-[var(--wine)]' : 'bg-[var(--surface-alt)] text-[var(--ink-muted)]'
          }`}
        >
          {initials(u.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-[var(--ink)]">
            {u.name}
            {u.id === me.id && (
              <span className="ml-2"><Badge tone="wine">You</Badge></span>
            )}
          </p>
          <p className="truncate text-sm text-[var(--ink-muted)]">{u.email}</p>
          <p className="text-xs text-[var(--ink-muted)]">Last login: {lastLoginLabel(u.lastLoginAt)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={ROLE_TONES[u.role] ?? 'gray'}>{u.role}</Badge>
        {u.active ? (
          <Badge tone="green">Active</Badge>
        ) : (
          <Badge tone="red">Inactive</Badge>
        )}
        {u.mustChangePassword && <Badge tone="gold">Must change password</Badge>}
      </div>
      <div className="flex items-center gap-1 sm:justify-end">
        <button
          type="button"
          onClick={() => openEdit(u)}
          aria-label={`Edit role for ${u.name}`}
          title="Edit role"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
        >
          <Icon name="edit" size={20} />
        </button>
        <button
          type="button"
          onClick={() => {
            setResetTarget(u);
            setNewPassword('');
          }}
          aria-label={`Reset password for ${u.name}`}
          title="Reset password"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
        >
          <Icon name="key" size={20} />
        </button>
        {u.id === me.id ? (
          <span className="flex h-11 items-center px-2 text-xs font-semibold text-[var(--ink-muted)]">
            Current user
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setToggleTarget(u)}
            aria-label={u.active ? `Deactivate ${u.name}` : `Reactivate ${u.name}`}
            title={u.active ? 'Deactivate' : 'Reactivate'}
            className={`flex h-11 w-11 items-center justify-center rounded-lg ${
              u.active
                ? 'text-[var(--ink-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]'
                : 'text-[var(--success)] hover:bg-[var(--success-bg)]'
            }`}
          >
            <Icon name={u.active ? 'person_off' : 'person_add'} size={20} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      <PageHeader
        title="Users"
        subtitle="Manage staff accounts and roles"
        actions={
          <PrimaryButton onClick={openCreate}>
            <Icon name="person_add" size={20} /> Add user
          </PrimaryButton>
        }
      />

      {loading ? (
        <SkeletonRows rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchUsers} />
      ) : users.length === 0 ? (
        <EmptyState
          icon="group"
          title="No users"
          body="Something is off — there should always be at least one admin."
          action={<SecondaryButton onClick={fetchUsers}><Icon name="refresh" size={20} /> Reload</SecondaryButton>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {users.map((u, i) => (
            <motion.div key={u.id} variants={riseVariants} custom={i}>
              <Row u={u} />
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Add / edit sheet ── */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? 'Edit user' : 'Add user'}>
        <div className="flex flex-col gap-4">
          <Field label="Full name" htmlFor="u-name">
            <input
              id="u-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ama Serwaa"
              disabled={!!editing}
            />
          </Field>
          <Field label="Email" htmlFor="u-email">
            <input
              id="u-email"
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ama@example.com"
              disabled={!!editing}
            />
          </Field>
          {!editing && (
            <Field label="Temporary password" htmlFor="u-pass" hint="At least 8 characters. They will be asked to change it on first login.">
              <input
                id="u-pass"
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>
          )}
          <Field label="Role" htmlFor="u-role">
            <select id="u-role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="cashier">Cashier — sell and view own sales</option>
              <option value="manager">Manager — inventory, purchases, reports, voids</option>
              <option value="admin">Admin — full access, including users and settings</option>
            </select>
          </Field>
          {editing?.role === 'admin' && (
            <p className="rounded-lg bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning)]">
              Demoting the last active admin is blocked — the server will reject it.
            </p>
          )}
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SecondaryButton onClick={() => setSheetOpen(false)} disabled={formBusy}>
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={submitForm} disabled={formBusy}>
              {formBusy ? 'Saving…' : editing ? 'Save role' : 'Add user'}
            </PrimaryButton>
          </div>
        </div>
      </Sheet>

      {/* ── Deactivate / reactivate ── */}
      <ConfirmDialog
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={confirmToggle}
        title={toggleTarget?.active ? 'Deactivate user?' : 'Reactivate user?'}
        body={
          toggleTarget?.active ? (
            <>
              <strong className="text-[var(--ink)]">{toggleTarget?.name}</strong> will no longer be
              able to sign in. Their past sales and activity are kept.
            </>
          ) : (
            <>
              <strong className="text-[var(--ink)]">{toggleTarget?.name}</strong> will be able to
              sign in again.
            </>
          )
        }
        confirmLabel={toggleTarget?.active ? 'Deactivate' : 'Reactivate'}
        danger={toggleTarget?.active}
        busy={toggleBusy}
      />

      {/* ── Reset password ── */}
      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset password — ${resetTarget?.name ?? ''}`}>
        <p className="text-[15px] text-[var(--ink-muted)]">
          Set a new temporary password. They will be asked to change it on next login.
        </p>
        <div className="mt-4">
          <Field label="New password" htmlFor="rp-pass" hint="At least 8 characters.">
            <input
              id="rp-pass"
              className={inputClass}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={() => setResetTarget(null)} disabled={resetBusy}>
            Cancel
          </SecondaryButton>
          <DangerButton onClick={submitReset} disabled={resetBusy}>
            {resetBusy ? 'Resetting…' : 'Reset password'}
          </DangerButton>
        </div>
      </Modal>
    </motion.div>
  );
}
