'use client';

import { Printer } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/Button';
import s from '@/features/change-requests/ProposalSummaryView.module.css';

/** Hidden when printing (S-11 print view). */
export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className={s.toolbar}>
      <Button
        type="button"
        icon={<Printer size={16} aria-hidden="true" />}
        onClick={() => window.print()}
      >
        Print or save as PDF
      </Button>
      <Link href={backHref}>Back to the invoice</Link>
    </div>
  );
}
