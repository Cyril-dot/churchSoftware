import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { can } from '@/lib/rbac';
import PurchasesClient from './PurchasesClient';

export const metadata = { title: 'Purchases' };

export default async function PurchasesPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role, 'managePurchases')) redirect('/dashboard');
  return <PurchasesClient user={user} />;
}
