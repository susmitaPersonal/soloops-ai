import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProposalSummaryView } from '@/features/change-requests/ProposalSummaryView';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Proposal summary' };

/** S-08 client-facing proposal summary (FR-027): print-friendly page and copyable plain text. */
export default async function ProposalSummaryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; crId: string; n: string }>;
}) {
  const { workspaceId, crId, n } = await params;
  const num = Number(n);
  if (!Number.isInteger(num) || num < 1 || num > 50) notFound();
  const summary = await (
    await serverApi()
  ).changeRequests
    .summary(workspaceId, crId, num)
    .catch(handleServerError);
  return <ProposalSummaryView summary={summary} />;
}
