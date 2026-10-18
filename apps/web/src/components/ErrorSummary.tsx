'use client';

import { CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import styles from './ErrorSummary.module.css';

export interface SummaryItem {
  /** id of the input to focus, or undefined for form-level messages. */
  fieldId?: string;
  message: string;
}

/**
 * A11Y-003: on submit, a summary listing each problem with a link to its field. It receives
 * focus whenever its contents change, so screen readers announce it.
 */
export function ErrorSummary({
  items,
  title = 'There is a problem',
}: {
  items: SummaryItem[];
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = items.map((i) => `${i.fieldId}:${i.message}`).join('|');
  useEffect(() => {
    if (signature) ref.current?.focus();
  }, [signature]);
  if (items.length === 0) return null;
  return (
    <div
      ref={ref}
      className={styles.summary}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
    >
      <p id="error-summary-title" className={styles.title}>
        <CircleAlert size={20} aria-hidden="true" />
        {title}
      </p>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={`${item.fieldId ?? 'form'}-${item.message}`}>
            {item.fieldId ? (
              <a
                href={`#${item.fieldId}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(item.fieldId as string)?.focus();
                }}
              >
                {item.message}
              </a>
            ) : (
              item.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
