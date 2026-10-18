'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { clientFieldsSchema, type ClientDto } from '@soloops/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';

type Input = z.input<typeof clientFieldsSchema>;
type Output = z.output<typeof clientFieldsSchema>;

const FIELDS = {
  name: 'client-name',
  contactName: 'client-contact',
  email: 'client-email',
  phone: 'client-phone',
  billingAddress: 'client-address',
  taxId: 'client-tax-id',
} as const satisfies Record<keyof Input, string>;

const toValues = (c?: ClientDto): Input => ({
  name: c?.name ?? '',
  contactName: c?.contactName ?? '',
  email: c?.email ?? '',
  phone: c?.phone ?? '',
  billingAddress: c?.billingAddress ?? '',
  taxId: c?.taxId ?? '',
});

/**
 * S-02 client form (FR-010, AC-004.1). `initial` switches it to edit mode (If-Match, ERR-005).
 * Archived clients render read-only with the documented banner (AC-004.3, BR-029).
 */
export function ClientForm({
  workspaceId,
  initial,
  onCancel,
}: {
  workspaceId: string;
  initial?: ClientDto;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState('');
  const [rowVersion, setRowVersion] = useState(initial?.rowVersion ?? 1);
  const readOnly = (initial?.archivedAt ?? null) !== null;
  const editing = initial !== undefined;
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(clientFieldsSchema),
    defaultValues: toValues(initial),
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    // A11Y-003: the ErrorSummary takes focus on submit.
    shouldFocusError: false,
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    setStatus('');
    const returnTo = editing
      ? `/w/${workspaceId}/clients/${initial.id}`
      : `/w/${workspaceId}/clients`;
    try {
      if (editing) {
        const saved = await browserApi.clients.update(workspaceId, initial.id, values, rowVersion);
        setRowVersion(saved.rowVersion);
        reset(toValues(saved));
        setStatus('Client saved.');
        router.refresh();
      } else {
        const created = await browserApi.clients.create(workspaceId, values);
        router.push(`/w/${workspaceId}/clients/${created.id}`);
      }
    } catch (err) {
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () => router.push(`/signin?returnTo=${encodeURIComponent(returnTo)}`),
          setFieldError: (path, message) => {
            if (!(path in FIELDS)) return false;
            setError(path as keyof Input, { message });
            return true;
          },
        }),
      );
    }
  });

  const summary = (Object.keys(FIELDS) as (keyof Input)[]).flatMap((name) => {
    const message = errors[name]?.message;
    return message ? [{ fieldId: FIELDS[name], message }] : [];
  });
  const field = (name: keyof Input) => ({
    id: FIELDS[name],
    error: errors[name]?.message,
    readOnly,
    ...register(name),
  });

  return (
    <form
      className={styles.card}
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={editing ? 'client-form-title' : 'client-create-title'}
    >
      <h2 id={editing ? 'client-form-title' : 'client-create-title'} className={styles.cardTitle}>
        {editing ? 'Contact and billing details' : 'Add client'}
      </h2>
      {readOnly ? (
        <Alert tone="warning" title="Archived — read-only">
          This client is archived. Its details and projects can no longer be changed.
        </Alert>
      ) : null}
      <BannerAlert banner={banner} />
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
      <div className={styles.grid}>
        <TextField label="Client name" required autoComplete="organization" {...field('name')} />
        <TextField label="Contact person" hint="Optional" {...field('contactName')} />
        <TextField
          label="Email"
          hint="Optional"
          type="email"
          autoComplete="email"
          {...field('email')}
        />
        <TextField
          label="Phone"
          hint="Optional"
          type="tel"
          autoComplete="tel"
          {...field('phone')}
        />
        <TextField
          label="Billing address"
          hint="Optional"
          className={styles.wide}
          {...field('billingAddress')}
        />
        <TextField label="Tax ID" hint="Optional" {...field('taxId')} />
      </div>
      {readOnly ? null : (
        <div className={styles.actions}>
          <Button type="submit" loading={isSubmitting}>
            {editing ? 'Save client' : 'Add client'}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      )}
      <p className="so-visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      {status ? <Alert tone="success" title={status} /> : null}
    </form>
  );
}
