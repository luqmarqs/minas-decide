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

describe('infographic as an editorial spread (redesign A, D4/D5)', () => {
  it('seven figures in one asymmetric grid, no carousel, accessible visuals, short sources', () => {
    render(<WhyMinasInfographic data={buildInfographic(HIGHLIGHTS)!} />);
    const list = screen.getByRole('list', { name: 'Números de Minas Gerais' });
    // D5: never a carousel for the main infographic (no snap scroller, no dots).
    expect(list.className).toContain('ed-grid-12');
    expect(list.className).not.toMatch(/snap-x|overflow-x/);
    expect(screen.queryByRole('button', { name: /Ir para o número/ })).not.toBeInTheDocument();
    const figs = within(list).getAllByRole('listitem');
    expect(figs).toHaveLength(7);
    // Hierarchy by scale: the anchor is the only XL figure; multiples use LG.
    const anchor = screen.getByTestId('fig-nacional');
    expect(within(anchor).getByText('10,3%').className).toContain('ed-figure-xl');
    expect(list.querySelectorAll('.ed-figure-xl')).toHaveLength(1);
    expect(screen.getByTestId('fig-duelo').querySelector('.ed-figure')?.className).toContain(
      'ed-figure-lg',
    );
    expect(screen.getByTestId('fig-duelo').className).toContain('lg:self-start');
    expect(anchor).toHaveTextContent('2º maior');
    expect(anchor).toHaveTextContent('16,4 mi pessoas aptas a votar');
    expect(within(anchor).getByRole('img')).toHaveAttribute(
      'aria-label',
      'Minas tem 10,3% do eleitorado do Brasil',
    );
    // Asymmetric layout: anchor 4 + comparison 8; four multiples 3/3/3/3 on desktop.
    expect(anchor.className).toContain('lg:col-span-4');
    expect(screen.getByTestId('fig-duelo').className).toContain('lg:col-span-8');
    expect(screen.getByTestId('fig-duelo').className).toContain('lg:row-span-2');
    expect(screen.getByTestId('fig-margem-2022').className).toContain('lg:col-start-1');
    for (const id of ['fig-municipios', 'fig-comparecimento', 'fig-nenhum', 'fig-brancos-nulos'])
      expect(screen.getByTestId(id).className).toContain('lg:col-span-3');
    // Blank and null votes (owner: "falta falar de brancos e nulos"): count, share of turnout,
    // 2022 × 2026 bars, framed as votes that can be won.
    const bn = screen.getByTestId('fig-brancos-nulos');
    expect(bn).toHaveTextContent('661.039');
    expect(bn).toHaveTextContent('5,2% do comparecimento');
    expect(bn).toHaveTextContent('votos que podem ser conquistados');
    expect(within(bn).getByRole('img').getAttribute('aria-label')).toMatch(
      /^Brancos e nulos para Presidente — 2022 · 2º turno: 4,2% do comparecimento \(534\.014 votos\); 2026 · 1º turno: 5,2% do comparecimento \(661\.039 votos\)$/,
    );
    expect(screen.getByTestId('fig-margem-2022')).toHaveTextContent('+49.650');
    expect(screen.getByTestId('fig-margem-2022')).toHaveTextContent('+0,4 p.p.');
    expect(screen.getByTestId('fig-nenhum')).toHaveTextContent('5,4 mi');
    expect(screen.getByTestId('fig-nenhum')).toHaveTextContent('33,0% do eleitorado apto');
    expect(screen.getByTestId('fig-comparecimento')).toHaveTextContent('77,2%');
    expect(screen.getByTestId('fig-municipios')).toHaveTextContent('853');
    // Each block opens with a short question (h3), in reading order.
    expect(
      within(list)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Peso no país',
      'O que mudou de 2022 para 2026?',
      'Quão apertado foi 2022?',
      'Quem liderou nos municípios?',
      'Quantos foram votar?',
      'Quantos ficaram fora do duelo?',
      'Quantos votaram branco ou nulo?',
    ]);
    const imgs = within(list).getAllByRole('img');
    expect(imgs).toHaveLength(7);
    const duel = within(screen.getByTestId('fig-duelo')).getByRole('img');
    expect(duel.getAttribute('aria-label')).toContain(
      '2026 · 1º turno: Lula 43,3%, Flávio Bolsonaro 48,2%',
    );
    // The published margins (p.p.) annotate each round; nothing recomputed.
    expect(duel.getAttribute('aria-label')).toContain('Flávio Bolsonaro à frente por 4,9 p.p.');
    expect(duel.getAttribute('aria-label')).toContain(
      '2022 · 2º turno: Lula 50,2%, Jair Bolsonaro 49,8% (Lula à frente por 0,4 p.p.)',
    );
    // Values annotated at the bar tips and a textual legend (not colour only).
    expect(duel).toHaveTextContent('Lula 48,3%');
    expect(duel).toHaveTextContent('Jair 43,6%');
    expect(duel).toHaveTextContent('Flávio 48,2%');
    expect(screen.getByTestId('fig-duelo')).toHaveTextContent(
      'Bolsonaro (Jair em 2022, Flávio em 2026)',
    );
    expect(screen.getByTestId('fig-duelo')).not.toHaveTextContent('barra de');
    expect(
      within(screen.getByTestId('fig-municipios')).getByRole('img').getAttribute('aria-label'),
    ).toBe('Em 2026, Lula liderou em 452 municípios e Flávio Bolsonaro em 401');
    expect(screen.getByTestId('fig-municipios')).toHaveTextContent('Lula 452');
    expect(screen.getByTestId('fig-municipios')).toHaveTextContent('Flávio Bolsonaro 401');
    expect(
      within(screen.getByTestId('fig-margem-2022')).getByRole('img').getAttribute('aria-label'),
    ).toBe(
      'Margem de Lula em Minas no 2º turno de 2022: +0,40 p.p., 49.650 votos, numa escala de −2 a +2 pontos percentuais',
    );
    // Hover detail on bars (SVG <title>) includes votes.
    expect(screen.getByTestId('fig-duelo').querySelector('title')?.textContent).toBe(
      'Lula, 2022 · 1º turno: 48,3% (5.802.571 votos)',
    );
    // Turnout legend in text, with percentages over the eligible electorate.
    const turnout = screen.getByTestId('fig-comparecimento');
    expect(turnout).toHaveTextContent('votos válidos 73,1%');
    expect(turnout).toHaveTextContent('brancos e nulos 4,0%');
    expect(turnout).toHaveTextContent('abstenção 22,8%');
    // Party colours only on the Lula × Bolsonaro marks.
    for (const id of ['fig-nacional', 'fig-comparecimento', 'fig-nenhum'])
      for (const el of screen.getByTestId(id).querySelectorAll('[style]'))
        expect(el.getAttribute('style')).not.toMatch(/map-lula|map-bolsonaro/);
    // No boxes: no rounded/bordered card chrome, no shadows.
    for (const f of figs) expect(f.className).not.toMatch(/rounded|shadow|bg-surface-raised/);
    // D10: short sources; the comparison and the 2022 margin share one line → 5 source lines.
    expect(screen.getAllByText(/^Fonte: /)).toHaveLength(6);
    expect(screen.getByTestId('fig-margem-2022')).not.toHaveTextContent('Fonte:');
    expect(screen.getByTestId('fig-duelo')).toHaveTextContent(
      /Fonte: TSE · 2022 e 2026 \(inclui a margem de 2022\)$/,
    );
    for (const id of ['fig-nacional', 'fig-municipios', 'fig-comparecimento', 'fig-nenhum'])
      expect(screen.getByTestId(id)).toHaveTextContent(/Fonte: (TSE|TSE · IBGE)$/);
    expect(screen.queryByText(/Um texto longo/)).not.toBeInTheDocument();
  });
});
