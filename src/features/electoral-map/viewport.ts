/**
 * Free map space on phones (FE-10): the compact layer bar sits on top of the map, the
 * collapsed/half territory sheet is fixed at the bottom of the viewport, and the legend chip
 * sits right above the sheet. These pure helpers turn measured rectangles into the camera
 * padding and the bottom inset of the overlays, so the territory is framed in the part of
 * the map that is actually visible.
 */

export interface SheetOverlapInput {
  /** Map box (getBoundingClientRect) top/bottom in viewport px. */
  mapTop: number;
  mapBottom: number;
  viewportHeight: number;
  /** Visible height of the fixed bottom sheet (0 = closed). */
  sheetHeight: number;
  /** Space taken by the bar at the top of the map (camera never frames under it). */
  topInset?: number;
  /** Map height always kept for the territory itself. */
  minMap?: number;
}

/** Part of the map box covered by the bottom sheet, clamped so some map always remains. */
export function sheetOverlap({
  mapTop,
  mapBottom,
  viewportHeight,
  sheetHeight,
  topInset = 0,
  minMap = 120,
}: SheetOverlapInput): number {
  if (sheetHeight <= 0) return 0;
  const sheetTop = viewportHeight - sheetHeight;
  const overlap = Math.round(mapBottom - sheetTop);
  const max = Math.max(0, Math.round(mapBottom - mapTop - topInset - minMap));
  return Math.max(0, Math.min(overlap, max));
}

/** Height of the legend chip row (44 px target + 8 px gap) kept free at the bottom. */
export const LEGEND_CHIP_ROW = 52;

export interface CameraPaddingInput {
  /** Phone layout (compact bar + chip legend + bottom sheet). */
  compact: boolean;
  /** Bottom edge of the compact bar inside the map box (px from the map top). */
  barBottom: number;
  /** Sheet overlap (see `sheetOverlap`). */
  overlap: number;
  /** Desktop side panel width (0 when absent). */
  panelRight: number;
}

/** MapLibre camera padding (MapCanvas adds its own 24 px margin on the sides/bottom). */
export function cameraPadding({ compact, barBottom, overlap, panelRight }: CameraPaddingInput): {
  top: number;
  right: number;
  bottom: number;
} {
  if (!compact) return { top: 72, right: panelRight, bottom: 0 };
  return { top: Math.max(0, barBottom) + 8, right: 0, bottom: overlap + LEGEND_CHIP_ROW };
}

/** Free vertical band of the map (px) between the bar and the sheet. */
export function freeMapHeight(mapHeight: number, barBottom: number, overlap: number): number {
  return Math.max(0, Math.round(mapHeight - barBottom - overlap));
}
