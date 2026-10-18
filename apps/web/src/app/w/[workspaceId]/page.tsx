import type { Metadata } from 'next';
import Link from 'next/link';
import { handleServerError, serverApi } from '@/lib/api/server';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Home' };

/**
 * Workspace home: the getting-started path through the implemented workflow (M1–M5). The S-14
 * dashboard (FR-017, not built) will replace it. Only implemented capabilities are listed.
 */
export default async function WorkspaceHome({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { data: ws } = await (
    await serverApi()
  ).workspaces
    .get(workspaceId)
    .catch(handleServerError);
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{ws.name}</h1>
      <section className={styles.card} aria-labelledby="getting-started">
        <h2 id="getting-started" className={styles.cardTitle}>
          Getting started
        </h2>
        <ol className={styles.steps}>
          <li>
            {ws.myRole === 'OWNER' ? (
              <>
                <Link href={`/w/${workspaceId}/settings`}>Set your billing defaults</Link>:
                currency, hourly rate, tax and invoice prefix.
              </>
            ) : (
              <>
                Review the{' '}
                <Link href={`/w/${workspaceId}/settings`}>workspace billing defaults</Link> set by
                the owner.
              </>
            )}
          </li>
          <li>
            <Link href={`/w/${workspaceId}/clients`}>Add a client</Link>, then create a{' '}
            <Link href={`/w/${workspaceId}/projects`}>project</Link> for them.
          </li>
          <li>
            Record the project&apos;s requirements and baseline them as the agreed original scope.
          </li>
          <li>Plan the work as tasks linked to baselined requirements.</li>
          <li>
            When the client asks for more, record a change request in the project, propose it, and
            record the client&apos;s decision. Proposals waiting for a decision are listed under{' '}
            <Link href={`/w/${workspaceId}/approvals`}>Approvals</Link>.
          </li>
          <li>Turn an approved change request into tasks, and log the work you deliver.</li>
          <li>
            Draft an invoice from eligible work in{' '}
            <Link href={`/w/${workspaceId}/billing`}>Billing</Link>.
          </li>
        </ol>
        <p className={styles.note}>
          Only baselined requirements and approved change requests can be invoiced. Work on pending,
          rejected or withdrawn proposals stays unbilled.
        </p>
      </section>
    </div>
  );
}
