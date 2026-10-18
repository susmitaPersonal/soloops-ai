/**
 * ERR-008: only same-site workspace paths are accepted as a post-sign-in destination, so the
 * sign-in page can never be used as an open redirect.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\/w\/[A-Za-z0-9-]+(\/[A-Za-z0-9\-/]*)?(\?[A-Za-z0-9=&%_\-.,]*)?$/.test(value)) return null;
  if (value.includes('//') || value.includes('\\')) return null;
  return value;
}
