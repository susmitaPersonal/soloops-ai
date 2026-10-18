import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import styles from '@/features/core-ops/core-ops.module.css';
import { BILLING_MODEL_LABEL, PROJECT_STATUS } from '@/features/core-ops/labels';
import { formatMoney } from '@/features/core-ops/money';
import { ProjectTabs } from '@/features/projects/ProjectTabs';
import { handleServerError, serverApi } from '@/lib/api/server';

/** S-04 project page header (design system §7.4) and tabs. Foreign ID → not-found (SEC-004). */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const { data: p } = await (
    await serverApi()
  ).projects
    .get(workspaceId, projectId)
    .catch(handleServerError);
  const base = `/w/${workspaceId}/projects/${projectId}`;
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.breadcrumbs}>
            <Link href={`/w/${workspaceId}/projects`}>Projects</Link> / {p.name}
          </p>
          <h1 className={styles.title}>{p.name}</h1>
          <p className={styles.meta}>
            <Link href={`/w/${workspaceId}/clients/${p.clientId}`}>{p.clientName}</Link>
            {p.readOnly ? (
              <StatusBadge tone="neutral">Archived</StatusBadge>
            ) : (
              <StatusBadge tone={PROJECT_STATUS[p.status].tone}>
                {PROJECT_STATUS[p.status].label}
              </StatusBadge>
            )}
            <span>
              {BILLING_MODEL_LABEL[p.billingModel]}
              {p.billingModel === 'HOURLY'
                ? ` · ${p.hourlyRateMinor === null ? 'workspace default rate' : `${formatMoney(p.hourlyRateMinor, p.currency)}/h`}`
                : ''}{' '}
              · {p.currency}
            </span>
          </p>
        </div>
      </div>
      <ProjectTabs base={base} />
      {children}
    </div>
  );
}
