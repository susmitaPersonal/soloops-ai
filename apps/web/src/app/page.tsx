import { ApiError } from '@soloops/api-client';
import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

/** `/`: signed-in users go to their first workspace; everyone else to sign-in. */
export default async function RootPage() {
  let target = '/signin';
  try {
    const me = await (await serverApi()).auth.me();
    const first = me.workspaces[0];
    if (first) target = `/w/${first.id}`;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) throw err;
  }
  redirect(target);
}
