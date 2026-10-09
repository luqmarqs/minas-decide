/**
 * URL ⇄ map state (spec §4.7, T24). A shared link restores selection, layer,
 * year/round and candidate; the camera is derived from the selection.
 *   ?t=<territory_id>&camada=<slug>&ano=2026&turno=1&cand=<id>&vista=lista
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { MapLayerCode } from '@shared/contracts/metrics.ts';
import { TerritoryId } from '@shared/contracts/territory.ts';
import { LAYER_SLUG, layerFromSlug } from './layers';

export interface MapUrlState {
  territoryId: string | null;
  layer: MapLayerCode;
  year: number;
  round: number;
  candidateId: string | null;
  view: 'mapa' | 'lista';
}

export const MAP_DEFAULTS: Omit<MapUrlState, 'territoryId'> = {
  layer: 'abstention',
  year: 2026,
  round: 1,
  candidateId: null,
  view: 'mapa',
};

const CAND_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function parseMapParams(sp: URLSearchParams): MapUrlState {
  const t = sp.get('t');
  const year = Number.parseInt(sp.get('ano') ?? '', 10);
  const round = Number.parseInt(sp.get('turno') ?? '', 10);
  const cand = sp.get('cand');
  return {
    territoryId: t && TerritoryId.safeParse(t).success ? t : null,
    layer: layerFromSlug(sp.get('camada')) ?? MAP_DEFAULTS.layer,
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : MAP_DEFAULTS.year,
    round: round === 1 || round === 2 ? round : MAP_DEFAULTS.round,
    candidateId: cand && CAND_RE.test(cand) ? cand : null,
    view: sp.get('vista') === 'lista' ? 'lista' : 'mapa',
  };
}

export function serializeMapParams(
  state: Partial<MapUrlState>,
  into = new URLSearchParams(),
): URLSearchParams {
  const set = (k: string, v: string | null | undefined, def?: string) => {
    if (v === undefined) return;
    if (v === null || v === '' || v === def) into.delete(k);
    else into.set(k, v);
  };
  if ('territoryId' in state) set('t', state.territoryId ?? null);
  if (state.layer) set('camada', LAYER_SLUG[state.layer], LAYER_SLUG[MAP_DEFAULTS.layer]);
  if (state.year !== undefined) set('ano', String(state.year), String(MAP_DEFAULTS.year));
  if (state.round !== undefined) set('turno', String(state.round), String(MAP_DEFAULTS.round));
  if ('candidateId' in state) set('cand', state.candidateId ?? null);
  if (state.view) set('vista', state.view, MAP_DEFAULTS.view);
  return into;
}

export function useMapUrlState() {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parseMapParams(sp), [sp]);
  const update = useCallback(
    (patch: Partial<MapUrlState>, opts: { push?: boolean } = {}) => {
      setSp((prev) => serializeMapParams(patch, new URLSearchParams(prev)), {
        replace: !opts.push,
        preventScrollReset: true,
      });
    },
    [setSp],
  );
  return [state, update] as const;
}

/** Build a query string (with leading "?") preserving map context for links. */
export function mapQuery(state: Partial<MapUrlState>): string {
  const qs = serializeMapParams(state).toString();
  return qs ? `?${qs}` : '';
}
