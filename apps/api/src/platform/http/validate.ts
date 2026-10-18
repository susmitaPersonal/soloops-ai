import { zValidator } from '@hono/zod-validator';
import type { FieldError } from '@soloops/contracts';
import type { z } from 'zod';
import { errors } from '../errors';

export function toFieldErrors(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): FieldError[] {
  return error.issues.map((i) => ({
    path: i.path.map(String).join('.') || '(body)',
    message: i.message,
  }));
}

/** SEC-005 / ERR-010: Zod-validated JSON body; failures become 422 with field errors. Unknown keys are stripped. */
export const jsonBody = <T extends z.ZodType>(schema: T) =>
  zValidator('json', schema, (result) => {
    if (!result.success) throw errors.validationFailed(toFieldErrors(result.error));
  });

/** SEC-005: Zod-validated query string (whitelisted filters, api-design §1). Failures → 422. */
export const queryParams = <T extends z.ZodType>(schema: T) =>
  zValidator('query', schema, (result) => {
    if (!result.success) throw errors.validationFailed(toFieldErrors(result.error));
  });

/** Parses `If-Match: "<rowVersion>"` (api-design §1). Missing → 428, malformed → 412. */
export function parseIfMatch(header: string | undefined): number {
  if (header === undefined) throw errors.preconditionRequired();
  const match = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim());
  if (!match) throw errors.preconditionFailed();
  return Number(match[1]);
}
