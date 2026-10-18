'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { RequirementDto, TaskDto } from '@soloops/contracts';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { SelectField } from '@/components/SelectField';
import { TextArea } from '@/components/TextArea';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { describeError } from '@/lib/api/errors';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import type { ApprovedVersion } from '@/features/tasks/task-form';
import {
  emptyLogWork,
  linkOptions,
  logWorkFieldFor,
  makeLogWorkSchema,
  toEntryRequest,
  type LogWorkInput,
  type LogWorkValues,
} from './log-work-form';

/**
 * S-10 "Log work" (FR-040). One Idempotency-Key per opened form, kept when the outcome is
 * unknown (network / 5xx), so a retry never logs the same work twice.
 */
export function LogWorkForm({
  workspaceId,
  projectId,
  currency,
  today,
  tasks,
  requirements,
  approvedVersions,
  onDone,
}: {
  workspaceId: string;
  projectId: string;
  currency: string;
  today: string;
  tasks: TaskDto[];
  requirements: RequirementDto[];
  approvedVersions: ApprovedVersion[];
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const uid = useId();
  const ids: Record<keyof LogWorkInput, string> = {
    kind: `${uid}-kind`,
    workDate: `${uid}-workDate`,
    hours: `${uid}-hours`,
    minutes: `${uid}-minutes`,
    amount: `${uid}-amount`,
    description: `${uid}-description`,
    link: `${uid}-link`,
  };
  const [banner, setBanner] = useState<Banner | null>(null);
  const [retryError, setRetryError] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const schema = useMemo(() => makeLogWorkSchema(currency, today), [currency, today]);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<LogWorkInput, unknown, LogWorkValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyLogWork(today),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });
  const kind = useWatch({ control, name: 'kind' });
  const here = `/w/${workspaceId}/projects/${projectId}/billing`;

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    setRetryError('');
    try {
      const entry = await browserApi.billableEntries.create(
        workspaceId,
        projectId,
        toEntryRequest(values, currency),
        key,
      );
      onDone(
        entry.eligibility.eligible
          ? 'Work logged. It is ready to invoice.'
          : `Work logged, but it is not billable yet: ${entry.eligibility.explanation}`,
      );
      router.refresh();
    } catch (err) {
      const d = describeError(err);
      if (d.status === 0 || d.status >= 500) {
        setRetryError(`${d.message} You can retry safely — it will not be logged twice.`);
        return;
      }
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () => router.push(`/signin?returnTo=${encodeURIComponent(here)}`),
          setFieldError: (path, message) => {
            const f = logWorkFieldFor(path);
            if (!f) return false;
            setError(f, { message });
            return true;
          },
        }),
      );
    }
  });

  const summary = (Object.keys(ids) as (keyof LogWorkInput)[]).flatMap((name) => {
    const message = errors[name]?.message;
    return message ? [{ fieldId: ids[name], message }] : [];
  });
  const field = (name: keyof LogWorkInput) => ({
    id: ids[name],
    error: errors[name]?.message,
    ...register(name),
  });
  const titleId = `${uid}-title`;

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.cardTitle}>
        Log work
      </h3>
      <BannerAlert banner={banner} />
      {retryError ? (
        <Alert tone="error" title="Couldn’t confirm the result">
          {retryError}
        </Alert>
      ) : null}
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
      <div className={styles.grid}>
        <SelectField
          label="Kind"
          required
          options={[
            { value: 'TIME', label: 'Time' },
            { value: 'FIXED', label: 'Fixed amount' },
          ]}
          {...field('kind')}
        />
        <TextField label="Date" type="date" required max={today} {...field('workDate')} />
        {kind === 'TIME' ? (
          <>
            <TextField
              label="Hours"
              inputMode="numeric"
              hint="Up to 24 hours per entry"
              {...field('hours')}
            />
            <TextField label="Minutes" inputMode="numeric" {...field('minutes')} />
          </>
        ) : (
          <TextField
            label={`Amount (${currency})`}
            inputMode="decimal"
            required
            {...field('amount')}
          />
        )}
        <SelectField
          label="Belongs to"
          hint="Only work on baselined requirements or approved change requests can be invoiced."
          required
          className={styles.wide}
          options={linkOptions(tasks, requirements, approvedVersions)}
          {...field('link')}
        />
        <TextArea
          label="Description"
          required
          rows={2}
          className={styles.wide}
          {...field('description')}
        />
      </div>
      <div className={styles.actions}>
        <Button type="submit" loading={isSubmitting}>
          Log work
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone('')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
