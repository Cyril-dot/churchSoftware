import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { can } from '@/lib/rbac';
import SettingsClient from './SettingsClient';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role, 'manageSettings')) redirect('/dashboard');
  return <SettingsClient user={user} />;
}
