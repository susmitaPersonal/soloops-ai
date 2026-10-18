'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { RequirementDto } from '@soloops/contracts';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { SelectField } from '@/components/SelectField';
import { TextArea } from '@/components/TextArea';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { options, PRIORITY_LABEL } from '@/features/core-ops/labels';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import {
  requirementFieldFor,
  requirementFormSchema,
  toRequirementFormValues,
  toRequirementRequest,
  type RequirementFormInput,
  type RequirementFormValues,
} from './requirement-form';

/**
 * S-05 add/edit requirement (FR-012, AC-006.1–.2). Only drafts are ever edited here; the server
 * still refuses edits to baselined requirements (409, AC-007.2) and the banner explains why.
 */
export function RequirementForm({
  workspaceId,
  projectId,
  initial,
  onDone,
}: {
  workspaceId: string;
  projectId: string;
  initial?: RequirementDto;
  onDone: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const ids: Record<keyof RequirementFormInput, string> = {
    title: `${uid}-title`,
    description: `${uid}-description`,
    acceptanceCriteria: `${uid}-criteria`,
    priority: `${uid}-priority`,
  };
  const [banner, setBanner] = useState<Banner | null>(null);
  const editing = initial !== undefined;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<RequirementFormInput, unknown, RequirementFormValues>({
    resolver: zodResolver(requirementFormSchema),
    defaultValues: toRequirementFormValues(initial),
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    const body = toRequirementRequest(values);
    try {
      if (editing) {
        await browserApi.requirements.update(workspaceId, initial.id, body, initial.rowVersion);
      } else {
        await browserApi.requirements.create(workspaceId, projectId, body);
      }
      onDone();
      router.refresh();
    } catch (err) {
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () =>
            router.push(
              `/signin?returnTo=${encodeURIComponent(`/w/${workspaceId}/projects/${projectId}/requirements`)}`,
            ),
          setFieldError: (path, message) => {
            const f = requirementFieldFor(path);
            if (!f) return false;
            setError(f, { message });
            return true;
          },
        }),
      );
    }
  });

  const summary = (Object.keys(ids) as (keyof RequirementFormInput)[]).flatMap((name) => {
    const message = errors[name]?.message;
    return message ? [{ fieldId: ids[name], message }] : [];
  });
  const field = (name: keyof RequirementFormInput) => ({
    id: ids[name],
    error: errors[name]?.message,
    ...register(name),
  });
  const titleId = `${uid}-form-title`;

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.cardTitle}>
        {editing ? `Edit ${initial.key}` : 'Add requirement'}
      </h3>
      <BannerAlert banner={banner} />
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
      <TextField label="Title" required {...field('title')} />
      <TextArea label="Description" hint="Optional" rows={3} {...field('description')} />
      <TextArea
        label="Acceptance criteria"
        hint="Optional. One per line, up to 30."
        rows={4}
        {...field('acceptanceCriteria')}
      />
      <SelectField
        label="Priority"
        required
        options={options(PRIORITY_LABEL)}
        {...field('priority')}
      />
      <div className={styles.actions}>
        <Button type="submit" loading={isSubmitting}>
          {editing ? 'Save requirement' : 'Add requirement'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
