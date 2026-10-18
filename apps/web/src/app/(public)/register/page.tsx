import type { Metadata } from 'next';
import { RegisterForm } from '@/features/auth/RegisterForm';

export const metadata: Metadata = { title: 'Create your workspace' };

export default function RegisterPage() {
  return <RegisterForm />;
}
