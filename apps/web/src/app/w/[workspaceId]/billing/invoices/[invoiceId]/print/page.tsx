import type { Metadata } from 'next';
import s from '@/features/change-requests/ProposalSummaryView.module.css';
import { InvoicePaper } from '@/features/invoices/InvoicePaper';
import { PrintToolbar } from '@/features/invoices/PrintToolbar';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Print invoice' };

/** S-11 print view (FR-045, AC-020.5): light and printable; drafts carry the DRAFT watermark. */
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}) {
  const { workspaceId, invoiceId } = await params;
  const invoice = await (
    await serverApi()
  ).invoices
    .get(workspaceId, invoiceId)
    .catch(handleServerError);
  return (
    <div className={s.wrap}>
      <PrintToolbar backHref={`/w/${workspaceId}/billing/invoices/${invoiceId}`} />
      <InvoicePaper invoice={invoice} />
    </div>
  );
}
