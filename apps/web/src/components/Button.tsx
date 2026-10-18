import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}

/** Design system §7.1. While loading, the label stays, a spinner shows and double submits are blocked. */
export function Button({
  variant = 'primary',
  loading = false,
  icon,
  children,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}
