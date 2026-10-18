import type { WorkspaceSummary } from '@soloops/contracts';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { WorkspaceNav } from './WorkspaceNav';
import styles from './WorkspaceShell.module.css';

/**
 * App shell (design system §7.3). Navigation lists only screens that exist today: Clients and
 * Projects since M2; Dashboard, Approvals and Billing arrive with their milestones
 * (docs/product/roadmap.md).
 */
export function WorkspaceShell({
  workspaceId,
  workspaceName,
  userName,
  workspaces,
  children,
}: {
  workspaceId: string;
  workspaceName: string;
  userName: string;
  workspaces: WorkspaceSummary[];
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.sidebar}>
        <div className={styles.workspace}>
          <span className={styles.workspaceLabel}>Workspace</span>
          <span className={styles.workspaceName}>{workspaceName}</span>
          {workspaces.length > 1 ? (
            <span className={styles.meta}>{workspaces.length} workspaces</span>
          ) : null}
        </div>
        <WorkspaceNav workspaceId={workspaceId} />
        <div className={styles.user}>
          <span className={styles.meta}>Signed in as {userName}</span>
          <SignOutButton />
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
