/* Shared credit (accounts receivable) status computation. */

export function creditStatus(total: number, paid: number, dueDate: string | null) {
  const balance = Math.round((total - paid) * 100) / 100;
  const status: 'owing' | 'part_paid' | 'settled' =
    balance <= 0 ? 'settled' : paid > 0 ? 'part_paid' : 'owing';
  const overdue =
    balance > 0 && dueDate != null && dueDate < new Date().toISOString().slice(0, 10);
  return { balance, status, overdue };
}
