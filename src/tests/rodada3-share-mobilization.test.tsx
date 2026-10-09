/** D26 (WhatsApp sharing) and D27 (mobilization layer + ranking). */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MapLayerValues, TerritoryMetrics } from '@shared/contracts/metrics.ts';
import { WhatsAppShare } from '@/components/ui/WhatsAppShare';
import { MapLegend } from '@/features/electoral-map/MapLegend';
import { valueForLayer } from '@/features/electoral-map/layers';
import {
  deriveMobilizationLayer,
  rankMobilization,
  rowFromMetrics,
  rowsFromLayers,
} from '@/features/electoral-map/mobilization';
import { MobilizationList } from '@/features/territory/MobilizationBlock';
import {
  activityShareText,
  homeShareText,
  shareWhen,
  territoryShareText,
  whatsAppHref,
} from '@/lib/share';
import { renderWithApp } from './utils';

describe('WhatsApp share (D26)', () => {
  it('builds the activity message in São Paulo time with place, short description and link', () => {
    const text = activityShareText({
      id: 'abc',
      title: '[EXEMPLO] Panfletagem na Rodoviária de Belo Horizonte',
      // 12:00 UTC = 09:00 in São Paulo; a UTC-midnight edge would change the day elsewhere.
      starts_at: '2026-10-16T12:00:00.000Z',
      location_public: 'Rodoviária de BH',
      placeLabel: 'Centro — Belo Horizonte/MG',
      description_sanitized: 'x'.repeat(200),
      origin: 'https://exemplo.test',
    });
    const lines = text.split('\n');
    expect(lines[0]).toBe('[EXEMPLO] Panfletagem na Rodoviária de Belo Horizonte');
    expect(lines[1]).toBe('📅 sexta-feira, 16/10 às 09:00 (horário de Brasília)');
    expect(lines[2]).toBe('📍 Rodoviária de BH — Centro — Belo Horizonte/MG');
    expect(lines[3]).toHaveLength(140);
    expect(lines[3]!.endsWith('…')).toBe(true);
    expect(lines[4]).toBe('Confirme que vai e veja no mapa: https://exemplo.test/atividade/abc');
    expect(lines[5]).toBe('Minas Decide Lula');
  });

  it('uses Brasília for late-evening events (UTC is already the next day)', () => {
    expect(shareWhen('2026-10-17T01:30:00.000Z')).toBe(
      'sexta-feira, 16/10 às 22:30 (horário de Brasília)',
    );
  });

  it('omits missing parts of the territory sentence', () => {
    expect(
      territoryShareText({
        name: 'Juiz de Fora/MG',
        url: 'https://x.test/?t=mg-3136702',
        abstentionRate: 0.2281,
        lulaShare: 0.4333,
        bolsonaroShare: 0.4824,
      }),
    ).toBe(
      'Juiz de Fora/MG: abstenção 22,8 %, Lula 43,3 % × Bolsonaro 48,2 % no 1º turno de 2026 — veja no mapa: https://x.test/?t=mg-3136702',
    );
    expect(territoryShareText({ name: 'Bairro X', url: 'u' })).toBe('Bairro X — veja no mapa: u');
    expect(homeShareText('https://x.test')).toContain('https://x.test/');
  });

  it('renders a real wa.me link in a new tab, with copy as a discreet secondary action', async () => {
    const text = 'Olá & até já\nhttps://x.test/atividade/1';
    expect(whatsAppHref(text)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithApp(<WhatsAppShare text={text} copyUrl="https://x.test/atividade/1" />);
    const link = screen.getByRole('link', { name: /Compartilhar no WhatsApp/ });
    expect(link).toHaveAttribute('href', whatsAppHref(text));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'copiar link' }));
    expect(writeText).toHaveBeenCalledWith('https://x.test/atividade/1');
    expect(await screen.findByText(/Link copiado/)).toBeInTheDocument();
  });
});

const layer = (
  l: MapLayerValues['layer'],
  values: Record<string, number>,
  unit: MapLayerValues['unit'],
): MapLayerValues => ({
  layer: l,
  year: 2026,
  round: 1,
  unit,
  candidate_id: null,
  values,
  domain: [0, 1],
});

