import { useSyncExternalStore } from 'react';
import type { TerritoryMetrics } from '@shared/contracts/metrics.ts';
import type { SnapPoint } from '@/components/ui/BottomSheet';
import { formatPercent } from '@/lib/format';

/** Fraction of the viewport covered by the mobile sheet in its "half" state. */
export const SHEET_HALF = 0.45;

/** Height of the collapsed sheet: handle + one line (name, badge) + one summary line (FE-10). */
export const SHEET_COLLAPSED_PX = 76;

/**
 * collapsed (name + summary, ≈ 76 px: the map keeps the screen) / half (only when the person
 * pulls or taps) / expanded. FE-10: a new selection opens collapsed, never half.
 */
export const SHEET_SNAPS: SnapPoint[] = [`${SHEET_COLLAPSED_PX}px`, SHEET_HALF, 0.92];

// Visible height of the mobile territory sheet (0 = closed), shared with the map so the
// camera, legend chip and popovers sit in the part of the map the sheet leaves free.
let sheetHeight = 0;
const listeners = new Set<() => void>();
export function setSheetHeight(px: number): void {
  const v = Math.max(0, Math.round(px));
  if (v === sheetHeight) return;
  sheetHeight = v;
  listeners.forEach((l) => l());
}
export function useSheetHeight(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sheetHeight,
    () => 0,
  );
}

export type SheetState = 'collapsed' | 'half' | 'expanded';

export function sheetStateOf(snap: SnapPoint | null): SheetState {
  if (snap === SHEET_SNAPS[0]) return 'collapsed';
  if (snap === SHEET_SNAPS[2]) return 'expanded';
  return 'half';
}

/** Next state for the explicit (keyboard/screen-reader) toggle button. */
export function nextSheetSnap(snap: SnapPoint | null): SnapPoint {
  const state = sheetStateOf(snap);
  if (state === 'collapsed') return SHEET_SNAPS[1]!;
  if (state === 'half') return SHEET_SNAPS[2]!;
  return SHEET_SNAPS[0]!;
}

export const SHEET_TOGGLE_LABEL: Record<SheetState, string> = {
  collapsed: 'Mostrar painel',
  half: 'Expandir painel',
  expanded: 'Recolher painel',
};

/**
 * One-line summary of the collapsed sheet (FE-10): abstention and blank+null of the
 * selected year/round, e.g. "Abstenção 22,1% · Brancos e nulos 5,3%". Null when the
 * territory has no turnout block for that year/round.
 */
export function sheetSummary(m: TerritoryMetrics | undefined): string | null {
  const t = m?.turnout;
  if (!t) return null;
  const bn = t.turnout > 0 ? (t.blank + t.null_votes) / t.turnout : null;
  return `Abstenção ${formatPercent(t.abstention_rate)} · Brancos e nulos ${formatPercent(bn)}`;
}
