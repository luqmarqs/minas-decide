import { useMemo } from 'react';
import type { TerritoryMetrics } from '@shared/contracts/metrics.ts';
import { municipalityIdOf } from '@shared/contracts/snapshot.ts';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Note } from '@/components/ui/States';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { WhatsAppShare } from '@/components/ui/WhatsAppShare';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { absoluteUrl, territoryShareText } from '@/lib/share';
import { useMunicipalityMetrics, usePois, useTerritoryIndex } from '@/features/electoral-map/hooks';
import { pickMetrics, pickPresidentComparison } from '@/features/electoral-map/layers';
import { POI_CATEGORY_LABEL, poisOfMunicipality } from '@/features/electoral-map/poi';
import { PoiMarker } from '@/features/electoral-map/PoiMarker';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import { mapQuery } from '@/features/electoral-map/useMapUrlState';
import { ActivityAgenda } from '@/features/activities/ActivityAgenda';
import { DataQualityNote } from './DataQualityNote';
import { GroupCard } from './GroupCard';
import { ResultsBlock, TurnoutCards } from './MetricBlocks';
import { MobilizationBlock } from './MobilizationBlock';
import { PresidentialComparisonBlock } from './PresidentialComparisonBlock';
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
  /** `false` keeps the skeleton and does not fetch yet (page waits for first paint). */
  dataEnabled?: boolean;
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
    <section className={cn('flex flex-col gap-3', className)}>
      <hr className="ed-rule" aria-hidden="true" />
      <h2 className="ed-kicker font-body">{title}</h2>
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
  rows,
}: {
  entry: TerritoryIndexEntry;
  year: number;
  round: number;
  rows: TerritoryMetrics[] | undefined;
}) {
  const url = absoluteUrl(`/${mapQuery({ territoryId: entry.id, year, round })}`);
  // Numbers of the 2026 1st round from the snapshot; missing parts are omitted.
  const m26 = pickMetrics(rows, 2026, 1);
  const pc = pickPresidentComparison(rows);
  const share = (k: 'lula' | 'bolsonaro') =>
    pc && pc.precision !== 'unavailable'
      ? (pc.entries.find((e) => e.key === k)?.share_2026_r1 ?? null)
      : null;
  const text = territoryShareText({
    name: territoryLabel(entry),
    url,
    abstentionRate: m26?.turnout?.abstention_rate ?? null,
    lulaShare: share('lula'),
    bolsonaroShare: share('bolsonaro'),
  });
  return <WhatsAppShare text={text} copyUrl={url} variant="ghost" />;
}

export function TerritoryDetails({
  territoryId,
  year,
  round,
  candidateId,
  onYearRoundChange,
  onSelectTerritory,
  variant = 'panel',
  dataEnabled = true,
}: TerritoryDetailsProps) {
  const {
    index,
    snapshot,
    isLoading: indexLoading,
    error: indexError,
    refetch,
  } = useTerritoryIndex({ enabled: dataEnabled });
  const entry = index?.byId.get(territoryId);
  const muniId = municipalityIdOf(territoryId);
  const metricsQ = useMunicipalityMetrics(entry ? muniId : null);

  const rows: TerritoryMetrics[] | undefined = useMemo(() => {
    const file = metricsQ.data;
    if (!file || !entry) return undefined;
    return entry.type === 'neighborhood' ? file.children[entry.id] : file.self;
  }, [metricsQ.data, entry]);

  // Terminals list only on the territory page (the map panel stays short).
  const poisQ = usePois({ enabled: dataEnabled && variant === 'page' && !!entry });

  const combos = useMemo(() => {
    const list = (rows ?? []).map((m) => ({ year: m.year, round: m.round }));
    return list.sort((a, b) => b.year - a.year || a.round - b.round);
  }, [rows]);

  // Index and indicators render in the same step (P-PERF-2): the skeleton reserves
  // roughly the final height so the bairros list and the footer do not jump.
  if (!dataEnabled || indexLoading || (entry && metricsQ.isLoading)) {
    return (
      <div className={variant === 'page' ? 'min-h-[36rem]' : 'min-h-80'}>
        <LoadingBlock label="Carregando território…" lines={variant === 'page' ? 12 : 6} />
      </div>
    );
  }
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
          <ShareTerritoryButton entry={entry} year={year} round={round} rows={rows} />
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
        {metricsQ.error ? (
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

      {/* Rodada 3: tracked-candidate history (comparison_2022) is no longer highlighted. */}
      {!metricsQ.error && rows ? (
        <Section title="Lula × Bolsonaro: 2022 → 2026">
          <PresidentialComparisonBlock
            comparison={pickPresidentComparison(rows)}
            releaseId={snapshot.releaseId}
            demo={status === 'demo'}
          />
        </Section>
      ) : null}

      {entry.type !== 'neighborhood' && !metricsQ.error ? (
        <Section title="Onde a abstenção pesa mais">
          <MobilizationBlock
            entry={entry}
            index={index}
            municipalityFile={metricsQ.data}
            releaseId={snapshot.releaseId}
            onSelectTerritory={onSelectTerritory}
          />
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

      {variant === 'page' && entry.type !== 'state' && muniId && muniId !== 'mg' ? (
        <PoiSection
          municipalityId={muniId}
          municipalityName={entry.type === 'neighborhood' ? entry.municipality_name : entry.name}
          loading={poisQ.isLoading}
          failed={!!poisQ.error}
          items={poisQ.data?.items ?? null}
        />
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
              <ButtonLink to="/criar-atividade" variant="secondary" size="sm">
                Propor atividade
              </ButtonLink>
            }
          />
        </Section>
      ) : null}
    </div>
  );
}

function PoiSection({
  municipalityId,
  municipalityName,
  loading,
  failed,
  items,
}: {
  municipalityId: string;
  municipalityName: string | null | undefined;
  loading: boolean;
  failed: boolean;
  items: Parameters<typeof poisOfMunicipality>[0];
}) {
  if (loading || failed || !items) return null;
  const list = poisOfMunicipality(items, municipalityId);
  if (!list.length) return null;
  return (
    <Section title="Terminais e estações no município">
      <p className="text-sm text-secondary">
        Locais de grande circulação em {municipalityName ?? 'este município'}, úteis para planejar
        panfletagens. Não são dados eleitorais.
      </p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {list.map((p) => (
          <li key={p.id} className="flex min-h-11 items-center gap-2 rounded-sm px-1">
            <PoiMarker size={11} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.name}</span>
              <span className="block text-xs text-muted">{POI_CATEGORY_LABEL[p.category]}</span>
            </span>
            <a
              href={p.osm_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm underline"
              aria-label={`${p.name} no OpenStreetMap (openstreetmap.org)`}
            >
              OSM <Icon name="external" size={14} />
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Fonte: OpenStreetMap (© OpenStreetMap contributors, ODbL).
      </p>
    </Section>
  );
}
