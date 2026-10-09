import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { clerkErrorMessage } from '@/lib/clerk';
import { normalizeCode } from './emailCode';

const RESEND_COOLDOWN_S = 30;

export interface CodeStepProps {
  idPrefix: string;
  email: string;
  code: string;
  onCodeChange: (code: string) => void;
  error?: string | null;
  title?: string;
}

/**
 * Step 2 of the e-mail code flows: "Digite o código enviado para <e-mail>". Focus moves to
 * the code input when it appears. The parent `<form>` owns submit; buttons live in
 * `<CodeActions>` so extra content (Turnstile) can sit between them.
 */
export function CodeStep({
  idPrefix,
  email,
  code,
  onCodeChange,
  error,
  title = 'Confira seu e-mail',
}: CodeStepProps) {
  const inputId = `${idPrefix}-code`;
  const titleId = `${idPrefix}-code-title`;
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    focused.current = true;
    document.getElementById(inputId)?.focus();
  }, [inputId]);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div>
        <h2 id={titleId} className="font-body text-xl font-semibold tracking-normal">
          {title}
        </h2>
        <p className="mt-1 text-secondary">
          Digite o código de 6 números enviado para{' '}
          <strong className="break-all text-primary">{email}</strong>. Confira também o spam. O
          código vale por poucos minutos.
        </p>
      </div>
      <Field label="Código de verificação" required id={inputId} error={error ?? undefined}>
        {(p) => (
          <Input
            {...p}
            className="max-w-48 font-mono text-lg tracking-widest"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={9}
            value={code}
            onChange={(e) => onCodeChange(normalizeCode(e.target.value))}
          />
        )}
      </Field>
    </section>
  );
}

export interface CodeActionsProps {
  email: string;
  verifying: boolean;
  submitLabel?: string;
  verifyingLabel?: string;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
}

/** Submit (type=submit), "Reenviar código" with cooldown and "Trocar e-mail". */
export function CodeActions({
  email,
  verifying,
  submitLabel = 'Confirmar código',
  verifyingLabel = 'Confirmando…',
  onResend,
  onChangeEmail,
}: CodeActionsProps) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setResending(true);
    setResendMsg(null);
    try {
      await onResend();
      setResendMsg({ ok: true, text: `Enviamos um novo código para ${email}.` });
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setResendMsg({ ok: false, text: clerkErrorMessage(err) });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={verifying} loadingText={verifyingLabel}>
          {submitLabel}
        </Button>
        <Button
          variant="secondary"
          disabled={cooldown > 0 || verifying}
          loading={resending}
          loadingText="Reenviando…"
          onClick={() => void resend()}
        >
          {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
        </Button>
        <Button variant="ghost" disabled={verifying} onClick={onChangeEmail}>
          Trocar e-mail
        </Button>
      </div>
      {resendMsg ? (
        <p
          role={resendMsg.ok ? 'status' : 'alert'}
          className={resendMsg.ok ? 'text-sm' : 'text-sm font-medium text-error'}
        >
          {resendMsg.text}
        </p>
      ) : null}
    </div>
  );
}
