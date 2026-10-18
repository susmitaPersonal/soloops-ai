'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { RequirementDto, TaskDto } from '@soloops/contracts';
import { CircleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/Button';
import { ErrorSummary } from '@/components/ErrorSummary';
import { SelectField } from '@/components/SelectField';
import { TextArea } from '@/components/TextArea';
import { TextField } from '@/components/TextField';
import fieldStyles from '@/components/TextField.module.css';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { options, TASK_STATUS } from '@/features/core-ops/labels';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import {
  scopeOptions,
  type ApprovedVersion,
  taskFieldFor,
  taskFormSchema,
  toTaskFormValues,
  toTaskRequest,
  type TaskFormInput,
  type TaskFormValues,
} from './task-form';

/**
 * S-09 create/edit task (FR-014, BR-015, AC-016.1–.2). The scope list offers only baselined
 * requirements, approved change-request versions or Internal. Assignees: until member management (FR-004) exists, the only member
 * the UI can name is the signed-in user; the API checks membership either way.
 */
export function TaskForm({
  workspaceId,
  projectId,
  requirements,
  approvedVersions = [],
  currentUserId,
  initial,
  onDone,
}: {
  workspaceId: string;
  projectId: string;
  requirements: RequirementDto[];
  approvedVersions?: ApprovedVersion[];
  currentUserId: string;
  initial?: TaskDto;
  onDone: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const ids: Record<keyof TaskFormInput, string> = {
    title: `${uid}-title`,
    description: `${uid}-description`,
    scope: `${uid}-scope`,
    billable: `${uid}-billable`,
    assigneeUserId: `${uid}-assignee`,
    status: `${uid}-status`,
  };
  const [banner, setBanner] = useState<Banner | null>(null);
  const editing = initial !== undefined;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: toTaskFormValues(initial),
    // Validate on submit, then live while fixing: blur validation moved the submit button
    // under the pointer and swallowed the click (design system §7.2, NFR-012 review).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    { value: currentUserId, label: 'Me' },
    ...(initial?.assigneeUserId && initial.assigneeUserId !== currentUserId
      ? [{ value: initial.assigneeUserId, label: 'Another member' }]
      : []),
  ];

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    const body = toTaskRequest(values);
    try {
      if (editing) await browserApi.tasks.update(workspaceId, initial.id, body, initial.rowVersion);
      else await browserApi.tasks.create(workspaceId, projectId, body);
      onDone();
      router.refresh();
    } catch (err) {
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () =>
            router.push(
              `/signin?returnTo=${encodeURIComponent(`/w/${workspaceId}/projects/${projectId}/tasks`)}`,
            ),
          setFieldError: (path, message) => {
            const f = taskFieldFor(path);
            if (!f) return false;
            setError(f, { message });
            return true;
          },
        }),
      );
    }
  });

  const summary = (Object.keys(ids) as (keyof TaskFormInput)[]).flatMap((name) => {
    const message = errors[name]?.message;
    return message ? [{ fieldId: ids[name], message }] : [];
  });
  const field = (name: keyof TaskFormInput) => ({
    id: ids[name],
    error: errors[name]?.message,
    ...register(name),
  });
  const titleId = `${uid}-form-title`;
  const billableError = errors.billable?.message;

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.cardTitle}>
        {editing ? 'Edit task' : 'New task'}
      </h3>
      <BannerAlert banner={banner} />
      {submitCount > 0 && summary.length > 0 ? <ErrorSummary items={summary} /> : null}
      <div className={styles.grid}>
        <TextField label="Title" required className={styles.wide} {...field('title')} />
        <SelectField
          label="Belongs to"
          hint="Only baselined requirements and approved change requests can authorise work."
          required
          options={scopeOptions(requirements, approvedVersions, initial)}
          {...field('scope')}
        />
        <SelectField label="Assignee" options={assigneeOptions} {...field('assigneeUserId')} />
        <SelectField label="Status" required options={options(TASK_STATUS)} {...field('status')} />
        <div className={fieldStyles.field}>
          <label className={styles.checkbox} htmlFor={ids.billable}>
            <input
              type="checkbox"
              id={ids.billable}
              aria-invalid={billableError ? true : undefined}
              aria-describedby={billableError ? `${ids.billable}-error` : undefined}
              {...register('billable')}
            />
            Billable
          </label>
          {billableError ? (
            <p id={`${ids.billable}-error`} className={fieldStyles.error}>
              <CircleAlert size={16} aria-hidden="true" />
              <span>{billableError}</span>
            </p>
          ) : null}
        </div>
        <TextArea
          label="Description"
          hint="Optional"
          rows={3}
          className={styles.wide}
          {...field('description')}
        />
      </div>
      <div className={styles.actions}>
        <Button type="submit" loading={isSubmitting}>
          {editing ? 'Save task' : 'Create task'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
