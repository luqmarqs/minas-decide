import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp, stubFetch } from '@/tests/utils';
import { MapShell } from './MapShell';
import { MAP_DEFAULTS, type MapUrlState } from './useMapUrlState';

vi.mock('@/lib/webgl', () => ({ hasWebGL: () => false }));
// If the WebGL map were ever imported in this test, fail loudly.
vi.mock('./MapCanvas', () => {
  throw new Error('MapCanvas must not load without WebGL');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const state: MapUrlState = { ...MAP_DEFAULTS, territoryId: null };

describe('MapShell without WebGL (T20)', () => {
  it('renders the textual list alternative with territories and values', async () => {
    stubFetch();
    const onStateChange = vi.fn();
    renderWithApp(<MapShell state={state} onStateChange={onStateChange} />);

    const list = await screen.findByTestId('territory-list-fallback', {}, { timeout: 5000 });
    expect(within(list).getByText(/não oferece WebGL/)).toBeInTheDocument();
    const row = await within(list).findByRole('button', { name: /Vale Demo/ }, { timeout: 5000 });
    expect(row).toHaveTextContent('%');

    await userEvent.setup().click(row);
    expect(onStateChange).toHaveBeenCalledWith({ territoryId: 'mg-3100104' }, { push: true });
  });

  it('keeps the attribution visible even in list mode', async () => {
    stubFetch();
    renderWithApp(<MapShell state={state} onStateChange={() => {}} />);
    await screen.findByTestId('territory-list-fallback');
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
    expect(screen.getByText(/Malha municipal: IBGE/)).toBeInTheDocument();
  });

  it('shows neighborhoods of the selected municipality in the list', async () => {
    stubFetch();
    renderWithApp(
      <MapShell state={{ ...state, territoryId: 'mg-3100104' }} onStateChange={() => {}} />,
    );
    expect(await screen.findByText(/Bairros de Vale Demo/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Jardim Exemplo/ })).toBeInTheDocument();
  });
});
