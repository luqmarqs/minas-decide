import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MapLayerValues, TerritoryMetrics } from '@shared/contracts/metrics.ts';
import {
  BottomSheet,
  nearestSnapIndex,
  snapToPx,
  type SnapPoint,
} from '@/components/ui/BottomSheet';
import { MapControlBar } from '@/features/electoral-map/MapControlBar';
import { legendChipText } from '@/features/electoral-map/legendText';
import { MapLegendChip } from '@/features/electoral-map/MapLegend';
import {
  AUTO_AREAS_LIMIT,
  visibleMunicipalities,
  type BBox,
} from '@/features/electoral-map/neighborhoodAreas';
import {
  cameraPadding,
  freeMapHeight,
  LEGEND_CHIP_ROW,
  sheetOverlap,
} from '@/features/electoral-map/viewport';
import { Carousel } from '@/features/highlights/Carousel';
import { activeIndexFor, edgeFadeMask, scrollEdgesOf } from '@/features/highlights/scrollHints';
import { SHEET_COLLAPSED_PX, SHEET_SNAPS, sheetSummary } from '@/features/territory/sheet';

const values = (domain: [number, number]): MapLayerValues => ({
  layer: 'abstention',
  year: 2026,
  round: 1,
  unit: 'rate',
  candidate_id: null,
  values: { 'mg-3140001': 0.2 },
  domain,
});

describe('FE-10 · free map space (viewport.ts)', () => {
  it('measures only the part of the map covered by the collapsed sheet', () => {
    // Pixel 7: 839 px viewport, map from 56 to 839, collapsed sheet 76 px.
    const overlap = sheetOverlap({
      mapTop: 56,
      mapBottom: 839,
      viewportHeight: 839,
      sheetHeight: 76,
      topInset: 60,
    });
    expect(overlap).toBe(76);
    expect(freeMapHeight(783, 60, overlap)).toBe(647);
    // ≥ 55 % of the viewport is free map.
    expect(freeMapHeight(783, 60, overlap) / 839).toBeGreaterThan(0.55);
  });

  it('is 0 when the sheet is closed or below the map', () => {
    expect(sheetOverlap({ mapTop: 0, mapBottom: 500, viewportHeight: 839, sheetHeight: 0 })).toBe(
      0,
    );
    expect(sheetOverlap({ mapTop: 0, mapBottom: 500, viewportHeight: 839, sheetHeight: 76 })).toBe(
      0,
    );
  });

  it('never lets the sheet leave less than minMap of map', () => {
    const o = sheetOverlap({
      mapTop: 56,
      mapBottom: 839,
      viewportHeight: 839,
      sheetHeight: 772, // expanded
      topInset: 60,
      minMap: 120,
    });
    expect(o).toBe(783 - 60 - 120);
  });

  it('builds the camera padding from the bar, the sheet and the legend chip row', () => {
    expect(cameraPadding({ compact: true, barBottom: 60, overlap: 76, panelRight: 0 })).toEqual({
      top: 68,
      right: 0,
      bottom: 76 + LEGEND_CHIP_ROW,
    });
    expect(cameraPadding({ compact: false, barBottom: 60, overlap: 0, panelRight: 420 })).toEqual({
      top: 72,
      right: 420,
      bottom: 0,
    });
  });
});

