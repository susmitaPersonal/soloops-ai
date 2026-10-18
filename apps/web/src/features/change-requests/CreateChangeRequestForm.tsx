'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { channels, createChangeRequestSchema } from '@soloops/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { SelectField } from '@/components/SelectField';
import { TextArea } from '@/components/TextArea';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import { CHANNEL_LABEL } from './cr-labels';

type Input = z.input<typeof createChangeRequestSchema>;
type Output = z.output<typeof createChangeRequestSchema>;

const IDS: Record<keyof Input, string> = {
  rawRequestText: 'cr-raw',
  sourceChannel: 'cr-channel',
  requestedByName: 'cr-requested-by',
  receivedOn: 'cr-received',
  title: 'cr-title',
};

/**
 * S-06 "Record change request" (FR-020, AC-008.1): the client's message exactly as received.
 * Submitting creates CR-n with draft v1 and opens it (S-07).
 */
export function CreateChangeRequestForm({
  workspaceId,
  projectId,
  today,
}: {
  workspaceId: string;
  projectId: string;
  /** Today in the workspace time zone (YYYY-MM-DD), the max for the received date. */
  today: string;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);
  const base = `/w/${workspaceId}/projects/${projectId}/change-requests`;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(createChangeRequestSchema),
    defaultValues: {
      rawRequestText: '',
      sourceChannel: 'EMAIL',
      requestedByName: '',
      receivedOn: today,
      title: '',
    },
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      const cr = await browserApi.changeRequests.create(workspaceId, projectId, values);
      router.push(`${base}/${cr.id}`);
    } catch (err) {
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () =>
            router.push(`/signin?returnTo=${encodeURIComponent(`${base}/new`)}`),
          setFieldError: (path, message) => {
            if (!(path in IDS)) return false;
            setError(path as keyof Input, { message });
            return true;
          },
        }),
      );
    }
  });

  const summary = (Object.keys(IDS) as (keyof Input)[]).flatMap((name) => {
    const message = errors[name]?.message;
    return message ? [{ fieldId: IDS[name], message }] : [];
  });
  const field = (name: keyof Input) => ({
    id: IDS[name],
    error: errors[name]?.message,
    ...register(name),
  });

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby="cr-new-title">
      <h2 id="cr-new-title" className={styles.cardTitle}>
        Record a change request
      </h2>
      <p className={styles.muted}>
        Record it here instead of just saying yes. Paste the client’s message exactly as you
        received it — it is kept unchanged as evidence.
      </p>
      <BannerAlert banner={banner} />
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
      <TextArea
        label="Client’s message, as received"
        hint="Paste it exactly. Up to 20,000 characters."
        required
        rows={8}
        {...field('rawRequestText')}
      />
      <div className={styles.grid}>
        <SelectField
          label="Received via"
          required
          options={channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
          {...field('sourceChannel')}
        />
        <TextField label="Requested by" required autoComplete="off" {...field('requestedByName')} />
        <TextField label="Received on" type="date" required max={today} {...field('receivedOn')} />
        <TextField
          label="Title"
          hint="Optional. Defaults to the first line of the message."
          {...field('title')}
        />
      </div>
      <div className={styles.actions}>
        <Button type="submit" loading={isSubmitting}>
          Record change request
        </Button>
      </div>
    </form>
  );
}
