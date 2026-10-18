'use client';

import type { AiStatus } from '@soloops/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';

const HEALTH: Record<
  AiStatus['health'],
  { label: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  ok: { label: 'Reachable', tone: 'success' },
  unreachable: { label: 'Unreachable', tone: 'warning' },
  unconfigured: { label: 'Not configured', tone: 'neutral' },
};

/**
 * S-12 Settings → AI (FR-053, FR-054, AC-022.1–.3). Owners enable AI only after acknowledging
 * exactly what is sent to the provider. The server enforces the role and the acknowledgement.
 */
export function AiSettings({
  workspaceId,
  status,
  isOwner,
}: {
  workspaceId: string;
  status: AiStatus;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const configured = status.health !== 'unconfigured';

  async function set(enabled: boolean) {
    setBusy(true);
    setBanner(null);
    try {
      await browserApi.ai.setEnablement(
        workspaceId,
        enabled ? { enabled, acknowledgeDisclosure: ack } : { enabled },
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      setOpen(false);
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () =>
            router.push(`/signin?returnTo=${encodeURIComponent(`/w/${workspaceId}/settings`)}`),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="ai-settings">
      <h2 id="ai-settings" className={styles.cardTitle}>
        AI assistance
      </h2>
      <p className={styles.meta}>
        <span>Provider: {status.provider === 'none' ? 'none' : status.provider}</span>
        {status.model ? <span>· Model: {status.model}</span> : null}
        <StatusBadge tone={HEALTH[status.health].tone}>{HEALTH[status.health].label}</StatusBadge>
        <StatusBadge tone={status.workspaceEnabled ? 'success' : 'neutral'}>
          {status.workspaceEnabled ? 'On for this workspace' : 'Off for this workspace'}
        </StatusBadge>
      </p>
      <p className={styles.muted}>
        AI only suggests a draft proposal from a client’s message. It never proposes, prices or
        approves anything, and everything works without it.
      </p>
      <BannerAlert banner={banner} />
      {!configured ? (
        <Alert tone="info" title="Your administrator hasn’t configured an AI endpoint">
          AI stays off until the server has a provider configured (AI_PROVIDER).
        </Alert>
      ) : null}
      {!isOwner ? (
        <Alert tone="permission" title="Only workspace owners can change AI settings" />
      ) : status.workspaceEnabled ? (
        <div className={styles.actions}>
          <Button type="button" variant="secondary" loading={busy} onClick={() => void set(false)}>
            Turn AI off
          </Button>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button
            type="button"
            disabled={!configured}
            onClick={() => {
              setAck(false);
              setOpen(true);
            }}
          >
            Turn AI on…
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={open}
        title="Turn on AI assistance?"
        confirmLabel="Turn AI on"
        busy={busy}
        confirmDisabled={!ack}
        onClose={() => setOpen(false)}
        onConfirm={() => void set(true)}
      >
        <p>When someone asks for an AI suggestion, this is sent to the configured provider:</p>
        <ul>
          {status.disclosure.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I
          understand what is sent to the AI provider.
        </label>
      </ConfirmDialog>
    </section>
  );
}
