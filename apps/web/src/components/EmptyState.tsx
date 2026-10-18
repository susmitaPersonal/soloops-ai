import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

/** Screen specifications §3 EmptyState: a one-line explanation and the next action. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {children ? <div className={styles.body}>{children}</div> : null}
    </div>
  );
}
