import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import type { Role } from '@/lib/rbac';
import GuideClient from './GuideClient';

export const metadata = { title: 'Staff Guide' };

export default async function GuidePage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  return <GuideClient role={user.role as Role} />;
}
