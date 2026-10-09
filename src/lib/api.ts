/**
 * Fetch client for the Worker API (`/api/v1/*`). Every response is validated
 * against the Zod contracts in `shared/contracts` (envelope + payload). Errors are
 * surfaced as `ApiClientError` with a stable `code`, optional field errors and the
 * server `request_id` — never with raw bodies or stack traces.
 */
import type { z } from 'zod';
import { ApiError, apiSuccess, type ApiErrorCode } from '@shared/contracts/api.ts';

export type ClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'HTTP_ERROR';

export class ApiClientError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly fields: Record<string, string> | undefined;
  readonly requestId: string | undefined;

  constructor(
    code: ClientErrorCode,
    message: string,
    opts: { status?: number; fields?: Record<string, string>; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = opts.status ?? 0;
    this.fields = opts.fields;
    this.requestId = opts.requestId;
  }

  /** True when the API could not be reached or is degraded (offline, Worker down, proxy error). */
  get isUnavailable(): boolean {
    return (
      this.code === 'NETWORK_ERROR' ||
      this.code === 'HTTP_ERROR' ||
      this.code === 'INVALID_RESPONSE' ||
      this.code === 'WRITES_SUSPENDED' ||
      this.status >= 500
    );
  }
}

export const API_BASE = '/api/v1';

export const GENERIC_ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  VALIDATION_ERROR: 'Revise os campos destacados.',
  UNAUTHENTICATED: 'É preciso entrar para continuar.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail para continuar.',
  NOT_FOUND: 'Não encontrado.',
  CONFLICT: 'Este registro mudou. Recarregue e tente de novo.',
  UNPROCESSABLE: 'Não foi possível processar a solicitação.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  TURNSTILE_FAILED: 'Não foi possível verificar que você é uma pessoa. Tente de novo.',
  WRITES_SUSPENDED: 'Envios estão temporariamente suspensos. Tente mais tarde.',
  SERVICE_UNAVAILABLE: 'Serviço de autenticação indisponível, tente de novo.',
  INTERNAL_ERROR: 'Erro no servidor. Tente de novo em instantes.',
  NETWORK_ERROR: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',
  INVALID_RESPONSE: 'Resposta inesperada do servidor.',
  HTTP_ERROR: 'Serviço indisponível no momento.',
};

export function messageForError(err: unknown): string {
  if (err instanceof ApiClientError) return err.message || GENERIC_ERROR_MESSAGES[err.code];
  return GENERIC_ERROR_MESSAGES.INTERNAL_ERROR;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function buildApiUrl(path: string, query?: RequestOptions['query']): string {
  const base = path.startsWith('/api/')
    ? path
    : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return base;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  opts: RequestOptions = {},
): Promise<z.infer<S>> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildApiUrl(path, opts.query), {
      method,
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiClientError('NETWORK_ERROR', GENERIC_ERROR_MESSAGES.NETWORK_ERROR);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // Non-JSON body: proxy error page, Worker down, SPA fallback HTML...
    throw new ApiClientError(
      res.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR',
      res.ok ? GENERIC_ERROR_MESSAGES.INVALID_RESPONSE : GENERIC_ERROR_MESSAGES.HTTP_ERROR,
      { status: res.status },
    );
  }

  if (!res.ok) {
    const parsed = ApiError.safeParse(json);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiClientError(e.code, e.message || GENERIC_ERROR_MESSAGES[e.code], {
        status: res.status,
        fields: e.fields,
        requestId: parsed.data.meta.request_id,
      });
    }
    throw new ApiClientError('HTTP_ERROR', GENERIC_ERROR_MESSAGES.HTTP_ERROR, {
      status: res.status,
    });
  }

  const parsed = apiSuccess(schema).safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError('INVALID_RESPONSE', GENERIC_ERROR_MESSAGES.INVALID_RESPONSE, {
      status: res.status,
    });
  }
  return (parsed.data as { data: z.infer<S> }).data;
}

/** Random idempotency key for mutations. */
export function idempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
