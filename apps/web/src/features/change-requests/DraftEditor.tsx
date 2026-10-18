'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  riskSeverities,
  type AnalysisResponse,
  type ChangeRequestDetail,
  type RequirementDto,
  type VersionDto,
} from '@soloops/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { SelectField } from '@/components/SelectField';
import { StatusBadge } from '@/components/StatusBadge';
import { TextArea } from '@/components/TextArea';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import { AiSuggestionPanel, type SuggestionField } from './AiSuggestionPanel';
import {
  draftFieldFor,
  joinLines,
  makeDraftFormSchema,
  minutesToHours,
  PROVENANCE_FIELD,
  toDraftFormValues,
  toUpdateRequest,
  type DraftFormInput,
  type DraftFormValues,
} from './draft-form';
import { PricingSummary } from './ProposalView';

type Risk = VersionDto['risks'][number];

const IDS: Record<keyof DraftFormInput, string> = {
  title: 'draft-title',
  clarifiedDescription: 'draft-description',
  inScope: 'draft-in-scope',
  outOfScope: 'draft-out-of-scope',
  acceptanceCriteria: 'draft-criteria',
  dependencies: 'draft-dependencies',
  assumptions: 'draft-assumptions',
  timelineImpact: 'draft-timeline',
  effortLow: 'draft-effort-low',
  effortLikely: 'draft-effort-likely',
  effortHigh: 'draft-effort-high',
  confirmedHours: 'draft-confirmed',
  pricingMode: 'draft-pricing',
  fixedPrice: 'draft-fixed-price',
  affectedRequirementIds: 'draft-affected',
};

/**
 * S-07 draft editing (FR-022, BR-006): every proposal field, the AI panel beside it, and a server
 * price preview ("calculated on save", BR-020 — the UI never computes a price).
 */
