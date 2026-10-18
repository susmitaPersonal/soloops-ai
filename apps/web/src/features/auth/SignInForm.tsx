'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema } from '@soloops/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { describeError } from '@/lib/api/errors';
import styles from './AuthForm.module.css';

/** S-01 sign in (FR-002, AC-001.3). Errors are generic; the server decides. */
export function SignInForm({ returnTo }: { returnTo: string | null }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<z.input<typeof loginRequestSchema>, unknown, z.output<typeof loginRequestSchema>>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    // A11Y-003: the ErrorSummary takes focus on submit; RHF must not move focus to a field as well.
    shouldFocusError: false,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await browserApi.auth.login(values);
      const first = session.workspaces[0];
      router.replace(returnTo ?? (first ? `/w/${first.id}` : '/'));
      router.refresh();
    } catch (err) {
      setFormError(describeError(err).message);
    }
  });

  const summary = [
    errors.email?.message && { fieldId: 'signin-email', message: errors.email.message },
    errors.password?.message && { fieldId: 'signin-password', message: errors.password.message },
  ].filter(Boolean) as { fieldId: string; message: string }[];

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby="signin-title">
      <h1 id="signin-title" className={styles.title}>
        Sign in
      </h1>
      {returnTo ? (
        <p className={styles.lead}>Your session ended. Sign in to continue where you left off.</p>
      ) : null}
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
      {formError ? (
        <Alert tone="error" title="Couldn't sign in">
          {formError}
        </Alert>
      ) : null}
      <TextField
        id="signin-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        id="signin-password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" loading={isSubmitting}>
        Sign in
      </Button>
      <p className={styles.alternate}>
        New to SoloOps AI? <Link href="/register">Create a workspace</Link>
      </p>
    </form>
  );
}
