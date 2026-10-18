'use client';

import type { ProposalSummary } from '@soloops/contracts';
import { Copy, Printer } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { formatDate } from '@/features/core-ops/labels';
import { formatMoney } from '@/features/core-ops/money';
import { formatMinutes, shortHash } from './cr-labels';
import s from './ProposalSummaryView.module.css';

/** Plain-text version for pasting into email or chat (FR-027). */
export function summaryText(p: ProposalSummary): string {
  const v = p.version;
  const price = v.pricing?.priceMinor ? formatMoney(v.pricing.priceMinor, v.pricing.currency) : '—';
  const ref = v.contentHash ? ` · Ref ${shortHash(v.contentHash)}` : '';
  const list = (title: string, items: string[]) =>
    items.length ? [`${title}:`, ...items.map((i) => `- ${i}`), ''] : [];
  return [
    `${p.supplier.legalName} — proposal for ${p.clientName}`,
    `Change request ${p.changeRequestKey} · Proposal v${v.number}${v.proposedAt ? ` · ${formatDate(v.proposedAt)}` : ''}${ref}`,
    v.state === 'DRAFT' ? 'DRAFT — not yet proposed' : '',
    '',
    v.title,
    v.clarifiedDescription,
    '',
    ...list("What's included", v.inScope),
    ...list('Not included', v.outOfScope),
    ...list('Acceptance criteria', v.acceptanceCriteria),
    ...list('Assumptions', v.assumptions),
    `Price: ${price}`,
    v.effort
      ? `Estimated effort: ${formatMinutes(v.effort.lowMinutes)} – ${formatMinutes(v.effort.highMinutes)}`
      : '',
    v.timelineImpact ? `Timeline impact: ${v.timelineImpact}` : '',
    '',
    p.disclaimer,
    '',
    'How to respond: reply to approve, reject or ask questions, quoting the reference above.',
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');
}

/** S-08 summary: light, printable, with a DRAFT watermark for unproposed versions. */
export function ProposalSummaryView({ summary }: { summary: ProposalSummary }) {
  const [copied, setCopied] = useState('');
  const v = summary.version;
  const draft = v.state === 'DRAFT';
  const section = (title: string, items: string[]) =>
    items.length ? (
      <section>
        <h2>{title}</h2>
        <ul>
          {items.map((x, i) => (
            <li key={`${i}-${x}`}>{x}</li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className={s.wrap}>
      <div className={s.toolbar}>
        <Button
          type="button"
          variant="secondary"
          icon={<Printer size={16} aria-hidden="true" />}
          onClick={() => window.print()}
        >
          Print or save as PDF
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={<Copy size={16} aria-hidden="true" />}
          onClick={() =>
            void navigator.clipboard
              .writeText(summaryText(summary))
              .then(() => setCopied('Copied as plain text.'))
              .catch(() => setCopied('Copy failed — select the text and copy it manually.'))
          }
        >
          Copy as text
        </Button>
        <span role="status" aria-live="polite">
          {copied}
        </span>
      </div>
      <article className={s.paper} aria-label="Proposal summary">
        {draft ? (
          <p className={s.watermark} aria-label="Draft">
            DRAFT — not yet proposed
          </p>
        ) : null}
        <header className={s.head}>
          <p className={s.supplier}>
            {summary.supplier.legalName}
            {summary.supplier.address ? (
              <>
                <br />
                {summary.supplier.address}
              </>
            ) : null}
            {summary.supplier.taxId ? (
              <>
                <br />
                Tax ID {summary.supplier.taxId}
              </>
            ) : null}
          </p>
          <p>For {summary.clientName}</p>
          <h1>
            Change request {summary.changeRequestKey} · Proposal v{v.number}
          </h1>
          <p className={s.ref}>
            {summary.projectName}
            {v.proposedAt ? ` · ${formatDate(v.proposedAt)}` : ''}
            {v.contentHash ? (
              <>
                {' '}
                · Ref <span className="so-mono">{shortHash(v.contentHash)}</span>
              </>
            ) : null}
          </p>
        </header>
        <section>
          <h2>Summary</h2>
          <p>
            <strong>{v.title}</strong>
          </p>
          <p>{v.clarifiedDescription}</p>
        </section>
        {section("What's included", v.inScope)}
        {section('Not included', v.outOfScope)}
        {section('Acceptance criteria', v.acceptanceCriteria)}
        {section('Assumptions', v.assumptions)}
        <section>
          <h2>Price</h2>
          <p className={s.price}>
            {v.pricing?.priceMinor ? formatMoney(v.pricing.priceMinor, v.pricing.currency) : '—'}
          </p>
          {v.effort ? (
            <p>
              Estimated effort {formatMinutes(v.effort.lowMinutes)} –{' '}
              {formatMinutes(v.effort.highMinutes)}
            </p>
          ) : null}
        </section>
        {v.timelineImpact ? (
          <section>
            <h2>Timeline impact</h2>
            <p>{v.timelineImpact}</p>
          </section>
        ) : null}
        <p className={s.disclaimer}>{summary.disclaimer}</p>
        <p>
          How to respond: reply to approve, reject or ask questions, quoting the reference above.
        </p>
      </article>
    </div>
  );
}
