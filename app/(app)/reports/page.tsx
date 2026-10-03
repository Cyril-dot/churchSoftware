import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { can } from '@/lib/rbac';
import ReportsClient from './ReportsClient';

export const metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role, 'viewReports')) redirect('/dashboard');
  return <ReportsClient user={user} />;
}
