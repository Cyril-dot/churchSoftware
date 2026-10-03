import { handle, ok, clearSessionCookie } from '@/lib/auth';

export const POST = handle(async () => {
  await clearSessionCookie();
  return ok({ ok: true });
});
