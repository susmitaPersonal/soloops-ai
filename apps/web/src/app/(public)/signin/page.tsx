import type { Metadata } from 'next';
import { SignInForm } from '@/features/auth/SignInForm';
import { safeReturnTo } from '@/lib/return-to';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  return <SignInForm returnTo={safeReturnTo(typeof returnTo === 'string' ? returnTo : null)} />;
}
