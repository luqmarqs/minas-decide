import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DadosSection } from '@/features/admin/AdminDados';
import {
  groupWarnings,
  parseMatching,
  shortSources,
  summarizeLayers,
} from '@/features/admin/dadosDerive';
import { jsonResponse, renderWithApp, stubFetch } from './utils';

const REL = 'mg-test-1';
const sha = 'a'.repeat(64);

function manifest(over: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    release_id: REL,
    status: 'validated',
    generated_at: '2026-10-09T18:45:45.077Z',
    years: [2022, 2026],
    rounds: [1],
    geographic_levels: ['state', 'municipality', 'neighborhood'],
    source_project_alias: 'alias',
    source_tables: [],
    pipeline_commit: 'abc',
    territories_count: 5,
    records_count: 100,
    indicator_types: [],
    files: [
      { path: `${REL}/territories-index.json`, sha256: sha, bytes: 1048576 },
      { path: `${REL}/layers/2022-r1-president_margin.json`, sha256: sha, bytes: 1048576 },
      { path: `${REL}/layers/2022-r2-president_margin.json`, sha256: sha, bytes: 1 },
      { path: `${REL}/layers/2026-r1-turnout.json`, sha256: sha, bytes: 1 },
      { path: `${REL}/layers/2026-r1-votes-100001.json`, sha256: sha, bytes: 1 },
      { path: `${REL}/layers/2026-r1-votes-100002.json`, sha256: sha, bytes: 1 },
    ],
    methodology_version: '1.1.0',
    coverage_notes: [
      'Bairros 2022 (aproximados): 99.39 % dos votos válidos de 2022 (1º turno) associados; 5 municípios abaixo de 80 % (bairros sem comparação).',
    ],
    warnings: [
      'mg-1-a: grafias distintas de bairro unificadas (A / B).',
      'mg-1-b: grafias distintas de bairro unificadas (C / D).',
      'mg-1-c: Σ candidatos ≠ válidos (0,7%).',
    ],
    ...over,
  };
}

const idx = (id: string, type: string, parent: string | null, name: string, dq = 'complete') => ({
  id,
  type,
  name,
  slug: id,
  parent_id: parent,
  ibge_code: null,
  state_code: 'MG',
  centroid: null,
  data_quality: dq,
  normalized_name: name.toLowerCase(),
  municipality_name: null,
});
const INDEX = [
  idx('mg', 'state', null, 'Minas Gerais'),
  idx('mg-3100104', 'municipality', 'mg', 'Alfa'),
  idx('mg-3100203', 'municipality', 'mg', 'Beta'),
  idx('mg-3100104-centro', 'neighborhood', 'mg-3100104', 'Centro'),
  idx('mg-3100104-norte', 'neighborhood', 'mg-3100104', 'Norte', 'unavailable'),
  idx('mg-3100203-sul', 'neighborhood', 'mg-3100203', 'Sul'),
];

const METHODOLOGY = {
  version: '1.1.0',
  language: 'pt-BR',
  summary: 's',
  neighborhood_note: 'Nota de bairro de teste: aproximação pelo local de votação.',
  comparison_note: 'c',
  denominators: {},
  sources: [
    { label: 'Resultados (TSE)', note: 'n' },
    { label: 'Malha municipal', note: 'IBGE, API de malhas' },
  ],
  limitations: [],
};

interface Opts {
  manifest?: unknown;
  /** serve a 404 for the manifest (forces the DEMO fallback) */
  noManifest?: boolean;
  index?: Response;
  geo?: Response;
  pois?: Response;
  highlights?: Response;
  candidates?: Response;
}

