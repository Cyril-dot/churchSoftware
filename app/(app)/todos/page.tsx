import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth';
import TodosClient from './TodosClient';

export const metadata = { title: 'To-Do List' };

export default async function TodosPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect('/login');
  return <TodosClient user={user} />;
}
