import { Hono } from 'hono';
import { z } from 'zod';
import { TerritoryId, type TerritoryDetail } from '../../shared/contracts/territory.ts';
import { municipalityIdOf } from '../../shared/contracts/snapshot.ts';
import { normalizeText } from '../../shared/schemas/normalize.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parse } from '../http.ts';
import { cachePublic } from '../middleware/cache.ts';
import { toSearchItem, toTerritorySummary } from '../services/projections.ts';

export const territories = new Hono<AppBindings>();

const SearchQuery = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

const TYPE_ORDER = { state: 0, municipality: 1, neighborhood: 2 } as const;

territories.get('/territories/search', cachePublic(60), async (c) => {
  const { q, limit } = parse(SearchQuery, c.req.query());
  const needle = normalizeText(q).replace(/[^a-z0-9 ]/g, '').trim();
  if (needle.length < 2) throw fail('VALIDATION_ERROR', undefined, { q: 'Digite ao menos 2 letras.' });
  const rows = await c.get('deps').repo.searchTerritories(needle, limit);
  const items = rows
    .sort((a, b) => {
      const pa = a.normalized_name.startsWith(needle) ? 0 : 1;
      const pb = b.normalized_name.startsWith(needle) ? 0 : 1;
      return pa - pb || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.normalized_name.localeCompare(b.normalized_name);
    })
    .slice(0, limit)
    .map(toSearchItem);
  return ok(c, { items });
});

function territoryIdParam(raw: string | undefined): string {
  const r = TerritoryId.safeParse(raw);
  if (!r.success) throw fail('NOT_FOUND');
  return r.data;
}

territories.get('/territories/:id', cachePublic(60), async (c) => {
  const id = territoryIdParam(c.req.param('id'));
  const { repo } = c.get('deps');
  const lineage = [...new Set(['mg', municipalityIdOf(id), id].filter((x): x is string => Boolean(x)))];
  const rows = await repo.getTerritories(lineage);
  const self = rows.find((r) => r.id === id);
  if (!self) throw fail('NOT_FOUND');
  const breadcrumb = lineage
    .map((lid) => rows.find((r) => r.id === lid))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({ id: r.id, type: r.type, name: r.name, slug: r.slug }));
  const detail: TerritoryDetail = {
    ...toTerritorySummary(self),
    breadcrumb,
    children_count: self.type === 'neighborhood' ? 0 : await repo.countChildren(id),
    coverage_note:
      self.type === 'neighborhood'
        ? 'Bairro aproximado a partir dos endereços dos locais de votação; não é um limite oficial.'
        : null,
  };
  return ok(c, detail);
});

/** Metrics are served ONLY from the static snapshot (`/data/...`), never from a database. */
territories.get('/territories/:id/metrics', (_c) => {
  throw fail(
    'NOT_FOUND',
    'Indicadores eleitorais são publicados apenas no snapshot estático em /data/manifest.json; esta API não os serve.',
  );
});
