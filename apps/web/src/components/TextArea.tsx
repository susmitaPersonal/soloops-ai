import { CircleAlert } from 'lucide-react';
import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import styles from './TextField.module.css';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** Design system §7.2 TextArea: same anatomy and accessibility wiring as TextField (A11Y-003). */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, id, required, className, rows = 4, ...rest },
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
      <textarea
        {...rest}
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={[styles.input, styles.textarea, error ? styles.invalid : '']
          .filter(Boolean)
          .join(' ')}
      />
      {error ? (
        <p id={errorId} className={styles.error}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
});
