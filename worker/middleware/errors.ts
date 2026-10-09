import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { routePath } from 'hono/route';
import { ZodError } from 'zod';
import { HTTP_STATUS_BY_CODE, type ApiErrorCode } from '../../shared/contracts/api.ts';
import type { AppBindings } from '../env.ts';
import { AppError, DEFAULT_MESSAGES } from '../errors.ts';

export function errorBody(
  c: Context<AppBindings>,
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
) {
  return {
    error: { code, message, ...(fields && Object.keys(fields).length ? { fields } : {}) },
    meta: { request_id: c.get('requestId') ?? 'unknown' },
  };
}

export function respondError(
  c: Context<AppBindings>,
  code: ApiErrorCode,
  message?: string,
  fields?: Record<string, string>,
) {
  const status = HTTP_STATUS_BY_CODE[code] as ContentfulStatusCode;
  return c.json(errorBody(c, code, message ?? DEFAULT_MESSAGES[code], fields), status);
}

export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    if (!fields[key]) fields[key] = issue.message.slice(0, 200);
  }
  return fields;
}

/** Single error mapper: AppError -> its code; ZodError -> VALIDATION_ERROR; else INTERNAL_ERROR. */
export const onError: ErrorHandler<AppBindings> = (err, c) => {
  if (err instanceof AppError) return respondError(c, err.code, err.message, err.fields);
  if (err instanceof ZodError)
    return respondError(c, 'VALIDATION_ERROR', undefined, zodFields(err));
  // Never leak stack/SQL. Log only the error class name.
  console.error(
    JSON.stringify({
      level: 'error',
      request_id: c.get('requestId'),
      route: routePath(c),
      error: err instanceof Error ? err.name : 'unknown',
    }),
  );
  return respondError(c, 'INTERNAL_ERROR');
};

export const onNotFound: NotFoundHandler<AppBindings> = (c) => respondError(c, 'NOT_FOUND');
