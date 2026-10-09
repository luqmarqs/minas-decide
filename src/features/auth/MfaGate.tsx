import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import {
  getAssurance,
  listTotpFactors,
  MfaError,
  needsStepUp,
  verifyTotp,
  type Assurance,
} from './mfa';

/** 6-digit one-time code input (autocomplete="one-time-code", numeric keyboard). */
export function OtpField({
  id,
  value,
  onChange,
  error,
  label = 'Código de 6 números do app autenticador',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  label?: string;
}) {
  return (
    <Field label={label} required id={id} error={error ?? undefined}>
      {(p) => (
        <Input
          {...p}
          className="max-w-48 font-mono text-lg tracking-widest"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, ''))}
        />
      )}
    </Field>
  );
}

type GateState =
  | { s: 'checking' }
  | { s: 'ok'; assurance: Assurance }
  | { s: 'need'; factorId: string }
  | { s: 'error'; message: string };

export interface MfaGateProps {
  children: ReactNode;
  /** Text under the title explaining why the code is needed here. */
  reason?: string;
  /** Show a hint to enrol when the account has no factor yet (e.g. /admin). */
  suggestEnrol?: boolean;
}

/**
 * Step-up gate (P-AUTH-1). When the account has a verified TOTP factor and the
 * session is still aal1, asks for the code (challenge + verify + refreshSession)
 * BEFORE rendering `children` — so the protected panel never loads with an aal1
 * token. No bypass: the Worker checks the `aal` claim itself.
 */
export function MfaGate({ children, reason, suggestEnrol }: MfaGateProps) {
  const uid = useId().replace(/:/g, '');
  const queryClient = useQueryClient();
  const [state, setState] = useState<GateState>({ s: 'checking' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const a = await getAssurance();
        if (!needsStepUp(a)) {
          if (alive) setState({ s: 'ok', assurance: a });
          return;
        }
        const factor = (await listTotpFactors()).find((f) => f.status === 'verified');
        if (!alive) return;
        setState(
          factor
            ? { s: 'need', factorId: factor.id }
            : { s: 'error', message: 'Nenhum autenticador verificado encontrado nesta conta.' },
        );
      } catch (err) {
        if (alive)
          setState({
            s: 'error',
            message: err instanceof Error ? err.message : 'Não foi possível verificar o MFA.',
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.s !== 'need' || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(state.factorId, code);
      setCode('');
      // Anything fetched with the aal1 token is stale now.
      await queryClient.invalidateQueries();
      setState({ s: 'ok', assurance: { current: 'aal2', next: 'aal2' } });
    } catch (err) {
      setError(err instanceof MfaError ? err.message : 'Não foi possível verificar o código.');
      document.getElementById(`${uid}-code`)?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (state.s === 'checking') return <LoadingBlock label="Verificando segundo fator…" lines={2} />;
  if (state.s === 'error') {
    return (
      <ErrorState
        title="Verificação em duas etapas indisponível"
        message={state.message}
        onRetry={() => {
          setState({ s: 'checking' });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (state.s === 'need') {
    return (
      <section
        aria-labelledby={`${uid}-title`}
        className="flex max-w-xl flex-col gap-4 rounded-md border border-border-strong bg-surface-raised p-4"
      >
        <div>
          <h2 id={`${uid}-title`} className="text-xl">
            Confirme o segundo fator
          </h2>
          <p className="mt-1 text-sm text-secondary">
            {reason ??
              'Esta área exige verificação em duas etapas. Abra seu app autenticador e digite o código atual.'}
          </p>
        </div>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
          <OtpField id={`${uid}-code`} value={code} onChange={setCode} error={error} />
          <div>
            <Button type="submit" loading={busy} loadingText="Verificando…">
              Verificar e continuar
            </Button>
          </div>
        </form>
      </section>
    );
  }
  return (
    <>
      {suggestEnrol && state.assurance.next !== 'aal2' ? (
        <Note tone="warning">
          Sua conta ainda não tem verificação em duas etapas. Fora do ambiente local o servidor
          recusa moderação sem MFA:{' '}
          <Link to="/conta/seguranca" className="underline">
            ativar em Segurança da conta
          </Link>
          .
        </Note>
      ) : null}
      {children}
    </>
  );
}
