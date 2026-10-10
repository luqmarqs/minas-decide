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

  it('opens as editorial plate 02 ("Números") and renders the spread, not a carousel', () => {
    state.status = 'validated';
    const item = (id: string, value: number, compare_value: number | null = null) => ({
      id,
      label: id,
      value,
      unit: 'count' as const,
      compare_value,
      compare_label: null,
      note: null,
      source: 'TSE',
    });
    state.highlights = {
      data: {
        generated_at: 'x',
        items: [
          item('mg_eligible_2026', 16372372),
          item('mg_share_national_eligible_2026', 10.31),
          item('mg_rank_eligible_2026', 2, 27),
          item('mg_turnout_2026_r1', 12637274),
          item('mg_abstention_2026_r1', 3735098),
          item('mg_2022_r2_margin_votes', 49650, 0.4),
        ],
        why_minas: [],
      },
      isLoading: false,
      error: null,
    };
    renderWithApp(<WhyMinasStrip start />);
    const section = screen.getByTestId('why-minas');
    expect(section).toHaveAttribute('aria-labelledby', 'why-minas-title');
    expect(screen.getByRole('heading', { level: 2, name: 'Por que Minas decide' })).toHaveAttribute(
      'id',
      'why-minas-title',
    );
    expect(section).toHaveTextContent(/02\s*Seção 2: Números/);
    expect(screen.getByTestId('why-minas-figures').className).toContain('ed-grid-12');
    expect(screen.queryByRole('button', { name: /Ir para o número/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('fig-nacional')).toHaveTextContent('10,3%');
    expect(screen.queryByText('DADOS DEMONSTRATIVOS')).not.toBeInTheDocument();
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
