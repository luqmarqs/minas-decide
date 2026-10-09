import { useSignUp } from '@clerk/clerk-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { RegistrationInput } from '@shared/contracts/registration.ts';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, FormErrorSummary } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import type { AuthSession } from '@/lib/auth';
import { AuthFlowError, clerkErrorCode, clerkErrorMessage, clerkErrorParam } from '@/lib/clerk';
import { TurnstileWidget, type TurnstileHandle } from '@/lib/turnstile';
import { CodeActions, CodeStep } from '@/features/auth/CodeStep';
import { CODE_RE, useEmailCodeSignIn } from '@/features/auth/emailCode';
import { CONSENT_VERSION, submitRegistration, type ObrigadoState } from './api';
import {
  focusFirstError,
  serverFieldErrors,
  submitErrorMessage,
  zodFieldErrors,
  type FieldErrors,
} from './formErrors';
import { TerritoryField } from './TerritoryField';

const ORDER = [
  'display_name',
  'email',
  'phone',
  'territory_id',
  'terms_accepted',
  'turnstile_token',
] as const;

const IDS: Record<string, string> = {
  display_name: 'reg-name',
  email: 'reg-email',
  phone: 'reg-phone',
  territory_id: 'reg-territory',
  terms_accepted: 'reg-terms',
  contact_opt_in: 'reg-optin',
  turnstile_token: 'reg-turnstile',
};

const MESSAGES: Record<string, string> = {
  display_name: 'Informe seu nome (de 2 a 120 caracteres).',
  email: 'Informe um e-mail válido.',
  phone: 'Informe um WhatsApp brasileiro válido com DDD.',
  territory_id: 'Escolha sua cidade ou bairro.',
  terms_accepted: 'Para se cadastrar é preciso aceitar os termos e a política de privacidade.',
  turnstile_token: 'Conclua a verificação de segurança antes de enviar.',
};

const EMAIL_ERROR_CODES = new Set([
  'form_param_format_invalid',
  'form_param_value_invalid',
  'form_email_address_blocked',
]);

const idOf = (k: string) => IDS[k] ?? k;

type Step = { s: 'form' } | { s: 'code'; flow: 'signup' | 'signin'; email: string };
type Busy = null | 'account' | 'signin' | 'verify' | 'register';

export interface RegistrationFormProps {
  initialTerritoryId: string | null;
  /** Active Clerk session: no account creation, the e-mail comes from the account. */
  session: AuthSession | null;
}

/**
 * Cadastro rápido (spec §3.3, ADR 0005). Without a session: Clerk sign-up with an e-mail
 * code (step 2 inline), then POST /registrations with the new session token. With a
 * session: only POST /registrations (idempotent server-side). Navigates to /obrigado only
 * after the Worker answers.
 */
