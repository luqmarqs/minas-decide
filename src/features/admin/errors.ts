import { ApiClientError, messageForError } from '@/lib/api';

export const ADMIN_FORBIDDEN_MESSAGE =
  'Sem permissão. É preciso estar na lista de administradores. A tentativa foi registrada.';

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiClientError && (err.code === 'FORBIDDEN' || err.status === 403);
}

export function adminErrorMessage(err: unknown): string {
  if (isForbidden(err)) return ADMIN_FORBIDDEN_MESSAGE;
  if (err instanceof ApiClientError && err.code === 'CONFLICT')
    return 'Este item já foi decidido ou mudou (talvez por outra pessoa). Recarregue a fila.';
  return messageForError(err);
}

/** Messages of the "Administradores" section, by API error code. */
export function adminAccessErrorMessage(err: unknown, action: 'grant' | 'revoke'): string {
  if (isForbidden(err)) return ADMIN_FORBIDDEN_MESSAGE;
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'NOT_FOUND':
        return action === 'grant'
          ? 'Não encontramos uma conta com este e-mail. A pessoa precisa criar a conta em /participar e confirmar o e-mail antes.'
          : 'Este administrador não está mais na lista. Atualize a lista.';
      case 'VALIDATION_ERROR':
        return action === 'grant'
          ? (err.fields?.email ?? 'O e-mail informado não pôde ser usado. Revise e tente de novo.')
          : 'Você não pode remover o seu próprio acesso.';
      case 'CONFLICT':
        return 'Este é o último administrador e não pode ser removido.';
      case 'RATE_LIMITED':
        return 'Muitas alterações seguidas. Aguarde alguns minutos e tente de novo.';
      case 'SERVICE_UNAVAILABLE':
        return 'Serviço de autenticação indisponível. Tente de novo em instantes.';
      default:
        break;
    }
  }
  return adminErrorMessage(err);
}
