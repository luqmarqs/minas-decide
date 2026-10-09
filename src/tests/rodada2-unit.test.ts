import type { StyleSpecification } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFT_TTL_MS,
  draftKey,
  purgeExpiredDrafts,
  readDraft,
  writeDraft,
} from '@/features/activities/draftStore';
import {
  BASEMAP_STYLE_URLS,
  fillExpression,
  trimBasemapStyle,
} from '@/features/electoral-map/mapExpressions';
import type { MapPalette } from '@/features/electoral-map/palette';
import { parseArrayChunked, SnapshotFileError } from '@/features/electoral-map/snapshot';
import {
  nextSheetSnap,
  SHEET_HALF,
  SHEET_SNAPS,
  SHEET_TOGGLE_LABEL,
  sheetStateOf,
} from '@/features/territory/sheet';
import { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { whenIdle } from '@/lib/idle';

describe('activity draft store (P-UX-1)', () => {
  beforeEach(() => window.localStorage.clear());

  it('is per user and survives in localStorage', () => {
    writeDraft('user-a', { title: 'A' });
    writeDraft('user-b', { title: 'B' });
    expect(readDraft<{ title: string }>('user-a')?.title).toBe('A');
    expect(readDraft<{ title: string }>('user-b')?.title).toBe('B');
    expect(window.localStorage.getItem(draftKey('user-a'))).toContain('"savedAt"');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('expires after 7 days and purges stale/garbage keys', () => {
    const t0 = 1_800_000_000_000;
    writeDraft('user-a', { title: 'old' }, t0);
    window.localStorage.setItem(draftKey('broken'), '{not json');
    expect(readDraft('user-a', t0 + DRAFT_TTL_MS - 1)).not.toBeNull();
    expect(readDraft('user-a', t0 + DRAFT_TTL_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(draftKey('user-a'))).toBeNull();
    purgeExpiredDrafts(t0);
    expect(window.localStorage.getItem(draftKey('broken'))).toBeNull();
  });

  it('null clears the draft', () => {
    writeDraft('user-a', { title: 'x' });
    writeDraft('user-a', null);
    expect(readDraft('user-a')).toBeNull();
  });
});

describe('basemap and choropleth expressions', () => {
  it('has light and dark OpenFreeMap styles', () => {
    expect(BASEMAP_STYLE_URLS.light).toBe('https://tiles.openfreemap.org/styles/positron');
    expect(BASEMAP_STYLE_URLS.dark).toBe('https://tiles.openfreemap.org/styles/dark');
  });

  it('drops buildings/airports/rail/shields but keeps places, roads, water', () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        'background',
        'water',
        'building',
        'aeroway-area',
        'railway',
        'highway-shield-non-us',
        'label_city',
        'highway_minor',
        'road_oneway',
      ].map((id) => ({ id, type: 'background' })),
    } as unknown as StyleSpecification;
    expect(trimBasemapStyle(style).layers.map((l) => l.id)).toEqual([
      'background',
      'water',
      'label_city',
      'highway_minor',
    ]);
  });

  it('colours by a GeoJSON property and falls back to "no data"', () => {
    const p = {
      sequential: ['#1', '#2', '#3', '#4', '#5'],
      diverging: ['#n', '#z', '#p'],
      none: '#none',
    } as unknown as MapPalette;
    expect(fillExpression(p, 'activities', null)).toBe('#none');
    const expr = fillExpression(p, 'abstention', {
      domain: [0.1, 0.4],
      values: {},
    } as never) as unknown[];
    expect(expr[0]).toBe('case');
    expect(JSON.stringify(expr)).toContain('["get","v"]');
    expect(expr.at(-1)).toBe('#none');
  });
});

describe('chunked validation of the territories index', () => {
  const entry = (i: number) => ({
    id: `mg-31${String(i).padStart(5, '0')}`,
    type: 'municipality',
    name: `M${i}`,
    slug: `m${i}`,
    normalized_name: `m${i}`,
    parent_id: 'mg',
    ibge_code: `31${String(i).padStart(5, '0')}`,
    state_code: 'MG',
    centroid: [-44, -19],
    data_quality: 'complete',
    municipality_name: null,
  });

  it('validates every chunk with the same contract and keeps order', async () => {
    expect(TerritoryIndexEntry.safeParse(entry(1)).success).toBe(true);
    const data = Array.from({ length: 25 }, (_, i) => entry(i));
    const out = await parseArrayChunked(TerritoryIndexEntry, data, 'x.json', 10);
    expect(out.map((e) => e.id)).toEqual(data.map((e) => e.id));
  });

  it('rejects non-arrays and invalid items', async () => {
    await expect(parseArrayChunked(TerritoryIndexEntry, {}, 'x.json')).rejects.toBeInstanceOf(
      SnapshotFileError,
    );
    await expect(
      parseArrayChunked(TerritoryIndexEntry, [{ id: 'nope' }], 'x.json'),
    ).rejects.toBeInstanceOf(SnapshotFileError);
  });
});

describe('mobile sheet states (P-UX-2)', () => {
  it('cycles collapsed → half → expanded → collapsed with explicit labels', () => {
    expect(SHEET_SNAPS[1]).toBe(SHEET_HALF);
    expect(SHEET_HALF).toBeLessThanOrEqual(0.5);
    expect(sheetStateOf(SHEET_SNAPS[0]!)).toBe('collapsed');
    expect(nextSheetSnap(SHEET_SNAPS[0]!)).toBe(SHEET_SNAPS[1]);
    expect(nextSheetSnap(SHEET_SNAPS[1]!)).toBe(SHEET_SNAPS[2]);
    expect(nextSheetSnap(SHEET_SNAPS[2]!)).toBe(SHEET_SNAPS[0]);
    expect(SHEET_TOGGLE_LABEL.half).toBe('Expandir painel');
  });
});

describe('idle scheduling (P-PERF-1)', () => {
  afterEach(() => vi.useRealTimers());

  it('runs after load + frames, and can be cancelled', async () => {
    const cb = vi.fn();
    whenIdle(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    const cb2 = vi.fn();
    const cancel = whenIdle(cb2);
    cancel();
    await new Promise((r) => setTimeout(r, 60));
    expect(cb2).not.toHaveBeenCalled();
  });
});
