import type { Metadata } from 'next';
import Link from 'next/link';
import { handleServerError, serverApi } from '@/lib/api/server';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Home' };

/**
 * Workspace home. The S-14 dashboard (FR-017) replaces this once change requests and billing
 * exist (M3–M5). Only implemented capabilities are listed.
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
        </ol>
        <p className={styles.note}>
          Change requests, client approvals and invoices are not available yet. They arrive in the
          next milestones.
        </p>
      </section>
    </div>
  );
}