function install(o: Opts = {}) {
  const notFound = () => new Response('nf', { status: 404 });
  return stubFetch((url) => {
    if (url.endsWith('/data/manifest.json'))
      return Promise.resolve(o.noManifest ? notFound() : jsonResponse(o.manifest ?? manifest()));
    if (url.endsWith(`${REL}/territories-index.json`))
      return Promise.resolve(o.index ?? jsonResponse(INDEX));
    if (url.endsWith(`${REL}/methodology.json`)) return Promise.resolve(jsonResponse(METHODOLOGY));
    if (url.endsWith(`${REL}/highlights.json`))
      return Promise.resolve(
        o.highlights ??
          jsonResponse({
            generated_at: 'x',
            items: [
              {
                id: 'mg_municipalities',
                label: 'Municípios',
                value: 4,
                unit: 'count',
                compare_value: null,
                compare_label: null,
                note: null,
                source: 'IBGE',
              },
            ],
            why_minas: [],
          }),
      );
    if (url.endsWith(`${REL}/candidates.json`))
      return Promise.resolve(
        o.candidates ??
          jsonResponse({
            items: [1, 2, 3].map((n) => ({
              candidate_id: `c${n}`,
              ballot_name: `Cand ${n}`,
              party: 'P',
              number: n,
              office: n === 1 ? 'president' : 'governor',
              year: 2026,
              has_history: false,
              has_layer: true,
            })),
          }),
      );
    if (url.includes(`${REL}/layers/2026-r1-president_comparison-lula`))
      return Promise.resolve(
        jsonResponse({
          layer: 'president_comparison',
          year: 2026,
          round: 1,
          unit: 'pp',
          candidate_id: 'lula',
          values: { 'mg-3100104': 1, 'mg-3100104-centro': 2, 'mg-3100203-sul': 3 },
          domain: [0, 3],
        }),
      );
    if (url.endsWith('/geo/bairros/index.json'))
      return Promise.resolve(
        o.geo ??
          jsonResponse({
            attribution: 'Malha municipal: IBGE.',
            totals: {
              municipalities: 2,
              neighborhoods_with_area: 10,
              neighborhoods_without_area: 1,
              by_method: { 'official-ibge-cd2022': 4, 'voronoi-polling-places': 6 },
              municipalities_with_official_mesh: 1,
            },
          }),
      );
    if (url.endsWith('/pois/terminais-mg.json'))
      return Promise.resolve(
        o.pois ??
          jsonResponse({
            generated_at: '2026-10-09T16:52:33.812Z',
            source: 'OpenStreetMap via Overpass',
            license: 'ODbL 1.0',
            attribution: '© OpenStreetMap contributors',
            items: [
              {
                id: 'a',
                name: 'A',
                category: 'bus_station',
                coordinates: [-43, -19],
                municipality_id: 'mg-3100104',
                osm_url: 'https://www.openstreetmap.org/way/1',
              },
              {
                id: 'b',
                name: 'B',
                category: 'bus_terminal',
                coordinates: [-43, -19],
                municipality_id: null,
                osm_url: 'https://www.openstreetmap.org/way/2',
              },
            ],
          }),
      );
    return undefined;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('derivations', () => {
  it('summarizeLayers groups layers by election from manifest paths', () => {
    const s = summarizeLayers(manifest().files);
    expect(s.map((x) => x.election)).toEqual([
      '2022 · 1º turno',
      '2022 · 2º turno',
      '2026 · 1º turno',
    ]);
    expect(s[2]!.layers).toEqual(['comparecimento', 'votos por candidatura (2 arquivos)']);
  });

  it('groupWarnings groups by message, ignoring territory ids and details', () => {
    expect(groupWarnings(manifest().warnings)).toEqual([
      {
        key: 'grafias distintas de bairro unificadas',
        label: 'grafias distintas de bairro unificadas',
        count: 2,
      },
      { key: 'Σ candidatos ≠ válidos', label: 'Σ candidatos ≠ válidos', count: 1 },
    ]);
    expect(groupWarnings([])).toEqual([]);
  });

  it('parseMatching returns null when notes do not carry the figures', () => {
    expect(parseMatching(manifest().coverage_notes)).toEqual({
      matchedPct: 99.39,
      lowMunicipalities: 5,
    });
    expect(parseMatching([])).toEqual({ matchedPct: null, lowMunicipalities: null });
  });

  it('shortSources picks TSE / IBGE / OpenStreetMap', () => {
    expect(
      shortSources(['Resultados (TSE)', 'IBGE malha', '© OpenStreetMap contributors']),
    ).toEqual(['TSE', 'IBGE', 'OpenStreetMap']);
    expect(shortSources([])).toEqual([]);
  });
});

describe('Dados section', () => {
  it('validated snapshot: status, coverage, geography and quality from the static files', async () => {
    install();
    renderWithApp(<DadosSection />);
    await screen.findByText(REL);
    expect(screen.getByText('Dados validados')).toBeInTheDocument();
    expect(screen.queryByText('DADOS DEMONSTRATIVOS')).not.toBeInTheDocument();
    expect(screen.getByText('2,0 MB')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/fontes: TSE, IBGE, OpenStreetMap/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Ver metodologia' })).toHaveAttribute(
      'href',
      '/metodologia',
    );
    expect(await screen.findByText('municípios com dados, de 4')).toBeInTheDocument();
    expect(await screen.findByText('50%')).toBeInTheDocument(); // 2 of 4
    await waitFor(() =>
      expect(screen.getByText('candidaturas no snapshot').previousElementSibling).toHaveTextContent(
        '3',
      ),
    );
    expect(screen.getByText('99,39%')).toBeInTheDocument();
    expect(await screen.findByText('2 de 3')).toBeInTheDocument(); // neighborhoods compared
    expect(screen.getByText('2026 · 1º turno').closest('div')).toHaveTextContent('comparecimento');
    expect(screen.getByRole('list', { name: 'Bairros por qualidade do dado' })).toHaveTextContent(
      'indisponível',
    );
    const top = screen.getByRole('list', { name: 'Municípios com mais bairros' });
    expect(within(top).getAllByRole('listitem')[0]).toHaveTextContent('Alfa');
    // geography
    expect(await screen.findByText('áreas de bairro publicadas')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /40% com limite oficial/ })).toBeInTheDocument();
    expect(
      await screen.findByText(/terminais e estações · © OpenStreetMap contributors \(ODbL 1.0\)/),
    ).toBeInTheDocument();
    // quality
    expect(screen.getByRole('list', { name: 'Avisos por tipo' })).toHaveTextContent(
      'grafias distintas de bairro unificadas',
    );
    expect(screen.getByText(/Nota de bairro de teste/)).toBeInTheDocument();
  });

  it('demo fallback shows the DEMO seal and the synthetic warning', async () => {
    install({ noManifest: true });
    renderWithApp(<DadosSection />);
    expect(await screen.findByText('DADOS DEMONSTRATIVOS')).toBeInTheDocument();
    expect(screen.getByText(/Snapshot demonstrativo em uso/)).toBeInTheDocument();
  });

  it('missing optional files render "não publicado" instead of invented numbers', async () => {
    const nf = () => new Response('nf', { status: 404 });
    install({
      manifest: manifest({ files: [], coverage_notes: [], warnings: [] }),
      geo: nf(),
      pois: nf(),
      highlights: nf(),
      candidates: nf(),
    });
    renderWithApp(<DadosSection />);
    await screen.findByText(REL);
    await waitFor(() =>
      expect(screen.getByText('Áreas de bairro: não publicado.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Terminais e estações: não publicado.')).toBeInTheDocument();
    expect(
      screen.getByText('municípios com dados (total de MG não publicado)'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('não publicado').length).toBeGreaterThanOrEqual(4);
    expect(
      screen.getByText('Nenhum aviso de consistência registrado no manifest.'),
    ).toBeInTheDocument();
  });

  it('shows "Snapshot indisponível" when the index cannot be read', async () => {
    install({ index: new Response('err', { status: 500 }) });
    renderWithApp(<DadosSection />);
    expect(await screen.findByText('Snapshot indisponível')).toBeInTheDocument();
  });

  it('shows a loading state first', () => {
    install();
    renderWithApp(<DadosSection />);
    expect(screen.getByText('Carregando snapshot…')).toBeInTheDocument();
  });
});
