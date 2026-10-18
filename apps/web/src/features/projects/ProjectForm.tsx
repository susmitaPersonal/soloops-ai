'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ProjectDto } from '@soloops/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { SelectField } from '@/components/SelectField';
import { TextArea } from '@/components/TextArea';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { BILLING_MODEL_LABEL, options, PROJECT_STATUS } from '@/features/core-ops/labels';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import {
  PROJECT_API_PATH_TO_FIELD,
  projectFormSchema,
  toProjectFormValues,
  toProjectRequest,
  type ProjectFormInput,
  type ProjectFormValues,
} from './project-form';

const FIELDS: Record<keyof ProjectFormInput, string> = {
  clientId: 'project-client',
  name: 'project-name',
  description: 'project-description',
  billingModel: 'project-billing-model',
  currency: 'project-currency',
  hourlyRate: 'project-rate',
  startDate: 'project-start-date',
  status: 'project-status',
};

/**
 * S-03 / S-04 project form (FR-011, AC-005.1). Create mode needs the active clients to choose
 * from (or a fixed client on the client page). Edit mode sends If-Match (ERR-005); the client
 * cannot change after creation. A read-only project (BR-029) shows values without actions.
 */
export function ProjectForm({
  workspaceId,
  clients,
  defaultCurrency,
  initial,
  fixedClientId,
  onCancel,
}: {
  workspaceId: string;
  clients: { id: string; name: string }[];
  defaultCurrency: string;
  initial?: ProjectDto;
  fixedClientId?: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = initial !== undefined;
  const readOnly = initial?.readOnly ?? false;
  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState('');
  const [rowVersion, setRowVersion] = useState(initial?.rowVersion ?? 1);
  const defaults = { clientId: fixedClientId ?? clients[0]?.id ?? '', currency: defaultCurrency };
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<ProjectFormInput, unknown, ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: toProjectFormValues(defaults, initial),
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });
  const currency = useWatch({ control, name: 'currency' });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    setStatus('');
    const body = toProjectRequest(values);
    const here = editing
      ? `/w/${workspaceId}/projects/${initial.id}`
      : `/w/${workspaceId}/projects`;
    try {
      if (editing) {
        const { clientId: _fixed, ...update } = body;
        const saved = await browserApi.projects.update(workspaceId, initial.id, update, rowVersion);
        setRowVersion(saved.rowVersion);
        reset(toProjectFormValues(defaults, saved));
        setStatus('Project saved.');
        router.refresh();
      } else {
        const created = await browserApi.projects.create(workspaceId, body);
        router.push(`/w/${workspaceId}/projects/${created.id}`);
      }
    } catch (err) {
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () => router.push(`/signin?returnTo=${encodeURIComponent(here)}`),
          setFieldError: (path, message) => {
            const f = PROJECT_API_PATH_TO_FIELD[path];
            if (!f) return false;
            setError(f, { message });
            return true;
          },
        }),
      );
    }
  });

  const summary = (Object.keys(FIELDS) as (keyof ProjectFormInput)[]).flatMap((name) => {
    const message = errors[name]?.message;
    return message ? [{ fieldId: FIELDS[name], message }] : [];
  });
  const field = (name: keyof ProjectFormInput) => ({
    id: FIELDS[name],
    error: errors[name]?.message,
    ...register(name),
  });
  const titleId = editing ? 'project-form-title' : 'project-create-title';

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.cardTitle}>
        {editing ? 'Project details' : 'New project'}
      </h2>
      {readOnly ? (
        <Alert tone="warning" title="Archived — read-only">
          This project or its client is archived, so it can no longer be changed.
        </Alert>
      ) : null}
      <BannerAlert banner={banner} />
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
      <fieldset className={`${styles.grid} ${styles.fieldset}`} disabled={readOnly}>
        {editing || fixedClientId ? null : (
          <SelectField
            label="Client"
            required
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            {...field('clientId')}
          />
        )}
        <TextField label="Project name" required {...field('name')} />
        <SelectField
          label="Billing model"
          required
          options={options(BILLING_MODEL_LABEL)}
          {...field('billingModel')}
        />
        <TextField
          label="Currency"
          hint="3-letter ISO code. Defaults to the workspace currency."
          required
          maxLength={3}
          autoCapitalize="characters"
          {...field('currency')}
        />
        <TextField
          label="Hourly rate"
          hint="Optional. Leave empty to use the workspace default rate."
          inputMode="decimal"
          prefix={currency}
          {...field('hourlyRate')}
        />
        <TextField label="Start date" hint="Optional" type="date" {...field('startDate')} />
        {editing ? (
          <SelectField
            label="Status"
            required
            options={options(PROJECT_STATUS)}
            {...field('status')}
          />
        ) : null}
        <TextArea
          label="Description"
          hint="Optional"
          className={styles.wide}
          rows={3}
          {...field('description')}
        />
      </fieldset>
      {readOnly ? null : (
        <div className={styles.actions}>
          <Button type="submit" loading={isSubmitting}>
            {editing ? 'Save project' : 'Create project'}
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
