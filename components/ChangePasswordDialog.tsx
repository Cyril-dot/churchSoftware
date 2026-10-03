'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import Icon from './Icon';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          minLength={8}
          className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-input)] bg-[var(--surface)] pr-12 pl-3.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--focus)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show}
          className="absolute top-1/2 right-1 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-black/5"
        >
          <Icon name={show ? 'visibility_off' : 'visibility'} size={20} />
        </button>
      </div>
    </div>
  );
}

/** Modal to change the signed-in user's password. */
export default function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setError('');
      setBusy(false);
    }
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || 'Could not change password.');
      toast.success('Password changed successfully.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="cp-title">
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-md rounded-t-2xl bg-[var(--surface)] p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-1 flex items-start justify-between gap-4">
              <div>
                <h2 id="cp-title" className="font-display text-xl text-[var(--ink)]">
                  Change password
                </h2>
                <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
                  Use at least 8 characters.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-black/5"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <form onSubmit={submit} className="mt-4 space-y-4">
              <PasswordField id="cp-current" label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
              <PasswordField id="cp-new" label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
              <PasswordField id="cp-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-[var(--danger-bg)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">
                  <Icon name="error" size={18} className="mt-0.5" />
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] px-4 text-[15px] font-semibold text-[var(--ink)] hover:bg-black/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--wine)] px-4 text-[15px] font-semibold text-white hover:bg-[var(--wine-hover)] disabled:opacity-60"
                >
                  {busy ? <Icon name="progress_activity" size={20} className="animate-spin" /> : <Icon name="lock_reset" size={20} />}
                  {busy ? 'Saving…' : 'Save password'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
