import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AdminInternalMetrics, AdminSiteMetrics } from '@shared/contracts/admin.ts';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import { formatInt, formatPercent, plural } from '@/lib/format';
import { Figure, RankedBars, Section } from './metricsParts';
import { DadosSection } from './AdminDados';
import { fetchAdminMetrics } from './api';
import { adminErrorMessage, isForbidden } from './errors';
import './metrics.css';

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

const STATUS_ORDER: [string, string][] = [
  ['pending_review', 'Pendentes de revisão'],
  ['published', 'Publicadas'],
  ['suspended', 'Suspensas'],
  ['cancelled', 'Canceladas'],
  ['rejected', 'Rejeitadas'],
  ['archived', 'Arquivadas'],
  ['draft', 'Rascunhos'],
];

/** 'YYYY-MM-DD' -> 'dd/mm' (no timezone maths: the server already bucketed by Brasília day). */
function dayLabel(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

function duration(seconds: number | null): string {
  if (seconds === null) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${formatInt(s)} s`;
  const m = Math.floor(s / 60);
  return `${formatInt(m)} min ${formatInt(s % 60)} s`;
}

/** Simple SVG column chart; the numbers live in the aria-label, the axis shows 3 dates. */
function DayBars({
  points,
  label,
  unit,
}: {
  points: { day: string; value: number }[];
  label: string;
  unit: string;
}) {
  const total = points.reduce((s, p) => s + p.value, 0);
  const peak = points.reduce(
    (best, p) => (p.value > best.value ? p : best),
    points[0] ?? { day: '', value: 0 },
  );
  const max = Math.max(1, peak.value);
  const n = Math.max(1, points.length);
  const W = 300;
  const H = 72;
  const slot = W / n;
  const barW = Math.max(1, slot - Math.min(2, slot * 0.3));
  const first = points[0];
  const last = points[points.length - 1];
  const mid = points[Math.floor(points.length / 2)];
  const summary =
    total === 0
      ? `${label}: nenhum registro nos ${points.length} dias, de ${first ? dayLabel(first.day) : ''} a ${last ? dayLabel(last.day) : ''}.`
      : `${label}: ${formatInt(total)} ${unit} em ${points.length} dias, de ${dayLabel(first!.day)} a ${dayLabel(last!.day)}; pico de ${formatInt(peak.value)} em ${dayLabel(peak.day)}.`;
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-20 w-full"
        role="img"
        aria-label={summary}
      >
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--color-border-strong)" />
        {points.map((p, i) => {
          const h = p.value === 0 ? 0 : Math.max(1.5, (p.value / max) * (H - 4));
          return (
            <rect
              key={p.day}
              className="adm-bar-fill"
              x={i * slot + (slot - barW) / 2}
              y={H - 1 - h}
              width={barW}
              height={h}
            >
              <title>{`${dayLabel(p.day)}: ${formatInt(p.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div aria-hidden="true" className="ed-caption mt-1 flex justify-between tabular-nums">
        <span>{first ? dayLabel(first.day) : ''}</span>
        <span>{points.length > 14 && mid ? dayLabel(mid.day) : ''}</span>
        <span>{last ? dayLabel(last.day) : ''}</span>
      </div>
    </figure>
  );
}

function Mobilization({ m, days }: { m: AdminInternalMetrics; days: Period }) {
  const statuses = STATUS_ORDER.map(([key, label]) => ({
    key,
    label,
    count: m.activities.by_status[key] ?? 0,
  })).filter((s) => s.count > 0 || s.key === 'pending_review' || s.key === 'published');
  return (
    <Section id="metrics-mob" kicker="Mobilização" title="Cadastros e atividades">
      <div className="grid grid-cols-3 gap-4">
        <Figure large value={formatInt(m.profiles.total)} label="cadastros no total" />
        <Figure large value={formatInt(m.profiles.last_7d)} label="nos últimos 7 dias" />
        <Figure large value={formatInt(m.profiles.last_30d)} label="nos últimos 30 dias" />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Cadastros por dia (últimos {days} dias)</p>
        <DayBars
          label="Cadastros por dia"
          unit="cadastros"
          points={m.profiles.by_day.map((d) => ({ day: d.day, value: d.count }))}
        />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Atividades por status</p>
          <RankedBars
            label="Atividades por status"
            empty="Nenhuma atividade ainda."
            items={statuses}
          />
        </div>
        <div className="grid grid-cols-2 content-start gap-4">
          <Figure
            value={formatInt(m.activities.upcoming_published)}
            label="próximas atividades publicadas"
          />
          <Figure value={formatInt(m.rsvps.total)} label={`“Eu vou” no total (intenção)`} />
          <Figure value={formatInt(m.rsvps.last_7d)} label="“Eu vou” nos últimos 7 dias" />
          <Figure value={formatInt(m.groups.active)} label="grupos ativos" />
          <Figure value={formatInt(m.groups.suspended)} label="grupos suspensos" />
          <Figure
            value={formatInt(m.groups.pending_proposals)}
            label="propostas de grupo pendentes"
          />
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Territórios com mais cadastros</p>
        <RankedBars
          label="Territórios com mais cadastros"
          empty="Ainda não há cadastros com território."
          items={m.top_territories.map((t) => ({
            key: t.territory_id,
            label: t.name,
            count: t.registrations,
          }))}
        />
      </div>
      <p className="ed-caption">
        {plural(m.admins.total, 'administrador', 'administradores')}. Números agregados; nenhum dado
        pessoal é exibido.
      </p>
    </Section>
  );
}

function Audience({ site, days }: { site: AdminSiteMetrics; days: Period }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Figure large value={formatInt(site.visitors)} label="visitantes" />
        <Figure large value={formatInt(site.visits)} label="visitas" />
        <Figure large value={formatInt(site.pageviews)} label="page views" />
        <Figure
          large
          value={site.bounce_rate === null ? '—' : formatPercent(site.bounce_rate, 0)}
          label="taxa de rejeição"
        />
        <Figure large value={duration(site.avg_visit_seconds)} label="tempo médio por visita" />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Page views por dia (últimos {days} dias)</p>
        <DayBars
          label="Page views por dia"
          unit="page views"
          points={site.by_day.map((d) => ({ day: d.day, value: d.pageviews }))}
        />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Páginas mais vistas</p>
          <RankedBars
            label="Páginas mais vistas"
            empty="Sem dados no período."
            items={site.top_pages.map((p, i) => ({ key: `${i}-${p.label}`, ...p }))}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Principais origens</p>
          <RankedBars
            label="Principais origens"
            empty="Sem dados no período."
            items={site.top_referrers.map((p, i) => ({ key: `${i}-${p.label}`, ...p }))}
          />
        </div>
      </div>
      <div className="sm:max-w-[50%]">
        <p className="mb-2 text-sm font-semibold">Dispositivos</p>
        <RankedBars
          label="Dispositivos"
          empty="Sem dados no período."
          items={site.devices.map((p, i) => ({ key: `${i}-${p.label}`, ...p }))}
        />
      </div>
    </>
  );
}

export function AdminMetrics() {
  const [days, setDays] = useState<Period>(30);
  const q = useQuery({
    queryKey: ['admin', 'metrics', days],
    queryFn: ({ signal }) => fetchAdminMetrics(days, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="adm-metrics flex flex-col gap-8">
      <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={days === p ? 'primary' : 'secondary'}
            aria-pressed={days === p}
            onClick={() => setDays(p)}
          >
            {p} dias
          </Button>
        ))}
        <span role="status" aria-live="polite" className="ed-caption">
          {q.isFetching && q.data ? 'Atualizando…' : ''}
        </span>
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Carregando métricas…" lines={6} />
      ) : q.error ? (
        <ErrorState
          title={isForbidden(q.error) ? 'Sem permissão' : 'Métricas indisponíveis'}
          message={adminErrorMessage(q.error)}
          onRetry={isForbidden(q.error) ? undefined : () => void q.refetch()}
          retrying={q.isFetching}
        />
      ) : q.data ? (
        <>
          <Mobilization m={q.data.internal} days={days} />
          <Section id="metrics-aud" kicker="Audiência" title="Visitas ao site (Umami)">
            {q.data.site_status === 'ok' && q.data.site ? (
              <Audience site={q.data.site} days={days} />
            ) : q.data.site_status === 'unconfigured' ? (
              <Note tone="info">
                Audiência ainda não configurada: faltam as credenciais do Umami no servidor.
              </Note>
            ) : (
              <Note tone="warning">Umami indisponível agora; tente de novo.</Note>
            )}
            <p className="ed-caption">
              Fonte:{' '}
              <a
                href="https://analytics.luqmarqs.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Umami · analytics.luqmarqs.dev
              </a>
            </p>
          </Section>
        </>
      ) : null}

      <DadosSection />
    </div>
  );
}
