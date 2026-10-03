import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { can } from '@/lib/rbac';
import SalesClient from './SalesClient';

export const metadata = { title: 'Sales' };

export default async function SalesPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role, 'viewOwnSales')) redirect('/dashboard');
  return <SalesClient user={user} />;
}
