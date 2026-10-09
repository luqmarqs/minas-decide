import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { GroupProposalInput } from '@shared/contracts/groups.ts';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, FormErrorSummary } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { idempotencyKey } from '@/lib/api';
import { useMe, useSession } from '@/lib/auth';
import { TurnstileWidget, type TurnstileHandle } from '@/lib/turnstile';
import { CONSENT_VERSION } from '@/features/registration/api';
import {
  focusFirstError,
  serverFieldErrors,
  submitErrorMessage,
  zodFieldErrors,
  type FieldErrors,
} from '@/features/registration/formErrors';
import { TerritoryField } from '@/features/registration/TerritoryField';
import { useTerritoryName } from '@/features/registration/useTerritoryName';
import { submitGroupProposal } from './api';

const ORDER = [
  'territory_id',
  'name_proposed',
  'join_url_proposed',
  'proposer_name',
  'proposer_email',
  'proposer_phone',
  'responsibility_accepted',
  'turnstile_token',
];

const IDS: Record<string, string> = {
  territory_id: 'gp-territory',
  name_proposed: 'gp-name',
  join_url_proposed: 'gp-url',
  proposer_name: 'gp-proposer-name',
  proposer_email: 'gp-proposer-email',
  proposer_phone: 'gp-proposer-phone',
  responsibility_accepted: 'gp-responsibility',
  turnstile_token: 'gp-turnstile',
};

const MESSAGES: Record<string, string> = {
  territory_id: 'Escolha a cidade ou o bairro do grupo.',
  name_proposed: 'Informe o nome público do grupo (de 3 a 80 caracteres).',
  join_url_proposed:
    'Informe um link de convite oficial do WhatsApp (https://chat.whatsapp.com/...).',
  proposer_name: 'Informe seu nome (de 2 a 120 caracteres).',
  proposer_email: 'Informe um e-mail válido.',
  proposer_phone: 'Informe um WhatsApp brasileiro válido com DDD.',
  responsibility_accepted: 'É preciso declarar a responsabilidade pelo grupo.',
  turnstile_token: 'Conclua a verificação de segurança antes de enviar.',
};

const idOf = (k: string) => IDS[k] ?? k;

