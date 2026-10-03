import { handle, ok, requireUser } from '@/lib/auth';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
});
