import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import type { Role } from '@/lib/rbac';
import { can } from '@/lib/rbac';
import DepositsClient from './DepositsClient';

export const metadata = { title: 'Deposit Accounts' };

export default async function DepositsPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role as Role, 'manageDeposits')) redirect('/dashboard');
  return <DepositsClient />;
}