describe('FE-10 · bottom sheet', () => {
  it('opens collapsed by default (≈ 76 px) and converts snap points to px', () => {
    expect(SHEET_SNAPS[0]).toBe(`${SHEET_COLLAPSED_PX}px`);
    expect(snapToPx('76px', 839)).toBe(76);
    expect(snapToPx(0.45, 800)).toBe(360);
    expect(nearestSnapIndex(100, [76, 378, 772])).toBe(0);
    expect(nearestSnapIndex(300, [76, 378, 772])).toBe(1);
    // A fast upward flick from the collapsed state goes up one step.
    expect(nearestSnapIndex(120, [76, 378, 772], 1.5)).toBe(1);
  });

  it('summarises abstention and blank+null on one line', () => {
    const m = {
      year: 2026,
      round: 1,
      turnout: {
        eligible: 1000,
        turnout: 800,
        abstention: 200,
        abstention_rate: 0.2,
        turnout_rate: 0.8,
        valid: 760,
        blank: 20,
        null_votes: 20,
        basis_office: 'president',
      },
    } as unknown as TerritoryMetrics;
    expect(sheetSummary(m)).toBe('Abstenção 20,0% · Brancos e nulos 5,0%');
    expect(sheetSummary(undefined)).toBeNull();
  });

  function Harness({ onOpenChange = () => {} }: { onOpenChange?: (o: boolean) => void }) {
    const [snap, setSnap] = useState<SnapPoint | null>(SHEET_SNAPS[0]!);
    return (
      <>
        <button type="button">Mapa</button>
        <BottomSheet
          open
          onOpenChange={onOpenChange}
          title="Mariana"
          summary="Abstenção 20,0% · Brancos e nulos 5,0%"
          badge={<span>DEMO</span>}
          snapPoints={SHEET_SNAPS}
          activeSnapPoint={snap}
          onActiveSnapPointChange={setSnap}
        >
          <a href="#x">Página do território</a>
        </BottomSheet>
      </>
    );
  }

  it('is a non-modal dialog: page stays accessible, content inert while collapsed', async () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Mariana' });
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(dialog).toHaveAttribute('data-state', 'collapsed');
    expect(dialog).toHaveAccessibleDescription(/Abstenção 20,0%/);
    expect(within(dialog).getByText('DEMO')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-body')).toHaveAttribute('inert');
    // Nothing else on the page is hidden from assistive technology.
    expect(document.querySelector('[aria-hidden="true"]:not(svg):not(span):not(div)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mapa' })).not.toHaveAttribute('aria-hidden');
  });

  it('a tap on the handle expands to half; Esc inside closes', async () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const handle = screen.getByTestId('sheet-handle');
    fireEvent.pointerDown(handle, { button: 0, clientY: 800, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 800, pointerId: 1 });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'half');
    expect(screen.getByTestId('sheet-body')).not.toHaveAttribute('inert');
    screen.getByRole('link', { name: 'Página do território' }).focus();
    await userEvent.setup().keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('FE-10 · compact map bar', () => {
  function Bar() {
    const [act, setAct] = useState(true);
    const [poi, setPoi] = useState(false);
    return (
      <>
        <p>fora</p>
        <MapControlBar
          layerLabel="Abstenção"
          layerDetail="2026 · 1º turno"
          selector={<fieldset aria-label="Camada do mapa">camadas</fieldset>}
          activities={act}
          onActivitiesChange={setAct}
          pois={poi}
          onPoisChange={setPoi}
          listMode={{ list: false, onToggle: () => {} }}
        />
      </>
    );
  }

  it('is one row: layer button + overlay toggles + list, all with names', async () => {
    render(<Bar />);
    const bar = screen.getByTestId('map-control-bar');
    const buttons = within(bar).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(bar.className).toContain('h-13'); // 52 px ≤ 56 px
    expect(screen.getByTestId('layer-bar-trigger')).toHaveTextContent(
      'Camada: Abstenção · 2026 · 1º turno',
    );
    const acts = screen.getByRole('button', { name: 'Atividades no mapa' });
    expect(acts).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(acts);
    expect(acts).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Ver como lista' })).toBeInTheDocument();
  });

  it('opens the selector popover; Esc and tapping outside close it', async () => {
    const user = userEvent.setup();
    render(<Bar />);
    const trigger = screen.getByTestId('layer-bar-trigger');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const pop = screen.getByRole('dialog', { name: 'Camada do mapa' });
    expect(pop).toHaveAttribute('aria-modal', 'false');
    expect(pop).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('layer-popover')).toBeNull();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    fireEvent.pointerDown(screen.getByText('fora'));
    expect(screen.queryByTestId('layer-popover')).toBeNull();
  });
});

