'use client';

import { Archive } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from './BannerAlert';
import { bannerForError, type Banner } from './mutation-errors';

/**
 * Archive a client or project (FR-010, FR-011, BR-029). Archiving makes it read-only and hides it
 * from default lists; the dialog says so before anything changes.
 */
export function ArchiveButton({
  workspaceId,
  kind,
  id,
  name,
}: {
  workspaceId: string;
  kind: 'client' | 'project';
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const path = `/w/${workspaceId}/${kind === 'client' ? 'clients' : 'projects'}/${id}`;

  async function confirm() {
    setBusy(true);
    setBanner(null);
    try {
      if (kind === 'client') await browserApi.clients.archive(workspaceId, id);
      else await browserApi.projects.archive(workspaceId, id);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setOpen(false);
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () => router.push(`/signin?returnTo=${encodeURIComponent(path)}`),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        icon={<Archive size={16} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Archive {kind}
      </Button>
      <BannerAlert banner={banner} />
      <ConfirmDialog
        open={open}
        title={`Archive ${name}?`}
        confirmLabel={`Archive ${kind}`}
        busy={busy}
        onConfirm={confirm}
        onClose={() => setOpen(false)}
      >
        <p>
          {kind === 'client'
            ? 'The client and all of its projects become read-only. No new projects, requirements or tasks can be added.'
            : 'The project becomes read-only. No new requirements, baselines or tasks can be added.'}{' '}
          It will be hidden from the default list.
        </p>
      </ConfirmDialog>
    </>
  );
}
