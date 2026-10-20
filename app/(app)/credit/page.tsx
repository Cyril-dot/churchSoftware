import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { can } from '@/lib/rbac';
import CreditClient from './CreditClient';

export const metadata = { title: 'Credit Customers' };

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role, 'manageCredit')) redirect('/dashboard');
  const sp = await searchParams;
  return <CreditClient user={user} initialStatus={sp.status ?? ''} />;
}
