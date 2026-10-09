/**
 * Map colours come ONLY from tokens (--map-*) read at runtime, so retheming and
 * dark mode need no code change. Sequential scale for magnitudes, diverging scale
 * for 2022→2026 deltas; no value is encoded as a moral judgement.
 */
import { cssVar } from '@/lib/media';

export interface MapPalette {
  sequential: [string, string, string, string, string];
  diverging: [string, string, string];
  none: string;
  stroke: string;
  selected: string;
  activity: string;
  surface: string;
  surfaceAlt: string;
  textPrimary: string;
}

export const SEQUENTIAL_VARS = [
  '--map-fill-low',
  '--map-fill-mid-low',
  '--map-fill-mid',
  '--map-fill-mid-high',
  '--map-fill-high',
] as const;
export const DIVERGING_VARS = [
  '--map-diverging-neg',
  '--map-diverging-zero',
  '--map-diverging-pos',
] as const;

export function readMapPalette(): MapPalette {
  // Fallbacks are only used where CSS is unavailable (tests); they mirror tokens.css.
  return {
    sequential: [
      cssVar('--map-fill-low', 'rgb(233,239,232)'),
      cssVar('--map-fill-mid-low', 'rgb(168,199,180)'),
      cssVar('--map-fill-mid', 'rgb(95,154,124)'),
      cssVar('--map-fill-mid-high', 'rgb(47,109,83)'),
      cssVar('--map-fill-high', 'rgb(22,62,47)'),
    ],
    diverging: [
      cssVar('--map-diverging-neg', 'rgb(180,87,47)'),
      cssVar('--map-diverging-zero', 'rgb(236,231,222)'),
      cssVar('--map-diverging-pos', 'rgb(47,109,83)'),
    ],
    none: cssVar('--map-fill-none', 'rgb(216,210,198)'),
    stroke: cssVar('--map-stroke', 'rgb(27,26,22)'),
    selected: cssVar('--map-selected', 'rgb(194,119,26)'),
    activity: cssVar('--map-activity', 'rgb(194,119,26)'),
    surface: cssVar('--color-surface', 'rgb(246,243,238)'),
    surfaceAlt: cssVar('--color-surface-alt', 'rgb(236,231,222)'),
    textPrimary: cssVar('--color-text-primary', 'rgb(27,26,22)'),
  };
}

/** Normalised domain with strictly increasing bounds. */
export function safeDomain(
  domain: [number, number] | undefined,
  diverging: boolean,
): [number, number] {
  let [a, b] = domain ?? [0, 1];
  if (!Number.isFinite(a) || !Number.isFinite(b)) [a, b] = [0, 1];
  if (diverging) {
    const m = Math.max(Math.abs(a), Math.abs(b), 0.1);
    return [-m, m];
  }
  if (b <= a) b = a + 1e-6;
  return [a, b];
}

/** 0..4 bucket index of a value inside the domain (for DOM swatches). */
export function bucketIndex(v: number, domain: [number, number]): number {
  const [a, b] = domain;
  const t = b > a ? (v - a) / (b - a) : 0;
  return Math.max(0, Math.min(4, Math.floor(t * 5 - 1e-9)));
}

/** CSS var name for a value (sequential buckets or diverging sign). */
export function swatchVar(
  v: number | null | undefined,
  domain: [number, number],
  diverging: boolean,
): string {
  if (v === null || v === undefined) return 'var(--map-fill-none)';
  if (diverging) {
    const m = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
    if (Math.abs(v) < m * 0.1) return 'var(--map-diverging-zero)';
    return v < 0 ? 'var(--map-diverging-neg)' : 'var(--map-diverging-pos)';
  }
  return `var(${SEQUENTIAL_VARS[bucketIndex(v, domain)]})`;
}
