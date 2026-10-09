import type { ReactNode } from 'react';
import {
  OFFICE_LABEL_PT,
  VOTES_PER_VOTER,
  type CandidateResult,
  type OfficeCode,
  type TerritoryMetrics,
} from '@shared/contracts/metrics.ts';
import { Note } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { formatInt, formatPercent } from '@/lib/format';

export function MetricCard({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md border border-border bg-surface p-3', className)}>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 font-display text-2xl leading-tight font-(--heading-weight) tabular-nums">
        {value}
      </p>
      {detail ? <p className="mt-0.5 text-sm text-secondary">{detail}</p> : null}
    </div>
  );
}

export function TurnoutCards({ m }: { m: TerritoryMetrics }) {
  const t = m.turnout;
  if (!t) {
    return (
      <Note tone="warning">Sem dados de comparecimento para este território neste ano/turno.</Note>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <MetricCard
        label="Eleitorado apto"
        value={formatInt(t.eligible)}
        detail="pessoas aptas a votar"
      />
      <MetricCard
        label="Comparecimento"
        value={formatPercent(t.turnout_rate)}
        detail={`${formatInt(t.turnout)} de ${formatInt(t.eligible)} aptos`}
      />
      <MetricCard
        label="Abstenção"
        value={formatPercent(t.abstention_rate)}
        detail={`${formatInt(t.abstention)} de ${formatInt(t.eligible)} aptos`}
      />
      <MetricCard
        label={`Válidos · ${OFFICE_LABEL_PT[t.basis_office]}`}
        value={formatInt(t.valid)}
        detail={`brancos ${formatInt(t.blank)} · nulos ${formatInt(t.null_votes)} · de ${formatInt(t.turnout)} comparecimentos`}
      />
    </div>
  );
}

const OFFICE_ORDER: OfficeCode[] = [
  'president',
  'governor',
  'senator',
  'federal_deputy',
  'state_deputy',
];

function ResultRow({ c, highlight }: { c: CandidateResult; highlight?: boolean }) {
  const pct = Math.max(0, Math.min(1, c.share_of_valid));
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={cn('min-w-0 truncate', highlight && 'font-semibold')}>
          {c.ballot_name}{' '}
          <span className="text-muted">
            · {c.party} {c.number}
          </span>
        </span>
        <span className="shrink-0 tabular-nums">
          <strong>{formatPercent(c.share_of_valid)}</strong>{' '}
          <span className="text-muted">({formatInt(c.votes)})</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-alt" aria-hidden="true">
        <div
          className="h-full rounded-pill bg-(--map-fill-mid)"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </li>
  );
}

export function ResultsBlock({
  m,
  selectedCandidateId,
}: {
  m: TerritoryMetrics;
  selectedCandidateId?: string | null;
}) {
  const offices = OFFICE_ORDER.filter((o) => (m.results[o]?.length ?? 0) > 0);
  if (!offices.length) return null;
  return (
    <div className="flex flex-col gap-4">
      {offices.map((office) => {
        const list = m.results[office] ?? [];
        const valid = m.valid_by_office[office];
        return (
          <section key={office} aria-label={`Votação para ${OFFICE_LABEL_PT[office]}`}>
            <h3 className="font-body text-sm font-semibold tracking-normal">
              {OFFICE_LABEL_PT[office]}
            </h3>
            <p className="mb-2 text-xs text-muted">
              % dos votos válidos do cargo
              {valid !== undefined ? ` (${formatInt(valid)} válidos)` : ''}
            </p>
            <ul className="flex flex-col gap-2">
              {list.map((c) => (
                <ResultRow
                  key={c.candidate_id}
                  c={c}
                  highlight={c.candidate_id === selectedCandidateId}
                />
              ))}
            </ul>
            {office === 'senator' && m.year === 2026 && VOTES_PER_VOTER.senator === 2 ? (
              <p className="mt-2 text-xs text-muted">
                Em 2026 cada eleitor pode votar em até 2 candidaturas ao Senado: o total de votos
                válidos para Senador é maior que o número de pessoas que votaram, e os percentuais
                usam esse total como denominador.
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
