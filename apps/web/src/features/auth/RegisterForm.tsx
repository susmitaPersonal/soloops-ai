'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, registerRequestSchema } from '@soloops/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { describeError } from '@/lib/api/errors';
import styles from './AuthForm.module.css';

/** The optional workspace-name input submits "" when left empty; it is then omitted from the request. */
const registerFormSchema = registerRequestSchema.extend({
  workspaceName: z
    .string()
    .trim()
    .max(120, { error: 'Workspace name must be at most 120 characters.' }),
});
type RegisterFormInput = z.input<typeof registerFormSchema>;
type RegisterFormValues = z.output<typeof registerFormSchema>;

const FIELDS: { name: Path<RegisterFormInput>; id: string }[] = [
  { name: 'name', id: 'register-name' },
  { name: 'email', id: 'register-email' },
  { name: 'password', id: 'register-password' },
  { name: 'workspaceName', id: 'register-workspace' },
];

/** S-01 registration (FR-001, FR-003, AC-001.1–.2). Creates the account and its workspace, then signs in. */
export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<RegisterFormInput, unknown, RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '', workspaceName: '' },
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    // A11Y-003: the ErrorSummary takes focus on submit; RHF must not move focus to a field as well.
    shouldFocusError: false,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const body = { ...values, workspaceName: values.workspaceName || undefined };
    try {
      const session = await browserApi.auth.register(body);
      const first = session.workspaces[0];
      router.replace(first ? `/w/${first.id}/settings?welcome=1` : '/');
      router.refresh();
    } catch (err) {
      const described = describeError(err);
      for (const fe of described.fieldErrors) {
        const field = FIELDS.find((f) => f.name === fe.path);
        if (field) setError(field.name, { message: fe.message });
      }
      if (described.fieldErrors.length === 0) setFormError(described.message);
    }
  });

  const summary = FIELDS.flatMap((f) => {
    const message = errors[f.name]?.message;
    return message ? [{ fieldId: f.id, message }] : [];
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby="register-title">
      <h1 id="register-title" className={styles.title}>
        Create your workspace
      </h1>
      <p className={styles.lead}>Free and open source. Your data stays in your workspace.</p>
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
      {formError ? (
        <Alert tone="error" title="Couldn't create the account">
          {formError}
        </Alert>
      ) : null}
      <TextField
        id="register-name"
        label="Your name"
        autoComplete="name"
        required
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        id="register-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        id="register-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A long phrase is easiest to remember.`}
        required
        error={errors.password?.message}
        {...register('password')}
      />
      <TextField
        id="register-workspace"
        label="Workspace name"
        hint="Optional. Usually your name or studio. You can change it later."
        error={errors.workspaceName?.message}
        {...register('workspaceName')}
      />
      <Button type="submit" loading={isSubmitting}>
        Create workspace
      </Button>
      <p className={styles.alternate}>
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </form>
  );
}
