/**
 * "Por que Minas decide" as an infographic (owner decision D34): each tile = big number +
 * short label (3–6 words) + a small SVG visual + a short source. Pure: values come only from
 * highlights.json (percent on a 0–100 scale, p.p., votes/people as integers). Returns null
 * when the file lacks the expected ids (the strip then falls back to plain cards).
 */
import type { Highlights } from '@shared/contracts/snapshot.ts';

type Item = Highlights['items'][number];

export interface DuelRound {
  label: string;
  lula: { share: number; votes: number | null };
  bolsonaro: { share: number; votes: number | null; name: string };
  /** Published Lula − Bolsonaro margin in p.p. of valid votes (compare value of the margin id). */
  marginPp: number | null;
}

export interface Infographic {
  national: { sharePct: number; rank: number; ufs: number | null; eligible: number };
  duel: DuelRound[];
  margin2022: { votes: number; pp: number };
  municipalities: { total: number; lula: number | null; bolsonaro: number | null };
  turnout: {
    eligible: number;
    turnout: number;
    abstention: number;
    blankNull: number | null;
  };
  neither: { people: number; pctEligible: number | null } | null;
}

export function buildInfographic(h: Highlights | null | undefined): Infographic | null {
  if (!h) return null;
  const m = new Map<string, Item>(h.items.map((i) => [i.id, i]));
  const v = (id: string) => m.get(id)?.value ?? null;
  const cmp = (id: string) => m.get(id)?.compare_value ?? null;

  const eligible = v('mg_eligible_2026');
  const sharePct = v('mg_share_national_eligible_2026');
  const rank = v('mg_rank_eligible_2026');
  const turnout = v('mg_turnout_2026_r1');
  const abstention = v('mg_abstention_2026_r1') ?? v('mg_2026_r1_abstention_votes');
  const margin22 = v('mg_2022_r2_margin_votes');
  const margin22pp = cmp('mg_2022_r2_margin_votes');
  if (
    eligible === null ||
    sharePct === null ||
    rank === null ||
    turnout === null ||
    abstention === null ||
    margin22 === null ||
    margin22pp === null
  )
    return null;

  const round = (
    label: string,
    lulaVotes: string,
    bolsoVotes: string,
    bolsoName: string,
    marginId: string,
    lulaShare?: string,
    bolsoShare?: string,
  ): DuelRound | null => {
    const ls = lulaShare ? v(lulaShare) : cmp(lulaVotes);
    const bs = bolsoShare ? v(bolsoShare) : cmp(bolsoVotes);
    if (ls === null || bs === null) return null;
    return {
      label,
      lula: { share: ls, votes: v(lulaVotes) },
      bolsonaro: { share: bs, votes: v(bolsoVotes), name: bolsoName },
      marginPp: cmp(marginId),
    };
  };
  const duel = [
    round(
      '2022 · 1º turno',
      'mg_2022_r1_lula_votes',
      'mg_2022_r1_bolsonaro_votes',
      'Jair Bolsonaro',
      'mg_2022_r1_margin_votes',
    ),
    round(
      '2022 · 2º turno',
      'mg_2022_r2_lula_votes',
      'mg_2022_r2_bolsonaro_votes',
      'Jair Bolsonaro',
      'mg_2022_r2_margin_votes',
    ),
    round(
      '2026 · 1º turno',
      'mg_2026_r1_lula_votes',
      'mg_2026_r1_flavio_votes',
      'Flávio Bolsonaro',
      'mg_2026_r1_margin_votes',
      'mg_2026_r1_lula_share',
      'mg_2026_r1_flavio_share',
    ),
  ].filter((r): r is DuelRound => !!r);

  const neither = v('mg_2026_r1_neither_of_two');
  return {
    national: { sharePct, rank, ufs: cmp('mg_rank_eligible_2026'), eligible },
    duel,
    margin2022: { votes: margin22, pp: margin22pp },
    municipalities: {
      total: v('mg_municipalities') ?? 853,
      lula: v('mg_2026_r1_municipalities_led_lula'),
      bolsonaro: v('mg_2026_r1_municipalities_led_bolsonaro'),
    },
    turnout: { eligible, turnout, abstention, blankNull: v('mg_2026_r1_blank_null_votes') },
    neither:
      neither === null ? null : { people: neither, pctEligible: cmp('mg_2026_r1_neither_of_two') },
  };
}

/** 5.405.888 → "5,4 mi"; 49.650 → "49,7 mil". */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  const fmt = (x: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(x);
  if (abs >= 1e6) return `${fmt(n / 1e6)} mi`;
  if (abs >= 1e4) return `${fmt(n / 1e3)} mil`;
  return new Intl.NumberFormat('pt-BR').format(n);
}