/** Proposta de grupo (spec §3.4): fica `pending` até revisão; nunca promete publicação. */
export function GroupProposalForm({ initialTerritoryId }: { initialTerritoryId: string | null }) {
  const session = useSession();
  const me = useMe(session.status === 'active' ? session.session : null);
  const [territoryId, setTerritoryId] = useState<string | null>(initialTerritoryId);
  const [groupName, setGroupName] = useState('');
  const [url, setUrl] = useState('');
  // null = untouched: shows the value consented in the session (still editable).
  const [nameInput, setProposerName] = useState<string | null>(null);
  const [emailInput, setProposerEmail] = useState<string | null>(null);
  const [proposerPhone, setProposerPhone] = useState('');
  const [responsibility, setResponsibility] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // One key per form instance, re-sent on retries (server deduplicates).
  const [idemKey] = useState(() => idempotencyKey());
  const ts = useRef<TurnstileHandle>(null);
  const { label: territoryName } = useTerritoryName(territoryId);

  // Re-use consented data from an existing session (spec §3.4).
  const proposerName = nameInput ?? me.data?.display_name ?? '';
  const proposerEmail =
    emailInput ?? (session.status === 'active' ? (session.session.user.email ?? '') : '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const parsed = GroupProposalInput.safeParse({
      territory_id: territoryId ?? '',
      name_proposed: groupName,
      join_url_proposed: url,
      proposer_name: proposerName,
      proposer_email: proposerEmail,
      proposer_phone: proposerPhone,
      responsibility_accepted: responsibility,
      consent_version: CONSENT_VERSION,
      turnstile_token: token ?? '',
      idempotency_key: idemKey,
    });
    if (!parsed.success) {
      const next = zodFieldErrors(parsed.error, MESSAGES);
      setErrors(next);
      focusFirstError(ORDER, next, idOf);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await submitGroupProposal(parsed.data);
      setDone(true);
    } catch (err) {
      const fields = serverFieldErrors(err);
      setErrors(fields);
      focusFirstError(ORDER, fields, idOf);
      setFormError(
        Object.keys(fields).length ? 'Revise os campos destacados.' : submitErrorMessage(err),
      );
    } finally {
      setSubmitting(false);
      ts.current?.reset();
    }
  }

  if (done) {
    return (
      <section
        aria-labelledby="gp-done"
        role="status"
        className="flex flex-col gap-3 rounded-md border border-success/40 bg-success-soft p-4 text-primary"
      >
        <h2 id="gp-done" className="font-body text-xl font-semibold tracking-normal">
          Proposta enviada para análise
        </h2>
        <p>
          Recebemos a proposta do grupo “{groupName.trim()}” para {territoryName ?? 'a região'}. Uma
          pessoa da equipe vai revisar o link e o território. O grupo{' '}
          <strong>só aparece no site se for aprovado</strong>; não há prazo garantido.
        </p>
        <p className="text-sm text-secondary">
          Seus dados de contato não são publicados: servem apenas para a equipe falar com você.
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={territoryId ? `/territorio/${territoryId}` : '/'} variant="secondary">
            Voltar ao território
          </ButtonLink>
        </div>
      </section>
    );
  }

  const summary = ORDER.filter((k) => errors[k]).map((k) => ({
    fieldId: idOf(k),
    message: errors[k]!,
  }));

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
      aria-label="Proposta de grupo"
    >
      <FormErrorSummary errors={summary} />
      <TerritoryField
        id={IDS.territory_id!}
        label="Cidade ou bairro do grupo"
        value={territoryId}
        onChange={(entry) => setTerritoryId(entry.id)}
        error={errors.territory_id}
      />
      <Field
        label="Nome público do grupo"
        required
        id={IDS.name_proposed}
        error={errors.name_proposed}
      >
        {(p) => (
          <Input
            {...p}
            value={groupName}
            maxLength={80}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Link de convite do WhatsApp"
        required
        id={IDS.join_url_proposed}
        error={errors.join_url_proposed}
        hint="Somente links oficiais, no formato https://chat.whatsapp.com/…"
      >
        {(p) => (
          <Input
            {...p}
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            maxLength={200}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
      </Field>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-base font-semibold">
          Quem está propondo (não é publicado)
        </legend>
        <Field label="Seu nome" required id={IDS.proposer_name} error={errors.proposer_name}>
          {(p) => (
            <Input
              {...p}
              autoComplete="name"
              value={proposerName}
              maxLength={120}
              onChange={(e) => setProposerName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Seu e-mail" required id={IDS.proposer_email} error={errors.proposer_email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={proposerEmail}
              maxLength={254}
              onChange={(e) => setProposerEmail(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Seu WhatsApp"
          required
          id={IDS.proposer_phone}
          error={errors.proposer_phone}
          hint="Com DDD. Só a equipe de revisão vê."
        >
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={proposerPhone}
              maxLength={20}
              onChange={(e) => setProposerPhone(e.target.value)}
            />
          )}
        </Field>
      </fieldset>
      <div className="flex flex-col gap-1">
        <Checkbox
          id={IDS.responsibility_accepted}
          checked={responsibility}
          onCheckedChange={setResponsibility}
          required
          invalid={!!errors.responsibility_accepted}
          aria-describedby={errors.responsibility_accepted ? 'gp-responsibility-error' : undefined}
          label={
            <>
              Declaro que administro (ou tenho autorização para divulgar) este grupo e concordo com
              o tratamento dos meus dados conforme a{' '}
              <Link to="/privacidade" target="_blank" className="underline">
                política de privacidade
              </Link>
              .
            </>
          }
        />
        {errors.responsibility_accepted ? (
          <p id="gp-responsibility-error" className="text-sm font-medium text-error">
            {errors.responsibility_accepted}
          </p>
        ) : null}
      </div>
      <TurnstileWidget
        ref={ts}
        id={IDS.turnstile_token}
        action="group_proposal"
        onToken={setToken}
        error={errors.turnstile_token}
      />
      {formError ? (
        <p role="alert" className="rounded-md border border-error/40 bg-error-soft p-3 text-sm">
          {formError}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="lg" loading={submitting} loadingText="Enviando proposta…">
          Enviar proposta para análise
        </Button>
      </div>
    </form>
  );
}
