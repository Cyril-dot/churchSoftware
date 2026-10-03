import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { can } from '@/lib/rbac';
import UsersClient from './UsersClient';

export const metadata = { title: 'Users' };

export default async function UsersPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role, 'manageUsers')) redirect('/dashboard');
  return <UsersClient user={user} />;
}
