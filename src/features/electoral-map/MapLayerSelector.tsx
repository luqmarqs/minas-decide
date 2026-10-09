import { useId, type ReactNode } from 'react';
import type { MapLayerCode } from '@shared/contracts/metrics.ts';
import { Select, type SelectOption } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { LAYER_ORDER, LAYERS } from './layers';

export interface MapLayerSelectorProps {
  layer: MapLayerCode;
  onLayerChange: (layer: MapLayerCode) => void;
  yearRound: string;
  yearRoundOptions: SelectOption[];
  onYearRoundChange: (value: string) => void;
  candidateId: string | null;
  candidateOptions: SelectOption[];
  onCandidateChange: (id: string) => void;
  /** Extra controls rendered at the end of the second row (e.g. list toggle). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * Legible layer switch (spec §12.3): native radio group (keyboard + screen reader
 * semantics for free) styled as segmented chips, plus year/round and candidate.
 */
export function MapLayerSelector({
  layer,
  onLayerChange,
  yearRound,
  yearRoundOptions,
  onYearRoundChange,
  candidateId,
  candidateOptions,
  onCandidateChange,
  trailing,
  className,
}: MapLayerSelectorProps) {
  const name = useId();
  const needsCandidate = LAYERS[layer].needsCandidate;
  const showYear = layer !== 'activities' && layer !== 'comparison';
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <fieldset className="min-w-0">
        <legend className="sr-only">Camada do mapa</legend>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {LAYER_ORDER.map((code) => {
            const checked = code === layer;
            return (
              <label
                key={code}
                className={cn(
                  'relative inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-pill border px-3 text-sm font-medium whitespace-nowrap',
                  'transition-colors duration-(--duration-fast) ease-(--easing-standard)',
                  'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                  checked
                    ? 'border-action bg-action text-on-action'
                    : 'border-border-strong bg-surface-raised text-primary hover:border-action',
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={code}
                  checked={checked}
                  onChange={() => onLayerChange(code)}
                  className="sr-only"
                />
                {LAYERS[code].label}
              </label>
            );
          })}
        </div>
      </fieldset>
      {showYear || needsCandidate || trailing ? (
        <div className="flex flex-wrap items-center gap-2">
          {showYear && yearRoundOptions.length > 1 ? (
            <div className="w-36">
              <Select
                size="sm"
                aria-label="Ano e turno"
                value={yearRound}
                onValueChange={onYearRoundChange}
                options={yearRoundOptions}
              />
            </div>
          ) : null}
          {needsCandidate ? (
            <div className="min-w-0 flex-1 basis-48">
              <Select
                size="sm"
                aria-label="Candidatura exibida no mapa"
                placeholder={
                  candidateOptions.length
                    ? 'Escolha a candidatura'
                    : 'Sem candidaturas para esta camada'
                }
                value={candidateId ?? undefined}
                onValueChange={onCandidateChange}
                options={candidateOptions}
                disabled={!candidateOptions.length}
              />
            </div>
          ) : null}
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
