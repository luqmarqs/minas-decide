import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CandidateIndex,
  Methodology,
  MunicipalityMetricsFile,
} from '@shared/contracts/snapshot.ts';
import { MapLayerValues, SnapshotManifest } from '@shared/contracts/metrics.ts';
import { TerritoryIndexEntry, TerritoryId } from '@shared/contracts/territory.ts';
import { buildDemoSnapshot } from '@/fixtures/electoral/demo';
import { StatusBadge } from './MapLegend';
import { loadSnapshot } from './snapshot';

const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': type },
  });

describe('loadSnapshot', () => {
  it('falls back to DEMO when the manifest is missing (404)', async () => {
    const fetchImpl = vi.fn(async () => json('not found', 404, 'text/plain'));
    const snap = await loadSnapshot({ fetchImpl, base: '/data' });
    expect(fetchImpl).toHaveBeenCalledWith('/data/manifest.json', expect.anything());
    expect(snap.mode).toBe('demo');
    expect(snap.status).toBe('demo');
    expect(snap.fallbackReason).toMatch(/404/);
    render(createElement(StatusBadge, { status: snap.status }));
    expect(screen.getByText('DADOS DEMONSTRATIVOS')).toBeInTheDocument();
  });

  it('falls back to DEMO on network error, HTML (SPA fallback) or invalid manifest', async () => {
    const network = await loadSnapshot({
      fetchImpl: async () => Promise.reject(new TypeError('offline')),
    });
    expect(network.mode).toBe('demo');
    const html = await loadSnapshot({
      fetchImpl: async () => json('<!doctype html>', 200, 'text/html'),
    });
    expect(html.mode).toBe('demo');
    const invalid = await loadSnapshot({ fetchImpl: async () => json({ schema_version: 99 }) });
    expect(invalid.mode).toBe('demo');
  });

  it('uses the remote snapshot when the manifest is valid, keeping its status', async () => {
    const manifest = {
      ...buildDemoSnapshot().manifest,
      release_id: 'r-2026-10',
      status: 'partial',
    };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.json')) return json(manifest);
      if (url.endsWith('/r-2026-10/territories-index.json')) return json(buildDemoSnapshot().index);
      return json('nope', 404, 'text/plain');
    });
    const snap = await loadSnapshot({ fetchImpl, base: '/data' });
    expect(snap.mode).toBe('remote');
    expect(snap.status).toBe('partial');
    expect((await snap.getIndex()).length).toBeGreaterThan(10);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/data/r-2026-10/territories-index.json',
      expect.anything(),
    );
    // Missing per-municipality file → null (not an error, not invented data).
    expect(await snap.getMunicipalityMetrics('mg-3100104')).toBeNull();
    expect(await snap.getLayer(2026, 1, 'abstention')).toBeNull();
  });

  it('rejects remote files that violate the contract', async () => {
    const manifest = { ...buildDemoSnapshot().manifest, release_id: 'r1', status: 'validated' };
    const snap = await loadSnapshot({
      fetchImpl: async (url: string) =>
        url.endsWith('/manifest.json') ? json(manifest) : json([{ id: 'x' }]),
    });
    await expect(snap.getIndex()).rejects.toThrow(/schema/);
  });
});

describe('DEMO fixture', () => {
  const demo = buildDemoSnapshot();

  it('conforms to the snapshot contracts', () => {
    expect(SnapshotManifest.safeParse(demo.manifest).success).toBe(true);
    expect(demo.index.every((e) => TerritoryIndexEntry.safeParse(e).success)).toBe(true);
    expect(Methodology.safeParse(demo.methodology).success).toBe(true);
    expect(CandidateIndex.safeParse(demo.candidates).success).toBe(true);
    for (const f of Object.values(demo.metrics))
      expect(MunicipalityMetricsFile.safeParse(f).success).toBe(true);
    for (const l of Object.values(demo.layers))
      expect(MapLayerValues.safeParse(l).success).toBe(true);
  });

  it('is labelled demo everywhere and uses only fictitious candidates', () => {
    expect(demo.manifest.status).toBe('demo');
    expect(demo.index.every((e) => e.data_quality === 'demo')).toBe(true);
    for (const c of demo.candidates.items) {
      expect(c.ballot_name).toMatch(/^Candidatura [A-Z]$/);
      expect(c.party).toBe('PARTIDO DEMO');
      expect(c.number).toBeGreaterThanOrEqual(900);
    }
    for (const f of Object.values(demo.metrics)) {
      for (const m of [...f.self, ...Object.values(f.children).flat()]) {
        expect(m.status).toBe('demo');
        for (const list of Object.values(m.results)) {
          for (const r of list ?? []) expect(r.ballot_name).toMatch(/^Candidatura [A-Z]$/);
        }
      }
    }
  });

  it('has ~12 municipalities with valid ids, one without neighborhoods, and a shared "Centro"', () => {
    const munis = demo.index.filter((e) => e.type === 'municipality');
    expect(munis).toHaveLength(12);
    expect(
      munis.every((m) => /^mg-31\d{5}$/.test(m.id) && TerritoryId.safeParse(m.id).success),
    ).toBe(true);
    const childless = munis.filter((m) => !demo.index.some((e) => e.parent_id === m.id));
    expect(childless.map((m) => m.name)).toEqual(['Ribeirão Fictício']);
    expect(
      demo.index.filter((e) => e.type === 'neighborhood' && e.name === 'Centro').length,
    ).toBeGreaterThan(1);
  });

  it('keeps counts internally consistent (válidos + brancos + nulos = comparecimento)', () => {
    for (const f of Object.values(demo.metrics)) {
      for (const m of f.self) {
        const t = m.turnout!;
        expect(t.valid + t.blank + t.null_votes).toBe(t.turnout);
        expect(t.abstention).toBe(t.eligible - t.turnout);
        const gov = m.results.governor ?? [];
        expect(gov.reduce((a, c) => a + c.votes, 0)).toBe(m.valid_by_office.governor);
      }
    }
  });
});
