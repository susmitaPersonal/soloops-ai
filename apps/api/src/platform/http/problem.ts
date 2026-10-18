import type { Problem } from '@soloops/contracts';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { isDatabaseUnavailableError, UnsafeQueryError } from '../db';
import { AppError, errors, problemType } from '../errors';
import type { Logger } from '../logging';
import type { AppEnv } from './types';

function send(c: Context<AppEnv>, err: AppError) {
  const body: Problem = {
    type: problemType(err.code),
    title: err.title,
    status: err.status,
    code: err.code,
    ...(err.detail ? { detail: err.detail } : {}),
    ...(err.errors ? { errors: err.errors } : {}),
    requestId: c.get('requestId'),
  };
  for (const [k, v] of Object.entries(err.headers ?? {})) c.header(k, v);
  c.header('Content-Type', 'application/problem+json');
  return c.body(JSON.stringify(body), err.status as 400);
}

/** Central error mapper: typed errors → RFC 9457 problem+json; unknown errors → 500 with request ID. */
export function createErrorHandler(logger: Logger): ErrorHandler<AppEnv> {
  return (err, c) => {
    if (err instanceof AppError) return send(c, err);
    if (err instanceof HTTPException) {
      if (err.status === 413) return send(c, errors.payloadTooLarge());
      if (err.status === 400) return send(c, errors.malformedJson());
    }
    if (err instanceof UnsafeQueryError) {
      // Indicates a programming error (validated input should never reach this); log and hide details.
      logger.error(
        { requestId: c.get('requestId'), err: { name: err.name, message: err.message } },
        'unsafe query refused',
      );
      return send(
        c,
        new AppError(
          500,
          'INTERNAL_ERROR',
          'Something went wrong',
          'An unexpected error occurred.',
        ),
      );
    }
    if (isDatabaseUnavailableError(err)) {
      logger.error(
        { requestId: c.get('requestId'), err: { name: err.name } },
        'database unavailable',
      );
      return send(c, errors.serviceUnavailable());
    }
    logger.error(
      {
        requestId: c.get('requestId'),
        err: { name: err.name, message: err.message, stack: err.stack },
      },
      'unhandled error',
    );
    return send(
      c,
      new AppError(500, 'INTERNAL_ERROR', 'Something went wrong', 'An unexpected error occurred.'),
    );
  };
}

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => send(c, errors.notFound());
