import type { ReactNode } from 'react';
import styles from './StatusBadge.module.css';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

/**
 * Design system §7.7 StatusBadge / ScopeTag. The label text is always present, so state is never
 * conveyed by colour alone (A11Y-004). `square` renders the ScopeTag shape.
 */
export function StatusBadge({
  tone,
  children,
  square = false,
}: {
  tone: BadgeTone;
  children: ReactNode;
  square?: boolean;
}) {
  return (
    <span className={[styles.badge, styles[tone], square ? styles.square : ''].join(' ')}>
      {children}
    </span>
  );
}
