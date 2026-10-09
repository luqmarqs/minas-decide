/** FE-9 (D30): blank/null layer and card, mobilization totals, no consistency warnings in the UI. */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TerritoryMetrics } from '@shared/contracts/metrics.ts';
import {
  blankNullRate,
  formatLayerValue,
  LAYER_ORDER,
  LAYERS,
  layerFromSlug,
  valueForLayer,
} from '@/features/electoral-map/layers';
import { MapLegend } from '@/features/electoral-map/MapLegend';
import { combinedTotal, rankMobilization } from '@/features/electoral-map/mobilization';
import { MobilizationList } from '@/features/territory/MobilizationBlock';
import { TurnoutCards } from '@/features/territory/MetricBlocks';
import { TerritoryDetails } from '@/features/territory/TerritoryDetails';
import { renderWithApp, stubFetch } from './utils';

afterEach(() => vi.unstubAllGlobals());

const m = {
  territory_id: 'mg-1',
  year: 2026,
  round: 1,
  status: 'validated',
  release_id: 'r',
  data_quality: 'complete',
  turnout: {
    eligible: 1000,
    turnout: 800,
    abstention: 200,
    abstention_rate: 0.2,
    turnout_rate: 0.8,
    valid: 740,
    blank: 20,
    null_votes: 40,
    basis_office: 'president',
  },
  results: {},
  valid_by_office: {},
  comparison_2022: [],
  warnings: ['Divergência registrada no arquivo'],
} as TerritoryMetrics;

describe('blank_null layer', () => {
  it('is a neutral sequential layer of the 2026 1st round, as a share of turnout', () => {
    expect(LAYER_ORDER).toContain('blank_null');
    expect(LAYERS.blank_null.scale).toBe('sequential');
    expect(LAYERS.blank_null.palette).toBeUndefined();
    expect(LAYERS.blank_null.unit).toBe('% do comparecimento');
    expect(layerFromSlug('brancos-nulos')).toBe('blank_null');
    expect(blankNullRate(m)).toBeCloseTo(0.075);
    expect(valueForLayer(m, 'blank_null', null)).toBeCloseTo(0.075);
    expect(blankNullRate({ ...m, turnout: null })).toBeNull();
    expect(formatLayerValue('blank_null', 0.075)).toBe('7,5%');
  });

  it('legend shows the denominator and the source', () => {
    renderWithApp(
      <MapLegend
        layer="blank_null"
        values={{
          layer: 'blank_null',
          year: 2026,
          round: 1,
          unit: 'rate',
          candidate_id: null,
          values: { a: 0.05 },
          domain: [0.03, 0.12],
        }}
        status="validated"
        releaseId="rel"
        year={2026}
        round={1}
      />,
    );
    expect(screen.getByText('% do comparecimento')).toBeInTheDocument();
    expect(
      screen.getByText(/brancos \+ nulos para Presidente\) ÷ comparecimento/),
    ).toBeInTheDocument();
    expect(screen.getByText(/TSE · IBGE/)).toBeInTheDocument();
  });
});

describe('panel card', () => {
  it('"Brancos e nulos" next to abstention with absolute, % of turnout and the campaign line', () => {
    render(<TurnoutCards m={m} />);
    const label = screen.getByText('Brancos e nulos');
    const card = label.parentElement!;
    expect(card).toHaveTextContent('7,5%');
    expect(card).toHaveTextContent('60 de 800 comparecimentos');
    expect(card).toHaveTextContent('votos que podem ser conquistados');
  });
});

describe('mobilization totals with blank and null votes', () => {
  it('sums the two distinct groups and labels them as such', () => {
    const ranking = rankMobilization([
      {
        id: 'a',
        name: 'A',
        rate: 0.3,
        abstention: 300,
        margin: 4,
        blankNull: 50,
        blankNullRate: 0.07,
      },
      {
        id: 'b',
        name: 'B',
        rate: 0.2,
        abstention: 100,
        margin: 2,
        blankNull: 25,
        blankNullRate: 0.03,
      },
    ]);
    expect(ranking.blankNullTop).toBe(75);
    expect(combinedTotal(ranking.totalTop, ranking.blankNullTop)).toBe(475);
    expect(combinedTotal(null, 3)).toBeNull();
    renderWithApp(
      <MobilizationList
        ranking={ranking}
        childLabel={{ one: 'bairro', many: 'bairros' }}
        onSelectTerritory={() => {}}
        releaseId="rel"
      />,
    );
    expect(screen.getByRole('button', { name: /A/ })).toHaveTextContent(
      'brancos e nulos: 50 (7,0% do comparecimento)',
    );
    const combined = screen.getByTestId('mobilization-combined');
    expect(combined).toHaveTextContent('475');
    expect(combined).toHaveTextContent('soma de dois grupos distintos');
  });
});

describe('consistency warnings are no longer shown (D30)', () => {
  it('territory panel keeps the method note but not the warnings', async () => {
    stubFetch();
    // Demo municipality "Lagoa Teste" carries a warning in its metrics file.
    renderWithApp(
      <TerritoryDetails
        territoryId="mg-3125200"
        year={2026}
        round={1}
        onYearRoundChange={() => {}}
        onSelectTerritory={() => {}}
      />,
    );
    expect(await screen.findByText('Eleitorado apto')).toBeInTheDocument();
    expect(screen.queryByText(/Alertas de consistência/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Exemplo de alerta/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Metodologia' })).toBeInTheDocument();
  });
});
