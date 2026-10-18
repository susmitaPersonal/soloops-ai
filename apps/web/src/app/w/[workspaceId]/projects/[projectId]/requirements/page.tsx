import type { Metadata } from 'next';
import { RequirementsBoard } from '@/features/requirements/RequirementsBoard';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Requirements' };

/** S-05 Requirements and baselines (FR-012, FR-013). */
export default async function RequirementsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const api = await serverApi();
  const [{ data: project }, requirements, baselines] = await Promise.all([
    api.projects.get(workspaceId, projectId),
    api.requirements.list(workspaceId, projectId),
    api.baselines.list(workspaceId, projectId),
  ]).catch(handleServerError);
  return (
    <RequirementsBoard
      workspaceId={workspaceId}
      projectId={projectId}
      requirements={requirements.items}
      baselines={baselines.items}
      readOnly={project.readOnly}
    />
  );
}
