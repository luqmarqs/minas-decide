import { useId, type ReactNode } from 'react';
import type { MapLayerCode } from '@shared/contracts/metrics.ts';
import { Select, type SelectOption } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { ActivityMarker } from '@/features/activities/ActivityMarker';
import { isFixedRoundLayer, LAYER_ORDER, LAYERS } from './layers';
import { PoiMarker } from './PoiMarker';

export interface MapOverlaySwitches {
  activities: boolean;
  onActivitiesChange: (on: boolean) => void;
  pois: boolean;
  onPoisChange: (on: boolean) => void;
}

export interface MapLayerSelectorProps {
  layer: MapLayerCode;
  onLayerChange: (layer: MapLayerCode) => void;
  yearRound: string;
  yearRoundOptions: SelectOption[];
  onYearRoundChange: (value: string) => void;
  /** Year/round chips of the margin layer (2026 r1, 2022 r2, 2022 r1). */
  marginOptions?: SelectOption[];
  candidateId: string | null;
  candidateOptions: SelectOption[];
  onCandidateChange: (id: string) => void;
  /** Overlay switches (activities on by default, terminals off by default). */
  overlays?: MapOverlaySwitches;
  /** Extra controls rendered at the end of the second row (e.g. list toggle). */
  trailing?: ReactNode;
  className?: string;
}

const chip = (checked: boolean) =>
  cn(
    'relative inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-pill border px-3 text-sm font-medium whitespace-nowrap',
    'transition-colors duration-(--duration-fast) ease-(--easing-standard)',
    'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
    checked
      ? 'border-action bg-action text-on-action'
      : 'border-border-strong bg-surface-raised text-primary hover:border-action',
  );

/** Accessible on/off switch (native button, role="switch"), ≥ 44 px. */
function OverlaySwitch({
  checked,
  onChange,
  icon,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill border border-border-strong bg-surface-raised px-2.5 text-sm font-medium text-primary',
        'transition-colors duration-(--duration-fast) ease-(--easing-standard) hover:border-action',
      )}
    >
      {icon}
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-block h-5 w-9 shrink-0 rounded-pill border transition-colors duration-(--duration-fast)',
          checked ? 'border-action bg-action' : 'border-border-strong bg-surface-alt',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3.5 rounded-full transition-[left] duration-(--duration-fast)',
            checked ? 'left-[1.1rem] bg-on-action' : 'left-0.5 bg-(--color-text-secondary)',
          )}
        />
      </span>
      <span className="sr-only">{checked ? '(ligado)' : '(desligado)'}</span>
    </button>
  );
}

/**
 * Legible layer switch (spec §12.3): native radio group (keyboard + screen reader
 * semantics for free) styled as segmented chips for the exclusive statistical layers,
 * a Lula/Bolsonaro sub-selection for the presidential comparison, year/round,
 * candidate, and overlay switches (activities, terminals) that work over any layer.
 */
export function MapLayerSelector({
  layer,
  onLayerChange,
  yearRound,
  yearRoundOptions,
  onYearRoundChange,
  marginOptions = [],
  candidateId,
  candidateOptions,
  onCandidateChange,
  overlays,
  trailing,
  className,
}: MapLayerSelectorProps) {
  const name = useId();
  const subName = useId();
  const marginName = useId();
  const margin = layer === 'president_margin';
  const president = layer === 'president_comparison';
  const mobilization = layer === 'mobilization';
  const chips = president || mobilization;
  const needsCandidate = LAYERS[layer].needsCandidate && !chips;
  const showYear = LAYERS[layer].scale === 'sequential' && !isFixedRoundLayer(layer);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <fieldset className="min-w-0">
        <legend className="sr-only">Camada do mapa</legend>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {LAYER_ORDER.map((code) => {
            const checked = code === layer;
            return (
              <label key={code} className={chip(checked)}>
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
      {chips ? (
        <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-semibold text-secondary">
            {mobilization
              ? 'Abstenção no 1º turno de 2026, só nos territórios:'
              : 'Variação 2022 → 2026 (1º turno) de:'}
          </legend>
          <div className="flex flex-wrap gap-1">
            {candidateOptions.map((o) => {
              const checked = o.value === candidateId;
              return (
                <label key={o.value} className={chip(checked)}>
                  <input
                    type="radio"
                    name={subName}
                    value={o.value}
                    checked={checked}
                    onChange={() => onCandidateChange(o.value)}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {margin ? (
        <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-semibold text-secondary">
            Margem de Presidente no turno:
          </legend>
          <div className="flex flex-wrap gap-1">
            {marginOptions.map((o) => {
              const checked = o.value === yearRound;
              return (
                <label key={o.value} className={chip(checked)}>
                  <input
                    type="radio"
                    name={marginName}
                    value={o.value}
                    checked={checked}
                    onChange={() => onYearRoundChange(o.value)}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {showYear || needsCandidate || trailing || overlays ? (
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
          {overlays ? (
            <div role="group" aria-label="Sobreposições do mapa" className="flex flex-wrap gap-1">
              <OverlaySwitch
                checked={overlays.activities}
                onChange={overlays.onActivitiesChange}
                icon={<ActivityMarker size={10} />}
                label="Atividades"
              />
              <OverlaySwitch
                checked={overlays.pois}
                onChange={overlays.onPoisChange}
                icon={<PoiMarker size={11} />}
                label="Terminais"
              />
            </div>
          ) : null}
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
