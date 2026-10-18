import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/features/workspace/WorkspaceShell';
import { handleServerError, serverApi } from '@/lib/api/server';

// Per-user data: never statically rendered or cached (ADR-0009, frontend-architecture.md rule 1).
export const dynamic = 'force-dynamic';

/** Protected workspace shell. The API decides: 401 → sign-in with return path, 404 → not-found. */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const api = await serverApi();
  const [me, workspace] = await Promise.all([api.auth.me(), api.workspaces.get(workspaceId)]).catch(
    handleServerError,
  );
  return (
    <WorkspaceShell
      workspaceId={workspaceId}
      workspaceName={workspace.data.name}
      userName={me.user.name}
      workspaces={me.workspaces}
    >
      {children}
    </WorkspaceShell>
  );
}
