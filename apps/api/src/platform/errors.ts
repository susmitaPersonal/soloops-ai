import type { FieldError, ProblemCode } from '@soloops/contracts';

/**
 * Typed application errors. Services throw these; `app.onError` maps them to RFC 9457
 * problem+json (backend-architecture.md#errors). Never set HTTP status inside services.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ProblemCode,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: FieldError[],
    readonly headers?: Record<string, string>,
  ) {
    super(detail ?? title);
    this.name = 'AppError';
  }
}

export const errors = {
  malformedJson: () =>
    new AppError(400, 'MALFORMED_JSON', 'Malformed JSON', 'The request body is not valid JSON.'),
  unauthenticated: () =>
    new AppError(401, 'UNAUTHENTICATED', 'Not signed in', 'Sign in to continue.'),
  /** AC-001.3: one generic message for unknown email and wrong password. */
  invalidCredentials: () =>
    new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Sign-in failed',
      'The email or password is incorrect.',
    ),
  /** AC-001.2: never confirms whether the email is already registered. */
  registrationFailed: () =>
    new AppError(
      422,
      'REGISTRATION_FAILED',
      'Registration failed',
      'We could not create an account with these details. If you already have an account, sign in instead.',
    ),
  forbidden: (detail = 'Only workspace owners can do this.') =>
    new AppError(403, 'FORBIDDEN', 'Not allowed', detail),
  csrfRejected: () =>
    new AppError(
      403,
      'CSRF_REJECTED',
      'Request rejected',
      'The request did not come from the SoloOps app.',
    ),
  /** SEC-004: identical response for "missing" and "not in your workspace". */
  notFound: () =>
    new AppError(
      404,
      'NOT_FOUND',
      'Not found',
      "This item doesn't exist or isn't in this workspace.",
    ),
  payloadTooLarge: () =>
    new AppError(
      413,
      'PAYLOAD_TOO_LARGE',
      'Request too large',
      'The request body exceeds the size limit.',
    ),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(
      429,
      'RATE_LIMITED',
      'Too many attempts',
      'Too many attempts. Wait a few minutes and try again.',
      undefined,
      { 'Retry-After': String(retryAfterSeconds) },
    ),
  preconditionFailed: () =>
    new AppError(
      412,
      'PRECONDITION_FAILED',
      'This item changed',
      'This item changed since you opened it. Reload to see the latest version.',
    ),
  preconditionRequired: () =>
    new AppError(
      428,
      'PRECONDITION_REQUIRED',
      'If-Match required',
      'Send the If-Match header with the version you are editing.',
    ),
  /** BR-029: archived clients and projects are read-only. */
  archived: (detail = 'This item is archived and read-only.') =>
    new AppError(409, 'ARCHIVED', 'Archived', detail),
  /** BR-004 / AC-007.2. */
  baselineLocked: () =>
    new AppError(
      409,
      'BASELINE_LOCKED',
      'Requirement is baselined',
      'This requirement is part of the agreed original scope and can no longer be edited or deleted. Record the change as a change request instead.',
    ),
  /** BR-018 / AC-017.3: work on a non-void invoice cannot be edited or deleted. */
  alreadyInvoiced: (
    detail = 'This work is on an invoice and can no longer be edited or deleted.',
  ) => new AppError(409, 'ALREADY_INVOICED', 'Already invoiced', detail),
  /** AC-020.4: issuing is blocked when a line's work is no longer eligible. */
  linesNotEligible: (fieldErrors: FieldError[]) =>
    new AppError(
      409,
      'NOT_ELIGIBLE',
      'Some lines are no longer eligible',
      'Some work on this draft can no longer be invoiced. Remove those lines, then issue again.',
      fieldErrors,
    ),
  /** BR-015 and similar authorisation-of-work rules. */
  notEligible: (fieldErrors: FieldError[], detail: string) =>
    new AppError(422, 'NOT_ELIGIBLE', 'Not allowed for this work', detail, fieldErrors),
  /** Lifecycle table (change-request-lifecycle.md): any other transition is refused. */
  invalidStateTransition: (detail: string) =>
    new AppError(409, 'INVALID_STATE_TRANSITION', 'Not possible in this state', detail),
  /** BR-010 / AC-012.3. */
  versionHashMismatch: () =>
    new AppError(
      409,
      'VERSION_HASH_MISMATCH',
      'Proposal changed',
      'The version you are recording a decision for does not match the stored proposal. Reload and check it again.',
    ),
  idempotencyKeyReused: () =>
    new AppError(
      422,
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key reused',
      'This Idempotency-Key was already used for a different request.',
    ),
  /** AC-009.4 / AC-022.1: AI is off for the workspace or no provider is configured. */
  aiDisabled: (detail = 'AI assistance is not enabled for this workspace.') =>
    new AppError(409, 'AI_DISABLED', 'AI is not available', detail),
  aiTimeout: () =>
    new AppError(
      504,
      'AI_TIMEOUT',
      'AI analysis timed out',
      'The AI provider did not answer in time. Your draft is unchanged; you can continue manually.',
    ),
  aiProviderError: () =>
    new AppError(
      502,
      'AI_PROVIDER_ERROR',
      'AI provider error',
      'The AI provider could not complete the analysis. Your draft is unchanged; you can continue manually.',
    ),
  aiInvalidOutput: () =>
    new AppError(
      502,
      'AI_INVALID_OUTPUT',
      'AI returned an unusable answer',
      'The AI answer did not match the expected format, even after a retry. Your draft is unchanged; you can continue manually.',
    ),
  validationFailed: (fieldErrors: FieldError[], detail = 'Some fields need attention.') =>
    new AppError(422, 'VALIDATION_FAILED', 'Validation failed', detail, fieldErrors),
  serviceUnavailable: () =>
    new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'Service unavailable',
      'The service is temporarily unavailable. Try again shortly.',
    ),
};

export function problemType(code: ProblemCode): string {
  return `urn:soloops:problem:${code.toLowerCase().replace(/_/g, '-')}`;
}
