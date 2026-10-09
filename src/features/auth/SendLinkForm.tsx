import { useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { rememberAuthNext } from '@/lib/auth';
import { TurnstileWidget, type TurnstileHandle } from '@/lib/turnstile';
import { sendMagicLink } from '@/features/registration/api';
import { submitErrorMessage } from '@/features/registration/formErrors';

const Email = z.string().trim().toLowerCase().email().max(254);

export interface SendLinkFormProps {
  /** Internal path to open after the link is used (validated again on return). */
  next?: string;
  title?: string;
  description?: string;
  idPrefix?: string;
}

/**
 * "Receber link de acesso por e-mail" (POST /auth/send-link + Turnstile). The
 * answer is always neutral: it never reveals whether the e-mail has an account.
 */
export function SendLinkForm({
  next,
  title = 'Receber link de acesso por e-mail',
  description = 'Funciona para quem já se cadastrou. O link entra nesta conta neste navegador.',
  idPrefix = 'link',
}: SendLinkFormProps) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; turnstile?: string }>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const ts = useRef<TurnstileHandle>(null);
  const emailId = `${idPrefix}-email`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    const parsed = Email.safeParse(email);
    if (!parsed.success) nextErrors.email = 'Informe um e-mail válido.';
    if (!token) nextErrors.turnstile = 'Conclua a verificação de segurança antes de enviar.';
    setErrors(nextErrors);
    if (nextErrors.email) {
      document.getElementById(emailId)?.focus();
      return;
    }
    if (nextErrors.turnstile || !parsed.success || !token) {
      document.getElementById(`${idPrefix}-turnstile`)?.focus();
      return;
    }
    setStatus('sending');
    try {
      if (next) rememberAuthNext(next);
      const res = await sendMagicLink({ email: parsed.data, turnstile_token: token });
      setMessage(res.message);
      setStatus('sent');
    } catch (err) {
      setMessage(submitErrorMessage(err));
      setStatus('error');
    } finally {
      ts.current?.reset();
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-md border border-border p-4"
      aria-labelledby={`${idPrefix}-title`}
    >
      <div>
        <h2 id={`${idPrefix}-title`} className="font-body text-lg font-semibold tracking-normal">
          {title}
        </h2>
        <p className="mt-1 text-sm text-secondary">{description}</p>
      </div>
      <Field label="E-mail" required error={errors.email} id={emailId}>
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <TurnstileWidget
        ref={ts}
        id={`${idPrefix}-turnstile`}
        action="send_link"
        onToken={setToken}
        error={errors.turnstile}
      />
      <div aria-live="polite" role="status" className="text-sm">
        {status === 'sent' ? (
          <p className="rounded-md bg-info-soft p-3 text-primary">
            {message} Confira também o spam. O link vale por pouco tempo e só pode ser usado uma
            vez.
          </p>
        ) : null}
      </div>
      {status === 'error' ? (
        <p role="alert" className="rounded-md bg-error-soft p-3 text-sm text-primary">
          {message}
        </p>
      ) : null}
      <div>
        <Button type="submit" loading={status === 'sending'} loadingText="Enviando…">
          Enviar link
        </Button>
      </div>
    </form>
  );
}
