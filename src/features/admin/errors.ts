import { ApiClientError, messageForError } from '@/lib/api';

export const ADMIN_FORBIDDEN_MESSAGE =
  'Acesso negado. É preciso estar na lista de administradores e ter entrado com MFA (verificação em duas etapas). A tentativa foi registrada.';

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiClientError && (err.code === 'FORBIDDEN' || err.status === 403);
}

export function adminErrorMessage(err: unknown): string {
  if (isForbidden(err)) return ADMIN_FORBIDDEN_MESSAGE;
  if (err instanceof ApiClientError && err.code === 'CONFLICT')
    return 'Este item já foi decidido ou mudou (talvez por outra pessoa). Recarregue a fila.';
  return messageForError(err);
}
