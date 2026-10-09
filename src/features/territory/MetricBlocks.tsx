import type { ReactNode } from 'react';
import {
  OFFICE_LABEL_PT,
  VOTES_PER_VOTER,
  type CandidateResult,
  type ComparisonPoint,
  type OfficeCode,
  type TerritoryMetrics,
} from '@shared/contracts/metrics.ts';
import { Note } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { formatInt, formatPercent, formatPp, formatSignedInt } from '@/lib/format';

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

export function ComparisonBlock({ points }: { points: ComparisonPoint[] }) {
  if (!points.length) return null;
  return (
    <section aria-label="Comparação 2022 para 2026" className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <caption className="sr-only">
            Participação nos votos válidos em 2022 e 2026, diferença em pontos percentuais e em
            votos
          </caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="py-1 pr-2 font-semibold">
                Candidatura
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">
                2022
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">
                2026
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Variação
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const s22 =
                p.votes_2022 !== null && p.valid_2022 ? p.votes_2022 / p.valid_2022 : null;
              const s26 =
                p.votes_2026 !== null && p.valid_2026 ? p.votes_2026 / p.valid_2026 : null;
              return (
                <tr
                  key={`${p.office}-${p.candidate_id}`}
                  className="border-t border-border align-top"
                >
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {p.ballot_name}
                    <span className="block text-xs text-muted">{OFFICE_LABEL_PT[p.office]}</span>
                  </th>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatPercent(s22)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatPercent(s26)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    <strong>{formatPp(p.delta_pp)}</strong>
                    <span className="block text-xs text-muted">
                      {formatSignedInt(p.delta_votes)} votos
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Diferença da participação nos votos válidos de cada ano, em pontos percentuais. Só aparecem
        candidaturas com histórico em 2022.{' '}
        <strong>A variação não implica transferência de votos</strong> entre candidaturas.
      </p>
    </section>
  );
}
