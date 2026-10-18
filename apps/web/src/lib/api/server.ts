import 'server-only';
import { ApiError, createApiClient } from '@soloops/api-client';
import { SECURE_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from '@soloops/contracts';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { safeReturnTo } from '@/lib/return-to';

/**
 * Server Component API access (ADR-0013 §3): reads only, straight to API_INTERNAL_URL,
 * forwarding just the session cookie and the request ID. Never cached (api-client sets no-store).
 */
export async function serverApi() {
  const h = await headers();
  const sessionCookie = (h.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find(
      (c) =>
        c.startsWith(`${SECURE_SESSION_COOKIE_NAME}=`) || c.startsWith(`${SESSION_COOKIE_NAME}=`),
    );
  const forwarded: Record<string, string> = {
    'X-Request-Id': h.get('x-request-id') ?? crypto.randomUUID(),
  };
  if (sessionCookie) forwarded.Cookie = sessionCookie;
  return createApiClient({
    baseUrl: process.env.API_INTERNAL_URL ?? 'http://localhost:4000',
    headers: forwarded,
  });
}

/** ERR-008 and SEC-004 handling for Server Components: 401 → sign-in with return path, 404 → not-found page. */
export async function handleServerError(err: unknown): Promise<never> {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      const path = (await headers()).get('x-soloops-pathname');
      const returnTo = safeReturnTo(path);
      redirect(returnTo ? `/signin?returnTo=${encodeURIComponent(returnTo)}` : '/signin');
    }
    if (err.status === 404) notFound();
  }
  throw err;
}
