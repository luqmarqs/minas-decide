import { lazy, Suspense, useState } from 'react';
import type { SnapPoint } from '@/components/ui/BottomSheet';
import { SidePanel } from '@/components/ui/SidePanel';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/media';
import { useTerritoryIndex } from '@/features/electoral-map/hooks';
import { TerritoryDetails, type TerritoryDetailsProps } from './TerritoryDetails';
import { territoryLabel } from './search';

export interface TerritoryPanelProps extends Omit<
  TerritoryDetailsProps,
  'territoryId' | 'variant'
> {
  /** Selected territory (null = state overview on desktop, closed sheet on mobile). */
  territoryId: string | null;
  onClose: () => void;
}

// vaul is only needed on mobile: keep it out of the desktop/initial bundle.
const BottomSheet = lazy(() =>
  import('@/components/ui/BottomSheet').then((m) => ({ default: m.BottomSheet })),
);

const SNAPS: SnapPoint[] = ['168px', 0.55, 0.92];

/**
 * Contextual territory panel: SidePanel on desktop (≥1024px), bottom sheet with
 * collapsed/half/expanded snap points on mobile (spec §12.3/§12.4).
 */
export function TerritoryPanel({ territoryId, onClose, ...details }: TerritoryPanelProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { index } = useTerritoryIndex();
  const [collapsed, setCollapsed] = useState(false);
  const [snap, setSnap] = useState<SnapPoint | null>(SNAPS[1]!);
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
        snapPoints={SNAPS}
        activeSnapPoint={snap}
        onActiveSnapPointChange={setSnap}
      >
        <TerritoryDetails territoryId={territoryId} variant="panel" {...details} />
      </BottomSheet>
    </Suspense>
  );
}
