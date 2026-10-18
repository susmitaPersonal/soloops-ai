import { ApiError, ClientError } from '@soloops/api-client';
import type { FieldError } from '@soloops/contracts';

export interface DescribedError {
  /** Message shown in the form-level alert. */
  message: string;
  /** Server field errors (422) to map onto inputs. */
  fieldErrors: FieldError[];
  status: number;
  code: string;
  requestId?: string;
}

/** Maps API and network failures to user-facing text (frontend-architecture.md#loading-empty-and-error-states). */
export function describeError(err: unknown): DescribedError {
  if (err instanceof ApiError) {
    return {
      message: err.message,
      fieldErrors: err.errors,
      status: err.status,
      code: err.code,
      ...(err.requestId ? { requestId: err.requestId } : {}),
    };
  }
  if (err instanceof ClientError) {
    return { message: err.message, fieldErrors: [], status: err.status, code: err.code };
  }
  return {
    message: 'Something went wrong. Try again.',
    fieldErrors: [],
    status: 0,
    code: 'UNKNOWN',
  };
}
