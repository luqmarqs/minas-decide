import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { MePatch, type MeResponse } from '@shared/contracts/registration.ts';
import { Button } from '@/components/ui/Button';
import { Field, FormErrorSummary } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { meQueryKey } from '@/lib/auth';
import {
  focusFirstError,
  serverFieldErrors,
  submitErrorMessage,
  zodFieldErrors,
  type FieldErrors,
} from '@/features/registration/formErrors';
import { TerritoryField } from '@/features/registration/TerritoryField';
import { useTerritoryName } from '@/features/registration/useTerritoryName';
import { patchMe, type MePatchInput } from './api';

const ORDER = ['display_name', 'phone', 'selected_territory_id'] as const;
const MESSAGES: Record<string, string> = {
  display_name: 'Informe seu nome (de 2 a 120 caracteres).',
  phone: 'Informe um WhatsApp brasileiro válido com DDD.',
  selected_territory_id: 'Escolha sua cidade ou bairro.',
};

export interface ProfileReviewProps {
  me: MeResponse;
  /** Called with the updated profile once the server cleared the review flag. */
  onDone: (me: MeResponse) => void;
}

/**
 * P-SEC-1 — "Confira seus dados". After a provisional profile is promoted by the
 * magic link, the person confirms (or fixes) the name, territory and phone typed
 * before the e-mail was proven to be theirs. Nothing counts as reviewed before
 * the server answers.
 */
export function ProfileReview({ me, onDone }: ProfileReviewProps) {
  const uid = useId().replace(/:/g, '');
  const ids: Record<string, string> = {
    display_name: `${uid}-name`,
    phone: `${uid}-phone`,
    selected_territory_id: `${uid}-territory`,
  };
  const idOf = (k: string) => ids[k] ?? k;
  const queryClient = useQueryClient();
  const { label: territoryLabel } = useTerritoryName(me.selected_territory_id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.display_name ?? '');
  const [phone, setPhone] = useState('');
  const [territoryId, setTerritoryId] = useState<string | null>(me.selected_territory_id);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'confirm' | 'save' | null>(null);

  async function send(body: MePatchInput, kind: 'confirm' | 'save') {
    setBusy(kind);
    setFormError(null);
    try {
      const updated = await patchMe(body);
      queryClient.setQueryData(meQueryKey(updated.user_id), updated);
      onDone(updated);
    } catch (err) {
      const fields = serverFieldErrors(err);
      if (Object.keys(fields).length) {
        setEditing(true);
        setErrors(fields);
        focusFirstError([...ORDER], fields, idOf);
      }
      setFormError(submitErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const body: MePatchInput = {
      display_name: name,
      selected_territory_id: territoryId ?? '',
      ...(phone.trim() ? { phone } : {}),
      profile_reviewed: true,
    };
    const parsed = MePatch.safeParse(body);
    if (!parsed.success) {
      const next = zodFieldErrors(parsed.error, MESSAGES);
      setErrors(next);
      focusFirstError([...ORDER], next, idOf);
      return;
    }
    setErrors({});
    // Raw input goes to the server, which normalises the phone with the same contract.
    void send(body, 'save');
  }

  const summary = ORDER.filter((k) => errors[k]).map((k) => ({
    fieldId: idOf(k),
    message: errors[k]!,
  }));

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className="flex flex-col gap-4 rounded-md border border-border-strong bg-surface-raised p-4"
    >
      <div>
        <h2 id={`${uid}-title`} className="text-xl">
          Confira seus dados
        </h2>
        <p className="mt-1 text-sm text-secondary">
          Estes dados foram digitados antes de o e-mail ser confirmado; confira se são seus antes de
          continuar.
        </p>
      </div>

      {!editing ? (
        <>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">Nome</dt>
            <dd>{me.display_name ?? <span className="text-muted">não informado</span>}</dd>
            <dt className="font-semibold">Território</dt>
            <dd>
              {me.selected_territory_id ? (
                (territoryLabel ?? 'carregando…')
              ) : (
                <span className="text-muted">não informado</span>
              )}
            </dd>
            <dt className="font-semibold">WhatsApp</dt>
            <dd>
              {me.phone_masked ? (
                <span className="font-mono">{me.phone_masked}</span>
              ) : (
                <span className="text-muted">não informado</span>
              )}
            </dd>
          </dl>
          {formError ? (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              loading={busy === 'confirm'}
              loadingText="Salvando…"
              onClick={() => void send({ profile_reviewed: true }, 'confirm')}
            >
              Está correto
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={!!busy}>
              Corrigir
            </Button>
          </div>
        </>
      ) : (
        <form
          noValidate
          onSubmit={onSave}
          className="flex flex-col gap-4"
          aria-label="Corrigir dados"
        >
          <FormErrorSummary errors={summary} />
          <Field label="Nome" required id={idOf('display_name')} error={errors.display_name}>
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
            label="Novo WhatsApp"
            id={idOf('phone')}
            error={errors.phone}
            hint={
              me.phone_masked
                ? `Atual: ${me.phone_masked}. Deixe em branco para manter.`
                : 'Com DDD, por exemplo (31) 99999-8888. Não é publicado.'
            }
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
            id={idOf('selected_territory_id')}
            label="Cidade ou bairro onde quer atuar"
            value={territoryId}
            onChange={(entry) => setTerritoryId(entry.id)}
            error={errors.selected_territory_id}
          />
          {formError ? (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy === 'save'} loadingText="Salvando…">
              Salvar e continuar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setErrors({});
                setFormError(null);
              }}
              disabled={!!busy}
            >
              Voltar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Blocks a page while `me.profile_review_required` is set (P-SEC-1): renders the
 * review, and `children` only after the server cleared the flag.
 */
export function ProfileReviewGate({ me, children }: { me: MeResponse; children: ReactNode }) {
  const [reviewed, setReviewed] = useState(false);
  if (me.profile_review_required && !reviewed) {
    return <ProfileReview me={me} onDone={() => setReviewed(true)} />;
  }
  return <>{children}</>;
}
