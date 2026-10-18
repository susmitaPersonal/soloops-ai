'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { browserApi } from '@/lib/api/browser';

/** AC-001.4: the API deletes the session; the browser then returns to sign-in. */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      loading={busy}
      icon={<LogOut size={16} aria-hidden="true" />}
      onClick={async () => {
        setBusy(true);
        try {
          await browserApi.auth.logout();
        } catch {
          // Already signed out or offline: leave the protected area anyway. The server session,
          // if it still exists, expires on its own (SEC-002) and is rotated on the next sign-in.
        }
        router.replace('/signin');
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
