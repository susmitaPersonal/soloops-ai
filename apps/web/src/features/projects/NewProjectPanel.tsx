'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { ProjectForm } from './ProjectForm';

/** "New project" primary action (S-03, S-02 client detail). Needs at least one active client. */
export function NewProjectPanel({
  workspaceId,
  clients,
  defaultCurrency,
  fixedClientId,
}: {
  workspaceId: string;
  clients: { id: string; name: string }[];
  defaultCurrency: string;
  fixedClientId?: string;
}) {
  const [open, setOpen] = useState(false);
  if (clients.length === 0 && !fixedClientId) {
    return (
      <p>
        <Link href={`/w/${workspaceId}/clients`}>Add a client</Link> before creating a project.
      </p>
    );
  }
  if (!open) {
    return (
      <Button
        type="button"
        icon={<Plus size={16} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        New project
      </Button>
    );
  }
  return (
    <ProjectForm
      workspaceId={workspaceId}
      clients={clients}
      defaultCurrency={defaultCurrency}
      {...(fixedClientId ? { fixedClientId } : {})}
      onCancel={() => setOpen(false)}
    />
  );
}
