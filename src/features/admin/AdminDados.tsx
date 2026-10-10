import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { z } from 'zod';
import { OFFICE_LABEL_PT, type SnapshotManifest } from '@shared/contracts/metrics.ts';
import { Badge } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import {
  useCandidates,
  useHighlights,
  useLayerValues,
  useMethodology,
  usePois,
  useTerritoryIndex,
  type TerritoryIndex,
} from '@/features/electoral-map/hooks';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import { formatDateNumeric, formatInt, formatPercent, plural } from '@/lib/format';
import {
  POI_LABEL,
  QUALITY_LABEL,
  groupWarnings,
  parseMatching,
  shortSources,
  summarizeLayers,
} from './dadosDerive';
import { Figure, RankedBars, Section } from './metricsParts';

/** Not published / not recorded in the files read by this section. */
const NP = 'não publicado';

/* ---------- geometry index (public/geo/bairros/index.json) ---------- */

const GeoBairrosIndex = z.object({
  attribution: z.string().optional(),
  totals: z.object({
    municipalities: z.number(),
    neighborhoods_with_area: z.number(),
    neighborhoods_without_area: z.number(),
    by_method: z.record(z.string(), z.number()),
    municipalities_with_official_mesh: z.number().optional(),
  }),
});
type GeoBairrosIndex = z.infer<typeof GeoBairrosIndex>;

/**
 * Read-only static index of neighborhood areas. Lives here (admin lazy chunk) rather than in
 * `electoral-map/hooks.ts` because it needs Zod, which that module keeps out of the initial chunk.
 */
