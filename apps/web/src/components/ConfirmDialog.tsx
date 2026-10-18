'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

/**
 * Design system §7.8 confirmation (L2 "freezing" pattern): a modal that states exactly what will
 * happen and a confirm button that names the action ("Create Baseline 2", never "OK"). The native
 * <dialog> provides the focus trap and Esc; Esc is ignored while the action runs. Focus starts on
 * Cancel, the least destructive button, and returns to the trigger on close.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy = false,
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  /** L3/L4 flows: the confirm button stays disabled until the acknowledgement is ticked. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement;
      // jsdom has no showModal; the open attribute keeps component tests meaningful.
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {open ? (
        <div className={styles.content}>
          <h2 id="confirm-dialog-title" className={styles.title}>
            {title}
          </h2>
          <div className={styles.body}>{children}</div>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={danger ? 'danger' : 'primary'}
              loading={busy}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
