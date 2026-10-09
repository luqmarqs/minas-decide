/**
 * "Por que Minas decide" key numbers (Highlights contract). Pure: every number is computed from the
 * 2026 snapshot (state metrics, conferred against TSE in docs/TSE_SAMPLE_REPORT.md) and the TSE open-data
 * aggregates written by fetch-2022.ts. No hand-typed figures, no unverifiable historical claims.
 */
import type { TerritoryMetrics } from '../../shared/contracts/metrics.ts';
import type { Highlights } from '../../shared/contracts/snapshot.ts';
import {
  margin,
  share,
  ufRank,
  type National2026File,
  type President2022File,
} from './president-2022.ts';

const pct = (x: number) => Math.round(x * 10000) / 100; // 0..1 → percent with 2 decimals
const fmtInt = (n: number) => n.toLocaleString('pt-BR');
const fmtPct = (n: number, d = 2) => n.toFixed(d).replace('.', ',');
const fmtMi = (n: number) => fmtPct(n / 1e6, 1);

export interface HighlightInput {
  releaseId: string;
  municipalities: number;
  state2026: TerritoryMetrics;
  tse2022: President2022File;
  national2026: National2026File;
  /** municipalities led by each candidate (president_margin layers) */
  leaders: {
    r1_2026: { lula: number; bolsonaro: number };
    r2_2022: { lula: number; bolsonaro: number };
  };
}

