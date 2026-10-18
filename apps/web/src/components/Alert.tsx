import { CircleAlert, CircleCheck, Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Alert.module.css';

type Tone = 'info' | 'success' | 'warning' | 'error' | 'permission';

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  permission: ShieldAlert,
} as const;

interface AlertProps {
  tone: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

/**
 * InlineAlert / Banner / PermissionNotice (design system §7.13). Tone is conveyed by icon and
 * title text as well as colour (A11Y-004). Only errors use role="alert".
 */
export function Alert({ tone, title, children, action }: AlertProps) {
  const Icon = ICONS[tone];
  return (
    <div
      className={[styles.alert, styles[tone]].join(' ')}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <Icon className={styles.icon} size={20} aria-hidden="true" />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children ? <div className={styles.text}>{children}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
