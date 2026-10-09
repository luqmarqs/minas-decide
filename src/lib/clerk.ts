/**
 * Clerk configuration for the browser (ADR 0005). Only public values live here: the
 * publishable key (`VITE_CLERK_PUBLISHABLE_KEY`), routes, appearance and a minimal PT-BR
 * localization. `CLERK_SECRET_KEY` exists only in the Worker.
 */
import type { ComponentProps } from 'react';
import type { ClerkProvider } from '@clerk/clerk-react';

type ClerkProps = ComponentProps<typeof ClerkProvider>;

export const SIGN_IN_PATH = '/entrar';
export const SIGN_UP_PATH = '/participar';

export function clerkPublishableKey(): string {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

/** `false` when the environment has no (valid-looking) publishable key: auth UI degrades honestly. */
export function isClerkConfigured(): boolean {
  return /^pk_(test|live)_[A-Za-z0-9+/=_-]{8,}$/.test(clerkPublishableKey());
}

function cssToken(name: string): string | undefined {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Brand tokens → Clerk variables (read from the computed tokens so the active brand theme
 * wins). Only used by the few Clerk-rendered surfaces (bot-protection challenge, any
 * fallback component); our sign-up/sign-in flows are custom and use our own components.
 */
export function clerkAppearance(): ClerkProps['appearance'] {
  const variables: Record<string, string> = {};
  const primary = cssToken('--color-action-primary');
  const font = cssToken('--font-body');
  const radius = cssToken('--radius-md');
  const text = cssToken('--color-text-primary');
  const surface = cssToken('--color-surface-raised');
  if (primary) variables.colorPrimary = primary;
  if (font) variables.fontFamily = font;
  if (radius) variables.borderRadius = radius;
  if (text) variables.colorText = text;
  if (surface) variables.colorBackground = surface;
  return { variables };
}

/** Minimal PT-BR strings for Clerk-rendered UI (`@clerk/localizations` is not installed). */
export const clerkPtBR: ClerkProps['localization'] = {
  locale: 'pt-BR',
  formFieldLabel__emailAddress: 'E-mail',
  formFieldLabel__firstName: 'Nome',
  formButtonPrimary: 'Continuar',
  signIn: {
    start: {
      title: 'Entrar no Minas Decide',
      subtitle: 'Enviamos um código para o seu e-mail.',
      actionText: 'Ainda não tem cadastro?',
      actionLink: 'Cadastre-se',
    },
    emailCode: {
      title: 'Confira seu e-mail',
      subtitle: 'para continuar no Minas Decide',
      formTitle: 'Código de verificação',
      resendButton: 'Reenviar código',
    },
  },
  userButton: {
    action__signOut: 'Sair',
    action__manageAccount: 'Gerenciar conta',
  },
};

/** First error code of a Clerk API error (duck-typed: `{ errors: [{ code }] }`). */
export function clerkErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const errors = (err as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first: unknown = errors[0];
  if (!first || typeof first !== 'object') return null;
  const code = (first as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Parameter name of the first Clerk error, when it names one (e.g. `first_name`). */
export function clerkErrorParam(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const errors = (err as { errors?: { meta?: { paramName?: unknown } }[] }).errors;
  const p = Array.isArray(errors) ? errors[0]?.meta?.paramName : undefined;
  return typeof p === 'string' ? p : null;
}

/** PT-BR message for a Clerk error. Never echoes Clerk's English text. */
export function clerkErrorMessage(err: unknown): string {
  switch (clerkErrorCode(err)) {
    case 'form_identifier_exists':
      return 'Este e-mail já tem cadastro. Entre com um código enviado para ele.';
    case 'form_identifier_not_found':
      return 'Não encontramos cadastro com este e-mail. Confira o endereço ou faça o cadastro.';
    case 'form_code_incorrect':
      return 'Código incorreto. Confira os 6 números e tente de novo.';
    case 'verification_expired':
      return 'Este código expirou. Peça um novo código.';
    case 'verification_failed':
      return 'Muitas tentativas com este código. Peça um novo código.';
    case 'form_param_format_invalid':
    case 'form_param_value_invalid':
    case 'form_email_address_blocked':
      return 'Este e-mail não pode ser usado. Confira o endereço.';
    case 'too_many_requests':
    case 'rate_limit_exceeded':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 'captcha_invalid':
    case 'captcha_missing_token':
      return 'A verificação anti-robô do login falhou. Recarregue a página e tente de novo.';
    case 'strategy_unavailable':
      return 'Entrar por código não está disponível para este e-mail. Fale com a equipe.';
    case 'flow_incomplete':
      return 'O login pediu uma etapa extra que este site não oferece. Fale com a equipe.';
    case 'session_exists':
      return 'Você já entrou neste navegador.';
    case 'not_allowed_access':
    case 'identifier_not_allowed':
      return 'Este e-mail não pode se cadastrar agora.';
    default:
      return 'Não foi possível falar com o serviço de login agora. Tente de novo em instantes.';
  }
}

/** Error raised by our own flow checks, shaped like a Clerk API error so the same mapping applies. */
export class AuthFlowError extends Error {
  readonly errors: { code: string }[];
  constructor(code: 'strategy_unavailable' | 'flow_incomplete' | 'not_loaded') {
    super(code);
    this.name = 'AuthFlowError';
    this.errors = [{ code }];
  }
}
