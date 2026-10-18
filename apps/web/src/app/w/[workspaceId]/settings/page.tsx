import type { Metadata } from 'next';
import { Alert } from '@/components/Alert';
import { AiSettings } from '@/features/workspace/AiSettings';
import { MembersSettings } from '@/features/workspace/MembersSettings';
import { WorkspaceSettingsForm } from '@/features/workspace/WorkspaceSettingsForm';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Settings' };

/** S-12 Settings → Workspace (FR-005), Members (FR-004) and AI (FR-053, FR-054). The audit log (FR-016) is not built. */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const [{ workspaceId }, { welcome }] = await Promise.all([params, searchParams]);
  const api = await serverApi();
  const [{ data }, aiStatus, members] = await Promise.all([
    api.workspaces.get(workspaceId),
    api.ai.status(workspaceId),
    api.members.list(workspaceId),
  ]).catch(handleServerError);
  return (
    <>
      {welcome === '1' ? (
        <Alert tone="success" title="Your workspace is ready">
          Start by checking your billing defaults below.
        </Alert>
      ) : null}
      <WorkspaceSettingsForm initial={data} />
      <MembersSettings
        workspaceId={workspaceId}
        members={members}
        isOwner={data.myRole === 'OWNER'}
      />
      <AiSettings workspaceId={workspaceId} status={aiStatus} isOwner={data.myRole === 'OWNER'} />
    </>
  );
}