function useGeoBairrosIndex() {
  return useQuery<GeoBairrosIndex | null>({
    queryKey: ['admin', 'dados', 'geo-bairros-index'],
    queryFn: async ({ signal }) => {
      const res = await fetch('/geo/bairros/index.json', {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
      const parsed = GeoBairrosIndex.safeParse(await res.json());
      if (!parsed.success) throw new Error('schema');
      return parsed.data;
    },
    staleTime: Infinity,
    retry: false,
  });
}

/* ---------- UI ---------- */

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

function SnapshotBlock({
  manifest,
  mode,
  sources,
}: {
  manifest: SnapshotManifest;
  mode: 'remote' | 'demo';
  sources: string[];
}) {
  const bytes = manifest.files.reduce((s, f) => s + f.bytes, 0);
  const demo = mode === 'demo' || manifest.status === 'demo';
  const hasFiles = manifest.files.length > 0;
  return (
    <Sub title="Snapshot publicado">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={demo ? 'demo' : manifest.status === 'validated' ? 'success' : 'warning'}>
          {SNAPSHOT_STATUS_LABEL[manifest.status]}
        </Badge>
        <span className="font-mono text-sm break-all">{manifest.release_id}</span>
      </div>
      {demo ? (
        <Note tone="warning">
          Snapshot demonstrativo em uso: os números abaixo são sintéticos, não são dados reais.
        </Note>
      ) : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure
          value={hasFiles ? formatInt(manifest.files.length) : NP}
          label="arquivos no manifest"
        />
        <Figure
          value={hasFiles ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB` : NP}
          label="tamanho total (manifest)"
        />
        <Figure value={formatInt(manifest.territories_count)} label="territórios" />
        <Figure value={formatInt(manifest.records_count)} label="registros de indicadores" />
      </div>
      <p className="ed-caption">
        Gerado em {formatDateNumeric(manifest.generated_at)} · metodologia v
        {manifest.methodology_version} · fontes: {sources.length ? sources.join(', ') : NP}.{' '}
        <a href="/metodologia" className="underline">
          Ver metodologia
        </a>
      </p>
    </Sub>
  );
}

function CoverageBlock({
  manifest,
  index,
}: {
  manifest: SnapshotManifest;
  index: TerritoryIndex | undefined;
}) {
  const highlights = useHighlights();
  const candidates = useCandidates();
  const cmp = useLayerValues('president_comparison', 2026, 1, 'lula');
  const totalMg = highlights.data?.items.find((i) => i.id === 'mg_municipalities')?.value ?? null;
  const layers = useMemo(() => summarizeLayers(manifest.files), [manifest.files]);
  const matching = useMemo(() => parseMatching(manifest.coverage_notes), [manifest.coverage_notes]);

  const stats = useMemo(() => {
    if (!index) return null;
    const hoods = index.entries.filter((e) => e.type === 'neighborhood');
    const withData = index.municipalities.filter((m) => m.data_quality !== 'unavailable').length;
    const quality = new Map<string, number>();
    for (const h of hoods) quality.set(h.data_quality, (quality.get(h.data_quality) ?? 0) + 1);
    const top = index.municipalities
      .map((m) => ({ key: m.id, label: m.name, count: index.childrenOf.get(m.id)?.length ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { hoods: hoods.length, withData, quality, top };
  }, [index]);

  // The public comparison layer is municipal (one value per municipality); the bairro-level
  // comparison lives inside each municipality's metrics file and is summarised by the coverage
  // notes (matching rate, municipalities under 80 %) — never counted here.
  const compared = cmp.data
    ? Object.keys(cmp.data.values).filter((k) => /^mg-\d{7}$/.test(k)).length
    : null;

  const byOffice = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates.data?.items ?? []) m.set(c.office, (m.get(c.office) ?? 0) + 1);
    return [...m.entries()]
      .map(([k, count]) => ({
        key: k,
        label: OFFICE_LABEL_PT[k as keyof typeof OFFICE_LABEL_PT] ?? k,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [candidates.data]);

  const pendingOrNp = (failed: boolean) => (failed ? NP : '—');

  return (
    <Sub title="Cobertura eleitoral">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure
          large
          value={stats ? formatInt(stats.withData) : '—'}
          label={
            totalMg !== null
              ? `municípios com dados, de ${formatInt(totalMg)}`
              : 'municípios com dados (total de MG não publicado)'
          }
        />
        <Figure large value={stats ? formatInt(stats.hoods) : '—'} label="bairros com dados" />
        <Figure
          large
          value={
            candidates.data
              ? formatInt(candidates.data.items.length)
              : pendingOrNp(candidates.isError)
          }
          label="candidaturas no snapshot"
        />
        <Figure
          large
          value={
            stats && totalMg
              ? formatPercent(stats.withData / totalMg, 0)
              : pendingOrNp(highlights.data === null || highlights.isError)
          }
          label="cobertura municipal"
        />
      </div>
      {stats && stats.top.length ? (
        <div>
          <p className="mb-2 text-sm font-semibold">Municípios com mais bairros</p>
          <RankedBars label="Municípios com mais bairros" empty={NP} items={stats.top} />
        </div>
      ) : null}
      <div>
        <p className="mb-2 text-sm font-semibold">Eleições e camadas publicadas</p>
        {layers.length === 0 ? (
          <p className="ed-caption">{NP}</p>
        ) : (
          <dl className="m-0 flex flex-col">
            {layers.map((l) => (
              <div key={l.election} className="border-t border-border py-2 text-sm first:border-0">
                <dt className="font-semibold">{l.election}</dt>
                <dd className="m-0 text-secondary">{l.layers.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {byOffice.length ? (
        <div>
          <p className="mb-2 text-sm font-semibold">Candidaturas por cargo</p>
          <RankedBars label="Candidaturas por cargo" empty={NP} items={byOffice} />
        </div>
      ) : null}
      <div>
        <p className="mb-2 text-sm font-semibold">Comparação presidencial 2022 por bairro</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Figure
            value={
              matching.matchedPct === null ? NP : `${matching.matchedPct.toLocaleString('pt-BR')}%`
            }
            label="dos votos válidos de 2022 associados a bairros (taxa de casamento)"
          />
          <Figure
            value={matching.lowMunicipalities === null ? NP : formatInt(matching.lowMunicipalities)}
            label="municípios abaixo de 80% (bairros sem comparação)"
          />
          <Figure
            value={
              compared !== null && totalMg !== null
                ? `${formatInt(compared)} de ${formatInt(totalMg)}`
                : pendingOrNp(cmp.isError || cmp.data === null)
            }
            label="municípios com comparação 2022→2026 publicada (por bairro: nos arquivos de métricas)"
          />
        </div>
        {stats && stats.quality.size ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold">Bairros por qualidade do dado</p>
            <RankedBars
              label="Bairros por qualidade do dado"
              empty={NP}
              items={[...stats.quality.entries()].map(([k, count]) => ({
                key: k,
                label: QUALITY_LABEL[k] ?? k,
                count,
              }))}
            />
          </div>
        ) : null}
      </div>
    </Sub>
  );
}

function GeographyBlock() {
  const geo = useGeoBairrosIndex();
  const pois = usePois();
  const t = geo.data?.totals;
  const official = t
    ? (t.by_method['official-ibge-cd2022'] ?? 0) + (t.by_method['owner-provided'] ?? 0)
    : 0;
  const voronoi = t?.by_method['voronoi-polling-places'] ?? 0;
  const poiCats = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pois.data?.items ?? []) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()].map(([k, count]) => ({ key: k, label: POI_LABEL[k] ?? k, count }));
  }, [pois.data]);

  return (
    <Sub title="Geografia">
      {geo.isLoading ? (
        <LoadingBlock label="Carregando geografia…" lines={2} />
      ) : t ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure
              value={formatInt(t.neighborhoods_with_area)}
              label="áreas de bairro publicadas"
            />
            <Figure value={formatInt(official)} label="com limite oficial (IBGE, Censo 2022)" />
            <Figure
              value={formatInt(voronoi)}
              label="aproximadas (Voronoi dos locais de votação)"
            />
            <Figure value={formatInt(t.municipalities)} label="municípios cobertos" />
          </div>
          {t.neighborhoods_with_area > 0 ? (
            <div
              className="adm-hbar"
              role="img"
              aria-label={`Áreas de bairro: ${formatPercent(official / t.neighborhoods_with_area, 0)} com limite oficial, o restante aproximado.`}
            >
              <span style={{ width: `${(official / t.neighborhoods_with_area) * 100}%` }} />
            </div>
          ) : null}
          <p className="ed-caption">
            {plural(
              t.neighborhoods_without_area,
              'bairro sem área publicada',
              'bairros sem área publicada',
            )}{' '}
            (continuam como ponto).
            {t.municipalities_with_official_mesh !== undefined
              ? ` Malha oficial de bairros em ${formatInt(t.municipalities_with_official_mesh)} municípios.`
              : ''}{' '}
            Áreas aproximadas não são limites oficiais.
          </p>
        </>
      ) : (
        <p className="ed-caption">Áreas de bairro: {NP}.</p>
      )}
      <p className="ed-caption">
        Malha municipal: IBGE (API de malhas v3), arquivo único em /geo; a contagem de feições não é
        lida por este painel.
      </p>
      {pois.isLoading ? (
        <LoadingBlock label="Carregando terminais…" lines={1} />
      ) : pois.data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Figure
            value={formatInt(pois.data.items.length)}
            label={`terminais e estações · ${pois.data.attribution} (${pois.data.license})`}
          />
          <RankedBars label="Terminais e estações por tipo" empty={NP} items={poiCats} />
        </div>
      ) : (
        <p className="ed-caption">Terminais e estações: {NP}.</p>
      )}
    </Sub>
  );
}

function QualityBlock({ manifest }: { manifest: SnapshotManifest }) {
  const meth = useMethodology();
  const groups = useMemo(() => groupWarnings(manifest.warnings), [manifest.warnings]);
  return (
    <Sub title="Qualidade">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
        <Figure
          value={formatInt(manifest.warnings.length)}
          label={manifest.warnings.length === 1 ? 'aviso registrado' : 'avisos registrados'}
        />
        {groups.length ? (
          <RankedBars label="Avisos por tipo" empty="Nenhum aviso." items={groups} />
        ) : (
          <p className="ed-caption">Nenhum aviso de consistência registrado no manifest.</p>
        )}
      </div>
      <p className="ed-caption">
        Divergências são registradas, nunca corrigidas em silêncio. Avisos por território ficam nos
        arquivos de métricas e não são somados aqui.
      </p>
      <Note tone="info">
        {meth.data?.neighborhood_note ??
          'Bairro é aproximação: o bairro do endereço do local de votação, não a residência do eleitor.'}
      </Note>
    </Sub>
  );
}

export function DadosSection() {
  const { index, snapshot, isLoading, error } = useTerritoryIndex();
  const meth = useMethodology();
  const geo = useGeoBairrosIndex();
  const pois = usePois();
  const sources = useMemo(
    () =>
      shortSources([
        ...(meth.data?.sources.map((s) => s.label) ?? []),
        ...(geo.data?.attribution ? [geo.data.attribution] : []),
        ...(pois.data ? [pois.data.attribution] : []),
      ]),
    [meth.data, geo.data, pois.data],
  );

  return (
    <Section id="metrics-dados" kicker="Dados" title="Conjunto de dados publicado">
      {error ? (
        <ErrorState
          title="Snapshot indisponível"
          message="Não foi possível ler os arquivos estáticos do snapshot. Tente de novo mais tarde."
        />
      ) : isLoading || !snapshot ? (
        <LoadingBlock label="Carregando snapshot…" lines={4} />
      ) : (
        <>
          <SnapshotBlock manifest={snapshot.manifest} mode={snapshot.mode} sources={sources} />
          <CoverageBlock manifest={snapshot.manifest} index={index} />
          <GeographyBlock />
          <QualityBlock manifest={snapshot.manifest} />
          <p className="ed-caption">
            Lido dos arquivos estáticos em /data e /geo; nenhuma consulta a banco.
          </p>
        </>
      )}
    </Section>
  );
}
