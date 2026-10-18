import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/features/core-ops/core-ops.module.css';
import { InvoiceView } from '@/features/invoices/InvoiceView';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Invoice' };

/** S-11 Invoice draft, review, issue and void (FR-042–FR-046). */
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}) {
  const { workspaceId, invoiceId } = await params;
  const api = await serverApi();
  const [invoice, { data: ws }] = await Promise.all([
    api.invoices.get(workspaceId, invoiceId),
    api.workspaces.get(workspaceId),
  ]).catch(handleServerError);
  return (
    <>
      <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
        <Link href={`/w/${workspaceId}/billing`}>Billing</Link> ›{' '}
        <Link href={`/w/${workspaceId}/projects/${invoice.projectId}/billing`}>
          {invoice.projectName}
        </Link>
      </nav>
      <InvoiceView workspaceId={workspaceId} invoice={invoice} isOwner={ws.myRole === 'OWNER'} />
    </>
  );
}
