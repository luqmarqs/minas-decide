import { Icon } from '@/components/ui/Icon';
import { MapPopover } from './MapPopover';
import { POI_CATEGORY_LABEL, type PoiItem } from './poi';
import { PoiMarker } from './PoiMarker';

export interface PoiPopoverProps {
  poi: PoiItem;
  municipalityName: string | null;
  onClose: () => void;
  className?: string;
}

/** Popover of a terminal/station: name, category, municipality and the OSM link. */
export function PoiPopover({ poi, municipalityName, onClose, className }: PoiPopoverProps) {
  return (
    <MapPopover
      testId="poi-popover"
      className={className}
      onClose={onClose}
      closeLabel="Fechar local"
      eyebrow={
        <>
          <PoiMarker size={12} />
          <span className="text-xs font-semibold text-secondary">
            {POI_CATEGORY_LABEL[poi.category]}
          </span>
        </>
      }
      title={poi.name}
    >
      {municipalityName ? (
        <p className="flex items-start gap-1.5 text-secondary">
          <Icon name="pin" size={16} className="mt-0.5 shrink-0" />
          <span>{municipalityName}/MG</span>
        </p>
      ) : null}
      <p>
        <a
          href={poi.osm_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 font-semibold underline"
        >
          Ver no OpenStreetMap
          <span className="font-normal text-muted">(openstreetmap.org)</span>
          <Icon name="external" size={14} />
        </a>
      </p>
      <p className="text-xs text-muted">
        Local de grande circulação, útil para planejar panfletagens. Dados © OpenStreetMap
        contributors (ODbL); não são dados eleitorais.
      </p>
    </MapPopover>
  );
}
