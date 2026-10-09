import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { clerkErrorCode, clerkErrorMessage } from '@/lib/clerk';
import { CodeActions, CodeStep } from './CodeStep';
import { CODE_RE, useEmailCodeSignIn } from './emailCode';

const Email = z.string().trim().toLowerCase().email().max(254);

export interface SignInCodeFormProps {
  /** Called after the Clerk session is active. */
  onSignedIn: () => void;
  idPrefix?: string;
}

/**
 * "Entrar com código" (ADR 0005): e-mail → 6-digit code by e-mail → session. Same look as
 * the sign-up form; no password. Clerk's own bot protection applies to these calls.
 */
export function SignInCodeForm({ onSignedIn, idPrefix = 'entrar' }: SignInCodeFormProps) {
  const flow = useEmailCodeSignIn();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailId = `${idPrefix}-email`;
  const codeId = `${idPrefix}-code`;

  async function sendCode() {
    setFormError(null);
    setNotFound(false);
    const parsed = Email.safeParse(email);
    if (!parsed.success) {
      setEmailError('Informe um e-mail válido.');
      document.getElementById(emailId)?.focus();
      return;
    }
    setEmailError(null);
    setBusy(true);
    try {
      await flow.start(parsed.data);
      setCode('');
      setCodeError(null);
      setSentTo(parsed.data);
    } catch (err) {
      setNotFound(clerkErrorCode(err) === 'form_identifier_not_found');
      setFormError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!CODE_RE.test(code)) {
      setCodeError('Digite os 6 números do código.');
      document.getElementById(codeId)?.focus();
      return;
    }
    setCodeError(null);
    setBusy(true);
    try {
      await flow.verify(code);
      onSignedIn();
    } catch (err) {
      setCodeError(clerkErrorMessage(err));
      document.getElementById(codeId)?.focus();
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (sentTo) void confirm();
    else void sendCode();
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Entrar">
      {sentTo ? (
        <>
          <CodeStep
            idPrefix={idPrefix}
            email={sentTo}
            code={code}
            onCodeChange={setCode}
            error={codeError}
            title="Confira seu e-mail"
          />
          <CodeActions
            email={sentTo}
            verifying={busy}
            submitLabel="Entrar"
            verifyingLabel="Entrando…"
            onResend={flow.resend}
            onChangeEmail={() => {
              setSentTo(null);
              setCode('');
              setCodeError(null);
              window.requestAnimationFrame(() => document.getElementById(emailId)?.focus());
            }}
          />
        </>
      ) : (
        <>
          <Field
            label="E-mail"
            required
            id={emailId}
            error={emailError ?? undefined}
            hint="O e-mail do seu cadastro. Enviamos um código de 6 números; não há senha."
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          {formError ? (
            <div role="alert" className="rounded-md border border-error/40 bg-error-soft p-3">
              <p className="text-sm text-primary">{formError}</p>
              {notFound ? (
                <Link
                  to="/participar"
                  className="mt-1 inline-flex min-h-6 items-center text-sm underline"
                >
                  Fazer cadastro
                </Link>
              ) : null}
            </div>
          ) : null}
          <div>
            <Button type="submit" size="lg" loading={busy} loadingText="Enviando código…">
              Receber código
            </Button>
          </div>
        </>
      )}
      <div id="clerk-captcha" />
    </form>
  );
}
