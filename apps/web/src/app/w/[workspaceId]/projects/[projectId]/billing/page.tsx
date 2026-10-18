import type { Metadata } from 'next';
import { BillingBoard } from '@/features/billing/BillingBoard';
import { handleServerError, serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/today';

export const metadata: Metadata = { title: 'Billing' };

/** S-10 Project billing: unbilled work with server eligibility (FR-040, FR-041). */
export default async function ProjectBillingPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const api = await serverApi();
  const [{ data: project }, list, tasks, requirements, crs, { data: ws }] = await Promise.all([
    api.projects.get(workspaceId, projectId),
    api.billableEntries.list(workspaceId, projectId),
    api.tasks.list(workspaceId, projectId, { limit: 100 }),
    api.requirements.list(workspaceId, projectId),
    api.changeRequests.listForProject(workspaceId, projectId, {
      status: 'APPROVED,REVISING',
      limit: 100,
    }),
    api.workspaces.get(workspaceId),
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
    <BillingBoard
      workspaceId={workspaceId}
      projectId={projectId}
      list={list}
      tasks={tasks.items}
      requirements={requirements.items}
      approvedVersions={approvedVersions}
      today={todayIn(ws.timeZone)}
      readOnly={project.readOnly}
    />
  );
}
