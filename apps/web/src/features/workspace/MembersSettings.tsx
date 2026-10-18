'use client';

import type { MemberDto } from '@soloops/contracts';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';

/**
 * S-12 Settings → Members (FR-004, US-003). Owners add people who already have a SoloOps account
 * (by email) as members and remove members; members see the list. The server enforces the owner
 * role, the existing-account rule and that the last owner stays (AC-003.1–.2).
 */
export function MembersSettings({
  workspaceId,
  members,
  isOwner,
}: {
  workspaceId: string;
  members: MemberDto[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState('');
  const [removing, setRemoving] = useState<MemberDto | null>(null);
  const owners = members.filter((m) => m.role === 'OWNER').length;

  const onError = (err: unknown) =>
    setBanner(
      bannerForError(err, {
        onUnauthenticated: () =>
          router.push(`/signin?returnTo=${encodeURIComponent(`/w/${workspaceId}/settings`)}`),
        setFieldError: (path, message) => {
          if (path !== 'email') return false;
          setEmailError(message);
          return true;
        },
      }),
    );

  async function add(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    setStatus('');
    setEmailError(undefined);
    if (email.trim() === '') {
      setEmailError('Enter the email address of their SoloOps account.');
      return;
    }
    setBusy(true);
    try {
      const added = await browserApi.members.add(workspaceId, { email });
      setEmail('');
      setStatus(`${added.name} was added as a member.`);
      router.refresh();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: MemberDto) {
    setBusy(true);
    setBanner(null);
    setStatus('');
    try {
      await browserApi.members.remove(workspaceId, member.userId);
      setStatus(`${member.name} was removed from this workspace.`);
      router.refresh();
    } catch (err) {
      onError(err);
    } finally {
      setRemoving(null);
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="members-settings">
      <h2 id="members-settings" className={styles.cardTitle}>
        Members
      </h2>
      <p className={styles.muted}>
        Members can work on clients, projects, change requests and billable work. Only owners change
        settings, issue or void invoices, and manage members.
      </p>
      <BannerAlert banner={banner} />
      {/* aria-live without role="status": the settings form above owns the page status region. */}
      <p aria-live="polite" className={styles.muted}>
        {status}
      </p>
      <ul className={styles.list} aria-label="Workspace members">
        {members.map((m) => (
          <li key={m.userId} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>{m.name}</span>
              <span className={styles.muted}>{m.email}</span>
            </div>
            <StatusBadge tone={m.role === 'OWNER' ? 'info' : 'neutral'}>
              {m.role === 'OWNER' ? 'Owner' : 'Member'}
            </StatusBadge>
            {isOwner && !(m.role === 'OWNER' && owners <= 1) ? (
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove ${m.name}`}
                onClick={() => setRemoving(m)}
              >
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form className={styles.actions} onSubmit={(e) => void add(e)} noValidate>
          <TextField
            label="Add a member by email"
            hint="They need a SoloOps account first. They join as a member."
            type="email"
            autoComplete="off"
            value={email}
            error={emailError}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(undefined);
            }}
          />
          <Button type="submit" loading={busy}>
            Add member
          </Button>
        </form>
      ) : (
        <Alert tone="permission" title="Only workspace owners can add or remove members" />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${removing.name}?` : 'Remove member?'}
        confirmLabel="Remove member"
        danger
        busy={busy}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && void remove(removing)}
      >
        <p>
          They lose access to this workspace immediately. Work they recorded stays, and they can be
          added again later.
        </p>
      </ConfirmDialog>
    </section>
  );
}
