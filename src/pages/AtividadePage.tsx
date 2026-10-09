import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ACTIVITY_TYPE_LABEL_PT, type PublicActivity } from '@shared/contracts/activities.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import { ApiClientError, messageForError } from '@/lib/api';
import { formatActivityWhen } from '@/lib/format';
import { absoluteUrl, activityShareText } from '@/lib/share';
import { WhatsAppShare } from '@/components/ui/WhatsAppShare';
import { useActivity } from '@/features/activities/api';
import { RSVPButton } from '@/features/activities/RSVPButton';
import { DeferredMapShell } from '@/features/electoral-map/DeferredMapShell';
import { useTerritoryIndex } from '@/features/electoral-map/hooks';
import { territoryLabel } from '@/features/territory/search';

function contactHref(
  c: NonNullable<PublicActivity['contact_public']>,
): { href: string; shown: string } | null {
  const v = c.value.trim();
  if (c.type === 'email')
    return /^[^\s@]+@[^\s@]+$/.test(v) ? { href: `mailto:${v}`, shown: v } : null;
  if (c.type === 'whatsapp') {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 10
      ? { href: `https://wa.me/${digits}`, shown: `wa.me/${digits}` }
      : null;
  }
  const handle = v.replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '');
  return handle
    ? { href: `https://www.instagram.com/${handle}/`, shown: `instagram.com/${handle}` }
    : null;
}

const CONTACT_LABEL = { whatsapp: 'WhatsApp', email: 'E-mail', instagram: 'Instagram' } as const;

export default function AtividadePage() {
  const { id } = useParams();
  const q = useActivity(id);
  const { index } = useTerritoryIndex();
  const [now] = useState(() => Date.now());

  if (q.isLoading) {
    return (
      <PageShell title="Atividade" documentTitle="Carregando atividade">
        <LoadingBlock label="Carregando atividade…" lines={5} />
      </PageShell>
    );
  }
  if (q.error || !q.data) {
    const notFound = q.error instanceof ApiClientError && q.error.code === 'NOT_FOUND';
    const unavailable = q.error instanceof ApiClientError && q.error.isUnavailable;
    return (
      <PageShell title={notFound ? 'Atividade não encontrada' : 'Atividade indisponível'}>
        <ErrorState
          title={
            notFound ? 'Esta atividade não existe ou não está publicada' : 'Agenda indisponível'
          }
          message={
            notFound
              ? 'Ela pode ter sido removida ou ainda estar em revisão.'
              : unavailable
                ? 'Não conseguimos consultar a agenda agora. O mapa e os dados eleitorais continuam disponíveis.'
                : messageForError(q.error)
          }
          requestId={q.error instanceof ApiClientError ? q.error.requestId : undefined}
          onRetry={notFound ? undefined : () => void q.refetch()}
          retrying={q.isFetching}
        />
        <p className="mt-4">
          <Link to="/#agenda" className="underline">
            Ver agenda de atividades
          </Link>
        </p>
      </PageShell>
    );
  }

  const { activity: a, demo } = q.data;
  const cancelled = a.status === 'cancelled';
  const endIso = a.ends_at ?? a.starts_at;
  const past = new Date(endIso).getTime() < now;
  const territory = index?.byId.get(a.territory_id);
  const contact = a.contact_public ? contactHref(a.contact_public) : null;
  const disabledReason = demo
    ? 'Indisponível: esta é uma atividade demonstrativa, não um evento real.'
    : cancelled
      ? 'Esta atividade foi cancelada.'
      : past
        ? 'Esta atividade já aconteceu.'
        : null;

  return (
    <PageShell
      width="wide"
      title={a.title}
      documentTitle={a.title}
      eyebrow={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{ACTIVITY_TYPE_LABEL_PT[a.type]}</Badge>
          {cancelled ? <Badge variant="error">Cancelada</Badge> : null}
          {past && !cancelled ? <Badge variant="neutral">Encerrada</Badge> : null}
          {demo ? <Badge variant="demo">Atividade demonstrativa</Badge> : null}
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          {cancelled ? (
            <Note tone="warning">
              <strong>Atividade cancelada.</strong> Ela continua visível para quem já tinha o link,
              mas não vai acontecer.
            </Note>
          ) : null}
          {demo ? (
            <Note tone="warning">
              Exemplo fictício para demonstrar a interface. Não é um evento real.
            </Note>
          ) : null}
          <dl className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <dt className="text-sm font-semibold text-muted">Quando</dt>
            <dd className="flex items-start gap-2">
              <Icon name="calendar" className="mt-0.5 shrink-0 text-secondary" />
              <span>{formatActivityWhen(a.starts_at, a.ends_at)}</span>
            </dd>
            <dt className="text-sm font-semibold text-muted">Onde</dt>
            <dd className="flex items-start gap-2">
              <Icon name="pin" className="mt-0.5 shrink-0 text-secondary" />
              <span className="min-w-0 break-words">
                {a.location_public}
                {territory ? (
                  <>
                    {' · '}
                    <Link to={`/territorio/${territory.id}`} className="underline">
                      {territoryLabel(territory)}
                    </Link>
                  </>
                ) : null}
              </span>
            </dd>
          </dl>

          <section aria-labelledby="desc-title">
            <h2 id="desc-title" className="text-xl">
              Sobre a atividade
            </h2>
            {/* Plain text only — user content is never rendered as HTML. */}
            <p className="mt-2 whitespace-pre-line text-secondary">{a.description_sanitized}</p>
          </section>

          <section
            aria-labelledby="rsvp-title"
            className="rounded-card border border-border bg-surface-raised p-4"
          >
            <h2 id="rsvp-title" className="mb-3 text-xl">
              Vai somar com a campanha?
            </h2>
            <RSVPButton
              activityId={a.id}
              initialCount={a.rsvp_count_approx}
              disabledReason={disabledReason}
            />
          </section>

          {contact && a.contact_public ? (
            <section aria-labelledby="contact-title">
              <h2 id="contact-title" className="text-xl">
                Contato da organização
              </h2>
              <p className="mt-1 text-sm text-muted">Publicado com autorização de quem organiza.</p>
              <p className="mt-2">
                {CONTACT_LABEL[a.contact_public.type]}:{' '}
                <a
                  href={contact.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  {contact.shown}
                </a>
              </p>
            </section>
          ) : null}

          <div>
            <WhatsAppShare
              variant="secondary"
              size="md"
              copyUrl={absoluteUrl(`/atividade/${a.id}`)}
              text={activityShareText({
                ...a,
                placeLabel: territory ? territoryLabel(territory) : null,
              })}
            />
          </div>
        </div>

        <aside aria-label="Mapa da atividade">
          {a.coordinates ? (
            <div className="h-72 overflow-hidden rounded-card border border-border lg:h-96">
              <DeferredMapShell
                variant="context"
                className="h-full"
                activitiesOverride={[a]}
                state={{
                  territoryId: a.territory_id,
                  layer: 'activities',
                  year: 2026,
                  round: 1,
                  candidateId: null,
                  view: 'mapa',
                  activities: true,
                  pois: false,
                }}
                onStateChange={() => {}}
              />
            </div>
          ) : (
            <Note>Local sem ponto no mapa: consulte o endereço informado.</Note>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
