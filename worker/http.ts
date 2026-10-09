import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { AppBindings } from './env.ts';
import { fail } from './errors.ts';

export function ok<T>(c: Context<AppBindings>, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data, meta: { request_id: c.get('requestId') } }, status);
}

/** Reads a JSON body. Empty body -> {} when `allowEmpty`; malformed -> VALIDATION_ERROR. */
export async function readJson(c: Context<AppBindings>, allowEmpty = false): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) {
    if (allowEmpty) return {};
    throw fail('VALIDATION_ERROR', 'Corpo da requisição ausente.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw fail('VALIDATION_ERROR', 'JSON inválido.');
  }
}

/** Parses with Zod; ZodError bubbles to the error middleware (-> VALIDATION_ERROR + fields). */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  return schema.parse(data);
}

export async function parseBody<S extends z.ZodType>(
  c: Context<AppBindings>,
  schema: S,
  allowEmpty = false,
): Promise<z.output<S>> {
  return schema.parse(await readJson(c, allowEmpty));
}

export function clientIp(c: Context<AppBindings>): string {
  // Only the Cloudflare-set header is trusted; X-Forwarded-For is client-controlled.
  return c.req.header('CF-Connecting-IP') ?? 'local';
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(c: Context<AppBindings>, name = 'id'): string {
  const v = c.req.param(name);
  if (!v || !UUID_RE.test(v)) throw fail('NOT_FOUND');
  return v.toLowerCase();
}
