import type { Metadata } from 'next';
import { TasksBoard } from '@/features/tasks/TasksBoard';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Tasks' };

/** S-09 Tasks (FR-014, FR-030 links to approved change-request versions). */
export default async function TasksPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const api = await serverApi();
  const [{ data: project }, tasks, requirements, crs, me] = await Promise.all([
    api.projects.get(workspaceId, projectId),
    api.tasks.list(workspaceId, projectId, { limit: 100 }),
    api.requirements.list(workspaceId, projectId),
    // A REVISING change request still has an APPROVED version that authorises work (BR-013).
    api.changeRequests.listForProject(workspaceId, projectId, {
      status: 'APPROVED,REVISING',
      limit: 100,
    }),
    api.auth.me(),
  ]).catch(handleServerError);
  const approvedVersions = crs.items.flatMap((c) =>
    c.approvedVersionNumber === null
      ? []
      : [
          {
            changeRequestId: c.id,
            key: c.key,
            versionNumber: c.approvedVersionNumber,
            title: c.approvedVersionTitle ?? c.title,
          },
        ],
  );
  return (
    <TasksBoard
      workspaceId={workspaceId}
      projectId={projectId}
      tasks={tasks.items}
      requirements={requirements.items}
      approvedVersions={approvedVersions}
      currentUserId={me.user.id}
      readOnly={project.readOnly}
      hasMore={tasks.nextCursor !== null}
    />
  );
}
