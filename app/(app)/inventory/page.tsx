import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import { can } from '@/lib/rbac';
import InventoryClient from './InventoryClient';

export const metadata = { title: 'Items' };

export default async function InventoryPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  if (!can(user.role, 'manageInventory')) redirect('/dashboard');
  return (
    <Suspense>
      <InventoryClient user={user} />
    </Suspense>
  );
}
