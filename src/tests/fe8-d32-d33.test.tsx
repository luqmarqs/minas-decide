/** FE-8 (D29 neighborhood areas), D32 (short sources), D33 (footer signature). */
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapLayerValues } from '@shared/contracts/metrics.ts';
import { AppFooter } from '@/components/layouts/AppFooter';
import { MapLegend } from '@/features/electoral-map/MapLegend';
import { neighborhoodColor } from '@/features/electoral-map/mapExpressions';
import {
  bboxOfArea,
  clearNeighborhoodAreasCache,
  loadNeighborhoodAreas,
} from '@/features/electoral-map/neighborhoodAreas';
import { readMapPalette } from '@/features/electoral-map/palette';
import { shortSource } from '@/lib/source';
import { jsonResponse, renderWithApp } from './utils';

beforeEach(() => clearNeighborhoodAreasCache());
afterEach(() => vi.unstubAllGlobals());

const FIXTURE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        territory_id: 'mg-3140001-centro',
        name: 'Centro',
        municipality_id: 'mg-3140001',
        polling_places: 7,
        approx: true,
        method: 'voronoi-polling-places',
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-43.43, -20.39],
              [-43.41, -20.39],
              [-43.41, -20.36],
              [-43.43, -20.36],
              [-43.43, -20.39],
            ],
          ],
        ],
      },
    },
    // Another municipality's feature and a broken one are ignored.
    {
      type: 'Feature',
      properties: { territory_id: 'mg-3106200-centro', name: 'x' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    { type: 'Feature', properties: { name: 'sem id' }, geometry: null },
  ],
};

describe('neighborhood areas (D29)', () => {
  it('loads /geo/bairros/<ibge7>.geojson once, keeps only this municipality and computes bboxes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FIXTURE));
    const a = await loadNeighborhoodAreas('mg-3140001', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/geo/bairros/3140001.geojson', expect.anything());
    expect(a?.features.map((f) => f.properties.territory_id)).toEqual(['mg-3140001-centro']);
    expect(a?.bboxes.get('mg-3140001-centro')).toEqual([-43.43, -20.39, -43.41, -20.36]);
    await loadNeighborhoodAreas('mg-3140001', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // in-memory cache
  });

  it('falls back (null → points) when the file is missing, HTML, invalid or for the state', async () => {
    expect(
      await loadNeighborhoodAreas('mg-3100104', async () => new Response('x', { status: 404 })),
    ).toBeNull();
    expect(
      await loadNeighborhoodAreas(
        'mg-3100203',
        async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
      ),
    ).toBeNull();
    expect(
      await loadNeighborhoodAreas('mg-3100302', async () => jsonResponse({ type: 'nope' })),
    ).toBeNull();
    const never = vi.fn();
    expect(await loadNeighborhoodAreas('mg', never)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });

  it('bbox handles polygons and multipolygons', () => {
    expect(
      bboxOfArea({
        type: 'Polygon',
        coordinates: [
          [
            [1, 2],
            [3, 4],
            [0, 5],
          ],
        ],
      }),
    ).toEqual([0, 2, 3, 5]);
  });

  it('colours areas with the active layer scale (and party colours only on the margin layer)', () => {
    const p = readMapPalette();
    const values = (layer: MapLayerValues['layer'], domain: [number, number]): MapLayerValues => ({
      layer,
      year: 2026,
      round: 1,
      unit: 'rate',
      candidate_id: null,
      values: {},
      domain,
    });
    const abst = JSON.stringify(
      neighborhoodColor(p, 'abstention', values('abstention', [0.1, 0.3])),
    );
    expect(abst).toContain(p.sequential[0]);
    expect(abst).toContain('"has","v"');
    const margin = JSON.stringify(
      neighborhoodColor(p, 'president_margin', values('president_margin', [-50, 50])),
    );
    expect(margin).toContain(p.margin[4]);
    expect(neighborhoodColor(p, 'activities', null)).toBe(p.none);
  });

  it('legend explains that areas are approximate, not official', () => {
    renderWithApp(
      <MapLegend
        layer="abstention"
        values={null}
        status="validated"
        releaseId="mg-2026r1-20261008"
        year={2026}
        round={1}
      />,
    );
    expect(screen.getByTestId('legend-neighborhood-note')).toHaveTextContent(
      'áreas aproximadas pelos locais de votação (Voronoi), não são limites oficiais',
    );
    // D32: short source + methodology link, no release id.
    const legend = screen.getByRole('region', { name: 'Legenda do mapa' });
    expect(within(legend).getByText(/TSE · IBGE/)).toBeInTheDocument();
    expect(legend).not.toHaveTextContent('mg-2026r1-20261008');
  });
});

describe('shortSource (D32)', () => {
  it.each([
    [
      'Snapshot mg-2026r1-20261008 (1º turno de 2026, conferido com o TSE em docs/TSE_SAMPLE_REPORT.md)',
      'TSE',
    ],
    [
      'TSE, Dados Abertos — votacao_candidato_munzona_2022.zip e detalhe_votacao_munzona_2022.zip [entrada _BR], Presidente (Last-Modified Fri, 09 Oct 2026)',
      'TSE 2022',
    ],
    ['Malha municipal: IBGE (API de malhas v3)', 'IBGE'],
    ['OpenStreetMap via Overpass API; dados OSM de 2026-10-09', 'OpenStreetMap'],
    ['TSE + IBGE', 'TSE · IBGE'],
    ['DEMONSTRAÇÃO — número sintético', 'Demonstração (dados sintéticos)'],
    ['TSE', 'TSE'],
    ['', 'TSE'],
  ])('%s → %s', (input, out) => {
    expect(shortSource(input)).toBe(out);
  });
});

describe('footer', () => {
  it('short data sources, methodology link and the discreet signature', () => {
    renderWithApp(<AppFooter />);
    expect(screen.getByTestId('footer-fonte')).toHaveTextContent(
      'Fonte dos dados: TSE, IBGE e OpenStreetMap',
    );
    expect(screen.getByRole('link', { name: 'Proveniência e metodologia' })).toHaveAttribute(
      'href',
      '/metodologia',
    );
    const sig = screen.getByRole('link', { name: 'luqmarqs.dev' });
    expect(sig).toHaveAttribute('href', 'https://luqmarqs.dev');
    expect(sig).toHaveAttribute('target', '_blank');
    expect(sig).toHaveAttribute('rel', 'noopener noreferrer');
    expect(sig.className).toContain('text-xs');
    expect(sig.className).toContain('text-muted');
    expect(sig.className).toContain('min-h-6'); // ≥ 24 px target
  });
});