export function DraftEditor({
  workspaceId,
  cr,
  version,
  requirements,
  currency,
  aiAvailable,
  isOwner,
  onDirtyChange,
}: {
  workspaceId: string;
  cr: ChangeRequestDetail;
  version: VersionDto;
  requirements: RequirementDto[];
  currency: string;
  aiAvailable: boolean;
  isOwner: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState('');
  const [risks, setRisks] = useState<Risk[]>(version.risks);
  const [affected, setAffected] = useState<string[]>(version.affectedRequirementIds);
  const [provenance, setProvenance] = useState<Record<string, string | null>>({});
  const [badges, setBadges] = useState<Record<string, string>>(version.aiFieldProvenance);
  const schema = useMemo(() => makeDraftFormSchema(currency), [currency]);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting, submitCount, isDirty },
  } = useForm<DraftFormInput, unknown, DraftFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDraftFormValues(version, currency),
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });
  const [extraDirty, setExtraDirty] = useState(false);
  const dirty = isDirty || extraDirty;
  const markDirty = () => {
    setExtraDirty(true);
    onDirtyChange(true);
  };

  /** A human edit of an AI-filled field removes its "AI-suggested" badge (FR-022). */
  const clearProvenance = (field: keyof DraftFormInput | 'risks') => {
    const key = field === 'risks' ? 'risks' : PROVENANCE_FIELD[field];
    if (key && badges[key]) {
      setBadges(({ [key]: _gone, ...rest }) => rest);
      setProvenance((p) => ({ ...p, [key]: null }));
    }
    onDirtyChange(true);
  };

  const field = (name: keyof DraftFormInput) => ({
    id: IDS[name],
    error: errors[name]?.message,
    ...register(name, { onChange: () => clearProvenance(name) }),
  });
  const aiBadge = (key: string) =>
    badges[key] ? <StatusBadge tone="info">AI-suggested</StatusBadge> : null;

  function applySuggestion(fields: SuggestionField[], result: AnalysisResponse) {
    const s = result.suggestion;
    const nextBadges: Record<string, string> = {};
    for (const f of fields) {
      if (f === 'risks') setRisks(s.risks);
      else if (f === 'affectedRequirementIds') setAffected(s.affectedRequirementIds);
      else if (f === 'effort') {
        setValue('effortLow', minutesToHours(s.effort.lowMinutes), { shouldDirty: true });
        setValue('effortLikely', minutesToHours(s.effort.likelyMinutes), { shouldDirty: true });
        setValue('effortHigh', minutesToHours(s.effort.highMinutes), { shouldDirty: true });
      } else if (f === 'clarifiedDescription' || f === 'timelineImpact') {
        setValue(f, s[f], { shouldDirty: true });
      } else {
        setValue(f, joinLines(s[f]), { shouldDirty: true });
      }
      nextBadges[f] = result.generationId;
    }
    setBadges((b) => ({ ...b, ...nextBadges }));
    setProvenance((p) => ({ ...p, ...nextBadges }));
    markDirty();
  }

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    setStatus('');
    try {
      const saved = await browserApi.changeRequests.updateDraft(
        workspaceId,
        cr.id,
        version.number,
        {
          ...toUpdateRequest(values, currency, risks, provenance),
          affectedRequirementIds: affected,
        },
        cr.rowVersion,
      );
      // Show exactly what the server stored (normalised lists, server-computed price).
      const stored = saved.versions.find((v) => v.number === version.number);
      if (stored) {
        reset(toDraftFormValues(stored, currency));
        setRisks(stored.risks);
        setAffected(stored.affectedRequirementIds);
        setBadges(stored.aiFieldProvenance);
        setProvenance({});
      }
      setStatus('Draft saved. The price was recalculated by the server.');
      setExtraDirty(false);
      onDirtyChange(false);
      router.refresh();
    } catch (err) {
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () =>
            router.push(`/signin?returnTo=${encodeURIComponent(window.location.pathname)}`),
          setFieldError: (path, message) => {
            const f = draftFieldFor(path);
            if (!f) return false;
            setError(f, { message });
            return true;
          },
        }),
      );
    }
  });

  const summary = (Object.keys(IDS) as (keyof DraftFormInput)[]).flatMap((name) => {
    const message = errors[name]?.message;
    return message ? [{ fieldId: IDS[name], message }] : [];
  });

  return (
    <div className={styles.page}>
      <AiSuggestionPanel
        workspaceId={workspaceId}
        crId={cr.id}
        versionNumber={version.number}
        available={aiAvailable}
        isOwner={isOwner}
        onApply={applySuggestion}
      />
      <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby="draft-title-h">
        <h3 id="draft-title-h" className={styles.cardTitle}>
          Draft v{version.number} — editable
        </h3>
        <BannerAlert banner={banner} />
        {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
        {dirty ? (
          <Alert tone="warning" title="Unsaved changes">
            Save the draft before proposing it to the client.
          </Alert>
        ) : null}
        <TextField label="Title" {...field('title')} />
        <div className={styles.group}>
          {aiBadge('clarifiedDescription')}
          <TextArea label="Clarified description" rows={4} {...field('clarifiedDescription')} />
        </div>
        <div className={styles.grid}>
          {(
            [
              ['inScope', 'In scope'],
              ['outOfScope', 'Not included'],
              ['acceptanceCriteria', 'Acceptance criteria'],
              ['assumptions', 'Assumptions'],
              ['dependencies', 'Dependencies'],
            ] as const
          ).map(([name, label]) => (
            <div key={name} className={styles.group}>
              {aiBadge(name)}
              <TextArea
                label={label}
                hint={
                  name === 'acceptanceCriteria' || name === 'assumptions'
                    ? 'One per line. At least one is needed to propose.'
                    : 'One per line.'
                }
                rows={3}
                {...field(name)}
              />
            </div>
          ))}
          <div className={styles.group}>
            {aiBadge('timelineImpact')}
            <TextArea label="Timeline impact" rows={3} {...field('timelineImpact')} />
          </div>
        </div>

        <fieldset className={styles.fieldset} aria-describedby="affected-hint">
          <legend className={styles.rowTitle}>
            Affected requirements {aiBadge('affectedRequirementIds')}
          </legend>
          <p id="affected-hint" className={styles.muted}>
            Which agreed requirements does this change touch? The original requirements stay frozen.
          </p>
          {requirements.length === 0 ? (
            <p className={styles.muted}>This project has no requirements.</p>
          ) : null}
          {requirements.map((r) => (
            <label key={r.id} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={affected.includes(r.id)}
                onChange={(e) => {
                  setAffected((a) =>
                    e.target.checked ? [...a, r.id] : a.filter((x) => x !== r.id),
                  );
                  clearProvenance('affectedRequirementIds');
                  markDirty();
                }}
              />
              <span className="so-mono">{r.key}</span> {r.title}
              {r.baselineId ? ' (agreed scope)' : ' (draft)'}
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.rowTitle}>Risks {aiBadge('risks')}</legend>
          {risks.map((risk, i) => (
            <div key={i} className={styles.actions}>
              <SelectField
                label={`Risk ${i + 1} severity`}
                value={risk.severity}
                options={riskSeverities.map((s) => ({
                  value: s,
                  label: s[0] + s.slice(1).toLowerCase(),
                }))}
                onChange={(e) => {
                  const severity = e.target.value as Risk['severity'];
                  setRisks((rs) => rs.map((x, j) => (j === i ? { ...x, severity } : x)));
                  clearProvenance('risks');
                  markDirty();
                }}
              />
              <TextField
                label={`Risk ${i + 1}`}
                value={risk.description}
                maxLength={300}
                onChange={(e) => {
                  const description = e.target.value;
                  setRisks((rs) => rs.map((x, j) => (j === i ? { ...x, description } : x)));
                  clearProvenance('risks');
                  markDirty();
                }}
              />
              <Button
                type="button"
                variant="ghost"
                icon={<Trash2 size={16} aria-hidden="true" />}
                aria-label={`Remove risk ${i + 1}`}
                onClick={() => {
                  setRisks((rs) => rs.filter((_, j) => j !== i));
                  clearProvenance('risks');
                  markDirty();
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          {risks.length < 10 ? (
            <Button
              type="button"
              variant="ghost"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => {
                setRisks((rs) => [...rs, { description: '', severity: 'MEDIUM' }]);
                markDirty();
              }}
            >
              Add risk
            </Button>
          ) : null}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.rowTitle}>Effort and price {aiBadge('effort')}</legend>
          <div className={styles.grid}>
            <TextField label="Low (hours)" inputMode="decimal" {...field('effortLow')} />
            <TextField label="Likely (hours)" inputMode="decimal" {...field('effortLikely')} />
            <TextField label="High (hours)" inputMode="decimal" {...field('effortHigh')} />
            <TextField
              label="Confirmed effort to charge (hours)"
              hint="You enter this yourself; the AI never fills it."
              inputMode="decimal"
              {...field('confirmedHours')}
            />
            <SelectField
              label="Pricing"
              options={[
                { value: '', label: 'Not chosen yet' },
                { value: 'TIME', label: 'Time-based (confirmed hours × rate)' },
                { value: 'FIXED', label: 'Fixed price' },
              ]}
              {...field('pricingMode')}
            />
            <TextField
              label="Fixed price"
              hint="Only for fixed pricing"
              inputMode="decimal"
              prefix={currency}
              {...field('fixedPrice')}
            />
          </div>
          <PricingSummary version={version} />
        </fieldset>

        <div className={styles.actions}>
          <Button type="submit" loading={isSubmitting}>
            Save draft
          </Button>
        </div>
        <p className="so-visually-hidden" role="status" aria-live="polite">
          {status}
        </p>
        {status ? <Alert tone="success" title={status} /> : null}
      </form>
    </div>
  );
}
