import { CircleAlert } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import styles from './TextField.module.css';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Text shown before the input, e.g. a currency code. */
  prefix?: string;
}

/**
 * Design system §7.2: visible label, hint and error linked with aria-describedby (A11Y-003),
 * "(required)" written in text rather than only as an asterisk.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, prefix, id, required, className, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
        {required ? <span className={styles.required}> (required)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      <div className={styles.control}>
        {prefix ? (
          <span className={styles.prefix} aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={[styles.input, error ? styles.invalid : ''].filter(Boolean).join(' ')}
        />
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
});