export function buildHighlights(i: HighlightInput): Highlights {
  const t = i.state2026.turnout;
  if (!t) throw new Error('highlights: state turnout missing');
  const pres = i.state2026.president_comparison;
  const lula = pres?.entries.find((e) => e.key === 'lula');
  const bolso = pres?.entries.find((e) => e.key === 'bolsonaro');
  if (!lula || !bolso || lula.votes_2026_r1 === null || bolso.votes_2026_r1 === null)
    throw new Error('highlights: presidential comparison missing at state level');

  const src26 = `Snapshot ${i.releaseId} (1º turno de 2026, conferido com o TSE em docs/TSE_SAMPLE_REPORT.md)`;
  const n26 = i.national2026.source;
  const srcNat26 = `TSE, Dados Abertos — ${n26.url.split('/').pop()} [${n26.entries.join(', ')}], Presidente, 1º turno (Last-Modified ${n26.last_modified})`;
  const s22 = (key: string) => i.tse2022.sources.find((s) => s.key === key);
  const det22 = s22('detalhe_votacao_munzona_2022');
  const cand22 = s22('votacao_candidato_munzona_2022');
  const src22 = `TSE, Dados Abertos — ${cand22?.url.split('/').pop()} e ${det22?.url.split('/').pop()} [entrada _BR], Presidente (Last-Modified ${cand22?.last_modified} / ${det22?.last_modified})`;

  const natEligible = Object.values(i.national2026.by_uf).reduce((a, u) => a + u.eligible, 0);
  const natEligibleNoZZ = Object.entries(i.national2026.by_uf)
    .filter(([k]) => k !== 'ZZ')
    .reduce((a, [, u]) => a + u.eligible, 0);
  const mgEligibleTse = i.national2026.by_uf['MG']?.eligible ?? null;
  if (mgEligibleTse !== null && mgEligibleTse !== t.eligible)
    throw new Error(`highlights: MG eligible snapshot ${t.eligible} != TSE ${mgEligibleTse}`);
  const ufs = Object.keys(i.national2026.by_uf).filter((k) => k !== 'ZZ').length;
  const rank = ufRank(i.national2026.by_uf, 'MG');
  const shareNat = pct(t.eligible / natEligible);

  const mg22 = i.tse2022.state_mg;
  const br22 = i.tse2022.national;
  const m1 = margin(mg22.r1);
  const m2 = margin(mg22.r2);
  const mBr2 = margin(br22.r2);
  const lula22r2 = pct(share(mg22.r2.lula, mg22.r2.valid)!);
  const bolso22r2 = pct(share(mg22.r2.bolsonaro, mg22.r2.valid)!);
  const lulaBr22r2 = pct(share(br22.r2.lula, br22.r2.valid)!);
  const bolsoBr22r2 = pct(share(br22.r2.bolsonaro, br22.r2.valid)!);
  const lula22r1 = pct(share(mg22.r1.lula, mg22.r1.valid)!);
  const bolso22r1 = pct(share(mg22.r1.bolsonaro, mg22.r1.valid)!);
  const lula26 = pct(lula.share_2026_r1!);
  const flavio26 = pct(bolso.share_2026_r1!);
  const valid26 = lula.valid_2026_r1!;
  const m26 = margin({ lula: lula.votes_2026_r1, bolsonaro: bolso.votes_2026_r1, valid: valid26 });
  const mgShareBrValid22r2 = pct(mg22.r2.valid / br22.r2.valid);

  type Item = Highlights['items'][number];
  const item = (
    o: Omit<Item, 'compare_value' | 'compare_label' | 'note'> & Partial<Item>,
  ): Item => ({
    compare_value: null,
    compare_label: null,
    note: null,
    ...o,
  });

  const items: Item[] = [
    item({
      id: 'mg_eligible_2026',
      label: 'Eleitorado apto em Minas Gerais (2026)',
      value: t.eligible,
      unit: 'people',
      compare_value: natEligible,
      compare_label: 'eleitorado apto no Brasil, inclui exterior (2026)',
      source: `${src26}; total nacional: ${srcNat26}`,
    }),
    item({
      id: 'mg_share_national_eligible_2026',
      label: 'Participação de MG no eleitorado nacional (2026)',
      value: shareNat,
      unit: 'percent',
      compare_value: pct(t.eligible / natEligibleNoZZ),
      compare_label: 'sem o eleitorado do exterior (%)',
      note: 'Percentual em escala 0–100.',
      source: srcNat26,
    }),
    item({
      id: 'mg_rank_eligible_2026',
      label: 'Posição de MG entre as UFs por eleitorado apto (2026)',
      value: rank,
      unit: 'count',
      compare_value: ufs,
      compare_label: 'unidades da federação',
      source: srcNat26,
    }),
    item({
      id: 'mg_municipalities',
      label: 'Municípios de Minas Gerais',
      value: i.municipalities,
      unit: 'count',
      source: src26,
    }),
    item({
      id: 'mg_turnout_2026_r1',
      label: 'Comparecimento em MG (1º turno de 2026)',
      value: t.turnout,
      unit: 'people',
      compare_value: pct(t.turnout_rate),
      compare_label: '% do eleitorado apto',
      source: src26,
    }),
    item({
      id: 'mg_abstention_2026_r1',
      label: 'Abstenção em MG (1º turno de 2026)',
      value: t.abstention,
      unit: 'people',
      compare_value: pct(t.abstention_rate),
      compare_label: '% do eleitorado apto',
      source: src26,
    }),
    item({
      id: 'mg_2026_r1_lula_votes',
      label: 'Lula em MG — votos (1º turno de 2026)',
      value: lula.votes_2026_r1,
      unit: 'votes',
      compare_value: lula26,
      compare_label: '% dos votos válidos',
      source: src26,
    }),
    item({
      id: 'mg_2026_r1_flavio_votes',
      label: 'Flávio Bolsonaro em MG — votos (1º turno de 2026)',
      value: bolso.votes_2026_r1,
      unit: 'votes',
      compare_value: flavio26,
      compare_label: '% dos votos válidos',
      source: src26,
    }),
    item({
      id: 'mg_2026_r1_lula_share',
      label: 'Lula em MG — % dos válidos (1º turno de 2026)',
      value: lula26,
      unit: 'percent',
      source: src26,
    }),
    item({
      id: 'mg_2026_r1_flavio_share',
      label: 'Flávio Bolsonaro em MG — % dos válidos (1º turno de 2026)',
      value: flavio26,
      unit: 'percent',
      source: src26,
    }),
    item({
      id: 'mg_2026_r1_margin_votes',
      label: 'Diferença Lula − Flávio Bolsonaro em MG (1º turno de 2026)',
      value: m26.votes,
      unit: 'votes',
      compare_value: m26.pp,
      compare_label: 'p.p. dos válidos',
      note: 'Valor negativo: Flávio Bolsonaro à frente.',
      source: src26,
    }),
    item({
      id: 'mg_2022_r1_lula_votes',
      label: 'Lula em MG — votos (1º turno de 2022)',
      value: mg22.r1.lula,
      unit: 'votes',
      compare_value: lula22r1,
      compare_label: '% dos votos válidos',
      source: src22,
    }),
    item({
      id: 'mg_2022_r1_bolsonaro_votes',
      label: 'Jair Bolsonaro em MG — votos (1º turno de 2022)',
      value: mg22.r1.bolsonaro,
      unit: 'votes',
      compare_value: bolso22r1,
      compare_label: '% dos votos válidos',
      source: src22,
    }),
    item({
      id: 'mg_2022_r1_margin_votes',
      label: 'Diferença Lula − Bolsonaro em MG (1º turno de 2022)',
      value: m1.votes,
      unit: 'votes',
      compare_value: m1.pp,
      compare_label: 'p.p. dos válidos',
      source: src22,
    }),
    item({
      id: 'mg_2022_r2_lula_votes',
      label: 'Lula em MG — votos (2º turno de 2022)',
      value: mg22.r2.lula,
      unit: 'votes',
      compare_value: lula22r2,
      compare_label: '% dos votos válidos',
      source: src22,
    }),
    item({
      id: 'mg_2022_r2_bolsonaro_votes',
      label: 'Jair Bolsonaro em MG — votos (2º turno de 2022)',
      value: mg22.r2.bolsonaro,
      unit: 'votes',
      compare_value: bolso22r2,
      compare_label: '% dos votos válidos',
      source: src22,
    }),
    item({
      id: 'mg_2022_r2_margin_votes',
      label: 'Diferença Lula − Bolsonaro em MG (2º turno de 2022)',
      value: m2.votes,
      unit: 'votes',
      compare_value: m2.pp,
      compare_label: 'p.p. dos válidos',
      source: src22,
    }),
    item({
      id: 'br_2022_r2_lula_share',
      label: 'Lula no Brasil — % dos válidos (2º turno de 2022)',
      value: lulaBr22r2,
      unit: 'percent',
      compare_value: br22.r2.lula,
      compare_label: 'votos',
      source: src22,
    }),
    item({
      id: 'br_2022_r2_bolsonaro_share',
      label: 'Jair Bolsonaro no Brasil — % dos válidos (2º turno de 2022)',
      value: bolsoBr22r2,
      unit: 'percent',
      compare_value: br22.r2.bolsonaro,
      compare_label: 'votos',
      source: src22,
    }),
    item({
      id: 'br_2022_r2_margin_votes',
      label: 'Diferença Lula − Bolsonaro no Brasil (2º turno de 2022)',
      value: mBr2.votes,
      unit: 'votes',
      compare_value: mBr2.pp,
      compare_label: 'p.p. dos válidos',
      source: src22,
    }),
  ];

  // ---- municipalities led, and voters outside the Lula/Bolsonaro pair (DATA-4) ----
  const N = i.municipalities;
  const NOTE_GROUPS =
    'Soma de grupos distintos (abstenção, brancos, nulos e votos em outras candidaturas); não indica preferência nem comportamento comum dessas pessoas.';
  const lead = (
    key: 'r1_2026' | 'r2_2022',
    who: 'lula' | 'bolsonaro',
    label: string,
    src: string,
  ) =>
    item({
      id: `mg_${key === 'r1_2026' ? '2026_r1' : '2022_r2'}_municipalities_led_${who}`,
      label,
      value: i.leaders[key][who],
      unit: 'count',
      compare_value: pct(i.leaders[key][who] / N),
      compare_label: `% dos ${N} municípios`,
      note: 'Liderança = mais votos válidos entre Lula e Bolsonaro no município (diferença > 0).',
      source: src,
    });
  // 2026 r1: nulls derived as comparecimento − válidos − brancos (= TSE QT_TOTAL_VOTOS_NULOS, inclui nulos técnicos)
  const others26 = valid26 - lula.votes_2026_r1 - bolso.votes_2026_r1;
  const nulls26 = t.turnout - t.valid - t.blank;
  const bn26 = t.blank + nulls26;
  const neither26 = t.abstention + bn26 + others26;
  if (neither26 !== t.eligible - lula.votes_2026_r1 - bolso.votes_2026_r1)
    throw new Error('highlights: neither-of-the-two total inconsistent');
  const r2 = mg22.r2;
  const bn22 = r2.blank + r2.null_votes;
  const extra: Item[] = [
    lead('r1_2026', 'lula', 'Municípios onde Lula liderou (1º turno de 2026)', src26),
    lead(
      'r1_2026',
      'bolsonaro',
      'Municípios onde Flávio Bolsonaro liderou (1º turno de 2026)',
      src26,
    ),
    lead('r2_2022', 'lula', 'Municípios onde Lula liderou (2º turno de 2022)', src22),
    lead(
      'r2_2022',
      'bolsonaro',
      'Municípios onde Jair Bolsonaro liderou (2º turno de 2022)',
      src22,
    ),
    item({
      id: 'mg_2026_r1_other_candidates_votes',
      label: 'Votos em outras candidaturas a Presidente em MG (1º turno de 2026)',
      value: others26,
      unit: 'votes',
      compare_value: pct(others26 / valid26),
      compare_label: '% dos votos válidos',
      note: 'Votos válidos menos os de Lula e de Flávio Bolsonaro.',
      source: src26,
    }),
    item({
      id: 'mg_2026_r1_blank_null_votes',
      label: 'Brancos e nulos para Presidente em MG (1º turno de 2026)',
      value: bn26,
      unit: 'votes',
      compare_value: pct(bn26 / t.turnout),
      compare_label: '% do comparecimento',
      note: `Brancos ${t.blank} + nulos ${nulls26} (nulos = comparecimento − válidos − brancos; inclui 561 nulos técnicos do TSE). ${NOTE_GROUPS}`,
      source: src26,
    }),
    item({
      id: 'mg_2026_r1_abstention_votes',
      label: 'Abstenção em MG (1º turno de 2026)',
      value: t.abstention,
      unit: 'people',
      compare_value: pct(t.abstention / t.eligible),
      compare_label: '% do eleitorado apto',
      source: src26,
    }),
    item({
      id: 'mg_2026_r1_neither_of_two',
      label:
        'Eleitores aptos que não votaram em Lula nem em Flávio Bolsonaro em MG (1º turno de 2026)',
      value: neither26,
      unit: 'people',
      compare_value: pct(neither26 / t.eligible),
      compare_label: '% do eleitorado apto',
      note: `Abstenção ${t.abstention} + brancos e nulos ${bn26} + outras candidaturas ${others26}. ${NOTE_GROUPS}`,
      source: src26,
    }),
    item({
      id: 'mg_2022_r2_blank_null_votes',
      label: 'Brancos e nulos para Presidente em MG (2º turno de 2022)',
      value: bn22,
      unit: 'votes',
      compare_value: pct(bn22 / r2.turnout),
      compare_label: '% do comparecimento',
      note: `Brancos ${r2.blank} + nulos ${r2.null_votes}. ${NOTE_GROUPS}`,
      source: src22,
    }),
    item({
      id: 'mg_2022_r2_abstention_votes',
      label: 'Abstenção em MG (2º turno de 2022)',
      value: r2.abstention,
      unit: 'people',
      compare_value: pct(r2.abstention / r2.eligible),
      compare_label: '% do eleitorado apto',
      source: src22,
    }),
  ];
  items.push(...extra);

  const why: Highlights['why_minas'] = [
    {
      title: `${rank}º maior colégio eleitoral`,
      text: `Minas Gerais tem ${fmtMi(t.eligible)} milhões de eleitores aptos em 2026, ${fmtPct(shareNat)} % do eleitorado do país (incluindo o exterior) — o ${rank}º maior entre as ${ufs} unidades da federação.`,
      value: shareNat,
      unit: '%',
      source: `${src26}; ${srcNat26}`,
    },
    {
      title: 'Margem estreita em 2022',
      text: `No 2º turno de 2022, Lula venceu em Minas por ${fmtInt(m2.votes)} votos (${fmtPct(m2.pp)} p.p. dos válidos): ${fmtPct(lula22r2)} % a ${fmtPct(bolso22r2)} %. No Brasil, a diferença foi de ${fmtPct(mBr2.pp)} p.p. (${fmtPct(lulaBr22r2)} % a ${fmtPct(bolsoBr22r2)} %).`,
      value: m2.votes,
      unit: 'votos',
      source: src22,
    },
    {
      title: 'Resultado de MG próximo ao nacional',
      text: `Em 2022, o percentual de Lula em Minas no 2º turno (${fmtPct(lula22r2)} %) ficou a ${fmtPct(Math.abs(lulaBr22r2 - lula22r2))} p.p. do resultado nacional (${fmtPct(lulaBr22r2)} %). Minas reuniu ${fmtPct(mgShareBrValid22r2)} % dos votos válidos do país nesse turno.`,
      value: Math.round((lulaBr22r2 - lula22r2) * 100) / 100,
      unit: 'p.p.',
      source: src22,
    },
    {
      title: '1º turno de 2026',
      text: `No 1º turno de 2026, Lula teve ${fmtPct(lula26)} % dos votos válidos em Minas (${fmtInt(lula.votes_2026_r1)} votos) e Flávio Bolsonaro, ${fmtPct(flavio26)} % (${fmtInt(bolso.votes_2026_r1)} votos). Em 2022, no 1º turno, Lula teve ${fmtPct(lula22r1)} % e Jair Bolsonaro, ${fmtPct(bolso22r1)} %.`,
      value: lula26,
      unit: '%',
      source: `${src26}; ${src22}`,
    },
    {
      title: 'Participação',
      text: `Compareceram ${fmtMi(t.turnout)} milhões de eleitores no 1º turno de 2026 (${fmtPct(pct(t.turnout_rate))} % do eleitorado apto); a abstenção foi de ${fmtPct(pct(t.abstention_rate))} % em ${fmtInt(i.municipalities)} municípios.`,
      value: pct(t.turnout_rate),
      unit: '%',
      source: src26,
    },
  ];
  return { generated_at: new Date().toISOString(), items, why_minas: why };
}
