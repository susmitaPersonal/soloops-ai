import type { Metadata } from 'next';
import { Alert } from '@/components/Alert';
import { AiSettings } from '@/features/workspace/AiSettings';
import { WorkspaceSettingsForm } from '@/features/workspace/WorkspaceSettingsForm';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Settings' };

/** S-12 Settings → Workspace (FR-005) and AI (FR-053, FR-054). Members and the audit log arrive with FR-004, FR-016. */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const [{ workspaceId }, { welcome }] = await Promise.all([params, searchParams]);
  const api = await serverApi();
  const [{ data }, aiStatus] = await Promise.all([
    api.workspaces.get(workspaceId),
    api.ai.status(workspaceId),
  ]).catch(handleServerError);
  return (
    <>
      {welcome === '1' ? (
        <Alert tone="success" title="Your workspace is ready">
          Start by checking your billing defaults below.
        </Alert>
      ) : null}
      <WorkspaceSettingsForm initial={data} />
      <AiSettings workspaceId={workspaceId} status={aiStatus} isOwner={data.myRole === 'OWNER'} />
    </>
  );
}
