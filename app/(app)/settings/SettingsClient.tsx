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
  ErrorState,
  SkeletonRows,
} from '@/components/ui';

/* ═══════════════════════ Types ═══════════════════════ */

interface Settings {
  shopName: string;
  currencyCode: string;
  currencySymbol: string;
  receiptFooter: string;
  timezone: string;
  updatedAt: string | null;
}

const COMMON_TIMEZONES = [
  'Africa/Accra',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Europe/London',
  'America/New_York',
  'UTC',
];

/* ═══════════════════════ Main component ═══════════════════════ */

export default function SettingsClient({ user }: { user: SessionUser }) {
  void user;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);

  /* Draft (optimistic) */
  const [shopName, setShopName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [timezone, setTimezone] = useState('');

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Settings>('/api/v1/settings');
      setSaved(data);
      setShopName(data.shopName);
      setCurrencyCode(data.currencyCode);
      setCurrencySymbol(data.currencySymbol);
      setReceiptFooter(data.receiptFooter);
      setTimezone(data.timezone);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const markDirty = () => setDirty(true);

  const onReset = () => {
    if (!saved) return;
    setShopName(saved.shopName);
    setCurrencyCode(saved.currencyCode);
    setCurrencySymbol(saved.currencySymbol);
    setReceiptFooter(saved.receiptFooter);
    setTimezone(saved.timezone);
    setDirty(false);
  };

  const onSave = async () => {
    if (!shopName.trim()) return toast.error('Shop name is required.');
    if (!currencyCode.trim()) return toast.error('Currency code is required.');
    if (!currencySymbol.trim()) return toast.error('Currency symbol is required.');
    if (!timezone.trim()) return toast.error('Timezone is required.');

    /* Optimistic update */
    const optimistic: Settings = {
      shopName: shopName.trim(),
      currencyCode: currencyCode.trim().toUpperCase(),
      currencySymbol: currencySymbol.trim(),
      receiptFooter: receiptFooter.trim(),
      timezone: timezone.trim(),
      updatedAt: saved?.updatedAt ?? null,
    };
    const previous = saved;
    setSaved(optimistic);
    setSaving(true);

    try {
      const updated = await api<Settings>('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          shopName: optimistic.shopName,
          currencyCode: optimistic.currencyCode,
          currencySymbol: optimistic.currencySymbol,
          receiptFooter: optimistic.receiptFooter,
          timezone: optimistic.timezone,
        }),
      });
      setSaved(updated);
      setDirty(false);
      toast.success('Settings saved.');
    } catch (e) {
      /* Roll back on failure */
      setSaved(previous);
      toast.error(e instanceof Error ? e.message : 'Save failed — changes rolled back.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show">
      <PageHeader
        title="Settings"
        subtitle="Shop identity, currency and receipts"
      />

      {loading ? (
        <SkeletonRows rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchSettings} />
      ) : (
        <motion.div
          variants={riseVariants}
          className="max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6"
        >
          <div className="flex flex-col gap-4">
            <Field label="Shop name" htmlFor="s-name" hint="Shown on receipts and the login screen.">
              <input
                id="s-name"
                className={inputClass}
                value={shopName}
                onChange={(e) => {
                  setShopName(e.target.value);
                  markDirty();
                }}
                placeholder="Church Bookshop"
                maxLength={200}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Currency code" htmlFor="s-code" hint="ISO code, e.g. GHS.">
                <input
                  id="s-code"
                  className={inputClass}
                  value={currencyCode}
                  onChange={(e) => {
                    setCurrencyCode(e.target.value);
                    markDirty();
                  }}
                  placeholder="GHS"
                  maxLength={10}
                />
              </Field>
              <Field label="Currency symbol" htmlFor="s-symbol" hint="e.g. ₵, $, €.">
                <input
                  id="s-symbol"
                  className={inputClass}
                  value={currencySymbol}
                  onChange={(e) => {
                    setCurrencySymbol(e.target.value);
                    markDirty();
                  }}
                  placeholder="₵"
                  maxLength={10}
                />
              </Field>
            </div>

            <Field label="Timezone" htmlFor="s-tz" hint="Used for daily reports and the end-of-day cut-off.">
              <select
                id="s-tz"
                className={inputClass}
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  markDirty();
                }}
              >
                {COMMON_TIMEZONES.includes(timezone) ? null : (
                  <option value={timezone}>{timezone} (current)</option>
                )}
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Receipt footer"
              htmlFor="s-footer"
              hint="Printed at the bottom of every receipt. Line breaks are kept."
            >
              <textarea
                id="s-footer"
                className={`${inputClass} min-h-[110px] py-3`}
                value={receiptFooter}
                onChange={(e) => {
                  setReceiptFooter(e.target.value);
                  markDirty();
                }}
                placeholder={'Thank you for shopping with us!\nGod bless you.'}
                maxLength={2000}
              />
            </Field>

            {/* Live receipt preview */}
            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--ink)]">Receipt preview</p>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-5 text-center">
                <p className="font-display text-lg text-[var(--ink)]">
                  {shopName.trim() || 'Church Bookshop'}
                </p>
                <div className="my-3 border-t border-dashed border-[var(--border-input)]" />
                <p className="text-sm text-[var(--ink-muted)]">··· items ···</p>
                <div className="my-3 border-t border-dashed border-[var(--border-input)]" />
                <p className="text-sm whitespace-pre-line text-[var(--ink-muted)]">
                  {receiptFooter.trim() || 'Thank you for shopping with us!'}
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <SecondaryButton onClick={onReset} disabled={saving || !dirty}>
                <Icon name="restart_alt" size={20} /> Discard changes
              </SecondaryButton>
              <PrimaryButton onClick={onSave} disabled={saving || !dirty}>
                {saving ? (
                  'Saving…'
                ) : (
                  <>
                    <Icon name="check" size={20} /> Save settings
                  </>
                )}
              </PrimaryButton>
            </div>

            {saved?.updatedAt && (
              <p className="text-right text-xs text-[var(--ink-muted)]">
                Last updated{' '}
                {new Date(saved.updatedAt).toLocaleString('en-GH', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
