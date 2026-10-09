/**
 * DATA-6 — official neighbourhood limits (IBGE Censo 2022 "bairros", or owner-provided files):
 * name matching against the snapshot neighbourhood ids. Pure, no I/O.
 */
import { slugify } from '../../shared/schemas/normalize.ts';

/** Prefixes removed only when the direct slug does not match (spec DATA-6 §3). */
export const STRIPPABLE_PREFIXES = ['bairro-', 'vila-'] as const;

export function stripPrefix(slug: string): string {
  for (const p of STRIPPABLE_PREFIXES)
    if (slug.startsWith(p) && slug.length > p.length) return slug.slice(p.length);
  return slug;
}

export interface MatchResult {
  /** index slug → official slug */
  matched: Map<string, string>;
  /** how each pair matched */
  how: Map<string, 'direct' | 'prefix'>;
  unmatchedOfficial: string[];
  unmatchedIndex: string[];
}

/**
 * Matches neighbourhood slugs of one municipality. Pass 1: identical slug. Pass 2 (remaining only):
 * slugs equal after removing a "bairro-"/"vila-" prefix on either side, accepted only when the
 * stripped key is unique on both sides (no guessing between two candidates).
 */
export function matchNeighbourhoods(
  indexSlugs: Iterable<string>,
  officialSlugs: Iterable<string>,
): MatchResult {
  const idx = new Set(indexSlugs);
  const off = new Set(officialSlugs);
  const matched = new Map<string, string>();
  const how = new Map<string, 'direct' | 'prefix'>();
  for (const s of idx)
    if (off.has(s)) {
      matched.set(s, s);
      how.set(s, 'direct');
    }
  const usedOff = new Set(matched.values());
  const group = (slugs: Iterable<string>) => {
    const m = new Map<string, string[]>();
    for (const s of slugs) {
      const k = stripPrefix(s);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  };
  const restIdx = group([...idx].filter((s) => !matched.has(s)));
  const restOff = group([...off].filter((s) => !usedOff.has(s)));
  for (const [k, list] of restIdx) {
    const cands = restOff.get(k);
    if (list.length === 1 && cands?.length === 1) {
      matched.set(list[0]!, cands[0]!);
      how.set(list[0]!, 'prefix');
      usedOff.add(cands[0]!);
    }
  }
  return {
    matched,
    how,
    unmatchedOfficial: [...off].filter((s) => !usedOff.has(s)).sort(),
    unmatchedIndex: [...idx].filter((s) => !matched.has(s)).sort(),
  };
}

/** Slug used for official names: the same `slugify` as the snapshot ids. */
export const officialSlug = (name: string): string => slugify(name) || 'sem-bairro';

/** First non-empty string property among `keys` (case-insensitive). */
export function pickProp(
  props: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  const lower = new Map(Object.entries(props).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}
