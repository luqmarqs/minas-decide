import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from '@/pages/HomePage';
import { renderWithApp, stubFetch } from './utils';

vi.mock('@/lib/webgl', () => ({ hasWebGL: () => false }));

afterEach(() => vi.unstubAllGlobals());

const snapshotCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter(([u]) => String(u).includes('/data/'));

describe('home first paint (P-PERF-1)', () => {
  it('renders hero, search and a static map placeholder before any snapshot request', async () => {
    const fetchMock = stubFetch();
    renderWithApp(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Minas Gerais, território por território',
    );
    expect(screen.getByRole('combobox', { name: /Cidade ou bairro/ })).toBeInTheDocument();
    expect(screen.getByTestId('map-placeholder')).toBeInTheDocument();
    // Placeholder keeps the legend label and the mandatory attribution.
    expect(screen.getByText('Abstenção')).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
    expect(snapshotCalls(fetchMock)).toHaveLength(0);

    // After load + idle the map shell takes over (list fallback here: no WebGL in jsdom).
    expect(
      await screen.findByTestId('territory-list-fallback', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(snapshotCalls(fetchMock).length).toBeGreaterThan(0);
  });

  it('focusing the search starts loading the territories index', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithApp(<HomePage />);
    await user.click(screen.getByRole('combobox', { name: /Cidade ou bairro/ }));
    await vi.waitFor(() => expect(snapshotCalls(fetchMock).length).toBeGreaterThan(0));
  });
});
