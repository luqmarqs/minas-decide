/** FE-7 (D28): sign-up at the end of the home, CTAs to #participar, compact key-number cards. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { SessionMenu } from '@/components/layouts/SessionMenu';
import { WhyMinasStrip } from '@/features/highlights/WhyMinasStrip';
import { HomeJoinSection } from '@/features/registration/HomeJoinSection';
import { JoinCta } from '@/features/registration/JoinCta';
import { renderWithApp, stubFetch } from './utils';

const hl = vi.hoisted(() => ({
  data: {
    generated_at: 'x',
    items: [
      {
        id: 'mg_municipalities',
        label: 'Municípios de Minas Gerais',
        value: 853,
        unit: 'count',
        compare_value: null,
        compare_label: null,
        note: null,
        source: 'Snapshot X (fonte longa com arquivos e datas)',
      },
    ],
    why_minas: [],
  },
}));
vi.mock('@/features/electoral-map/hooks', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useHighlights: () => ({ data: hl.data, isLoading: false, error: null }),
}));

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

function renderAt(path: string, ui: React.ReactElement) {
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

describe('home sign-up section (#participar)', () => {
  it('is a labelled landmark with the Anton title, below the fixed header, with the real form', async () => {
    stubFetch();
    renderWithApp(<HomeJoinSection territoryId={null} start />);
    const section = screen.getByRole('region', { name: 'Entre para a campanha em Minas' });
    expect(section).toHaveAttribute('id', 'participar');
    expect(section.className).toContain('scroll-mt-(--header-height)');
    expect(
      within(section).getByRole('heading', { name: 'Entre para a campanha em Minas' }).className,
    ).toContain('brand-display');
    // Same RegistrationForm as /participar (lazy, after the session check).
    expect(await within(section).findByLabelText(/^Nome/)).toBeInTheDocument();
    expect(within(section).getByLabelText(/^WhatsApp/)).toBeInTheDocument();
  });
});

describe('JoinCta', () => {
  it('on the home page is an in-page link that scrolls smoothly to #participar and focuses it', () => {
    const scroll = vi.fn();
    renderAt(
      '/',
      <>
        <JoinCta>Quero participar</JoinCta>
        <section
          id="participar"
          ref={(el) => {
            if (el) el.scrollIntoView = scroll;
          }}
        >
          <h2 id="participar-titulo" tabIndex={-1}>
            Entre
          </h2>
        </section>
      </>,
    );
    const link = screen.getByRole('link', { name: 'Quero participar' });
    expect(link).toHaveAttribute('href', '#participar');
    expect(link.className).toContain('bg-action'); // blue primary, never the "Eu vou" yellow
    fireEvent.click(link);
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toHaveAttribute('id', 'participar-titulo');
    expect(window.location.hash).toBe('#participar');
  });

  it('elsewhere goes to /participar; the header CTA follows the same rule', () => {
    renderAt('/metodologia', <JoinCta />);
    expect(screen.getByRole('link', { name: 'Quero participar' })).toHaveAttribute(
      'href',
      '/participar',
    );
  });

  it('header "Participar" scrolls on the home page', () => {
    renderAt('/', <SessionMenu />);
    expect(screen.getByRole('link', { name: 'Participar' })).toHaveAttribute('href', '#participar');
  });
});

describe('compact key-number cards', () => {
  it('shows only a short source (D32 supersedes the "fonte" disclosure) in a keyboard-scrollable carousel', () => {
    renderWithApp(<WhyMinasStrip start />);
    const cards = screen.getByRole('list', { name: 'Números de Minas Gerais' });
    expect(cards).toHaveAttribute('tabindex', '0'); // phone carousel scrolls with the keyboard
    expect(cards.className).toContain('snap-x');
    expect(cards.className).toContain('md:auto-rows-fr'); // uniform height from md
    expect(within(cards).getByText('Fonte: TSE')).toBeInTheDocument();
    expect(within(cards).queryByText(/fonte longa/)).not.toBeInTheDocument();
  });
});
