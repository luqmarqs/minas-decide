import type { ApiErrorCode } from '../shared/contracts/api.ts';

/** Public, stable error. Message must be generic and safe to show (never SQL/stack). */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(code: ApiErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
  }
}

export const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Revise os dados informados.',
  UNAUTHENTICATED: 'Entre para continuar.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail para continuar.',
  NOT_FOUND: 'Não encontrado.',
  CONFLICT: 'Não foi possível concluir: o estado mudou ou já existe.',
  UNPROCESSABLE: 'Não foi possível processar esta solicitação.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde alguns minutos.',
  TURNSTILE_FAILED: 'Não foi possível validar a verificação de segurança. Tente novamente.',
  WRITES_SUSPENDED: 'Envios temporariamente suspensos. O mapa continua disponível.',
  INTERNAL_ERROR: 'Erro inesperado. Tente novamente.',
};

export function fail(code: ApiErrorCode, message?: string, fields?: Record<string, string>): AppError {
  return new AppError(code, message ?? DEFAULT_MESSAGES[code], fields);
}
