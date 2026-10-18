'use client';

import { RefreshCw } from 'lucide-react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import type { Banner } from './mutation-errors';

/** Renders a mutation Banner with the documented action (Reload for conflicts). */
export function BannerAlert({ banner }: { banner: Banner | null }) {
  if (!banner) return null;
  return (
    <Alert
      tone={banner.tone}
      title={banner.title}
      action={
        banner.reload ? (
          <Button
            type="button"
            variant="secondary"
            icon={<RefreshCw size={16} aria-hidden="true" />}
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        ) : undefined
      }
    >
      {banner.message}
    </Alert>
  );
}
