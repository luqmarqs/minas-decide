import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp, stubFetch } from '@/tests/utils';
import { TerritoryDetails } from './TerritoryDetails';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDetails(territoryId: string) {
  return renderWithApp(
    <TerritoryDetails
      territoryId={territoryId}
      year={2026}
      round={1}
      onYearRoundChange={() => {}}
      onSelectTerritory={() => {}}
    />,
  );
}

describe('TerritoryDetails', () => {
  it('T02: municipality without neighborhoods keeps the municipal flow and invents no neighborhood data', async () => {
    stubFetch();
    renderDetails('mg-3112901'); // "Ribeirão Fictício" (demo, no bairros)

    expect(
      await screen.findByText(/Sem dados confiáveis por bairro neste município/),
    ).toBeInTheDocument();
    expect(screen.getByText(/nenhum dado de bairro é estimado ou inventado/)).toBeInTheDocument();
    // Municipal indicators are still shown.
    expect(await screen.findByText('Eleitorado apto')).toBeInTheDocument();
    // No neighborhood entries are offered.
    expect(screen.queryByRole('button', { name: /^Centro$/ })).not.toBeInTheDocument();
  });

  it('lists approximated neighborhoods when the municipality has them', async () => {
    stubFetch();
    renderDetails('mg-3100104'); // "Vale Demo"
    expect(await screen.findByRole('button', { name: 'Centro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jardim Exemplo' })).toBeInTheDocument();
  });

  it('labels demo data and shows the comparison caveat', async () => {
    stubFetch();
    renderDetails('mg-3100104');
    expect((await screen.findAllByText('DADOS DEMONSTRATIVOS')).length).toBeGreaterThan(0);
    expect(await screen.findByText(/não implica transferência de votos/)).toBeInTheDocument();
  });

  it('marks neighborhoods as approximations', async () => {
    stubFetch();
    renderDetails('mg-3100104-centro');
    expect(await screen.findByText(/aproximação/)).toBeInTheDocument();
    expect(screen.getByText(/Bairro de Vale Demo\/MG/)).toBeInTheDocument();
  });

  it('shows honest unavailable states when the API is down (groups and agenda)', async () => {
    stubFetch(); // API throws network error; snapshot falls back to demo
    renderDetails('mg-3106655');
    expect(await screen.findByText(/Grupos: não foi possível verificar agora/)).toBeInTheDocument();
  });

  it('reports unknown territories instead of inventing one', async () => {
    stubFetch();
    renderDetails('mg-3199999');
    expect(await screen.findByText('Território não encontrado')).toBeInTheDocument();
  });
});
