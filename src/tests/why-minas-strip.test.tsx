import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WhyMinasStrip } from '@/features/highlights/WhyMinasStrip';
import { renderWithApp } from './utils';

const state = vi.hoisted(() => ({
  highlights: { data: undefined as unknown, isLoading: false, error: null as unknown },
  status: 'validated' as string,
}));

vi.mock('@/features/electoral-map/hooks', () => ({
  useHighlights: () => state.highlights,
  useSnapshot: () => ({ data: { status: state.status } }),
}));

describe('WhyMinasStrip states', () => {
  it('shows an honest empty state when highlights.json is not published', () => {
    state.highlights = { data: null, isLoading: false, error: null };
    renderWithApp(<WhyMinasStrip start />);
    expect(screen.getByRole('heading', { name: 'Por que Minas decide' })).toBeInTheDocument();
    expect(screen.getByText(/ainda não foram publicados/)).toBeInTheDocument();
  });

  it('shows a skeleton while loading and an error note on failure', () => {
    state.highlights = { data: undefined, isLoading: true, error: null };
    const { unmount } = renderWithApp(<WhyMinasStrip start />);
    expect(screen.getByRole('status', { name: /Carregando números/ })).toBeInTheDocument();
    unmount();
    state.highlights = { data: undefined, isLoading: false, error: new Error('x') };
    renderWithApp(<WhyMinasStrip start />);
    expect(screen.getByText(/Não foi possível carregar os números/)).toBeInTheDocument();
  });

  it('renders cards with sources and labels DEMO data', () => {
    state.status = 'demo';
    state.highlights = {
      data: {
        generated_at: 'x',
        items: [
          {
            id: 'mg_municipalities',
            label: 'Municípios na demonstração',
            value: 12,
            unit: 'count',
            compare_value: null,
            compare_label: null,
            note: null,
            source: 'DEMONSTRAÇÃO',
          },
        ],
        why_minas: [
          {
            title: 'Demonstração',
            text: 'Sintético.',
            value: null,
            unit: null,
            source: 'DEMONSTRAÇÃO',
          },
        ],
      },
      isLoading: false,
      error: null,
    };
    renderWithApp(<WhyMinasStrip start />);
    expect(screen.getByText('DADOS DEMONSTRATIVOS')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getAllByText('Fonte: Demonstração (dados sintéticos)').length).toBe(1);
    // D34: no why_minas paragraphs on the home.
    expect(screen.queryByText('Sintético.')).not.toBeInTheDocument();
  });
});
