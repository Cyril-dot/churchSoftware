/**
 * Cashier identity helpers shared by every receipt surface
 * (POS success overlay + print-only slip, sales-history modal + reprint).
 *
 * Chosen format:  Served by: Ama Serwaa · #a1b2c3d4
 * Name falls back to "Staff" when unknown; the staff code is the first
 * 8 chars of the user id and is omitted when there is no usable id.
 *
 * Client-safe: no imports, no server dependencies.
 */

/** Short staff code from a user id, e.g. "#a1b2c3d4". Empty string when no id. */
export function staffCode(id?: string | null): string {
  const clean = (id ?? '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 8);
  return clean ? `#${clean}` : '';
}

/** Full cashier identity line for a printed receipt. */
export function servedByLine(name?: string | null, id?: string | null): string {
  const display = (name ?? '').trim() || 'Staff';
  const code = staffCode(id);
  return code ? `Served by: ${display} · ${code}` : `Served by: ${display}`;
}
