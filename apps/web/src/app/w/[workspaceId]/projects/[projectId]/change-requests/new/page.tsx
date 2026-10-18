import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CreateChangeRequestForm } from '@/features/change-requests/CreateChangeRequestForm';
import { handleServerError, serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/today';

export const metadata: Metadata = { title: 'Record change request' };

/** S-06 "Record change request" page (a page, not a dialog: the text can be long). */
export default async function NewChangeRequestPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const api = await serverApi();
  const [{ data: project }, { data: ws }] = await Promise.all([
    api.projects.get(workspaceId, projectId),
    api.workspaces.get(workspaceId),
  ]).catch(handleServerError);
  // AC-008.2: archived projects take no new change requests (the API returns 409 anyway).
  if (project.readOnly) notFound();
  return (
    <CreateChangeRequestForm
      workspaceId={workspaceId}
      projectId={projectId}
      today={todayIn(ws.timeZone)}
    />
  );
}
