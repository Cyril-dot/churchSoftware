import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import AppShell from '@/components/AppShell';

/** Authenticated area: verifies the session server-side, then renders the app shell. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  return <AppShell user={user}>{children}</AppShell>;
}
