import { lazy, Suspense, useMemo, useState } from 'react';
import { municipalityIdOf } from '@shared/contracts/snapshot.ts';
import type { SnapPoint } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { SidePanel } from '@/components/ui/SidePanel';
import { cn } from '@/lib/cn';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/media';
import { useMunicipalityMetrics, useTerritoryIndex } from '@/features/electoral-map/hooks';
import { pickMetrics } from '@/features/electoral-map/layers';
import { StatusBadge } from '@/features/electoral-map/MapLegend';
import { TerritoryDetails, type TerritoryDetailsProps } from './TerritoryDetails';
import { territoryLabel } from './search';
import {
  nextSheetSnap,
  setSheetHeight,
  SHEET_SNAPS,
  SHEET_TOGGLE_LABEL,
  sheetStateOf,
  sheetSummary,
} from './sheet';

export interface TerritoryPanelProps extends Omit<
  TerritoryDetailsProps,
  'territoryId' | 'variant'
> {
  /** Selected territory (null = state overview on desktop, closed sheet on mobile). */
  territoryId: string | null;
  onClose: () => void;
}

// The sheet is only needed on mobile: keep it out of the desktop/initial bundle.
const BottomSheet = lazy(() =>
  import('@/components/ui/BottomSheet').then((m) => ({ default: m.BottomSheet })),
);

/**
 * Contextual territory panel: SidePanel on desktop (≥1024px), bottom sheet with
 * collapsed/half/expanded snap points on mobile (spec §12.3/§12.4).
 */
export function TerritoryPanel({ territoryId, onClose, ...details }: TerritoryPanelProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { index, snapshot } = useTerritoryIndex();
  const [collapsed, setCollapsed] = useState(false);
  const [snap, setSnap] = useState<SnapPoint | null>(SHEET_SNAPS[0]!);
  // FE-10: each new selection opens the sheet *collapsed* (name + summary line), so the
  // map keeps the screen; half/expanded only when the person pulls or taps.
  const [snapFor, setSnapFor] = useState(territoryId);
  if (snapFor !== territoryId) {
    setSnapFor(territoryId);
    setSnap(SHEET_SNAPS[0]!);
  }
  const sheetEntry = !desktop && territoryId ? index?.byId.get(territoryId) : undefined;
  const metricsQ = useMunicipalityMetrics(
    sheetEntry && sheetEntry.type !== 'state' ? municipalityIdOf(sheetEntry.id) : null,
  );
  const summary = useMemo(() => {
    const file = metricsQ.data;
    if (!file || !sheetEntry) return null;
    const rows = sheetEntry.type === 'neighborhood' ? file.children[sheetEntry.id] : file.self;
    return sheetSummary(pickMetrics(rows, details.year, details.round));
  }, [metricsQ.data, sheetEntry, details.year, details.round]);
  const sheetState = sheetStateOf(snap);
  const shownId = territoryId ?? 'mg';
  const entry = index?.byId.get(shownId);
  const title = entry ? (entry.type === 'state' ? 'Minas Gerais' : entry.name) : 'Território';
  const subtitle = entry && entry.type === 'neighborhood' ? territoryLabel(entry) : undefined;

  if (desktop) {
    return (
      <SidePanel
        open
        title={title}
        subtitle={subtitle}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onClose={territoryId ? onClose : undefined}
        className="max-h-full"
      >
        <TerritoryDetails territoryId={shownId} variant="panel" {...details} />
      </SidePanel>
    );
  }

  if (!territoryId) return null;
  return (
    <Suspense fallback={null}>
      <BottomSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={title}
        description={subtitle}
        summary={summary}
        badge={snapshot ? <StatusBadge status={snapshot.status} /> : null}
        snapPoints={SHEET_SNAPS}
        activeSnapPoint={snap}
        onActiveSnapPointChange={setSnap}
        onHeightChange={setSheetHeight}
        headerExtra={
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-alt"
            aria-label={SHEET_TOGGLE_LABEL[sheetState]}
            onClick={() => setSnap(nextSheetSnap(snap))}
          >
            <Icon
              name="chevronDown"
              className={cn(
                'transition-transform duration-(--duration-fast)',
                sheetState !== 'expanded' && 'rotate-180',
              )}
            />
          </button>
        }
      >
        <TerritoryDetails territoryId={territoryId} variant="panel" {...details} />
      </BottomSheet>
    </Suspense>
  );
}
