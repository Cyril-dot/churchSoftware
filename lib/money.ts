const ghs = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number as Ghana cedis, e.g. ₵1,234.50 */
export function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ghs.format(0);
  return ghs.format(n);
}

/** Parse a user-typed money string ("1,234.50", "₵45") into a number. NaN if invalid. */
export function parseMoney(s: string): number {
  const cleaned = s.replace(/[₵,\s]/g, '');
  return parseFloat(cleaned);
}

/** Compact form for chart labels, e.g. ₵1.2K */
export function formatMoneyCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '₵0';
  return (
    '₵' +
    new Intl.NumberFormat('en-GH', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n)
  );
}
