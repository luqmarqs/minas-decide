import type {
  PresidentialComparison,
  PresidentialComparisonEntry,
} from '@shared/contracts/metrics.ts';
import { Note } from '@/components/ui/States';
import { formatInt, formatPercent, formatPp, formatSignedInt } from '@/lib/format';

export interface PresidentialComparisonBlockProps {
  comparison: PresidentialComparison | null | undefined;
  releaseId: string;
  /** Synthetic data: names are "Candidatura A/B (demo)" and a DEMO note is shown. */
  demo?: boolean;
}

const PRECISION_TEXT: Record<PresidentialComparison['precision'], string> = {
  exact: 'Valores exatos do TSE para este território.',
  approximate:
    'Aproximação: os votos de 2022 deste bairro foram reconstruídos pelos locais de votação associados a ele.',
  unavailable: 'Comparação indisponível para este território.',
};

const CARD_TITLE: Record<PresidentialComparisonEntry['key'], string> = {
  lula: 'Lula',
  bolsonaro: 'Bolsonaro',
};

function Row({
  label,
  share,
  votes,
}: {
  label: string;
  share: number | null;
  votes: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-border py-1.5 first:border-t-0">
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className="text-right tabular-nums">
        <span className="font-semibold">{formatPercent(share)}</span>
        <span className="block text-xs text-muted">
          {votes === null ? 'sem dado' : `${formatInt(votes)} votos`}
        </span>
      </dd>
    </div>
  );
}

function CandidateCard({ e, demo }: { e: PresidentialComparisonEntry; demo?: boolean }) {
  const title = demo ? e.ballot_name_2026 : CARD_TITLE[e.key];
  const namesDiffer = e.ballot_name_2022 !== e.ballot_name_2026;
  return (
    <article
      className="flex min-w-0 flex-col rounded-md border border-border bg-surface p-3"
      aria-labelledby={`pc-${e.key}`}
    >
      <h3 id={`pc-${e.key}`} className="font-body text-base font-bold tracking-normal">
        {title}
      </h3>
      <p className="text-xs text-muted">
        {namesDiffer
          ? `2022: ${e.ballot_name_2022} (${e.number_2022}) · 2026: ${e.ballot_name_2026} (${e.number_2026})`
          : `${e.ballot_name_2026} (${e.number_2026}) · % dos votos válidos`}
      </p>
      <dl className="mt-2">
        <Row label="2022 · 1º turno" share={e.share_2022_r1} votes={e.votes_2022_r1} />
        <Row label="2022 · 2º turno" share={e.share_2022_r2} votes={e.votes_2022_r2} />
        <Row label="2026 · 1º turno" share={e.share_2026_r1} votes={e.votes_2026_r1} />
      </dl>
      <div className="mt-2 rounded-sm bg-surface-alt p-2">
        <p className="text-xs font-semibold text-secondary">Variação no 1º turno (2026 − 2022)</p>
        <p className="tabular-nums">
          <strong className="text-lg">{formatPp(e.delta_pp_r1)}</strong>{' '}
          <span className="text-sm text-secondary">
            {e.delta_votes_r1 === null ? '' : `${formatSignedInt(e.delta_votes_r1)} votos`}
          </span>
        </p>
      </div>
    </article>
  );
}

/**
 * Presidential 2022 → 2026 comparison (owner decision, rodada 3): Lula × Bolsonaro
 * (Jair in 2022, Flávio in 2026), share of valid votes in 2022 r1/r2 and 2026 r1,
 * absolute votes and the 1st-round change in p.p. and votes. Neutral colours only (no
 * party colours), precision note and the "no vote transfer" caveat are always shown.
 */
export function PresidentialComparisonBlock({
  comparison,
  releaseId: _releaseId,
  demo,
}: PresidentialComparisonBlockProps) {
  if (!comparison) {
    return (
      <Note>
        Comparativo Lula × Bolsonaro (2022 → 2026) ainda não publicado para este território no
        snapshot atual.
      </Note>
    );
  }
  const entries = (['lula', 'bolsonaro'] as const)
    .map((k) => comparison.entries.find((e) => e.key === k))
    .filter((e): e is PresidentialComparisonEntry => !!e);
  const unavailable = comparison.precision === 'unavailable' || entries.length === 0;
  return (
    <section
      aria-label="Comparativo Lula × Bolsonaro, 2022 para 2026"
      className="flex flex-col gap-2"
    >
      {unavailable ? (
        <Note tone="warning">
          {PRECISION_TEXT.unavailable}
          {comparison.note ? ` ${comparison.note}` : ''}
        </Note>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
          {entries.map((e) => (
            <CandidateCard key={e.key} e={e} demo={demo} />
          ))}
        </div>
      )}
      {!unavailable ? (
        <p className="text-xs text-secondary" data-precision={comparison.precision}>
          <span className="font-semibold">
            {comparison.precision === 'exact' ? 'Precisão: exata.' : 'Precisão: aproximada.'}
          </span>{' '}
          {PRECISION_TEXT[comparison.precision]}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        Percentuais sobre os votos válidos para Presidente de cada turno; variação em pontos
        percentuais (p.p.) e em votos, só no 1º turno.{' '}
        <strong>A variação não implica transferência de votos</strong> entre candidaturas nem entre
        eleitores.
      </p>
      {!unavailable && comparison.note ? (
        <p className="text-xs text-muted">{comparison.note}</p>
      ) : null}
      <p className="text-xs text-muted">Fonte: TSE.</p>
    </section>
  );
}
