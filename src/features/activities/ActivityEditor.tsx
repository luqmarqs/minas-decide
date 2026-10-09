import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import {
  ACTIVITY_TYPE_LABEL_PT,
  ActivityInput,
  ActivityType,
  type ActivityPatch,
  type MyActivity,
  type PublicContactType,
} from '@shared/contracts/activities.ts';
import { normalizeBrazilPhone } from '@shared/schemas/phone.ts';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, FormErrorSummary } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { formatActivityWhen } from '@/lib/format';
import {
  focusFirstError,
  serverFieldErrors,
  submitErrorMessage,
  zodFieldErrors,
  type FieldErrors,
} from '@/features/registration/formErrors';
import { TerritoryField } from '@/features/registration/TerritoryField';
import { useTerritoryName } from '@/features/registration/useTerritoryName';
import {
  createActivity,
  patchActivity,
  saoPauloLocalToUtcIso,
  saoPauloOffsetLabel,
  utcIsoToSaoPauloLocal,
} from './api';

const ActivityEditorMap = lazy(() => import('./ActivityEditorMap'));

export interface ActivityDraft {
  title: string;
  type: ActivityType | '';
  description: string;
  territoryId: string | null;
  address: string;
  lon: string;
  lat: string;
  confirmed: boolean;
  date: string;
  startTime: string;
  endTime: string;
  contactOptIn: boolean;
  contactType: PublicContactType | '';
  contactValue: string;
}

const EMPTY_DRAFT: ActivityDraft = {
  title: '',
  type: '',
  description: '',
  territoryId: null,
  address: '',
  lon: '',
  lat: '',
  confirmed: false,
  date: '',
  startTime: '',
  endTime: '',
  contactOptIn: false,
  contactType: '',
  contactValue: '',
};

export const DRAFT_STORAGE_KEY = 'mm.activity-draft';

function readDraft(): ActivityDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActivityDraft>;
    return { ...EMPTY_DRAFT, ...parsed, confirmed: false };
  } catch {
    return null;
  }
}

function writeDraft(d: ActivityDraft | null) {
  try {
    if (d) window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(d));
    else window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // storage unavailable: draft just isn't kept
  }
}

function draftFrom(a: MyActivity): ActivityDraft {
  const start = utcIsoToSaoPauloLocal(a.starts_at);
  const end = a.ends_at ? utcIsoToSaoPauloLocal(a.ends_at) : null;
  return {
    title: a.title,
    type: a.type,
    description: a.description_sanitized,
    territoryId: a.territory_id,
    address: a.location_public,
    lon: a.coordinates ? String(a.coordinates[0]) : '',
    lat: a.coordinates ? String(a.coordinates[1]) : '',
    confirmed: true,
    date: start.date,
    startTime: start.time,
    endTime: end ? end.time : '',
    contactOptIn: !!a.contact_public,
    contactType: a.contact_public?.type ?? '',
    contactValue: a.contact_public?.value ?? '',
  };
}

const IDS: Record<string, string> = {
  title: 'act-title',
  type: 'act-type',
  description: 'act-description',
  territory_id: 'act-territory',
  public_address: 'act-address',
  coordinates: 'act-lat',
  location_confirmed: 'act-confirmed',
  starts_at: 'act-date',
  ends_at: 'act-end',
  public_contact_type: 'act-contact-type',
  public_contact_value: 'act-contact-value',
};

const ORDER = Object.keys(IDS);
const idOf = (k: string) => IDS[k] ?? k;

const MESSAGES: Record<string, string> = {
  title: 'Informe um título (de 5 a 120 caracteres).',
  type: 'Escolha o tipo de atividade.',
  description: 'Descreva a atividade (de 10 a 2.000 caracteres).',
  territory_id: 'Escolha a cidade ou o bairro da atividade.',
  public_address: 'Informe o endereço ou ponto de encontro público (de 5 a 240 caracteres).',
  coordinates: 'Marque o ponto no mapa ou informe latitude e longitude válidas.',
  location_confirmed: 'Confirme que o ponto marcado corresponde ao local.',
  starts_at: 'Informe data e horário de início válidos.',
  ends_at: 'Horário de término inválido.',
  public_contact_type: 'Escolha o tipo de contato público.',
  public_contact_value: 'Contato público inválido.',
};

