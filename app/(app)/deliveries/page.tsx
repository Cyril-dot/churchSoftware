import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { can } from '@/lib/rbac';
import DeliveriesClient from './DeliveriesClient';

export const metadata = { title: 'Deliveries' };

export default async function DeliveriesPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role, 'manageDeliveries')) redirect('/dashboard');
  return <DeliveriesClient user={user} />;
}
