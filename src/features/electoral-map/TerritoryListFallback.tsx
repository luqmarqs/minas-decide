import { useMemo, type ReactNode } from 'react';
import type { MapLayerCode, MapLayerValues } from '@shared/contracts/metrics.ts';
import { municipalityIdOf } from '@shared/contracts/snapshot.ts';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { ActivityAgenda } from '@/features/activities/ActivityAgenda';
import type { TerritoryIndex } from './hooks';
import { formatLayerValue, LAYERS } from './layers';
import { safeDomain, swatchVar } from './palette';

export type FallbackReason = 'no-webgl' | 'map-error' | 'user';

export interface TerritoryListFallbackProps {
  index: TerritoryIndex;
  layer: MapLayerCode;
  layerValues: MapLayerValues | null | undefined;
  neighborhoodValues: Record<string, number> | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  reason: FallbackReason;
  onBackToMap?: () => void;
  /** Legend (status, unit, source) rendered inline in list mode. */
  legend?: ReactNode;
  className?: string;
}

const REASON_TEXT: Record<FallbackReason, string> = {
  'no-webgl':
    'Seu navegador ou dispositivo não oferece WebGL, necessário para o mapa interativo. Todos os territórios e valores estão disponíveis nesta lista.',
  'map-error':
    'O mapa interativo não pôde ser exibido. Todos os territórios e valores estão disponíveis nesta lista.',
  user: 'Visualização em lista: os mesmos dados do mapa, em ordem alfabética.',
};

/** Textual alternative to the map (spec T20, §12.14): same data, keyboard friendly. */
export function TerritoryListFallback({
  index,
  layer,
  layerValues,
  neighborhoodValues,
  selectedId,
  onSelect,
  reason,
  onBackToMap,
  legend,
  className,
}: TerritoryListFallbackProps) {
  const meta = LAYERS[layer];
  const diverging = meta.scale === 'diverging';
  const domain = safeDomain(layerValues?.domain, diverging);
  const selectedMuni = selectedId ? municipalityIdOf(selectedId) : null;
  const children = useMemo(
    () => (selectedMuni && selectedMuni !== 'mg' ? (index.childrenOf.get(selectedMuni) ?? []) : []),
    [index, selectedMuni],
  );

  return (
    <div
      className={cn('flex h-full flex-col gap-3 overflow-y-auto bg-surface p-4', className)}
      data-testid="territory-list-fallback"
    >
      <Note>
        <p>{REASON_TEXT[reason]}</p>
        {onBackToMap ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            iconBefore={<Icon name="map" size={18} />}
            onClick={onBackToMap}
          >
            Voltar ao mapa
          </Button>
        ) : null}
      </Note>
      {legend}

      {layer === 'activities' ? (
        <section aria-label="Agenda de atividades">
          <h3 className="mb-2 font-body text-base font-semibold tracking-normal">
            Atividades publicadas
          </h3>
          <ActivityAgenda />
        </section>
      ) : (
        <>
          {children.length ? (
            <section aria-label="Bairros do município selecionado">
              <h3 className="mb-1 font-body text-base font-semibold tracking-normal">
                Bairros de {index.byId.get(selectedMuni!)?.name} (aproximados)
              </h3>
              <TerritoryRows
                rows={children.map((c) => ({
                  id: c.id,
                  name: c.name,
                  value: neighborhoodValues?.[c.id] ?? null,
                }))}
                layer={layer}
                domain={domain}
                diverging={diverging}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </section>
          ) : null}
          <section aria-label="Municípios">
            <h3 className="mb-1 font-body text-base font-semibold tracking-normal">
              Municípios · {meta.label}{' '}
              <span className="font-normal text-muted">({meta.unit})</span>
            </h3>
            <TerritoryRows
              rows={index.municipalities.map((m) => ({
                id: m.id,
                name: m.name,
                value: layerValues?.values[m.id] ?? null,
              }))}
              layer={layer}
              domain={domain}
              diverging={diverging}
              selectedId={selectedMuni}
              onSelect={onSelect}
            />
          </section>
        </>
      )}
    </div>
  );
}

function TerritoryRows({
  rows,
  layer,
  domain,
  diverging,
  selectedId,
  onSelect,
}: {
  rows: { id: string; name: string; value: number | null }[];
  layer: MapLayerCode;
  domain: [number, number];
  diverging: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-surface-raised">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            aria-current={r.id === selectedId ? 'true' : undefined}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-surface-alt',
              r.id === selectedId && 'bg-accent-soft font-semibold',
            )}
          >
            <span
              className="inline-block size-3.5 shrink-0 rounded-sm border border-border-strong"
              style={{ background: swatchVar(r.value, domain, diverging) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="shrink-0 text-sm tabular-nums text-secondary">
              {formatLayerValue(layer, r.value)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
