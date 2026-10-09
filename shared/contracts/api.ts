/**
 * API envelope contracts (spec §7.2). Every Worker response is one of these.
 */
import { z } from 'zod';

export const ApiErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'EMAIL_NOT_VERIFIED',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'TURNSTILE_FAILED',
  'WRITES_SUSPENDED',
  /** an upstream dependency (Clerk) is unavailable or throttling us; retry later (QA3-05) */
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiMeta = z.object({
  request_id: z.string(),
});

export const ApiError = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
  meta: ApiMeta,
});
export type ApiError = z.infer<typeof ApiError>;

export function apiSuccess<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: ApiMeta });
}

export const cursorPage = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    next_cursor: z.string().nullable(),
  });

export const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  TURNSTILE_FAILED: 400,
  WRITES_SUSPENDED: 503,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};
