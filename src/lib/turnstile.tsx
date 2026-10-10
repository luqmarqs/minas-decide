/**
 * Cloudflare Turnstile: script loaded on demand (only on pages with a form) and the
 * widget rendered explicitly. Tokens are single-use: callers must call `reset()`
 * after every submit attempt (success or error). The server always re-validates
 * (Siteverify); the client check is only UX.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const LOAD_TIMEOUT_MS = 12_000;

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  language?: string;
  theme?: 'auto' | 'light' | 'dark';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  'timeout-callback'?: () => void;
}

export interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    const timer = window.setTimeout(() => reject(new Error('turnstile timeout')), LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('turnstile missing'));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('turnstile load error'));
    };
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    // Allow a later retry to inject the script again.
    scriptPromise = null;
    document.querySelector(`script[src="${SCRIPT_SRC}"]`)?.remove();
    throw err;
  });
  return scriptPromise;
}

function turnstileSiteKey(): string {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
}

/** Cloudflare's official test sitekeys (always pass / always fail / interactive). */
function isTestSiteKey(key: string): boolean {
  return /^[123]x0{20}AA$/.test(key);
}

export interface TurnstileHandle {
  reset: () => void;
}

export interface TurnstileWidgetProps {
  action: string;
  onToken: (token: string | null) => void;
  /** Error to show under the widget (e.g. "Conclua a verificação"). */
  error?: string;
  id?: string;
}

type WidgetState = 'loading' | 'ready' | 'unavailable';

export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ action, onToken, error, id = 'turnstile' }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const apiRef = useRef<TurnstileApi | null>(null);
    const onTokenRef = useRef(onToken);
    const [state, setState] = useState<WidgetState>('loading');
    const [attempt, setAttempt] = useState(0);
    const sitekey = turnstileSiteKey();

    useEffect(() => {
      onTokenRef.current = onToken;
    }, [onToken]);

    useEffect(() => {
      let alive = true;
      if (!sitekey) {
        setState('unavailable');
        return;
      }
      setState('loading');
      loadTurnstile()
        .then((api) => {
          if (!alive || !box.current) return;
          apiRef.current = api;
          box.current.innerHTML = '';
          widgetId.current = api.render(box.current, {
            sitekey,
            action,
            language: 'pt-br',
            theme: 'auto',
            callback: (t) => onTokenRef.current(t),
            'expired-callback': () => onTokenRef.current(null),
            'timeout-callback': () => onTokenRef.current(null),
            'error-callback': () => {
              onTokenRef.current(null);
              setState('unavailable');
            },
          });
          setState('ready');
        })
        .catch(() => {
          if (alive) setState('unavailable');
        });
      return () => {
        alive = false;
        if (widgetId.current && apiRef.current) {
          try {
            apiRef.current.remove(widgetId.current);
          } catch {
            // widget already gone
          }
        }
        widgetId.current = null;
      };
    }, [sitekey, action, attempt]);

    const reset = useCallback(() => {
      onTokenRef.current(null);
      if (widgetId.current && apiRef.current) {
        try {
          apiRef.current.reset(widgetId.current);
          return;
        } catch {
          // fall through to a full re-render
        }
      }
      setAttempt((a) => a + 1);
    }, []);

    useImperativeHandle(ref, () => ({ reset }), [reset]);

    const errorId = error ? `${id}-error` : undefined;
    return (
      <div id={id} tabIndex={-1} className="flex flex-col gap-2 outline-none">
        <p className="text-sm font-semibold text-primary">Verificação de segurança</p>
        {isTestSiteKey(sitekey) ? (
          <p className="text-xs text-muted">
            Ambiente de teste: chave oficial de teste da Cloudflare (não é proteção real).
          </p>
        ) : null}
        {/* The widget iframe is a fixed 300 px: scale it down on very narrow screens (< 360 px) so the
            page never scrolls sideways (WCAG 1.4.10 reflow). */}
        <div
          ref={box}
          aria-describedby={errorId}
          className="min-h-[65px] max-w-full origin-left max-[359px]:scale-[0.84]"
        />
        {state === 'loading' ? (
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <Spinner size={16} /> Carregando verificação…
          </p>
        ) : null}
        {state === 'unavailable' ? (
          <div role="alert" className="rounded-md border border-warning/40 bg-warning-soft p-3">
            <p className="text-sm text-primary">
              A verificação de segurança não carregou (rede, bloqueador de conteúdo ou serviço
              indisponível). Sem ela não é possível enviar.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Tentar carregar de novo
            </Button>
          </div>
        ) : null}
        {error ? (
          <p id={errorId} className="flex items-start gap-1 text-sm font-medium text-error">
            <span aria-hidden="true">!</span>
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    );
  },
);
