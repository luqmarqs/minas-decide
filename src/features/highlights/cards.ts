import type { Highlights } from '@shared/contracts/snapshot.ts';
import { compareLine, formatHighlightValue, formatPercent100, type HighlightItem } from './format';

export interface StripCard {
  key: string;
  label: string;
  value: string;
  detail: string[];
  note: string | null;
  source: string;
}

const byId = (items: HighlightItem[]) => new Map(items.map((i) => [i.id, i]));

function simpleCard(item: HighlightItem, extra: string[] = [], signed = false): StripCard {
  const line = compareLine(item);
  return {
    key: item.id,
    label: item.label,
    value: formatHighlightValue(item, { signed }),
    detail: [...(line ? [line] : []), ...extra],
    note: item.note,
    source: item.source,
  };
}

/**
 * Picks 4–6 cards from highlights.json (ids produced by scripts/tse/highlights.ts). Known
 * ids get a curated layout (eleitorado + share/rank, municipalities, 2026 1st round,
 * 2022 2nd-round margin, turnout/abstention); any other file still renders its first
 * items generically. Pure: no number is computed, only combined for display.
 */
export function buildStripCards(h: Highlights): StripCard[] {
  const m = byId(h.items);
  const cards: StripCard[] = [];
  const used = new Set<string>();
  const take = (id: string) => {
    const it = m.get(id);
    if (it) used.add(id);
    return it;
  };

  const eligible = take('mg_eligible_2026');
  if (eligible) {
    const share = take('mg_share_national_eligible_2026');
    const rank = take('mg_rank_eligible_2026');
    const extra: string[] = [];
    if (share) extra.push(`${formatPercent100(share.value)} do eleitorado do Brasil`);
    if (rank)
      extra.push(
        `${formatHighlightValue(rank)} maior colégio${rank.compare_value ? ` entre ${rank.compare_value} UFs` : ''}`,
      );
    cards.push({
      ...simpleCard(eligible),
      detail: extra.length ? extra : simpleCard(eligible).detail,
      source: [eligible.source, share?.source, rank?.source]
        .filter((s, i, a): s is string => !!s && a.indexOf(s) === i)
        .join(' · '),
    });
  }

  const munis = take('mg_municipalities');
  if (munis) cards.push(simpleCard(munis));

  const lula26 = take('mg_2026_r1_lula_share');
  const flavio26 = take('mg_2026_r1_flavio_share');
  const margin26 = take('mg_2026_r1_margin_votes');
  if (lula26 && flavio26) {
    cards.push({
      key: 'mg_2026_r1_duel',
      label: 'Minas no 1º turno de 2026 — Lula × Flávio Bolsonaro (% dos válidos)',
      value: `${formatHighlightValue(lula26)} × ${formatHighlightValue(flavio26)}`,
      detail: margin26
        ? [`diferença de ${formatHighlightValue(margin26, { signed: true })} votos`]
        : [],
      note: margin26?.note ?? null,
      source: lula26.source,
    });
  } else if (margin26) {
    cards.push(simpleCard(margin26, [], true));
  }

  const margin22 = take('mg_2022_r2_margin_votes');
  if (margin22) {
    const c = simpleCard(margin22, [], true);
    cards.push({ ...c, value: `${c.value} votos` });
  }

  const turnout = take('mg_turnout_2026_r1');
  if (turnout) {
    const abst = take('mg_abstention_2026_r1');
    const extra = abst ? [`abstenção: ${compareLine(abst) ?? formatHighlightValue(abst)}`] : [];
    cards.push(simpleCard(turnout, extra));
  }

  // Unknown files: show their first items as they come.
  for (const it of h.items) {
    if (cards.length >= 4) break;
    if (!used.has(it.id)) {
      used.add(it.id);
      cards.push(simpleCard(it));
    }
  }
  return cards.slice(0, 6);
}
