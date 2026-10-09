/**
 * Small helpers shared by the public forms: Zod issues → PT-BR field messages,
 * server `fields` → form fields, and focus on the first invalid field.
 */
import type { z } from 'zod';
import { ApiClientError, messageForError } from '@/lib/api';

export type FieldErrors = Record<string, string>;

/**
 * Maps Zod issues to one message per top-level field. Custom issues (phone,
 * WhatsApp URL…) already carry PT-BR text; the rest use the form's messages.
 */
export function zodFieldErrors(error: z.ZodError, messages: Record<string, string>): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (!key || out[key]) continue;
    out[key] = issue.code === 'custom' ? issue.message : (messages[key] ?? 'Valor inválido.');
  }
  return out;
}

/** Field errors from the API envelope (`error.fields`), keyed by the top-level field. */
export function serverFieldErrors(err: unknown): FieldErrors {
  if (!(err instanceof ApiClientError) || !err.fields) return {};
  const out: FieldErrors = {};
  for (const [path, msg] of Object.entries(err.fields)) {
    const key = path.split('.')[0] ?? path;
    if (key && !out[key]) out[key] = msg;
  }
  return out;
}

/** Moves focus to the first field (in visual order) that has an error. */
export function focusFirstError(order: string[], errors: FieldErrors, idOf: (k: string) => string) {
  const first = order.find((k) => errors[k]);
  if (!first) return;
  // Next frame: the error text must be in the DOM so it is read with the field.
  window.requestAnimationFrame(() => {
    const el = document.getElementById(idOf(first));
    el?.focus();
  });
}

/** Honest top-level message for a failed submit (never a success). */
export function submitErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'RATE_LIMITED':
        return 'Muitas tentativas a partir desta conexão. Aguarde alguns minutos e tente de novo.';
      case 'WRITES_SUSPENDED':
        return 'Os envios estão temporariamente suspensos. O mapa continua disponível; tente mais tarde.';
      case 'TURNSTILE_FAILED':
        return 'A verificação de segurança não foi aceita. Ela foi reiniciada: conclua-a e envie de novo.';
      case 'NETWORK_ERROR':
      case 'HTTP_ERROR':
        return 'Não foi possível falar com o servidor. Nada foi enviado. Verifique a conexão e tente de novo.';
      case 'INTERNAL_ERROR':
        return 'O servidor não conseguiu concluir o envio. Nada foi confirmado; tente de novo em instantes.';
      default:
        return messageForError(err);
    }
  }
  if (err instanceof Error && err.name === 'AuthUnavailableError') return err.message;
  return messageForError(err);
}
