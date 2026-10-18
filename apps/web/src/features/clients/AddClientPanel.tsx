'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { ClientForm } from './ClientForm';

/** S-02 primary action "Add client": opens the create form in place (name required, rest optional). */
export function AddClientPanel({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        icon={<Plus size={16} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Add client
      </Button>
    );
  }
  return <ClientForm workspaceId={workspaceId} onCancel={() => setOpen(false)} />;
}
