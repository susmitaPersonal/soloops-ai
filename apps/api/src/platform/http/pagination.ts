import { errors } from '../errors';

/**
 * Opaque keyset cursors (data-model §6): base64url JSON of the last item's sort key and `_id`.
 * Never `skip`. A cursor that does not decode is a validation error, not a 500.
 */
export interface CursorKey {
  /** Sort value of the last item (a string, or an ISO timestamp for dates). */
  k: string;
  id: string;
}

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): CursorKey | null {
  if (cursor === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CursorKey).k === 'string' &&
      typeof (parsed as CursorKey).id === 'string'
    ) {
      return { k: (parsed as CursorKey).k, id: (parsed as CursorKey).id };
    }
  } catch {
    // fall through
  }
  throw errors.validationFailed([{ path: 'cursor', message: 'The cursor is invalid.' }]);
}

/** Fetch `limit + 1` rows; the extra row only tells us whether another page exists. */
export function toPage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => CursorKey,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(keyOf(last)) : null,
  };
}
