import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { ActivityMarker } from '@/features/activities/ActivityMarker';
import { PoiMarker } from './PoiMarker';
import { useDismiss } from './useDismiss';

export interface MapControlBarProps {
  /** Active layer name, e.g. "Abstenção". */
  layerLabel: string;
  /** Short qualifier (year/round, candidate…), e.g. "2026 · 1º" (+ sr-only "turno"). */
  layerDetail?: ReactNode;
  /** Full layer selector (layers, year/round, candidate) shown in the popover. */
  selector: ReactNode;
  activities: boolean;
  onActivitiesChange: (on: boolean) => void;
  pois: boolean;
  onPoisChange: (on: boolean) => void;
  /** List/map toggle (absent when the map cannot render). */
  listMode?: { list: boolean; onToggle: () => void } | null;
  /** Max height of the popover (px): the free map below the bar. */
  popoverMaxHeight?: number;
  className?: string;
}

const ICON_BTN = cn(
  'relative grid size-11 shrink-0 place-items-center rounded-sm border text-primary',
  'transition-colors duration-(--duration-fast) ease-(--easing-standard)',
);

function ToggleIcon({
  pressed,
  onChange,
  label,
  icon,
}: {
  pressed: boolean;
  onChange: (on: boolean) => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={() => onChange(!pressed)}
      className={cn(
        ICON_BTN,
        pressed
          ? 'border-action bg-action-soft'
          : 'border-transparent opacity-70 hover:border-border-strong',
      )}
    >
      {icon}
      {/* Visible on/off cue besides colour: a slash when the overlay is hidden. */}
      {!pressed ? (
        <span
          aria-hidden="true"
          className="absolute h-0.5 w-7 rotate-45 rounded-pill bg-(--color-text-secondary)"
        />
      ) : null}
    </button>
  );
}

/**
 * Phone map controls (FE-10, < 1024 px): ONE row ≤ 56 px on top of the map — a layer
 * button ("Camada: Abstenção · 2026 1º ▾") that opens the full selector in a non-modal
 * popover (light-dismiss: tap outside / Esc / "Ver mapa"), plus icon toggles for the
 * activities and terminals overlays and the list view. Every target is ≥ 44 px and
 * every icon has an accessible name.
 */
export const MapControlBar = forwardRef<HTMLDivElement, MapControlBarProps>(function MapControlBar(
  {
    layerLabel,
    layerDetail,
    selector,
    activities,
    onActivitiesChange,
    pois,
    onPoisChange,
    listMode,
    popoverMaxHeight,
    className,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  useDismiss(popRef, () => close(true), { enabled: open, ignore: triggerRef });
  useEffect(() => {
    if (open) popRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        ref={ref}
        data-testid="map-control-bar"
        className="flex h-13 w-full items-center gap-1 rounded-md border border-border bg-surface-raised/95 p-1 shadow-raised backdrop-blur-sm"
      >
        <button
          ref={triggerRef}
          type="button"
          data-testid="layer-bar-trigger"
          aria-expanded={open}
          aria-controls={popId}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-surface-alt"
        >
          <Icon name="layers" size={18} className="shrink-0 text-secondary" />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-secondary">Camada: </span>
            <span className="font-semibold">{layerLabel}</span>
            {layerDetail ? <span className="text-secondary"> · {layerDetail}</span> : null}
          </span>
          <Icon
            name="chevronDown"
            size={18}
            className={cn(
              'shrink-0 transition-transform duration-(--duration-fast)',
              open && 'rotate-180',
            )}
          />
        </button>
        <ToggleIcon
          pressed={activities}
          onChange={onActivitiesChange}
          label="Atividades no mapa"
          icon={<ActivityMarker size={12} />}
        />
        <ToggleIcon
          pressed={pois}
          onChange={onPoisChange}
          label="Terminais e estações no mapa"
          icon={<PoiMarker size={13} />}
        />
        {listMode ? (
          <button
            type="button"
            aria-label={listMode.list ? 'Ver mapa' : 'Ver como lista'}
            title={listMode.list ? 'Ver mapa' : 'Ver como lista'}
            onClick={listMode.onToggle}
            className={cn(ICON_BTN, 'border-transparent hover:border-border-strong')}
          >
            <Icon name={listMode.list ? 'map' : 'list'} size={20} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          aria-modal="false"
          aria-label="Camada do mapa"
          tabIndex={-1}
          data-testid="layer-popover"
          style={popoverMaxHeight ? { maxHeight: popoverMaxHeight } : undefined}
          className="flex flex-col gap-2 overflow-y-auto overscroll-contain rounded-md border border-border bg-surface-raised p-2 shadow-raised outline-none focus-visible:outline-3 focus-visible:outline-focus"
        >
          {selector}
          <button
            type="button"
            onClick={() => close(true)}
            className="min-h-11 self-end rounded-sm px-3 text-sm font-semibold text-primary underline underline-offset-2 hover:bg-surface-alt"
          >
            Ver mapa
          </button>
        </div>
      ) : null}
    </div>
  );
});
