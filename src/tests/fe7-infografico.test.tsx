/** D34: "Por que Minas decide" as an infographic (numbers from highlights.json, 2026-10-09). */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Highlights } from '@shared/contracts/snapshot.ts';
import { buildInfographic, compactNumber } from '@/features/highlights/infographic';
import { WhyMinasInfographic } from '@/features/highlights/WhyMinasInfographic';

type Row = [string, number, Highlights['items'][number]['unit'], number | null, string | null];
const ROWS: Row[] = [
  [
    'mg_eligible_2026',
    16372372,
    'people',
    158745502,
    'eleitorado apto no Brasil, inclui exterior (2026)',
  ],
  ['mg_share_national_eligible_2026', 10.31, 'percent', 10.37, 'sem o eleitorado do exterior (%)'],
  ['mg_rank_eligible_2026', 2, 'count', 27, 'unidades da federação'],
  ['mg_municipalities', 853, 'count', null, null],
  ['mg_turnout_2026_r1', 12637274, 'people', 77.19, '% do eleitorado apto'],
  ['mg_abstention_2026_r1', 3735098, 'people', 22.81, '% do eleitorado apto'],
  ['mg_2026_r1_lula_votes', 5188936, 'votes', 43.33, '% dos votos válidos'],
  ['mg_2026_r1_flavio_votes', 5777548, 'votes', 48.24, '% dos votos válidos'],
  ['mg_2026_r1_lula_share', 43.33, 'percent', null, null],
  ['mg_2026_r1_flavio_share', 48.24, 'percent', null, null],
  ['mg_2026_r1_margin_votes', -588612, 'votes', -4.91, 'p.p. dos válidos'],
  ['mg_2022_r1_lula_votes', 5802571, 'votes', 48.29, '% dos votos válidos'],
  ['mg_2022_r1_bolsonaro_votes', 5239264, 'votes', 43.6, '% dos votos válidos'],
  ['mg_2022_r1_margin_votes', 563307, 'votes', 4.69, 'p.p. dos válidos'],
  ['mg_2022_r2_lula_votes', 6190960, 'votes', 50.2, '% dos votos válidos'],
  ['mg_2022_r2_bolsonaro_votes', 6141310, 'votes', 49.8, '% dos votos válidos'],
  ['mg_2022_r2_margin_votes', 49650, 'votes', 0.4, 'p.p. dos válidos'],
  ['br_2022_r2_lula_share', 50.9, 'percent', 60345999, 'votos'],
  ['br_2022_r2_bolsonaro_share', 49.1, 'percent', 58206354, 'votos'],
  ['br_2022_r2_margin_votes', 2139645, 'votes', 1.8, 'p.p. dos válidos'],
  ['mg_2026_r1_municipalities_led_lula', 452, 'count', 52.99, '% dos 853 municípios'],
  ['mg_2026_r1_municipalities_led_bolsonaro', 401, 'count', 47.01, '% dos 853 municípios'],
  ['mg_2022_r2_municipalities_led_lula', 564, 'count', 66.12, '% dos 853 municípios'],
  ['mg_2022_r2_municipalities_led_bolsonaro', 289, 'count', 33.88, '% dos 853 municípios'],
  ['mg_2026_r1_other_candidates_votes', 1009751, 'votes', 8.43, '% dos votos válidos'],
  ['mg_2026_r1_blank_null_votes', 661039, 'votes', 5.23, '% do comparecimento'],
  ['mg_2026_r1_abstention_votes', 3735098, 'people', 22.81, '% do eleitorado apto'],
  ['mg_2026_r1_neither_of_two', 5405888, 'people', 33.02, '% do eleitorado apto'],
  ['mg_2022_r2_blank_null_votes', 534014, 'votes', 4.15, '% do comparecimento'],
  ['mg_2022_r2_abstention_votes', 3418331, 'people', 20.99, '% do eleitorado apto'],
];

const HIGHLIGHTS: Highlights = {
  generated_at: '2026-10-09T00:00:00Z',
  items: ROWS.map(([id, value, unit, compare_value, compare_label]) => ({
    id,
    label: id,
    value,
    unit,
    compare_value,
    compare_label,
    note: null,
    source: 'TSE, Dados Abertos — arquivo.zip (Last-Modified …)',
  })),
  why_minas: [
    {
      title: 'Parágrafo',
      text: 'Um texto longo que não deve aparecer na home.',
      value: null,
      unit: null,
      source: 'TSE',
    },
  ],
};

describe('infographic data', () => {
  it('picks the published numbers without computing new ones', () => {
    const d = buildInfographic(HIGHLIGHTS)!;
    expect(d.national).toMatchObject({ sharePct: 10.31, rank: 2, ufs: 27 });
    expect(d.duel.map((r) => r.label)).toEqual([
      '2022 · 1º turno',
      '2022 · 2º turno',
      '2026 · 1º turno',
    ]);
    expect(d.duel[2]).toMatchObject({
      lula: { share: 43.33, votes: 5188936 },
      bolsonaro: { share: 48.24, votes: 5777548, name: 'Flávio Bolsonaro' },
    });
    expect(d.margin2022).toEqual({ votes: 49650, pp: 0.4 });
    expect(d.municipalities).toEqual({ total: 853, lula: 452, bolsonaro: 401 });
    expect(d.neither).toEqual({ people: 5405888, pctEligible: 33.02 });
    expect(compactNumber(5405888)).toBe('5,4 mi');
    expect(buildInfographic({ ...HIGHLIGHTS, items: [] })).toBeNull();
  });
});

describe('infographic tiles', () => {
  it('big number + short label + accessible visual + short source, no paragraphs', () => {
    render(<WhyMinasInfographic data={buildInfographic(HIGHLIGHTS)!} />);
    const list = screen.getByRole('list', { name: 'Números de Minas Gerais' });
    const tiles = within(list).getAllByRole('listitem');
    expect(tiles).toHaveLength(6);
    expect(within(screen.getByTestId('tile-nacional')).getByText('10,3%')).toBeInTheDocument();
    expect(screen.getByTestId('tile-margem-2022')).toHaveTextContent('+49.650');
    expect(screen.getByTestId('tile-nenhum')).toHaveTextContent('5,4 mi');
    const imgs = within(list).getAllByRole('img');
    expect(imgs.length).toBeGreaterThanOrEqual(6);
    const duel = within(screen.getByTestId('tile-duelo')).getByRole('img');
    expect(duel.getAttribute('aria-label')).toContain(
      '2026 · 1º turno: Lula 43,3%, Flávio Bolsonaro 48,2%',
    );
    expect(
      within(screen.getByTestId('tile-municipios')).getByRole('img').getAttribute('aria-label'),
    ).toBe('Em 2026, Lula liderou em 452 municípios e Flávio Bolsonaro em 401');
    // Hover detail on bars (SVG <title>) includes votes.
    expect(screen.getByTestId('tile-duelo').querySelector('title')?.textContent).toBe(
      'Lula, 2022 · 1º turno: 48,3% (5.802.571 votos)',
    );
    // Party colours only on the Lula × Bolsonaro marks.
    const turnoutRects = screen.getByTestId('tile-comparecimento').querySelectorAll('rect');
    for (const r of turnoutRects)
      expect(r.getAttribute('style')).not.toMatch(/map-lula|map-bolsonaro/);
    // Short sources only.
    for (const t of tiles) expect(t).toHaveTextContent(/Fonte: (TSE|TSE 2022|TSE · IBGE)$/);
    expect(screen.queryByText(/Um texto longo/)).not.toBeInTheDocument();
  });
});
