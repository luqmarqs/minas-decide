import { useMemo } from 'react';
import { Link } from 'react-router';
import type { TerritoryMetrics } from '@shared/contracts/metrics.ts';
import { municipalityIdOf } from '@shared/contracts/snapshot.ts';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Note } from '@/components/ui/States';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/toastContext';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { absoluteUrl, SHARE_FEEDBACK, shareOrCopy } from '@/lib/share';
import { useMunicipalityMetrics, useTerritoryIndex } from '@/features/electoral-map/hooks';
import { pickMetrics } from '@/features/electoral-map/layers';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshot';
import { mapQuery } from '@/features/electoral-map/useMapUrlState';
import { ActivityAgenda } from '@/features/activities/ActivityAgenda';
import { DataQualityNote } from './DataQualityNote';
import { GroupCard } from './GroupCard';
import { ComparisonBlock, ResultsBlock, TurnoutCards } from './MetricBlocks';
import { TERRITORY_TYPE_LABEL, territoryLabel } from './search';

export interface TerritoryDetailsProps {
  territoryId: string;
  year: number;
  round: number;
  candidateId?: string | null;
  onYearRoundChange: (year: number, round: number) => void;
  onSelectTerritory: (id: string) => void;
  /** 'panel' (map side panel / sheet) or 'page' (/territorio/:id). */
  variant?: 'panel' | 'page';
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h3 className="font-body text-sm font-semibold tracking-wide text-muted uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Breadcrumb({
  entry,
  byId,
  onSelect,
}: {
  entry: TerritoryIndexEntry;
  byId: Map<string, TerritoryIndexEntry>;
  onSelect: (id: string) => void;
}) {
  const chain: TerritoryIndexEntry[] = [];
  let cur: TerritoryIndexEntry | undefined = entry;
  let guard = 0;
  while (cur && guard++ < 4) {
    chain.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  if (chain[0]?.id !== 'mg')
    chain.unshift({ ...entry, id: 'mg', name: 'Minas Gerais', type: 'state' });
  return (
    <nav aria-label="Localização do território">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-secondary">
        {chain.map((c, i) => {
          const last = i === chain.length - 1;
          return (
            <li key={c.id} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="font-semibold text-primary">
                  {c.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="min-h-8 rounded-sm underline decoration-border-strong underline-offset-2 hover:text-primary"
                  onClick={() => onSelect(c.id)}
                >
                  {c.name}
                </button>
              )}
              {!last ? <Icon name="chevronRight" size={14} className="text-muted" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ShareTerritoryButton({
  entry,
  year,
  round,
}: {
  entry: TerritoryIndexEntry;
  year: number;
  round: number;
}) {
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      iconBefore={<Icon name="share" size={18} />}
      onClick={async () => {
        const url = absoluteUrl(`/${mapQuery({ territoryId: entry.id, year, round })}`);
        const outcome = await shareOrCopy({
          title: `${territoryLabel(entry)} — Minas em Movimento`,
          url,
        });
        if (outcome !== 'cancelled' && outcome !== 'shared') {
          toast.show({
            title: SHARE_FEEDBACK[outcome],
            variant: outcome === 'failed' ? 'error' : 'success',
          });
        }
      }}
    >
      Compartilhar
    </Button>
  );
}

export function TerritoryDetails({
  territoryId,
  year,
  round,
  candidateId,
  onYearRoundChange,
  onSelectTerritory,
  variant = 'panel',
}: TerritoryDetailsProps) {
  const {
    index,
    snapshot,
    isLoading: indexLoading,
    error: indexError,
    refetch,
  } = useTerritoryIndex();
  const entry = index?.byId.get(territoryId);
  const muniId = municipalityIdOf(territoryId);
  const metricsQ = useMunicipalityMetrics(entry ? muniId : null);

  const rows: TerritoryMetrics[] | undefined = useMemo(() => {
    const file = metricsQ.data;
    if (!file || !entry) return undefined;
    return entry.type === 'neighborhood' ? file.children[entry.id] : file.self;
  }, [metricsQ.data, entry]);

  const combos = useMemo(() => {
    const list = (rows ?? []).map((m) => ({ year: m.year, round: m.round }));
    return list.sort((a, b) => b.year - a.year || a.round - b.round);
  }, [rows]);

  if (indexLoading) return <LoadingBlock label="Carregando território…" lines={5} />;
  if (indexError && !index) {
    return (
      <ErrorState
        title="Índice de territórios indisponível"
        message="Não foi possível carregar a lista de territórios."
        onRetry={() => void refetch()}
      />
    );
  }
  if (!entry || !index || !snapshot) {
    return (
      <EmptyState
        title="Território não encontrado"
        description="Este território não existe no snapshot de dados atual. Use a busca para encontrar uma cidade ou bairro."
      />
    );
  }

  const metrics = pickMetrics(rows, year, round);
  const children = entry.type === 'municipality' ? (index.childrenOf.get(entry.id) ?? []) : [];
  const parent = entry.parent_id ? index.byId.get(entry.parent_id) : undefined;
  const status = snapshot.status;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Breadcrumb entry={entry} byId={index.byId} onSelect={onSelectTerritory} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{TERRITORY_TYPE_LABEL[entry.type]}</Badge>
          <Badge
            variant={status === 'demo' ? 'demo' : status === 'partial' ? 'warning' : 'success'}
          >
            {SNAPSHOT_STATUS_LABEL[status]}
          </Badge>
        </div>
        {entry.type === 'neighborhood' ? (
          <p className="text-sm text-secondary">
            Bairro de {entry.municipality_name ?? parent?.name}/MG, aproximado pelos locais de
            votação.
          </p>
        ) : entry.type === 'municipality' ? (
          <p className="text-sm text-secondary">
            {children.length
              ? `${plural(children.length, 'bairro aproximado', 'bairros aproximados')} com dados.`
              : 'Sem dados confiáveis por bairro neste município — exibimos apenas o total municipal.'}
          </p>
        ) : (
          <p className="text-sm text-secondary">
            Visão geral do estado. Selecione um município no mapa ou na busca.
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          <ShareTerritoryButton entry={entry} year={year} round={round} />
          {variant === 'panel' && entry.type !== 'state' ? (
            <ButtonLink
              to={`/territorio/${entry.id}${mapQuery({ year, round })}`}
              variant="ghost"
              size="sm"
            >
              Página do território
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <Section title="Resultados eleitorais">
        {combos.length > 1 ? (
          <Tabs
            value={`${year}-${round}`}
            onValueChange={(v) => {
              const [y, r] = v.split('-').map(Number);
              if (y && r) onYearRoundChange(y, r);
            }}
          >
            <TabsList aria-label="Ano e turno">
              {combos.map((c) => (
                <TabsTrigger key={`${c.year}-${c.round}`} value={`${c.year}-${c.round}`}>
                  {c.year} · {c.round}º turno
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
        {metricsQ.isLoading ? (
          <LoadingBlock label="Carregando indicadores…" lines={4} />
        ) : metricsQ.error ? (
          <ErrorState
            compact
            title="Indicadores indisponíveis"
            message="O arquivo de dados deste município não carregou."
            onRetry={() => void metricsQ.refetch()}
          />
        ) : !metrics ? (
          <Note tone="warning">
            Sem dados eleitorais para este território em {year}, {round}º turno, no snapshot atual.
          </Note>
        ) : (
          <div className="flex flex-col gap-4">
            <TurnoutCards m={metrics} />
            <ResultsBlock m={metrics} selectedCandidateId={candidateId} />
          </div>
        )}
      </Section>

      {metrics && metrics.comparison_2022.length ? (
        <Section title="2022 × 2026">
          <ComparisonBlock points={metrics.comparison_2022} />
        </Section>
      ) : null}

      {entry.type === 'municipality' ? (
        <Section title="Bairros (aproximados)">
          {children.length ? (
            <ul className={cn('grid gap-1', variant === 'page' ? 'sm:grid-cols-2' : '')}>
              {children.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTerritory(c.id)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-2 text-left hover:bg-surface-alt"
                  >
                    <span>{c.name}</span>
                    <Icon name="chevronRight" size={16} className="text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Note>
              Não há bairros com dados confiáveis para este município no snapshot. Os indicadores
              acima são do município inteiro; nenhum dado de bairro é estimado ou inventado.
            </Note>
          )}
        </Section>
      ) : null}

      <DataQualityNote entry={entry} metrics={metrics} releaseId={snapshot.releaseId} />

      {entry.type !== 'state' ? (
        <GroupCard
          territoryId={entry.id}
          territoryName={entry.name}
          municipalityName={entry.type === 'neighborhood' ? entry.municipality_name : entry.name}
        />
      ) : null}

      {entry.type !== 'state' ? (
        <Section title="Atividades próximas">
          <ActivityAgenda
            territoryId={entry.id}
            limit={3}
            compact
            emptyTitle={`Nenhuma atividade publicada em ${entry.name}`}
            emptyAction={
              <Link to="/criar-atividade" className="text-sm font-semibold underline">
                Organizar uma atividade
              </Link>
            }
          />
        </Section>
      ) : null}
    </div>
  );
}
