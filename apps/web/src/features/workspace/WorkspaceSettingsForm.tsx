'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { WorkspaceSettingsDto } from '@soloops/contracts';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { describeError } from '@/lib/api/errors';
import {
  API_PATH_TO_FIELD,
  settingsFormSchema,
  toFormValues,
  toUpdateRequest,
  type SettingsFormInput,
  type SettingsFormValues,
} from './settings-form';
import styles from './WorkspaceSettingsForm.module.css';

const FIELD_IDS: Record<keyof SettingsFormInput, string> = {
  name: 'settings-name',
  legalName: 'settings-legal-name',
  address: 'settings-address',
  taxId: 'settings-tax-id',
  defaultCurrency: 'settings-currency',
  defaultHourlyRate: 'settings-rate',
  taxLabel: 'settings-tax-label',
  taxRatePercent: 'settings-tax-rate',
  invoicePrefix: 'settings-prefix',
  timeZone: 'settings-time-zone',
};

type Banner =
  { kind: 'conflict' } | { kind: 'forbidden' } | { kind: 'error'; message: string } | null;

/**
 * S-12 workspace settings (FR-005, AC-002.1–.3). Owners edit; members see the same values
 * read-only with a PermissionNotice. The server enforces the role (SEC-011) and If-Match (ERR-005).
 */
export function WorkspaceSettingsForm({ initial }: { initial: WorkspaceSettingsDto }) {
  const router = useRouter();
  const [rowVersion, setRowVersion] = useState(initial.rowVersion);
  const [banner, setBanner] = useState<Banner>(null);
  const [status, setStatus] = useState('');
  const readOnly = initial.myRole !== 'OWNER';
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: toFormValues(initial),
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    // A11Y-003: the ErrorSummary takes focus on submit; RHF must not move focus to a field as well.
    shouldFocusError: false,
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    setStatus('');
    try {
      const { data } = await browserApi.workspaces.update(
        initial.id,
        toUpdateRequest(values),
        rowVersion,
      );
      setRowVersion(data.rowVersion);
      reset(toFormValues(data));
      setStatus('Settings saved.');
      router.refresh();
    } catch (err) {
      const d = describeError(err);
      if (d.status === 401) {
        router.push(`/signin?returnTo=${encodeURIComponent(`/w/${initial.id}/settings`)}`);
      } else if (d.status === 412) {
        setBanner({ kind: 'conflict' });
      } else if (d.status === 403) {
        setBanner({ kind: 'forbidden' });
      } else if (d.status === 422 && d.fieldErrors.length > 0) {
        for (const fe of d.fieldErrors) {
          const field = API_PATH_TO_FIELD[fe.path];
          if (field) setError(field, { message: fe.message });
        }
      } else {
        setBanner({ kind: 'error', message: d.message });
      }
    }
  });

  const summary = (Object.keys(FIELD_IDS) as (keyof SettingsFormInput)[]).flatMap((name) => {
    const message = errors[name]?.message;
    return message ? [{ fieldId: FIELD_IDS[name], message }] : [];
  });

  const field = (name: keyof SettingsFormInput) => ({
    id: FIELD_IDS[name],
    error: errors[name]?.message,
    readOnly,
    ...register(name),
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby="settings-title">
      <div className={styles.header}>
        <h1 id="settings-title" className={styles.title}>
          Workspace settings
        </h1>
        <p className={styles.lead}>Defaults used for new projects and invoices.</p>
      </div>

      {readOnly ? (
        <Alert tone="permission" title="Only workspace owners can change these settings">
          Ask an owner of this workspace if something needs to change.
        </Alert>
      ) : null}
      {banner?.kind === 'conflict' ? (
        <Alert
          tone="warning"
          title="These settings changed since you opened them"
          action={
            <Button
              type="button"
              variant="secondary"
              icon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          }
        >
          Reload to see the latest values, then make your change again.
        </Alert>
      ) : null}
      {banner?.kind === 'forbidden' ? (
        <Alert tone="permission" title="Only workspace owners can change these settings" />
      ) : null}
      {banner?.kind === 'error' ? (
        <Alert tone="error" title="Couldn't save settings">
          {banner.message}
        </Alert>
      ) : null}
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Workspace</legend>
        <TextField label="Workspace name" required {...field('name')} />
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Billing defaults</legend>
        <div className={styles.grid}>
          <TextField
            label="Currency"
            hint="3-letter ISO code, e.g. INR"
            required
            autoCapitalize="characters"
            maxLength={3}
            {...field('defaultCurrency')}
          />
          <TextField
            label="Default hourly rate"
            hint="Used when a project has no rate of its own"
            inputMode="decimal"
            prefix={initial.defaultCurrency}
            required
            {...field('defaultHourlyRate')}
          />
          <TextField
            label="Tax label"
            hint="For example GST or VAT"
            required
            {...field('taxLabel')}
          />
          <TextField
            label="Tax rate (%)"
            hint="0 to 100"
            inputMode="decimal"
            required
            {...field('taxRatePercent')}
          />
          <TextField
            label="Invoice number prefix"
            hint="Capital letters, digits or hyphens, up to 10"
            required
            autoCapitalize="characters"
            maxLength={10}
            {...field('invoicePrefix')}
          />
          <TextField
            label="Time zone"
            hint="IANA name, e.g. Asia/Kolkata. Defines “today” for dates."
            required
            {...field('timeZone')}
          />
        </div>
        <p className={styles.note}>
          The tax label is a label only. Invoices are drafts and SoloOps AI does not make them
          tax-compliant; you are responsible for compliance.
        </p>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Billing details on proposals and invoices</legend>
        <div className={styles.grid}>
          <TextField
            label="Legal name"
            required
            autoComplete="organization"
            {...field('legalName')}
          />
          <TextField label="Tax ID" hint="Optional" {...field('taxId')} />
          <TextField
            label="Address"
            hint="Optional"
            autoComplete="street-address"
            className={styles.wide}
            {...field('address')}
          />
        </div>
      </fieldset>

      {readOnly ? null : (
        <div className={styles.actions}>
          <Button type="submit" loading={isSubmitting}>
            Save settings
          </Button>
        </div>
      )}
      <p className="so-visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      {status ? <Alert tone="success" title={status} /> : null}
    </form>
  );
}
