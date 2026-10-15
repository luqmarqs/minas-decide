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
  it('renders hero, map search and a static map placeholder before any snapshot request', async () => {
    const fetchMock = stubFetch();
    renderWithApp(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Minas decide: é hora da virada!',
    );
    expect(screen.getByRole('combobox', { name: /cidade ou bairro/ })).toBeInTheDocument();
    expect(screen.getByTestId('map-placeholder')).toBeInTheDocument();
    // Placeholder keeps the legend label and the mandatory attribution.
    // (FE-10: phone chip + desktop legend, one of them hidden by CSS per breakpoint.)
    expect(screen.getAllByText('Abstenção').length).toBeGreaterThanOrEqual(1);
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
    await user.click(screen.getByRole('combobox', { name: /cidade ou bairro/ }));
    await vi.waitFor(() => expect(snapshotCalls(fetchMock).length).toBeGreaterThan(0));
  });

  it('simplified sequence: hero → text → map → sign-up → calendar (one search, by the map)', () => {
    stubFetch();
    renderWithApp(<HomePage />);
    const text = screen.getByRole('heading', { level: 2, name: 'É hora de disputar voto a voto!' });
    const join = screen.getByRole('heading', { level: 2, name: 'Inscreva-se' });
    const agenda = screen.getByRole('heading', { level: 2, name: 'Calendário' });
    const map = screen.getByRole('heading', { level: 2, name: 'Entenda a votação em Minas' });
    const mapSection = document.getElementById('mapa')!;
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(text, map)).toBe(true);
    expect(follows(map, mapSection)).toBe(true);
    expect(follows(mapSection, join)).toBe(true);
    expect(follows(join, agenda)).toBe(true);
    expect(screen.getByText('Emicida')).toBeInTheDocument();
    // The narrative and "Por que Minas decide" plates are gone.
    expect(screen.queryByTestId('story-intro')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Proponha uma atividade' })).toHaveAttribute(
      'href',
      '/criar-atividade',
    );
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(
      screen.getByRole('combobox', { name: 'Busque uma cidade ou bairro no mapa' }),
    ).toBeInTheDocument();
  });
});