export function RegistrationForm({ initialTerritoryId, session }: RegistrationFormProps) {
  const navigate = useNavigate();
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();
  const signInFlow = useEmailCodeSignIn();
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [phone, setPhone] = useState('');
  const [territoryId, setTerritoryId] = useState<string | null>(initialTerritoryId);
  // Home (D28): follow the territory selected on the map until the person picks one here.
  const [territoryTouched, setTerritoryTouched] = useState(false);
  const [lastInitial, setLastInitial] = useState(initialTerritoryId);
  if (lastInitial !== initialTerritoryId) {
    setLastInitial(initialTerritoryId);
    if (!territoryTouched) setTerritoryId(initialTerritoryId);
  }
  const [terms, setTerms] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** E-mail already has a Clerk account: offer "Entrar com código" (form stays filled). */
  const [exists, setExists] = useState(false);
  const [step, setStep] = useState<Step>({ s: 'form' });
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const ts = useRef<TurnstileHandle>(null);

  const signedIn = !!session;
  const name = nameInput ?? session?.user.firstName ?? '';
  const email = signedIn ? (session.user.email ?? '') : emailInput;

  function showErrors(next: FieldErrors) {
    setErrors(next);
    focusFirstError([...ORDER], next, idOf);
  }

  function parseInput() {
    return RegistrationInput.safeParse({
      display_name: name,
      email,
      phone,
      territory_id: territoryId ?? '',
      terms_accepted: terms,
      contact_opt_in: optIn,
      consent_version: CONSENT_VERSION,
      turnstile_token: token ?? '',
    });
  }

  /** POST /registrations with the Clerk token → /obrigado. Errors bring the form back. */
  async function register() {
    const parsed = parseInput();
    if (!parsed.success) {
      setStep({ s: 'form' });
      showErrors(zodFieldErrors(parsed.error, MESSAGES));
      setBusy(null);
      return;
    }
    setBusy('register');
    try {
      const result = await submitRegistration(parsed.data);
      const state: ObrigadoState = { registered: true };
      navigate(`/obrigado?territorio=${encodeURIComponent(result.territory_id)}`, { state });
    } catch (err) {
      setStep({ s: 'form' });
      const fields = serverFieldErrors(err);
      if (Object.keys(fields).length) showErrors(fields);
      setFormError(
        Object.keys(fields).length ? 'Revise os campos destacados.' : submitErrorMessage(err),
      );
      setBusy(null);
    } finally {
      // Turnstile tokens are single use: always get a fresh one for the next attempt.
      ts.current?.reset();
    }
  }

  async function createAccount(addr: string, firstName: string) {
    if (!signUpLoaded || !signUp) throw new AuthFlowError('not_loaded');
    try {
      await signUp.create({ emailAddress: addr, firstName });
    } catch (err) {
      // Instance without the "first name" attribute: create with the e-mail only (the name
      // still reaches our profile through POST /registrations).
      if (clerkErrorCode(err) === 'form_param_unknown' && clerkErrorParam(err) === 'first_name') {
        await signUp.create({ emailAddress: addr });
      } else {
        throw err;
      }
    }
    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
  }

  async function onSubmitForm() {
    setFormError(null);
    setExists(false);
    const parsed = parseInput();
    if (!parsed.success) {
      showErrors(zodFieldErrors(parsed.error, MESSAGES));
      return;
    }
    setErrors({});
    if (signedIn) {
      await register();
      return;
    }
    setBusy('account');
    try {
      await createAccount(parsed.data.email, parsed.data.display_name);
      setCode('');
      setCodeError(null);
      setStep({ s: 'code', flow: 'signup', email: parsed.data.email });
    } catch (err) {
      const c = clerkErrorCode(err);
      if (c === 'form_identifier_exists') setExists(true);
      else if (c && EMAIL_ERROR_CODES.has(c)) showErrors({ email: clerkErrorMessage(err) });
      setFormError(clerkErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function startSignIn() {
    const parsed = RegistrationInput.shape.email.safeParse(email);
    if (!parsed.success) {
      showErrors({ email: MESSAGES.email! });
      return;
    }
    setBusy('signin');
    setFormError(null);
    try {
      await signInFlow.start(parsed.data);
      setExists(false);
      setCode('');
      setCodeError(null);
      setStep({ s: 'code', flow: 'signin', email: parsed.data });
    } catch (err) {
      setFormError(clerkErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onSubmitCode(flow: 'signup' | 'signin') {
    if (!CODE_RE.test(code)) {
      setCodeError('Digite os 6 números do código.');
      document.getElementById('reg-code')?.focus();
      return;
    }
    if (!token) {
      setErrors({ turnstile_token: MESSAGES.turnstile_token! });
      document.getElementById(IDS.turnstile_token!)?.focus();
      return;
    }
    setCodeError(null);
    setErrors({});
    setBusy('verify');
    try {
      if (flow === 'signup') {
        if (!signUpLoaded || !signUp || !setActive) throw new AuthFlowError('not_loaded');
        const res = await signUp.attemptEmailAddressVerification({ code });
        if (res.status !== 'complete' || !res.createdSessionId) {
          throw new AuthFlowError('flow_incomplete');
        }
        await setActive({ session: res.createdSessionId });
      } else {
        await signInFlow.verify(code);
      }
    } catch (err) {
      setCodeError(clerkErrorMessage(err));
      setBusy(null);
      document.getElementById('reg-code')?.focus();
      return;
    }
    await register();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step.s === 'code') void onSubmitCode(step.flow);
    else void onSubmitForm();
  }

  function backToForm() {
    setStep({ s: 'form' });
    setCode('');
    setCodeError(null);
    window.requestAnimationFrame(() => document.getElementById(IDS.email!)?.focus());
  }

  async function resendCode(flow: 'signup' | 'signin') {
    if (flow === 'signin') return signInFlow.resend();
    if (!signUp) throw new AuthFlowError('not_loaded');
    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
  }

  const summary = ORDER.filter((k) => errors[k]).map((k) => ({
    fieldId: idOf(k),
    message: errors[k]!,
  }));

  // Same widget instance across both steps: it keeps a valid (auto-refreshed) token while
  // the person reads the e-mail; the server validates it on POST /registrations.
  const turnstile = (
    <TurnstileWidget
      ref={ts}
      id={IDS.turnstile_token}
      action="registration"
      onToken={setToken}
      error={errors.turnstile_token}
    />
  );

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
      aria-label="Cadastro"
      data-step={step.s}
    >
      {step.s === 'code' ? (
        <CodeStep
          idPrefix="reg"
          email={step.email}
          code={code}
          onCodeChange={setCode}
          error={codeError}
          title={step.flow === 'signin' ? 'Entrar com código' : 'Confirme seu e-mail'}
        />
      ) : (
        <>
          <FormErrorSummary errors={summary} />
          {signedIn ? (
            <p className="text-sm text-secondary">
              Você já entrou com uma conta de e-mail verificado. Complete os dados abaixo para
              participar.
            </p>
          ) : null}
          <Field
            label="Nome"
            required
            id={IDS.display_name}
            error={errors.display_name}
            hint="Como você quer ser chamado(a)."
          >
            {(p) => (
              <Input
                {...p}
                autoComplete="name"
                value={name}
                maxLength={120}
                onChange={(e) => setNameInput(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="E-mail"
            required
            id={IDS.email}
            error={errors.email}
            hint={
              signedIn
                ? 'E-mail da sua conta (já verificado).'
                : 'Enviamos um código de 6 números para confirmar. Não usamos senha.'
            }
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                maxLength={254}
                readOnly={signedIn}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setExists(false);
                }}
              />
            )}
          </Field>
          <Field
            label="WhatsApp"
            required
            id={IDS.phone}
            error={errors.phone}
            hint="Com DDD, por exemplo (31) 99999-8888. Não é publicado."
          >
            {(p) => (
              <Input
                {...p}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                maxLength={20}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
          </Field>
          <TerritoryField
            id={IDS.territory_id!}
            label="Cidade ou bairro onde quer atuar"
            value={territoryId}
            onChange={(entry) => {
              setTerritoryTouched(true);
              setTerritoryId(entry.id);
            }}
            error={errors.territory_id}
          />
          <div className="flex flex-col gap-3">
            <Checkbox
              id={IDS.terms_accepted}
              checked={terms}
              onCheckedChange={setTerms}
              required
              invalid={!!errors.terms_accepted}
              aria-describedby={errors.terms_accepted ? 'reg-terms-error' : undefined}
              label={
                <>
                  Li e aceito os{' '}
                  <Link to="/termos" target="_blank" className="underline">
                    termos de uso
                  </Link>{' '}
                  e a{' '}
                  <Link to="/privacidade" target="_blank" className="underline">
                    política de privacidade
                  </Link>{' '}
                  (obrigatório).
                </>
              }
            />
            {errors.terms_accepted ? (
              <p id="reg-terms-error" className="text-sm font-medium text-error">
                {errors.terms_accepted}
              </p>
            ) : null}
            <Checkbox
              id={IDS.contact_opt_in}
              checked={optIn}
              onCheckedChange={setOptIn}
              label="Quero receber comunicações sobre atividades na minha região (opcional)."
              description="Você pode desistir quando quiser. Sem isso, usamos seu contato só para o cadastro."
            />
          </div>
        </>
      )}
      {turnstile}
      {/* Clerk bot protection (Smart CAPTCHA) renders here during sign-up, only when it challenges. */}
      <div id="clerk-captcha" />
      {step.s === 'code' ? (
        <CodeActions
          email={step.email}
          verifying={busy === 'verify' || busy === 'register'}
          verifyingLabel={busy === 'register' ? 'Enviando cadastro…' : 'Confirmando…'}
          submitLabel="Confirmar e cadastrar"
          onResend={() => resendCode(step.flow)}
          onChangeEmail={backToForm}
        />
      ) : (
        <>
          {formError ? (
            <div role="alert" className="rounded-md border border-error/40 bg-error-soft p-3">
              <p className="text-sm text-primary">{formError}</p>
              {exists ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  loading={busy === 'signin'}
                  loadingText="Enviando código…"
                  onClick={() => void startSignIn()}
                >
                  Entrar com código
                </Button>
              ) : null}
            </div>
          ) : null}
          <div>
            <Button
              type="submit"
              size="lg"
              loading={busy === 'account' || busy === 'register'}
              loadingText={busy === 'account' ? 'Enviando código…' : 'Enviando cadastro…'}
            >
              {signedIn ? 'Concluir cadastro' : 'Cadastrar'}
            </Button>
          </div>
          <p className="text-sm text-muted">
            Não pedimos CPF, endereço nem senha. Seu e-mail e WhatsApp nunca aparecem publicamente.
            {signedIn ? null : (
              <>
                {' '}
                Já tem cadastro?{' '}
                <Link to="/entrar" className="underline">
                  Entrar com código
                </Link>
                .
              </>
            )}
          </p>
        </>
      )}
    </form>
  );
}
