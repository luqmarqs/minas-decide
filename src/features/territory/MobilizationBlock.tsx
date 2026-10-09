import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { MunicipalityMetricsFile } from '@shared/contracts/snapshot.ts';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { Icon } from '@/components/ui/Icon';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { formatInt, formatPercent, formatPp } from '@/lib/format';
import {
  snapshotKeys,
  useLayerValues,
  useSnapshot,
  type TerritoryIndex,
} from '@/features/electoral-map/hooks';
import { pickMetrics } from '@/features/electoral-map/layers';
import {
  combinedTotal,
  rankMobilization,
  rowFromMetrics,
  rowsFromLayers,
  type MobilizationRanking,
  type MobilizationRow,
} from '@/features/electoral-map/mobilization';

const N = 10;

export interface MobilizationBlockProps {
  entry: TerritoryIndexEntry;
  index: TerritoryIndex;
  /** Metrics file of the municipality (for its neighborhoods); unused at state level. */
  municipalityFile: MunicipalityMetricsFile | null | undefined;
  releaseId: string;
  onSelectTerritory: (id: string) => void;
}

/** Pure list (unit-testable). */
export function MobilizationList({
  ranking,
  childLabel,
  onSelectTerritory,
  releaseId: _releaseId,
}: {
  ranking: MobilizationRanking;
  childLabel: { one: string; many: string };
  onSelectTerritory: (id: string) => void;
  releaseId: string;
}) {
  if (!ranking.count) {
    return (
      <Note>
        Nenhum {childLabel.one} com dados onde Lula liderou no 1º turno de 2026 neste recorte.
      </Note>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
        {ranking.top.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelectTerritory(r.id)}
              className="flex min-h-11 w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-surface-alt"
            >
              <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {r.abstention === null
                    ? 'abstenções: …'
                    : `${formatInt(r.abstention)} abstenções`}{' '}
                  · margem de Lula {formatPp(r.margin)}
                </span>
                <span className="block text-xs text-muted tabular-nums">
                  brancos e nulos:{' '}
                  {r.blankNull !== null && r.blankNull !== undefined ? formatInt(r.blankNull) : '…'}
                  {r.blankNullRate !== null && r.blankNullRate !== undefined
                    ? ` (${formatPercent(r.blankNullRate)} do comparecimento)`
                    : ''}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatPercent(r.rate)}</span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ol>
      <p className="text-sm text-secondary" data-testid="mobilization-total">
        {ranking.totalTop !== null ? (
          <>
            Soma de abstenções nos {formatInt(ranking.top.length)}{' '}
            {ranking.top.length === 1 ? childLabel.one : childLabel.many} acima:{' '}
            <strong className="text-primary">{formatInt(ranking.totalTop)}</strong>.
          </>
        ) : (
          'Somando as abstenções…'
        )}
        {ranking.totalAll !== null
          ? ` Em todos os ${formatInt(ranking.count)} ${childLabel.many} onde Lula liderou: ${formatInt(ranking.totalAll)}.`
          : ` Lula liderou em ${formatInt(ranking.count)} ${childLabel.many} com dados.`}
      </p>
      {ranking.totalTop !== null && ranking.blankNullTop !== null ? (
        <p className="text-sm text-secondary" data-testid="mobilization-combined">
          Brancos e nulos nesses {formatInt(ranking.top.length)}{' '}
          {ranking.top.length === 1 ? childLabel.one : childLabel.many}:{' '}
          <strong className="text-primary">{formatInt(ranking.blankNullTop)}</strong>. Abstenção +
          brancos e nulos:{' '}
          <strong className="text-primary">
            {formatInt(combinedTotal(ranking.totalTop, ranking.blankNullTop))}
          </strong>{' '}
          (soma de dois grupos distintos de eleitores).
          {ranking.totalAll !== null && ranking.blankNullAll !== null
            ? ` Em todos os ${childLabel.many} onde Lula liderou: ${formatInt(combinedTotal(ranking.totalAll, ranking.blankNullAll))}.`
            : ''}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        Taxa = abstenções ÷ eleitorado apto, 1º turno de 2026, só onde Lula teve mais votos válidos
        que Bolsonaro. Priorização territorial de comparecimento, não inferência sobre pessoas.
        Fonte: TSE.
      </p>
    </div>
  );
}

/**
 * "Onde a abstenção pesa mais" (owner decision D27): top 10 child territories (municipalities
 * of the state; neighborhoods of a municipality) with the highest abstention among those where
 * Lula led the 2026 1st round, with rate, absolute abstentions, margin and totals.
 */
export function MobilizationBlock({
  entry,
  index,
  municipalityFile,
  releaseId,
  onSelectTerritory,
}: MobilizationBlockProps) {
  const isState = entry.type === 'state';
  const abstQ = useLayerValues('abstention', 2026, 1, null, { enabled: isState });
  const marginQ = useLayerValues('president_margin', 2026, 1, null, { enabled: isState });
  const blankNullQ = useLayerValues('blank_null', 2026, 1, null, { enabled: isState });
  const { data: client } = useSnapshot();

  const baseRanking = useMemo<MobilizationRanking | null>(() => {
    if (isState) {
      if (!abstQ.data || !marginQ.data) return null;
      const names = new Map(index.municipalities.map((m) => [m.id, m.name]));
      return rankMobilization(
        rowsFromLayers(abstQ.data, marginQ.data, names, 'lula', blankNullQ.data),
        N,
      );
    }
    if (!municipalityFile) return null;
    const rows: MobilizationRow[] = [];
    for (const child of index.childrenOf.get(entry.id) ?? []) {
      const r = rowFromMetrics(child.id, child.name, municipalityFile.children[child.id], 'lula');
      if (r) rows.push(r);
    }
    return rankMobilization(rows, N);
  }, [isState, abstQ.data, marginQ.data, blankNullQ.data, municipalityFile, index, entry.id]);

  // State level: absolute abstentions come from the top municipalities' files (≤ 10 small files).
  const topIds = isState && baseRanking ? baseRanking.top.map((r) => r.id) : [];
  const files = useQueries({
    queries: topIds.map((id) => ({
      queryKey: snapshotKeys.metrics(client?.releaseId ?? 'none', id),
      queryFn: () => client!.getMunicipalityMetrics(id),
      enabled: !!client,
      staleTime: Infinity,
    })),
  });
  // "abstention:blankNull" per top municipality ('' = still loading), as a stable memo key.
  const absKey = files
    .map((q) => {
      const t = pickMetrics(q.data?.self, 2026, 1)?.turnout;
      return t ? `${t.abstention}:${t.blank + t.null_votes}` : '';
    })
    .join(',');

  const ranking = useMemo<MobilizationRanking | null>(() => {
    if (!baseRanking || !isState) return baseRanking;
    const abs = absKey ? absKey.split(',') : [];
    const top = baseRanking.top.map((r, i) => {
      const [a, b] = (abs[i] ?? '').split(':');
      return {
        ...r,
        abstention: a ? Number(a) : null,
        blankNull: b ? Number(b) : null,
      };
    });
    const known = <K extends 'abstention' | 'blankNull'>(k: K) =>
      top.every((r) => r[k] !== null && r[k] !== undefined)
        ? top.reduce((acc, r) => acc + (r[k] ?? 0), 0)
        : null;
    return {
      ...baseRanking,
      top,
      totalTop: known('abstention'),
      totalAll: null,
      blankNullTop: known('blankNull'),
      blankNullAll: null,
    };
  }, [baseRanking, isState, absKey]);

  if (isState && (abstQ.isLoading || marginQ.isLoading)) {
    return <LoadingBlock label="Calculando a priorização…" lines={4} />;
  }
  if (!ranking) {
    return (
      <Note>
        Dados de abstenção e margem do 1º turno de 2026 ainda não disponíveis neste snapshot.
      </Note>
    );
  }
  return (
    <MobilizationList
      ranking={ranking}
      childLabel={
        isState ? { one: 'município', many: 'municípios' } : { one: 'bairro', many: 'bairros' }
      }
      onSelectTerritory={onSelectTerritory}
      releaseId={releaseId}
    />
  );
}
