import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { RegistrationInput } from '@shared/contracts/registration.ts';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, FormErrorSummary } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError } from '@/lib/api';
import { ensureProvisionalSession, getCurrentSession, signOut } from '@/lib/auth';
import { TurnstileWidget, type TurnstileHandle } from '@/lib/turnstile';
import { SendLinkForm } from '@/features/auth/SendLinkForm';
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

const idOf = (k: string) => IDS[k] ?? k;

export interface RegistrationFormProps {
  initialTerritoryId: string | null;
}

/** Cadastro rápido (spec §3.3, §12.8). */
export function RegistrationForm({ initialTerritoryId }: RegistrationFormProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
  const [conflict, setConflict] = useState(false);
  /** 409 while a provisional session exists: offer to sign out and start over (P-UX-1). */
  const [canRestart, setCanRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restarted, setRestarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const ts = useRef<TurnstileHandle>(null);

  function showErrors(next: FieldErrors) {
    setErrors(next);
    focusFirstError([...ORDER], next, idOf);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setConflict(false);
    setCanRestart(false);
    setRestarted(false);
    const parsed = RegistrationInput.safeParse({
      display_name: name,
      email,
      phone,
      territory_id: territoryId ?? '',
      terms_accepted: terms,
      contact_opt_in: optIn,
      consent_version: CONSENT_VERSION,
      turnstile_token: token ?? '',
    });
    if (!parsed.success) {
      showErrors(zodFieldErrors(parsed.error, MESSAGES));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await submitRegistration(parsed.data);
      const state: ObrigadoState = { emailState: result.email_verification_state };
      navigate(`/obrigado?territorio=${encodeURIComponent(result.territory_id)}`, { state });
    } catch (err) {
      const fields = serverFieldErrors(err);
      if (Object.keys(fields).length) showErrors(fields);
      if (err instanceof ApiClientError && err.code === 'CONFLICT') {
        setConflict(true);
        setFormError(err.message);
        const current = await getCurrentSession().catch(() => null);
        setCanRestart(!!current?.user.is_anonymous);
      } else {
        setFormError(
          Object.keys(fields).length ? 'Revise os campos destacados.' : submitErrorMessage(err),
        );
      }
      setSubmitting(false);
    } finally {
      // Turnstile tokens are single use: always get a fresh one for the next attempt.
      ts.current?.reset();
    }
  }

  async function restartWithOtherEmail() {
    setRestarting(true);
    try {
      await signOut();
      await ensureProvisionalSession();
      setConflict(false);
      setCanRestart(false);
      setFormError(null);
      setRestarted(true);
      document.getElementById(IDS.email!)?.focus();
    } catch (err) {
      setFormError(submitErrorMessage(err));
    } finally {
      setRestarting(false);
    }
  }

  const summary = ORDER.filter((k) => errors[k]).map((k) => ({
    fieldId: idOf(k),
    message: errors[k]!,
  }));

  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Cadastro">
        <FormErrorSummary errors={summary} />
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
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="E-mail"
          required
          id={IDS.email}
          error={errors.email}
          hint="Enviamos um link para confirmar. Não usamos senha."
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
        <TurnstileWidget
          ref={ts}
          id={IDS.turnstile_token}
          action="registration"
          onToken={setToken}
          error={errors.turnstile_token}
        />
        {formError ? (
          <div role="alert" className="rounded-md border border-error/40 bg-error-soft p-3">
            <p className="text-sm text-primary">{formError}</p>
            {conflict ? (
              <a
                href="#entrar-por-email"
                className="mt-1 inline-flex min-h-6 items-center text-sm underline"
              >
                Entrar por e-mail
              </a>
            ) : null}
            {canRestart ? (
              <div className="mt-2">
                <p className="text-sm text-secondary">
                  Este navegador já tem um cadastro provisório com outro e-mail.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  loading={restarting}
                  loadingText="Encerrando sessão…"
                  onClick={() => void restartWithOtherEmail()}
                >
                  Usar outro e-mail (sair e recomeçar)
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {restarted ? (
          <p role="status" className="text-sm">
            Sessão anterior encerrada. Confira o e-mail e envie o cadastro de novo.
          </p>
        ) : null}
        <div>
          <Button type="submit" size="lg" loading={submitting} loadingText="Enviando cadastro…">
            Cadastrar
          </Button>
        </div>
        <p className="text-sm text-muted">
          Não pedimos CPF, endereço nem senha. Seu e-mail e WhatsApp nunca aparecem publicamente.
        </p>
      </form>
      {conflict ? (
        <div id="entrar-por-email">
          <SendLinkForm idPrefix="reg-link" title="Entrar por e-mail" />
        </div>
      ) : null}
    </div>
  );
}
