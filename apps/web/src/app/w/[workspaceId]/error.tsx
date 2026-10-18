'use client';

import { RefreshCw } from 'lucide-react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';

/** ErrorState: message, retry and a reference for support (design system §7.13). */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Alert
      tone="error"
      title="This page couldn't load"
      action={
        <Button
          variant="secondary"
          icon={<RefreshCw size={16} aria-hidden="true" />}
          onClick={reset}
        >
          Retry
        </Button>
      }
    >
      <p>Something went wrong while loading this page. Try again in a moment.</p>
      {error.digest ? <p className="so-mono">Reference: {error.digest}</p> : null}
    </Alert>
  );
}
