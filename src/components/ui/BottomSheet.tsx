import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type SnapPoint = number | string;

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Optional subtitle rendered under the title (also used as accessible description). */
  description?: ReactNode;
  /** One-line summary shown under the title, also in the collapsed state (FE-10). */
  summary?: ReactNode;
  /** Inline badge next to the title (e.g. DEMO / snapshot status). */
  badge?: ReactNode;
  children: ReactNode;
  /** collapsed / half / expanded (spec §12.4): "76px" or a fraction of the viewport. */
  snapPoints?: SnapPoint[];
  activeSnapPoint?: SnapPoint | null;
  onActiveSnapPointChange?: (snap: SnapPoint | null) => void;
  /** Kept for API compatibility: the sheet is always non-modal (map stays usable). */
  modal?: boolean;
  headerExtra?: ReactNode;
  /** Visible height in px once the sheet settles (0 when closed). */
  onHeightChange?: (px: number) => void;
}

const DEFAULT_SNAPS: SnapPoint[] = ['76px', 0.45, 0.92];

/** Visible height (px) of a snap point: "76px" → 76; 0.45 → 45 % of the viewport. */
export function snapToPx(snap: SnapPoint, vh: number): number {
  if (typeof snap === 'number') return Math.round(snap * vh);
  const n = Number.parseFloat(snap);
  if (!Number.isFinite(n)) return 0;
  return snap.trim().endsWith('px') ? Math.round(n) : Math.round(n * vh);
}

/** Nearest snap index for a released height, projected with the velocity (px/ms, + = up). */
export function nearestSnapIndex(height: number, heights: number[], velocity = 0): number {
  const projected = height + velocity * 180;
  let best = 0;
  heights.forEach((h, i) => {
    if (Math.abs(h - projected) < Math.abs((heights[best] ?? 0) - projected)) best = i;
  });
  return best;
}

function useViewportHeight(): number {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('resize', cb);
      return () => window.removeEventListener('resize', cb);
    },
    () => window.innerHeight,
    () => 800,
  );
}

/**
 * Mobile bottom sheet (FE-10: own implementation, no vaul/Radix). A labelled, **non-modal**
 * `dialog`: it never hides the page from assistive technology nor traps focus, so the map,
 * its controls and popovers stay reachable. Snap points collapsed/half/expanded; drag the
 * handle/header (pointer events) or tap it to step up; the explicit buttons in `headerExtra`
 * cover keyboard and screen readers. Esc (focus inside) and the close button dismiss it.
 * Height animates with --duration-sheet (0 with reduced motion). The content is `inert`
 * while collapsed (only the header line is visible).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  summary,
  badge,
  children,
  snapPoints = DEFAULT_SNAPS,
  activeSnapPoint,
  onActiveSnapPointChange,
  headerExtra,
  onHeightChange,
}: BottomSheetProps) {
  const titleId = useId();
  const descId = useId();
  const vh = useViewportHeight();
  const heights = snapPoints.map((p) => snapToPx(p, vh));
  const found = activeSnapPoint == null ? -1 : snapPoints.indexOf(activeSnapPoint);
  const activeIdx = found < 0 ? 0 : found;
  const settled = heights[activeIdx] ?? 0;
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; t: number; last: number; moved: boolean; v: number }>(
    null,
  );
  const height = dragH ?? settled;
  const collapsed = activeIdx === 0 && dragH === null;

  const onHeightRef = useRef(onHeightChange);
  useEffect(() => {
    onHeightRef.current = onHeightChange;
  });
  useEffect(() => {
    onHeightRef.current?.(open ? settled : 0);
  }, [open, settled]);
  useEffect(() => () => onHeightRef.current?.(0), []);

  if (!open) return null;

  const setSnap = (i: number) => onActiveSnapPointChange?.(snapPoints[i] ?? null);
  const min = heights[0] ?? 0;
  const max = heights[heights.length - 1] ?? min;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select')) return;
    drag.current = { y: e.clientY, h: settled, t: e.timeStamp, last: settled, moved: false, v: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    const h = Math.max(min - 60, Math.min(max, d.h + dy));
    d.v = (h - d.last) / Math.max(1, e.timeStamp - d.t);
    d.t = e.timeStamp;
    d.last = h;
    setDragH(h);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // Tap on the handle/header: step up (collapsed → half → expanded → collapsed).
      setSnap((activeIdx + 1) % heights.length);
      return;
    }
    setDragH(null);
    if (d.last < min - 30) {
      onOpenChange(false);
      return;
    }
    setSnap(nearestSnapIndex(d.last, heights, d.v));
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-map-sheet=""
      data-state={collapsed ? 'collapsed' : activeIdx === heights.length - 1 ? 'expanded' : 'half'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onOpenChange(false);
        }
      }}
      style={{ height: Math.max(0, height) }}
      className={cn(
        'fixed inset-x-0 bottom-0 z-(--z-sheet) flex max-h-[94dvh] flex-col overflow-hidden',
        'rounded-t-sheet border border-b-0 border-border bg-surface-raised text-primary shadow-sheet outline-none',
        dragH === null &&
          'transition-[height] duration-(--duration-sheet) ease-(--easing-emphasized)',
      )}
    >
      <div
        className="shrink-0 cursor-grab touch-none px-3 pt-1.5 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragH(null);
        }}
        data-testid="sheet-handle"
      >
        <div aria-hidden="true" className="mx-auto h-1.5 w-12 rounded-pill bg-border-strong" />
        <div className="flex min-h-14 items-center justify-between gap-2">
          <div className="min-w-0 flex-1 pl-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 id={titleId} className="min-w-0 truncate font-display text-lg leading-tight">
                {title}
              </h2>
              {badge ? <span className="shrink-0">{badge}</span> : null}
            </div>
            <p id={descId} className="truncate text-xs leading-snug text-secondary">
              {description ? (
                <>
                  {description}
                  {summary ? ' · ' : ''}
                </>
              ) : null}
              {summary ?? (description ? null : 'Painel do território selecionado')}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            {headerExtra}
            <button
              type="button"
              className="grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-alt"
              aria-label="Fechar painel"
              onClick={() => onOpenChange(false)}
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[calc(var(--space-6)+var(--safe-bottom))]"
        inert={collapsed}
        data-testid="sheet-body"
      >
        {children}
      </div>
    </div>
  );
}
