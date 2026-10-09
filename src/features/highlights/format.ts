/**
 * Formatting of "por que Minas decide" numbers (Highlights contract). Percent values
 * in highlights.json are on a 0–100 scale; p.p. are percentage points; people, votes and
 * counts are integers. Nothing here invents a number: it only formats file values.
 */
import type { Highlights } from '@shared/contracts/snapshot.ts';
import { formatInt, formatPercent, formatPp, formatSignedInt } from '@/lib/format';

export type HighlightItem = Highlights['items'][number];

/** 0–100 percent value → "10,4%". */
export function formatPercent100(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return formatPercent(v / 100, digits);
}

export function formatHighlightValue(item: HighlightItem, opts: { signed?: boolean } = {}) {
  const v = item.value;
  switch (item.unit) {
    case 'percent':
      return formatPercent100(v);
    case 'pp':
      return formatPp(v);
    case 'count':
      return /rank/.test(item.id) ? `${formatInt(v)}º` : formatInt(v);
    case 'people':
    case 'votes':
      return opts.signed ? formatSignedInt(v) : formatInt(v);
    default:
      return formatInt(v);
  }
}

/** Secondary number, formatted from its label ("% …" → percent, "p.p." → p.p.). */
export function formatCompareValue(item: HighlightItem): string | null {
  if (item.compare_value === null || item.compare_value === undefined) return null;
  const label = (item.compare_label ?? '').trim();
  if (/^%|\(%\)/.test(label)) return formatPercent100(item.compare_value);
  if (/p\.p\./.test(label)) return formatPp(item.compare_value);
  return formatInt(item.compare_value);
}

/** "10,4% do eleitorado apto" style line, or null. */
export function compareLine(item: HighlightItem): string | null {
  const v = formatCompareValue(item);
  if (v === null) return null;
  const label = (item.compare_label ?? '')
    .replace(/^%\s*/, '')
    .replace(/\s*\(%\)$/, '')
    .replace(/^p\.p\.\s*/, '');
  return label ? `${v} ${label}` : v;
}
