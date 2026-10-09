import type { SnapPoint } from '@/components/ui/BottomSheet';

/** Fraction of the viewport covered by the mobile sheet in its "half" state. */
export const SHEET_HALF = 0.45;

/** collapsed (title only) / half (map stays visible above) / expanded (P-UX-2). */
export const SHEET_SNAPS: SnapPoint[] = ['148px', SHEET_HALF, 0.92];

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
