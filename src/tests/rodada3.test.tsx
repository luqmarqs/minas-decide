/**
 * Rodada 3 (FE-6): presidential comparison, key-number cards, overlays (activities always
 * on, POIs), activity popover with RSVP, margin layer (D25 partisan exception) and the
 * narrative section.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicActivity } from '@shared/contracts/activities.ts';
import type {
  MapLayerValues,
  PresidentialComparison,
  TerritoryMetrics,
} from '@shared/contracts/metrics.ts';
import type { Highlights, PoiFile } from '@shared/contracts/snapshot.ts';
import { ActivityPopover } from '@/features/activities/ActivityPopover';
import {
  isStatLayer,
  LAYER_ORDER,
  layerFromSlug,
  marginFromComparison,
  valueForLayer,
} from '@/features/electoral-map/layers';
import { fillExpression, overlayVisibility } from '@/features/electoral-map/mapExpressions';
import { MapLayerSelector } from '@/features/electoral-map/MapLayerSelector';
import { MapLegend } from '@/features/electoral-map/MapLegend';
import { marginVar, readMapPalette } from '@/features/electoral-map/palette';
import { poisOfMunicipality } from '@/features/electoral-map/poi';
import { loadSnapshot } from '@/features/electoral-map/snapshot';
import { parseMapParams } from '@/features/electoral-map/useMapUrlState';
import { buildStripCards } from '@/features/highlights/cards';
import { compareLine, formatHighlightValue } from '@/features/highlights/format';
import { projectMunicipalities, type MunicipalCollection } from '@/features/story/geo';
import { StoryIntroView } from '@/features/story/StoryIntro';
import { PresidentialComparisonBlock } from '@/features/territory/PresidentialComparisonBlock';
import { jsonResponse, renderWithApp } from './utils';

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => window.localStorage.clear());

const PC: PresidentialComparison = {
  precision: 'exact',
  note: 'Nota da fonte.',
  entries: [
    {
      key: 'lula',
      ballot_name_2022: 'LULA',
      ballot_name_2026: 'LULA',
      number_2022: 13,
      number_2026: 13,
      votes_2022_r1: 5802571,
      valid_2022_r1: 12016633,
      share_2022_r1: 0.4829,
      votes_2022_r2: 6190960,
      valid_2022_r2: 12332270,
      share_2022_r2: 0.502,
      votes_2026_r1: 5188936,
      valid_2026_r1: 11976235,
      share_2026_r1: 0.4333,
      delta_pp_r1: -4.96,
      delta_votes_r1: -613635,
    },
    {
      key: 'bolsonaro',
      ballot_name_2022: 'JAIR BOLSONARO',
      ballot_name_2026: 'FLÁVIO BOLSONARO',
      number_2022: 22,
      number_2026: 22,
      votes_2022_r1: 5239264,
      valid_2022_r1: 12016633,
      share_2022_r1: 0.436,
      votes_2022_r2: 6141310,
      valid_2022_r2: 12332270,
      share_2022_r2: 0.498,
      votes_2026_r1: 5777548,
      valid_2026_r1: 11976235,
      share_2026_r1: 0.4824,
      delta_pp_r1: 4.64,
      delta_votes_r1: 538284,
    },
  ],
};

const item = (
  id: string,
  value: number,
  unit: Highlights['items'][number]['unit'],
  compare_value: number | null = null,
  compare_label: string | null = null,
): Highlights['items'][number] => ({
  id,
  label: `Rótulo ${id}`,
  value,
  unit,
  compare_value,
  compare_label,
  note: null,
  source: `Fonte ${id}`,
});

const HIGHLIGHTS: Highlights = {
  generated_at: '2026-10-09T00:00:00Z',
  items: [
    item('mg_eligible_2026', 16372372, 'people', 158745502, 'eleitorado apto no Brasil'),
    item('mg_share_national_eligible_2026', 10.31, 'percent'),
    item('mg_rank_eligible_2026', 2, 'count', 27, 'unidades da federação'),
    item('mg_municipalities', 853, 'count'),
    item('mg_2026_r1_lula_share', 43.33, 'percent'),
    item('mg_2026_r1_flavio_share', 48.24, 'percent'),
    item('mg_2026_r1_margin_votes', -588612, 'votes', -4.91, 'p.p. dos válidos'),
    item('mg_2022_r2_margin_votes', 49650, 'votes', 0.4, 'p.p. dos válidos'),
    item('mg_turnout_2026_r1', 12637274, 'people', 77.19, '% do eleitorado apto'),
    item('mg_abstention_2026_r1', 3735098, 'people', 22.81, '% do eleitorado apto'),
    item('mg_2026_r1_municipalities_led_lula', 452, 'count', 52.99, '% dos 853 municípios'),
    item('mg_2026_r1_municipalities_led_bolsonaro', 401, 'count', 47.01, '% dos 853 municípios'),
    item('mg_2022_r2_municipalities_led_lula', 564, 'count'),
    item('mg_2022_r2_municipalities_led_bolsonaro', 289, 'count'),
    item('mg_2026_r1_other_candidates_votes', 1009751, 'votes', 8.43, '% dos votos válidos'),
    item('mg_2026_r1_blank_null_votes', 661039, 'votes', 5.23, '% do comparecimento'),
    item('mg_2026_r1_abstention_votes', 3735098, 'people', 22.81, '% do eleitorado apto'),
  ],
  why_minas: [
    {
      title: 'Margem estreita em 2022',
      text: 'Texto do arquivo.',
      value: 49650,
      unit: 'votos',
      source: 'TSE',
    },
  ],
};

describe('layers and URL state (rodada 3)', () => {
  it('offers only statistical layers in the selector; tracked comparison and overlays are out', () => {
    expect(LAYER_ORDER).toEqual([
      'abstention',
      'turnout',
      'votes',
      'president_margin',
      'president_comparison',
      'mobilization',
    ]);
    expect(isStatLayer('comparison')).toBe(false);
    expect(isStatLayer('activities')).toBe(false);
    expect(isStatLayer('pois')).toBe(false);
  });

  it('keeps old links working: comparacao → presidential comparison, atividades/terminais → overlays', () => {
    expect(layerFromSlug('comparacao')).toBe('president_comparison');
    expect(layerFromSlug('lula-bolsonaro')).toBe('president_comparison');
    expect(layerFromSlug('margem')).toBe('president_margin');
    expect(layerFromSlug('atividades')).toBeNull();
    const a = parseMapParams(new URLSearchParams('camada=atividades'));
    expect(a.layer).toBe('abstention');
    expect(a.activities).toBe(true);
    expect(a.pois).toBe(false);
    const t = parseMapParams(new URLSearchParams('camada=terminais&atividades=0'));
    expect(t.pois).toBe(true);
    expect(t.activities).toBe(false);
  });

  it('activities stay visible over every statistical layer (overlay depends only on its switch)', () => {
    for (const layer of LAYER_ORDER) {
      expect(layer).toBeTruthy();
      expect(overlayVisibility(true)).toBe('visible');
    }
    expect(overlayVisibility(false)).toBe('none');
  });

  it('reads the presidential delta and the margin from the comparison block', () => {
    const m = {
      territory_id: 'mg',
      year: 2026,
      round: 1,
      status: 'validated',
      release_id: 'r',
      data_quality: 'complete',
      turnout: null,
      results: {},
      valid_by_office: {},
      comparison_2022: [],
      president_comparison: PC,
      warnings: [],
    } satisfies TerritoryMetrics;
    expect(valueForLayer(m, 'president_comparison', 'lula')).toBe(-4.96);
    expect(valueForLayer(m, 'president_comparison', 'bolsonaro')).toBe(4.64);
    expect(valueForLayer(m, 'president_comparison', 'x')).toBeNull();
    expect(marginFromComparison(PC, 2026, 1)).toBe(-4.91);
    expect(marginFromComparison(PC, 2022, 2)).toBe(0.4);
    expect(marginFromComparison({ ...PC, precision: 'unavailable' }, 2026, 1)).toBeNull();
  });
});

describe('margin layer: D25 partisan exception only there', () => {
  const values: MapLayerValues = {
    layer: 'president_margin',
    year: 2026,
    round: 1,
    unit: 'pp',
    candidate_id: null,
    values: { 'mg-3106200': 12 },
    domain: [-60, 60],
  };
  it('uses the Lula/Bolsonaro tokens on the margin layer and never on the others', () => {
    const p = readMapPalette();
    const margin = JSON.stringify(fillExpression(p, 'president_margin', values));
    expect(margin).toContain(p.margin[0]);
    expect(margin).toContain(p.margin[4]);
    const neutral = JSON.stringify(
      fillExpression(p, 'president_comparison', { ...values, layer: 'president_comparison' }),
    );
    expect(neutral).not.toContain(p.margin[0]);
    expect(neutral).toContain(p.diverging[0]);
    const abst = JSON.stringify(
      fillExpression(p, 'abstention', { ...values, layer: 'abstention', domain: [0, 1] }),
    );
    expect(abst).not.toContain(p.margin[4]);
  });
  it('maps positive margins to Lula and negative to Bolsonaro, small ones to neutral', () => {
    expect(marginVar(50, [-60, 60])).toBe('--map-lula');
    expect(marginVar(10, [-60, 60])).toBe('--map-lula-soft');
    expect(marginVar(1, [-60, 60])).toBe('--map-margin-zero');
    expect(marginVar(-50, [-60, 60])).toBe('--map-bolsonaro');
  });
  it('legend names who leads on each side and states the unit and the source', () => {
    renderWithApp(
      <MapLegend
        layer="president_margin"
        values={values}
        status="validated"
        releaseId="rel-1"
        year={2022}
        round={2}
      />,
    );
    expect(screen.getByText('Lula à frente')).toBeInTheDocument();
    expect(screen.getByText('Jair Bolsonaro à frente')).toBeInTheDocument();
    expect(screen.getByText(/margem em p.p. dos votos válidos/)).toBeInTheDocument();
    expect(screen.getByText(/TSE/)).toBeInTheDocument();
  });
});

describe('PresidentialComparisonBlock', () => {
  it('shows Lula and Bolsonaro side by side with 2022 r1/r2, 2026 r1, deltas and caveats', () => {
    render(<PresidentialComparisonBlock comparison={PC} releaseId="rel-1" />);
    const lula = screen.getByRole('article', { name: 'Lula' });
    const bolso = screen.getByRole('article', { name: 'Bolsonaro' });
    expect(within(lula).getByText('48,3%')).toBeInTheDocument();
    expect(within(lula).getByText('50,2%')).toBeInTheDocument();
    expect(within(lula).getByText('43,3%')).toBeInTheDocument();
    expect(within(lula).getByText('−5,0 p.p.')).toBeInTheDocument();
    expect(within(lula).getByText('−613.635 votos')).toBeInTheDocument();
    expect(
      within(bolso).getByText(/JAIR BOLSONARO \(22\).*FLÁVIO BOLSONARO \(22\)/),
    ).toBeInTheDocument();
    expect(within(bolso).getByText('+4,6 p.p.')).toBeInTheDocument();
    expect(screen.getByText(/Precisão: exata/)).toBeInTheDocument();
    expect(screen.getByText(/não implica transferência de votos/)).toBeInTheDocument();
    expect(screen.getByText(/Fonte: TSE/)).toBeInTheDocument();
  });

  it('labels approximate and unavailable precision honestly', () => {
    const { rerender } = render(
      <PresidentialComparisonBlock
        comparison={{ ...PC, precision: 'approximate' }}
        releaseId="r"
      />,
    );
    expect(screen.getByText(/Precisão: aproximada/)).toBeInTheDocument();
    rerender(
      <PresidentialComparisonBlock
        comparison={{ ...PC, precision: 'unavailable', note: 'Sem linha no TSE.' }}
        releaseId="r"
      />,
    );
    expect(
      screen.getByText(/Comparação indisponível para este território. Sem linha no TSE./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    rerender(<PresidentialComparisonBlock comparison={null} releaseId="r" />);
    expect(screen.getByText(/ainda não publicado/)).toBeInTheDocument();
  });
});

describe('"Por que Minas decide" cards', () => {
  it('formats file values pt-BR (percent 0–100, p.p., ordinal rank) without computing new numbers', () => {
    const cards = buildStripCards(HIGHLIGHTS);
    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect(cards.length).toBeLessThanOrEqual(6);
    const [eligible, munis, duel, margin22, turnout] = cards;
    expect(eligible!.value).toBe('16.372.372');
    expect(eligible!.detail).toEqual([
      '10,3% do eleitorado do Brasil',
      '2º maior colégio entre 27 UFs',
    ]);
    expect(munis!.value).toBe('853');
    expect(duel!.value).toBe('43,3% × 48,2%');
    expect(duel!.detail[0]).toBe('diferença de −588.612 votos');
    expect(margin22!.value).toBe('+49.650 votos');
    expect(margin22!.detail[0]).toBe('+0,4 p.p. dos válidos');
    expect(turnout!.detail).toEqual([
      '77,2% do eleitorado apto',
      'abstenção: 22,8% do eleitorado apto',
    ]);
    for (const c of cards) expect(c.source).toMatch(/^Fonte /);
  });

  it('falls back to generic cards for unknown ids', () => {
    const cards = buildStripCards({
      generated_at: 'x',
      items: [item('a', 1, 'count'), item('b', 12.5, 'percent'), item('c', 3, 'pp')],
      why_minas: [],
    });
    expect(cards.map((c) => c.value)).toEqual(['1', '12,5%', '+3,0 p.p.']);
    expect(formatHighlightValue(item('x_rank', 2, 'count'))).toBe('2º');
    expect(compareLine(item('y', 1, 'votes', 52.99, '% dos 853 municípios'))).toBe(
      '53,0% dos 853 municípios',
    );
  });
});

describe('overlay switches and legend footer', () => {
  it('activities switch is on by default, terminals off; both are real switches', async () => {
    const onA = vi.fn();
    const onP = vi.fn();
    renderWithApp(
      <MapLayerSelector
        layer="president_comparison"
        onLayerChange={() => {}}
        yearRound="2026-1"
        yearRoundOptions={[]}
        onYearRoundChange={() => {}}
        candidateId="lula"
        candidateOptions={[
          { value: 'lula', label: 'Lula' },
          { value: 'bolsonaro', label: 'Bolsonaro' },
        ]}
        onCandidateChange={() => {}}
        overlays={{ activities: true, onActivitiesChange: onA, pois: false, onPoisChange: onP }}
      />,
    );
    const act1 = screen.getByRole('switch', { name: /Atividades/ });
    const term = screen.getByRole('switch', { name: /Terminais/ });
    expect(act1).toHaveAttribute('aria-checked', 'true');
    expect(term).toHaveAttribute('aria-checked', 'false');
    await userEvent.setup().click(term);
    expect(onP).toHaveBeenCalledWith(true);
    // Lula/Bolsonaro sub-selection and no tracked-candidate "2022 × 2026" layer.
    expect(screen.getByRole('radio', { name: 'Lula' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bolsonaro' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '2022 × 2026' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Atividades' })).not.toBeInTheDocument();
  });

  it('explains the sun marker over a statistical layer, offers "Propor atividade" when empty and credits OSM', () => {
    renderWithApp(
      <MapLegend
        layer="abstention"
        values={null}
        status="validated"
        releaseId="rel"
        year={2026}
        round={1}
        activityCount={0}
        showPois
        poiCount={380}
      />,
    );
    const act1 = screen.getByTestId('legend-activities');
    expect(within(act1).getByText(/Atividade da campanha/)).toBeInTheDocument();
    expect(within(act1).getByRole('link', { name: 'Propor atividade' })).toHaveAttribute(
      'href',
      '/criar-atividade',
    );
    const pois = screen.getByTestId('legend-pois');
    expect(within(pois).getByText(/380 locais/)).toBeInTheDocument();
    expect(within(pois).getByText('© OpenStreetMap contributors (ODbL)')).toBeInTheDocument();
  });
});

describe('points of interest', () => {
  const file: PoiFile = {
    generated_at: 'x',
    source: 'OSM',
    license: 'ODbL 1.0',
    attribution: '© OpenStreetMap contributors',
    items: [
      {
        id: 'b',
        name: 'Terminal B',
        category: 'bus_station',
        coordinates: [-43.9, -19.9],
        municipality_id: 'mg-3106200',
        osm_url: 'https://www.openstreetmap.org/way/1',
      },
      {
        id: 'a',
        name: 'Estação A',
        category: 'metro_station',
        coordinates: [-44, -19.9],
        municipality_id: 'mg-3106200',
        osm_url: 'https://www.openstreetmap.org/node/2',
      },
      {
        id: 'c',
        name: 'Outro',
        category: 'bus_terminal',
        coordinates: [-43.3, -21.7],
        municipality_id: 'mg-3136702',
        osm_url: 'https://www.openstreetmap.org/node/3',
      },
    ],
  };
  it('loads the OSM file even in demo mode and filters by municipality', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/pois/terminais-mg.json')
        ? jsonResponse(file)
        : new Response('x', { status: 404 }),
    );
    const snap = await loadSnapshot({ fetchImpl, base: '/data' });
    expect(snap.mode).toBe('demo');
    const pois = await snap.getPois();
    expect(pois?.items).toHaveLength(3);
    expect(poisOfMunicipality(pois?.items, 'mg-3106200').map((p) => p.name)).toEqual([
      'Estação A',
      'Terminal B',
    ]);
  });
  it('returns null (honest empty state) when the file is not published', async () => {
    const snap = await loadSnapshot({
      fetchImpl: async () => new Response('x', { status: 404 }),
      base: '/data',
    });
    expect(await snap.getPois()).toBeNull();
  });
});

describe('ActivityPopover', () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  const activity: PublicActivity = {
    id: ID,
    title: '[EXEMPLO] Panfletagem na Rodoviária',
    type: 'panfletagem',
    description_sanitized: 'x',
    starts_at: '2030-10-15T12:00:00.000Z',
    ends_at: null,
    timezone: 'America/Sao_Paulo',
    location_public: 'Rodoviária de Belo Horizonte',
    coordinates: [-43.94, -19.91],
    territory_id: 'mg-3106200',
    status: 'published',
    rsvp_count_approx: 0,
    contact_public: null,
    updated_at: '2026-10-09T00:00:00Z',
  };

  it('shows title, date/time (Brasília), place and "Eu vou" that confirms with the server', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: { activity_id: ID, going: true, rsvp_count_approx: 1 },
        meta: { request_id: 'r' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    renderWithApp(<ActivityPopover activity={activity} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: activity.title });
    expect(
      within(dialog).getByText(/15 de outubro de 2030, 09:00 \(horário de Brasília\)/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Rodoviária de Belo Horizonte')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: 'Eu vou' }));
    expect(await within(dialog).findByText(/Você marcou/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/activities/${ID}/rsvp`,
      expect.objectContaining({ method: 'POST' }),
    );
    dialog.focus();
    await act(async () => {
      await user.keyboard('{Escape}');
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('disables "Eu vou" for demo activities', () => {
    renderWithApp(<ActivityPopover activity={activity} demo onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Eu vou' })).toBeDisabled();
    expect(screen.getByText(/atividade demonstrativa/)).toBeInTheDocument();
  });
});

describe('StoryIntro (D25)', () => {
  const geo: MunicipalCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { codarea: '3106200' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-44, -20],
              [-43.9, -20],
              [-43.9, -19.8],
              [-44, -19.8],
              [-44, -20],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { codarea: '3136702' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-43.5, -21.8],
              [-43.2, -21.8],
              [-43.2, -21.6],
              [-43.5, -21.6],
              [-43.5, -21.8],
            ],
          ],
        },
      },
    ],
  };
  it('projects the IBGE mesh into simple SVG paths keyed by territory id', () => {
    const map = projectMunicipalities(geo, 200);
    expect(map.width).toBe(200);
    expect(map.height).toBeGreaterThan(0);
    expect(map.paths.map((p) => p.id)).toEqual(['mg-3106200', 'mg-3136702']);
    expect(map.paths[0]!.d).toMatch(/^M[\d.]+ [\d.]+L.*Z$/);
  });

  it('renders the five steps, numbers from the file and maps described in text', () => {
    const margin = (year: number, round: number): MapLayerValues => ({
      layer: 'president_margin',
      year,
      round,
      unit: 'pp',
      candidate_id: null,
      values: { 'mg-3106200': 20, 'mg-3136702': -30 },
      domain: [-60, 60],
    });
    renderWithApp(
      <StoryIntroView
        highlights={HIGHLIGHTS}
        margin2026={margin(2026, 1)}
        margin2022r2={margin(2022, 2)}
        map={projectMunicipalities(geo, 200)}
        releaseId="rel-1"
        demo={false}
      />,
    );
    const steps = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(steps).toEqual([
      'O mapa do primeiro turno assusta',
      'Mas ele não é exatamente assim',
      'E tem gente que não veio com a gente, mas também não foi para lá',
      '2022 foi decidido aqui',
      'A gente não pode se sentir sozinho, independente do resultado',
    ]);
    expect(screen.getByText(/parede impenetrável, o que não é verdade/)).toBeInTheDocument();
    expect(screen.getByText('48,2%')).toBeInTheDocument();
    expect(screen.getByText('452 municípios')).toBeInTheDocument();
    expect(screen.getByText('49.650 votos')).toBeInTheDocument();
    expect(screen.getByText('3.735.098')).toBeInTheDocument();
    expect(screen.getByText(/não indicam preferência/)).toBeInTheDocument();
    const maps = screen.getAllByTestId('story-map');
    expect(maps).toHaveLength(3);
    for (const m of maps) {
      const desc = document.getElementById(m.getAttribute('aria-describedby')!);
      expect(desc?.textContent).toMatch(/Fonte: TSE/);
    }
    // Step 2 colours municipalities by margin (Lula red / Bolsonaro blue tokens).
    const paths = maps[1]!.querySelectorAll('path');
    expect(paths[0]!.getAttribute('style')).toContain('--map-lula');
    expect(paths[1]!.getAttribute('style')).toContain('--map-bolsonaro');
    expect(screen.getByRole('link', { name: 'Quero participar' })).toHaveAttribute(
      'href',
      '/participar',
    );
  });

  it('keeps an honest state without data (skeleton maps, no invented numbers)', () => {
    renderWithApp(
      <StoryIntroView
        highlights={null}
        margin2026={null}
        margin2022r2={null}
        map={null}
        releaseId={null}
        demo
      />,
    );
    expect(screen.queryAllByTestId('story-map')).toHaveLength(0);
    expect(screen.getAllByRole('status', { name: 'Carregando mapa' })).toHaveLength(3);
    expect(screen.getByText('DADOS DEMONSTRATIVOS')).toBeInTheDocument();
    expect(screen.queryByText(/municípios$/)).not.toBeInTheDocument();
  });
});
