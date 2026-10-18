import { uuidv7 } from 'uuidv7';

/** Application-generated UUIDv7 IDs (ADR-0012 §5): time-ordered, used as `_id`. */
export function newId(): string {
  return uuidv7();
}