const INSTAGRAM_RE = /^@?[A-Za-z0-9._]{1,30}$/;

/** Same normalization the Worker applies, used for the preview and client checks. */
function previewContact(type: PublicContactType | '', value: string): string | null {
  const raw = value.trim();
  if (!type || !raw) return null;
  if (type === 'whatsapp') return normalizeBrazilPhone(raw);
  if (type === 'email')
    return z.string().email().max(120).safeParse(raw.toLowerCase()).success
      ? raw.toLowerCase()
      : null;
  return INSTAGRAM_RE.test(raw) ? (raw.startsWith('@') ? raw : `@${raw}`) : null;
}

const CONTACT_LABEL: Record<PublicContactType, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  instagram: 'Instagram',
};

function parseCoord(s: string): number | null {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
}

/** Checked at submit time (not during render). */
function startsInFuture(iso: string): boolean {
  return Date.parse(iso) > Date.now();
}

// Rough MG bounding box: outside it we warn (never block).
function insideMg(lon: number, lat: number): boolean {
  return lon >= -51.1 && lon <= -39.8 && lat >= -22.95 && lat <= -14.2;
}

export interface ActivityEditorProps {
  mode: 'create' | 'edit';
  initial?: MyActivity;
  /** When set, the form can be filled (draft) but not submitted. */
  blockedReason?: ReactNode;
  onSaved: (activity: MyActivity) => void;
  onCancel?: () => void;
}

