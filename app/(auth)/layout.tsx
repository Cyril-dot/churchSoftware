import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
};

/** Auth pages render full-screen on their own (no app shell). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
