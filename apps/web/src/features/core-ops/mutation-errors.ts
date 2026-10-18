import { describeError } from '@/lib/api/errors';

export interface Banner {
  tone: 'warning' | 'error' | 'permission';
  title: string;
  message?: string;
  /** Show a Reload action (stale data, ERR-005). */
  reload?: boolean;
}

/**
 * Screen specifications §3 shared states for a failed mutation:
 * 401 → sign-in with return path (ERR-008), 412 → conflict banner with Reload (ERR-005),
 * 409 → archived / baselined explanation (BR-029, AC-007.2), 403 → PermissionNotice,
 * 422 → field errors where a field exists, otherwise a form-level message.
 */
export function bannerForError(
  err: unknown,
  opts: {
    onUnauthenticated: () => void;
    /** Returns true when the path was shown on a field. */
    setFieldError?: (path: string, message: string) => boolean;
  },
): Banner | null {
  const d = describeError(err);
  if (d.status === 401) {
    opts.onUnauthenticated();
    return null;
  }
  if (d.status === 412) {
    return {
      tone: 'warning',
      title: 'This item changed since you opened it',
      message: 'Reload to see the latest version, then make your change again.',
      reload: true,
    };
  }
  if (d.status === 409 && d.code === 'ARCHIVED') {
    return { tone: 'warning', title: 'Archived — read-only', message: d.message };
  }
  if (d.status === 409 && d.code === 'BASELINE_LOCKED') {
    return { tone: 'warning', title: 'This requirement is baselined', message: d.message };
  }
  if (d.status === 409 && d.code === 'ALREADY_INVOICED') {
    return { tone: 'warning', title: 'Already invoiced', message: d.message };
  }
  if (d.status === 403) {
    return { tone: 'permission', title: 'You can’t do this', message: d.message };
  }
  if (d.status === 422 && d.fieldErrors.length > 0 && opts.setFieldError) {
    const unmapped = d.fieldErrors.filter((fe) => !opts.setFieldError?.(fe.path, fe.message));
    if (unmapped.length === 0) return null;
    return { tone: 'error', title: d.message, message: unmapped.map((u) => u.message).join(' ') };
  }
  return {
    tone: 'error',
    title: 'Couldn’t save',
    message: d.requestId ? `${d.message} (Reference: ${d.requestId})` : d.message,
  };
}
