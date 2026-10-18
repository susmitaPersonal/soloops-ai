import { CircleAlert } from 'lucide-react';
import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import styles from './TextField.module.css';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
}

/**
 * Design system §7.2 Select. A native <select> keeps full keyboard and screen-reader support
 * without a new dependency; the visual treatment matches TextField.
 */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, id, required, className, options, ...rest },
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
      <select
        {...rest}
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={[styles.input, error ? styles.invalid : ''].filter(Boolean).join(' ')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className={styles.error}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
});