describe('FE-10 · collapsed legend', () => {
  it('chip text carries the layer and the range', () => {
    expect(legendChipText('abstention', values([0.142, 0.401]))).toBe('Abstenção · 14,2% – 40,1%');
    expect(legendChipText('abstention', null)).toBe('Abstenção');
  });

  it('starts collapsed, shows DEMO, expands on tap and closes outside', async () => {
    const user = userEvent.setup();
    render(
      <>
        <p>fora</p>
        <MapLegendChip layer="abstention" values={values([0.14, 0.4])} status="demo">
          <section aria-label="Legenda do mapa">legenda completa</section>
        </MapLegendChip>
      </>,
    );
    const chip = screen.getByTestId('legend-chip');
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(within(chip).getByText(/Demo|DEMO|sintéticos|demonstra/i)).toBeInTheDocument();
    expect(screen.queryByText('legenda completa')).toBeNull();
    await user.click(chip);
    expect(screen.getByText('legenda completa')).toBeVisible();
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(screen.getByText('fora'));
    expect(screen.queryByText('legenda completa')).toBeNull();
  });
});

describe('FE-10 · carousel indicators', () => {
  it('activeIndexFor picks the nearest item start and the last at the end', () => {
    const offsets = [16, 384, 752, 1120];
    expect(activeIndexFor(0, offsets)).toBe(0);
    expect(activeIndexFor(350, offsets)).toBe(1);
    expect(activeIndexFor(740, offsets, 1000)).toBe(2);
    expect(activeIndexFor(1000, offsets, 1000)).toBe(3);
  });

  it('edges: fade only on the side with more content', () => {
    const mid = scrollEdgesOf({ scrollLeft: 100, scrollWidth: 1000, clientWidth: 400 });
    expect(mid).toEqual({ scrollable: true, atStart: false, atEnd: false });
    expect(edgeFadeMask(mid)).toContain('transparent 100%');
    expect(edgeFadeMask({ scrollable: false, atStart: true, atEnd: true })).toBeUndefined();
  });

  it('dots mark the current item with aria-current and follow the scroll', () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    render(
      <Carousel label="Números de Minas Gerais" itemNoun="número">
        {[0, 1, 2].map((i) => (
          <li key={i}>tile {i}</li>
        ))}
      </Carousel>,
    );
    const list = screen.getByRole('list', { name: 'Números de Minas Gerais' });
    [...list.children].forEach((li, i) =>
      Object.defineProperty(li, 'offsetLeft', { value: 16 + i * 368, configurable: true }),
    );
    const dots = screen.getAllByRole('button', { name: /Ir para o número/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    Object.defineProperty(list, 'scrollWidth', { value: 1200, configurable: true });
    Object.defineProperty(list, 'clientWidth', { value: 412, configurable: true });
    act(() => {
      list.scrollLeft = 368;
      list.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('button', { name: 'Ir para o número 2 de 3' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(dots[0]).not.toHaveAttribute('aria-current');
    // The first-visit hint disappears after the first scroll.
    expect(screen.queryByTestId('carousel-hint')).toBeNull();
    raf.mockRestore();
  });
});

describe('FE-10 · automatic neighborhood areas (visible municipalities)', () => {
  const boxes = new Map<string, BBox>([
    ['3106200', [-44.06, -20.06, -43.86, -19.78]], // BH
    ['3118601', [-44.14, -19.99, -43.98, -19.86]], // Contagem
    ['3140001', [-43.6, -20.5, -43.2, -20.2]], // Mariana (off screen)
  ]);
  const bhView: BBox = [-44.1, -20.05, -43.85, -19.8];

  it('below the zoom threshold only the selected municipality', () => {
    expect(visibleMunicipalities(boxes, bhView, 9, null)).toEqual([]);
    expect(visibleMunicipalities(boxes, bhView, 9, 'mg-3140001')).toEqual(['mg-3140001']);
  });

  it('from zoom 10: municipalities intersecting the viewport, nearest first', () => {
    expect(visibleMunicipalities(boxes, bhView, 11, null)).toEqual(['mg-3106200', 'mg-3118601']);
    // The selected one is always first and never duplicated.
    expect(visibleMunicipalities(boxes, bhView, 11, 'mg-3118601')).toEqual([
      'mg-3118601',
      'mg-3106200',
    ]);
  });

  it('caps the number of municipalities', () => {
    const many = new Map<string, BBox>(
      Array.from({ length: 30 }, (_, i) => [
        String(3100000 + i),
        [-44 + i * 0.001, -20, -43.9 + i * 0.001, -19.9] as BBox,
      ]),
    );
    expect(visibleMunicipalities(many, [-44.2, -20.2, -43.6, -19.6], 12)).toHaveLength(
      AUTO_AREAS_LIMIT,
    );
  });
});