/** Criar/editar atividade (spec §3.6, §12.9). */
export function ActivityEditor({
  mode,
  initial,
  blockedReason,
  onSaved,
  onCancel,
}: ActivityEditorProps) {
  const [draft, setDraft] = useState<ActivityDraft>(() =>
    initial ? draftFrom(initial) : (readDraft() ?? EMPTY_DRAFT),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const { entry: territoryEntry } = useTerritoryName(draft.territoryId);

  // Draft survives the e-mail verification detour (same tab) — create mode only.
  useEffect(() => {
    if (mode === 'create') writeDraft(draft);
  }, [mode, draft]);

  const set = <K extends keyof ActivityDraft>(k: K, v: ActivityDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const setPoint = (lon: string, lat: string) =>
    setDraft((d) => ({ ...d, lon, lat, confirmed: false }));

  const startIso =
    draft.date && draft.startTime ? saoPauloLocalToUtcIso(draft.date, draft.startTime) : null;
  const endIso =
    draft.date && draft.endTime ? saoPauloLocalToUtcIso(draft.date, draft.endTime) : null;
  const lon = parseCoord(draft.lon);
  const lat = parseCoord(draft.lat);
  const point: [number, number] | null = lon !== null && lat !== null ? [lon, lat] : null;
  const contactPreview = draft.contactOptIn
    ? previewContact(draft.contactType, draft.contactValue)
    : null;
  const mapCenter = useMemo<[number, number] | null>(
    () => territoryEntry?.centroid ?? null,
    [territoryEntry],
  );

  function buildInput(): { input?: ActivityInput; errors: FieldErrors } {
    const parsed = ActivityInput.safeParse({
      title: draft.title,
      type: draft.type || undefined,
      description: draft.description,
      territory_id: draft.territoryId ?? '',
      public_address: draft.address,
      coordinates: point ?? undefined,
      location_confirmed: draft.confirmed,
      starts_at: startIso ?? '',
      ends_at: draft.endTime ? (endIso ?? 'invalido') : null,
      timezone: 'America/Sao_Paulo',
      public_contact_opt_in: draft.contactOptIn,
      public_contact_type: draft.contactOptIn ? draft.contactType || null : null,
      public_contact_value: draft.contactOptIn ? draft.contactValue.trim() || null : null,
    });
    const errs: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error, MESSAGES);
    if (startIso && !startsInFuture(startIso) && !errs.starts_at)
      errs.starts_at = 'A atividade precisa começar no futuro.';
    if (startIso && endIso && Date.parse(endIso) <= Date.parse(startIso) && !errs.ends_at)
      errs.ends_at = 'O término deve ser depois do início (mesmo dia).';
    if (draft.contactOptIn) {
      if (!draft.contactType) errs.public_contact_type = MESSAGES.public_contact_type!;
      else if (!contactPreview)
        errs.public_contact_value =
          draft.contactType === 'whatsapp'
            ? 'Informe um WhatsApp brasileiro válido com DDD.'
            : draft.contactType === 'email'
              ? 'Informe um e-mail válido.'
              : 'Informe um usuário do Instagram válido (ex.: @coletivo).';
    }
    return Object.keys(errs).length || !parsed.success
      ? { errors: errs }
      : { input: parsed.data, errors: {} };
  }

  function buildPatch(input: ActivityInput, current: MyActivity): ActivityPatch {
    const patch: ActivityPatch = { version: current.version };
    if (input.title !== current.title) patch.title = input.title;
    if (input.type !== current.type) patch.type = input.type;
    if (input.description !== current.description_sanitized) patch.description = input.description;
    if (input.territory_id !== current.territory_id) patch.territory_id = input.territory_id;
    if (input.public_address !== current.location_public)
      patch.public_address = input.public_address;
    const [cLon, cLat] = current.coordinates ?? [NaN, NaN];
    if (input.coordinates[0] !== cLon || input.coordinates[1] !== cLat) {
      patch.coordinates = input.coordinates;
      patch.location_confirmed = true;
    }
    if (Date.parse(input.starts_at) !== Date.parse(current.starts_at)) {
      patch.starts_at = input.starts_at;
      patch.timezone = 'America/Sao_Paulo';
    }
    const curEnd = current.ends_at ? Date.parse(current.ends_at) : null;
    const newEnd = input.ends_at ? Date.parse(input.ends_at) : null;
    if (curEnd !== newEnd) patch.ends_at = input.ends_at ?? null;
    const curContact = current.contact_public;
    const newValue = input.public_contact_opt_in ? contactPreview : null;
    if (
      input.public_contact_opt_in !== !!curContact ||
      (input.public_contact_opt_in &&
        (input.public_contact_type !== curContact?.type || newValue !== curContact?.value))
    ) {
      patch.public_contact_opt_in = input.public_contact_opt_in;
      patch.public_contact_type = input.public_contact_opt_in ? input.public_contact_type : null;
      patch.public_contact_value = input.public_contact_opt_in ? input.public_contact_value : null;
    }
    return patch;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || blockedReason) return;
    setFormError(null);
    const { input, errors: errs } = buildInput();
    if (!input) {
      setErrors(errs);
      focusFirstError(ORDER, errs, idOf);
      return;
    }
    setErrors({});
    let body: ActivityPatch | null = null;
    if (mode === 'edit' && initial) {
      body = buildPatch(input, initial);
      if (Object.keys(body).length === 1) {
        setFormError('Nada foi alterado.');
        return;
      }
    }
    setSubmitting(true);
    try {
      const saved =
        mode === 'edit' && initial && body
          ? await patchActivity(initial.id, body)
          : await createActivity(input);
      if (mode === 'create') writeDraft(null);
      onSaved(saved);
    } catch (err) {
      const fields = serverFieldErrors(err);
      setErrors(fields);
      focusFirstError(ORDER, fields, idOf);
      setFormError(
        Object.keys(fields).length ? 'Revise os campos destacados.' : submitErrorMessage(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const summary = ORDER.filter((k) => errors[k]).map((k) => ({
    fieldId: idOf(k),
    message: errors[k]!,
  }));
  const typeOptions = ActivityType.options.map((t) => ({
    value: t,
    label: ACTIVITY_TYPE_LABEL_PT[t],
  }));
  const pub = initial?.status === 'published';

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
      aria-label={mode === 'edit' ? 'Editar atividade' : 'Nova atividade'}
    >
      <FormErrorSummary errors={summary} />
      {mode === 'edit' && pub ? (
        <Note tone="warning">
          Esta atividade está publicada. Mudar título, descrição, data, horário, endereço, ponto no
          mapa ou território faz ela <strong>voltar para análise</strong> e sair do mapa até nova
          aprovação.
        </Note>
      ) : null}
      <Field label="Título" required id={IDS.title} error={errors.title}>
        {(p) => (
          <Input
            {...p}
            value={draft.title}
            maxLength={120}
            onChange={(e) => set('title', e.target.value)}
          />
        )}
      </Field>
      <Field label="Tipo de atividade" required id={IDS.type} error={errors.type}>
        {(p) => (
          <Select
            id={p.id}
            aria-describedby={p['aria-describedby']}
            value={draft.type || undefined}
            onValueChange={(v) => set('type', v as ActivityType)}
            options={typeOptions}
            placeholder="Escolha o tipo"
          />
        )}
      </Field>
      <Field
        label="Descrição"
        required
        id={IDS.description}
        error={errors.description}
        hint="O que vai acontecer, o que levar, regras locais. Texto simples (sem links clicáveis)."
      >
        {(p) => (
          <Textarea
            {...p}
            value={draft.description}
            maxLength={2000}
            onChange={(e) => set('description', e.target.value)}
          />
        )}
      </Field>
      <TerritoryField
        id={IDS.territory_id!}
        label="Cidade ou bairro"
        value={draft.territoryId}
        onChange={(entry) => set('territoryId', entry.id)}
        error={errors.territory_id}
      />
      <Field
        label="Endereço ou ponto de encontro público"
        required
        id={IDS.public_address}
        error={errors.public_address}
        hint="Aparece para todos. Prefira locais públicos (praça, esquina); evite endereço residencial."
      >
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={draft.address}
            maxLength={240}
            onChange={(e) => set('address', e.target.value)}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-primary">Ponto no mapa *</legend>
        <p className="text-sm text-muted">
          Clique no mapa para marcar o local, ou digite as coordenadas. Não buscamos endereço
          automaticamente: confira o ponto antes de confirmar.
        </p>
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowMap((v) => !v)}
            aria-expanded={showMap}
          >
            {showMap ? 'Esconder mapa' : 'Marcar no mapa'}
          </Button>
        </div>
        {showMap ? (
          <Suspense fallback={<LoadingBlock label="Carregando mapa…" lines={3} />}>
            <ActivityEditorMap
              center={mapCenter}
              value={point}
              onPick={([lo, la]) => setPoint(String(lo), String(la))}
            />
          </Suspense>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Latitude"
            id={IDS.coordinates}
            error={errors.coordinates}
            hint="Ex.: -19.9191"
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={draft.lat}
                onChange={(e) => setPoint(draft.lon, e.target.value)}
              />
            )}
          </Field>
          <Field label="Longitude" id="act-lon" hint="Ex.: -43.9386">
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={draft.lon}
                onChange={(e) => setPoint(e.target.value, draft.lat)}
              />
            )}
          </Field>
        </div>
        {point && !insideMg(point[0], point[1]) ? (
          <Note tone="warning">Este ponto parece estar fora de Minas Gerais. Confira.</Note>
        ) : null}
        <Checkbox
          id={IDS.location_confirmed}
          checked={draft.confirmed}
          onCheckedChange={(v) => set('confirmed', v)}
          disabled={!point}
          invalid={!!errors.location_confirmed}
          label={
            point
              ? `Confirmo que o ponto (${point[1].toFixed(5)}, ${point[0].toFixed(5)}) corresponde ao local.`
              : 'Confirmo que o ponto marcado corresponde ao local.'
          }
          description="Mudar o ponto desfaz a confirmação."
        />
        {errors.location_confirmed ? (
          <p className="text-sm font-medium text-error">{errors.location_confirmed}</p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-primary">
          Data e horário (horário de Brasília)
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Data" required id={IDS.starts_at} error={errors.starts_at}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={draft.date}
                onChange={(e) => set('date', e.target.value)}
              />
            )}
          </Field>
          <Field label="Início" required id="act-start">
            {(p) => (
              <Input
                {...p}
                type="time"
                value={draft.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
            )}
          </Field>
          <Field label="Término (opcional)" id={IDS.ends_at} error={errors.ends_at}>
            {(p) => (
              <Input
                {...p}
                type="time"
                value={draft.endTime}
                onChange={(e) => set('endTime', e.target.value)}
              />
            )}
          </Field>
        </div>
        <p className="text-sm text-secondary" aria-live="polite">
          {startIso ? (
            <>
              Vai aparecer como: <strong>{formatActivityWhen(startIso, endIso)}</strong> —{' '}
              {saoPauloOffsetLabel(startIso)}.
            </>
          ) : (
            'Informe data e horário de início.'
          )}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-primary">Contato público (opcional)</legend>
        <Checkbox
          id="act-contact-optin"
          checked={draft.contactOptIn}
          onCheckedChange={(v) => set('contactOptIn', v)}
          label="Quero disponibilizar meu contato para interessados"
          description="Fica visível para qualquer pessoa na página da atividade. Você pode desligar depois."
        />
        {draft.contactOptIn ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Tipo de contato"
              required
              id={IDS.public_contact_type}
              error={errors.public_contact_type}
            >
              {(p) => (
                <Select
                  id={p.id}
                  aria-describedby={p['aria-describedby']}
                  value={draft.contactType || undefined}
                  onValueChange={(v) => set('contactType', v as PublicContactType)}
                  options={(Object.keys(CONTACT_LABEL) as PublicContactType[]).map((t) => ({
                    value: t,
                    label: CONTACT_LABEL[t],
                  }))}
                  placeholder="Escolha"
                />
              )}
            </Field>
            <Field
              label="Contato"
              required
              id={IDS.public_contact_value}
              error={errors.public_contact_value}
            >
              {(p) => (
                <Input
                  {...p}
                  value={draft.contactValue}
                  maxLength={120}
                  inputMode={
                    draft.contactType === 'whatsapp'
                      ? 'tel'
                      : draft.contactType === 'email'
                        ? 'email'
                        : 'text'
                  }
                  autoComplete={
                    draft.contactType === 'whatsapp'
                      ? 'tel'
                      : draft.contactType === 'email'
                        ? 'email'
                        : 'off'
                  }
                  onChange={(e) => set('contactValue', e.target.value)}
                />
              )}
            </Field>
            <p className="text-sm text-secondary sm:col-span-2" aria-live="polite">
              {contactPreview && draft.contactType ? (
                <>
                  Prévia pública:{' '}
                  <strong>
                    {CONTACT_LABEL[draft.contactType]}: {contactPreview}
                  </strong>
                </>
              ) : (
                'A prévia aparece quando o contato for válido.'
              )}
            </p>
          </div>
        ) : null}
      </fieldset>

      {formError ? (
        <p role="alert" className="rounded-md border border-error/40 bg-error-soft p-3 text-sm">
          {formError}
        </p>
      ) : null}
      {blockedReason ? <Note tone="warning">{blockedReason}</Note> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          loadingText="Enviando…"
          disabled={!!blockedReason}
        >
          {mode === 'edit' ? 'Salvar alterações' : 'Enviar para análise'}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Fechar sem salvar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
