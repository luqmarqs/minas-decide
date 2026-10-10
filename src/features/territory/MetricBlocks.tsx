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

/** Neutral proportion bar (no party or moral colour): value ÷ denominator. */
function ShareBar({ value }: { value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="mt-2 h-1.5 bg-surface-alt" aria-hidden="true">
      <div className="h-full bg-border-strong" style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

function PairFigure({
  label,
  value,
  rate,
  detail,
}: {
  label: string;
  value: string;
  rate: number | null;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <p className="ed-kicker">{label}</p>
      <p className="ed-figure ed-figure-md mt-1">{value}</p>
      <ShareBar value={rate} />
      <p className="ed-note mt-1.5 tabular-nums">{detail}</p>
    </div>
  );
}

/**
 * Participation indicators as a typographic composition (redesign editorial, D11): eligible
 * voters as a context line; turnout × abstention as a pair with neutral bars; blank + null
 * votes highlighted (the "votes that can be won"); valid votes of the basis office as a line.
 * Same numbers, labels and denominators as before.
 */
export function TurnoutCards({ m }: { m: TerritoryMetrics }) {
  const t = m.turnout;
  if (!t) {
    return (
      <Note tone="warning">Sem dados de comparecimento para este território neste ano/turno.</Note>
    );
  }
  const blankNull = t.blank + t.null_votes;
  return (
    <div className="flex flex-col gap-5">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="ed-kicker">Eleitorado apto</span>
        <span className="text-lg font-bold text-primary tabular-nums">{formatInt(t.eligible)}</span>
        <span className="text-sm text-secondary">pessoas aptas a votar</span>
      </p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <PairFigure
          label="Comparecimento"
          value={formatPercent(t.turnout_rate)}
          rate={t.turnout_rate}
          detail={`${formatInt(t.turnout)} de ${formatInt(t.eligible)} aptos`}
        />
        <PairFigure
          label="Abstenção"
          value={formatPercent(t.abstention_rate)}
          rate={t.abstention_rate}
          detail={`${formatInt(t.abstention)} de ${formatInt(t.eligible)} aptos`}
        />
      </div>
      <div className="flex flex-col gap-2">
        <hr className="ed-rule-strong" aria-hidden="true" />
        <div>
          <p className="ed-kicker">
            {t.basis_office === 'president'
              ? 'Brancos e nulos'
              : `Brancos e nulos · ${OFFICE_LABEL_PT[t.basis_office]}`}
          </p>
          <p className="ed-figure ed-figure-lg mt-1">
            {formatPercent(t.turnout > 0 ? blankNull / t.turnout : null)}
          </p>
          <p className="mt-1.5 text-sm text-secondary tabular-nums">
            {formatInt(blankNull)} de {formatInt(t.turnout)} comparecimentos ·{' '}
            <span className="font-semibold text-primary">votos que podem ser conquistados</span>
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <hr className="ed-rule" aria-hidden="true" />
        <div>
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="ed-kicker">{`Válidos · ${OFFICE_LABEL_PT[t.basis_office]}`}</span>
            <span className="text-lg font-bold text-primary tabular-nums">
              {formatInt(t.valid)}
            </span>
          </p>
          <p className="ed-note mt-0.5 tabular-nums">
            {`brancos ${formatInt(t.blank)} · nulos ${formatInt(t.null_votes)} · de ${formatInt(t.turnout)} comparecimentos`}
          </p>
        </div>
      </div>
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
