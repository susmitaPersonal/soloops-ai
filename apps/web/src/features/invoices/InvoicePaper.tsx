import type { InvoiceDto } from '@soloops/contracts';
import { formatDate } from '@/features/core-ops/labels';
import { formatMoney } from '@/features/core-ops/money';
import { formatMinutes } from '@/features/change-requests/cr-labels';
import s from '@/features/change-requests/ProposalSummaryView.module.css';
import { formatBps } from './invoice-labels';
import inv from './invoice.module.css';

export const TAX_DISCLAIMER =
  'SoloOps AI does not verify tax compliance. Review this invoice before sending it.';

/**
 * S-11 printable invoice (FR-045). Every figure is the server's. Drafts carry a DRAFT watermark
 * (AC-020.5) and void invoices a VOID one; the number appears only once issued (BR-023).
 */
export function InvoicePaper({
  invoice,
  headingLevel = 1,
}: {
  invoice: InvoiceDto;
  /** 2 when embedded under a page heading (S-11 detail), 1 on the print page. */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const money = (m: string) => formatMoney(m, invoice.currency);
  const title =
    invoice.status === 'DRAFT' ? 'Invoice draft' : `Invoice ${invoice.displayNumber ?? ''}`;
  return (
    <article className={s.paper} aria-labelledby="invoice-title">
      {invoice.status === 'DRAFT' ? (
        <p className={s.watermark}>DRAFT — not issued, not a valid invoice</p>
      ) : null}
      {invoice.status === 'VOID' ? (
        <p className={s.watermark}>VOID — {invoice.voidReason}</p>
      ) : null}
      <header className={s.head}>
        <p className={s.supplier}>{invoice.supplier.legalName}</p>
        {invoice.supplier.address ? (
          <p className={inv.preLine}>{invoice.supplier.address}</p>
        ) : null}
        {invoice.supplier.taxId ? <p>Tax ID {invoice.supplier.taxId}</p> : null}
        <Heading id="invoice-title">{title}</Heading>
        <p className={s.ref}>
          Bill to {invoice.clientName} · {invoice.projectName}
          {invoice.issuedAt ? ` · Issued ${formatDate(invoice.issuedAt)}` : ''}
        </p>
      </header>
      <div className={inv.tableWrap}>
        <table className={inv.table}>
          <caption className="so-visually-hidden">Invoice lines</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Description</th>
              <th scope="col" className={inv.num}>
                Quantity
              </th>
              <th scope="col" className={inv.num}>
                Rate
              </th>
              <th scope="col" className={inv.num}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.position}>
                <td>{l.position}</td>
                <td>
                  {l.description}
                  {l.kind === 'ADJUSTMENT' ? ` (manual adjustment: ${l.adjustmentReason})` : ''}
                </td>
                <td className={inv.num}>{l.minutes !== null ? formatMinutes(l.minutes) : '—'}</td>
                <td className={inv.num}>
                  {l.hourlyRateMinor !== null ? `${money(l.hourlyRateMinor)}/h` : '—'}
                </td>
                <td className={inv.num}>{money(l.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className={inv.totals}>
        <div className={inv.totalRow}>
          <dt>Subtotal</dt>
          <dd>{money(invoice.subtotalMinor)}</dd>
        </div>
        <div className={inv.totalRow}>
          <dt>
            {invoice.taxLabel} {formatBps(invoice.taxRateBps)}
          </dt>
          <dd>{money(invoice.taxMinor)}</dd>
        </div>
        <div className={inv.totalRow}>
          <dt>Total</dt>
          <dd className={s.price}>{money(invoice.totalMinor)}</dd>
        </div>
      </dl>
      <p className={s.disclaimer}>{TAX_DISCLAIMER}</p>
    </article>
  );
}