describe('mobilization (D27)', () => {
  const abst = layer('abstention', { a: 0.3, b: 0.25, c: 0.4, d: 0.2 }, 'rate');
  const margin = layer('president_margin', { a: 5, b: 12, c: -3, d: 0 }, 'pp');

  it('keeps the abstention rate only where Lula led; domain = min/max inside the cut', () => {
    const out = deriveMobilizationLayer(abst, margin, 'lula')!;
    expect(out.layer).toBe('mobilization');
    expect(out.values).toEqual({ a: 0.3, b: 0.25 });
    expect(out.domain).toEqual([0.25, 0.3]);
    const bolso = deriveMobilizationLayer(abst, margin, 'bolsonaro')!;
    expect(bolso.values).toEqual({ c: 0.4 });
    expect(deriveMobilizationLayer(abst, null, 'lula')).toBeNull();
  });

  const row = (abstRate: number, abs: number, lula: number, bolso: number) =>
    [
      {
        territory_id: 'x',
        year: 2026,
        round: 1,
        status: 'validated',
        release_id: 'r',
        data_quality: 'approximate',
        turnout: {
          eligible: 1000,
          turnout: 1000 - abs,
          abstention: abs,
          abstention_rate: abstRate,
          turnout_rate: 1 - abstRate,
          valid: 800,
          blank: 10,
          null_votes: 10,
          basis_office: 'president',
        },
        results: {},
        valid_by_office: {},
        comparison_2022: [],
        president_comparison: {
          precision: 'approximate',
          note: null,
          entries: (['lula', 'bolsonaro'] as const).map((key) => ({
            key,
            ballot_name_2022: key,
            ballot_name_2026: key,
            number_2022: 1,
            number_2026: 1,
            votes_2022_r1: null,
            valid_2022_r1: null,
            share_2022_r1: null,
            votes_2022_r2: null,
            valid_2022_r2: null,
            share_2022_r2: null,
            votes_2026_r1: null,
            valid_2026_r1: null,
            share_2026_r1: key === 'lula' ? lula : bolso,
            delta_pp_r1: null,
            delta_votes_r1: null,
          })),
        },
        warnings: [],
      },
    ] as TerritoryMetrics[];

  it('neighborhoods use turnout + presidential comparison (unavailable precision is out)', () => {
    expect(rowFromMetrics('n1', 'N1', row(0.3, 300, 0.55, 0.4), 'lula')).toEqual({
      id: 'n1',
      name: 'N1',
      rate: 0.3,
      abstention: 300,
      margin: 15,
    });
    expect(rowFromMetrics('n2', 'N2', row(0.3, 300, 0.4, 0.55), 'lula')).toBeNull();
    const unavailable = row(0.3, 300, 0.55, 0.4);
    unavailable[0]!.president_comparison!.precision = 'unavailable';
    expect(rowFromMetrics('n3', 'N3', unavailable, 'lula')).toBeNull();
    expect(valueForLayer(row(0.3, 300, 0.55, 0.4)[0], 'mobilization', null)).toBe(0.3);
    expect(valueForLayer(row(0.3, 300, 0.4, 0.55)[0], 'mobilization', 'bolsonaro')).toBe(0.3);
  });

  it('ranks the top 10 by rate and sums abstentions', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      name: `M${i}`,
      rate: 0.1 + i / 100,
      abstention: 100 + i,
      margin: 1,
    }));
    const r = rankMobilization(rows, 10);
    expect(r.top.map((x) => x.id)).toEqual([
      'm11',
      'm10',
      'm9',
      'm8',
      'm7',
      'm6',
      'm5',
      'm4',
      'm3',
      'm2',
    ]);
    expect(r.count).toBe(12);
    expect(r.totalTop).toBe(
      [111, 110, 109, 108, 107, 106, 105, 104, 103, 102].reduce((a, b) => a + b),
    );
    expect(r.totalAll).toBe(rows.reduce((a, x) => a + x.abstention, 0));
    const fromLayers = rowsFromLayers(abst, margin, new Map([['a', 'A']]), 'lula');
    expect(fromLayers.map((x) => [x.name, x.abstention])).toEqual([
      ['A', null],
      ['b', null],
    ]);
    expect(rankMobilization(fromLayers).totalTop).toBeNull();
  });

  it('renders the ranking with links and totals', async () => {
    const onSelect = vi.fn();
    renderWithApp(
      <MobilizationList
        ranking={rankMobilization([
          { id: 'm1', name: 'Cidade A', rate: 0.31, abstention: 3100, margin: 8.2 },
          { id: 'm2', name: 'Cidade B', rate: 0.29, abstention: 900, margin: 1 },
        ])}
        childLabel={{ one: 'município', many: 'municípios' }}
        onSelectTerritory={onSelect}
        releaseId="rel"
      />,
    );
    const first = screen.getByRole('button', { name: /Cidade A/ });
    expect(first).toHaveTextContent('31,0%');
    expect(first).toHaveTextContent('3.100 abstenções');
    expect(first).toHaveTextContent('+8,2 p.p.');
    expect(screen.getByTestId('mobilization-total')).toHaveTextContent('4.000');
    expect(screen.getByText(/não inferência sobre pessoas/)).toBeInTheDocument();
    await userEvent.setup().click(first);
    expect(onSelect).toHaveBeenCalledWith('m1');
  });

  it('legend explains the cut, the grey "out of the cut" and the caveat', () => {
    renderWithApp(
      <MapLegend
        layer="mobilization"
        values={{ ...deriveMobilizationLayer(abst, margin, 'lula')!, candidate_id: 'lula' }}
        status="validated"
        releaseId="rel"
        year={2026}
        round={1}
        defaultCollapsed={false}
      />,
    );
    const legend = screen.getByRole('region', { name: 'Legenda do mapa' });
    expect(within(legend).getByText(/Bolsonaro liderou — fora do recorte/)).toBeInTheDocument();
    expect(within(legend).getByTestId('legend-mobilization-note')).toHaveTextContent(
      'apenas em territórios onde Lula liderou no 1º turno de 2026',
    );
    expect(within(legend).getByText(/TSE/)).toBeInTheDocument();
  });
});
