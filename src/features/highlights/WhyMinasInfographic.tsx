import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatInt, formatPercent, formatPp } from '@/lib/format';
import { Carousel } from './Carousel';
import { compactNumber, type Infographic } from './infographic';

/*
 * Infographic tiles (D34). Mark specs from the dataviz method: thin bars (≤ 10 px), 2 px
 * surface gaps between touching segments, a 2 px surface ring on the dot, hairline axis,
 * text in text tokens (never in the series colour), partisan colours ONLY on the Lula ×
 * Bolsonaro marks (D25 tokens, validated: lightness band + CVD ΔE ≥ 15). Each SVG is
 * role="img" with the numbers in aria-label; bars carry <title> for hover.
 */

const pct100 = (v: number, d = 1) => formatPercent(v / 100, d);
const INK = { fill: 'var(--color-text-secondary)' } as const;
const MUTED = { fill: 'var(--color-text-muted)' } as const;

function Tile({
  big,
  label,
  source,
  children,
  className,
  testId,
}: {
  big: ReactNode;
  label: ReactNode;
  source: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <li
      data-testid={testId}
      className={cn(
        // Phones: width leaves ~28 px of the next tile visible (peek, FE-10); ≤ 160 px tall.
        'flex h-40 w-[calc(100%-1.25rem)] min-w-0 shrink-0 snap-start flex-col overflow-hidden rounded-md border border-border bg-surface-raised px-3 pt-2 pb-1.5 sm:w-[46%] md:h-auto md:min-h-40 md:w-auto',
        className,
      )}
    >
      <p className="brand-display text-[1.9rem] leading-none tabular-nums">{big}</p>
      <p className="mt-1 text-xs leading-snug font-semibold text-secondary">{label}</p>
      <div className="mt-auto pt-1">{children}</div>
      <p className="mt-0.5 text-[0.7rem] text-muted">Fonte: {source}</p>
    </li>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-[2px]"
      style={{ background: color }}
    />
  );
}

function NationalBar({ sharePct }: { sharePct: number }) {
  const w = 200;
  const fill = Math.max(2, (sharePct / 100) * w);
  return (
    <svg
      viewBox={`0 0 ${w} 10`}
      className="h-2.5 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Minas tem ${pct100(sharePct)} do eleitorado do Brasil`}
    >
      <rect x="0" y="1" width={w} height="8" rx="2" style={{ fill: 'var(--map-fill-none)' }} />
      <rect
        x="0"
        y="1"
        width={fill}
        height="8"
        rx="2"
        style={{ fill: 'var(--color-action-primary)' }}
      >
        <title>{`Minas Gerais: ${pct100(sharePct)} do eleitorado do Brasil`}</title>
      </rect>
    </svg>
  );
}

function DuelBars({ duel }: { duel: Infographic['duel'] }) {
  const W = 260;
  const labelW = 74;
  const max = 60; // % scale (shares in MG stay below 60%)
  const barW = W - labelW - 40;
  const rowH = 20;
  const aria = duel
    .map(
      (r) =>
        `${r.label}: Lula ${pct100(r.lula.share)}, ${r.bolsonaro.name} ${pct100(r.bolsonaro.share)}`,
    )
    .join('; ');
  return (
    <svg
      viewBox={`0 0 ${W} ${duel.length * rowH}`}
      // Height follows the width (scale ≈ 1.2–1.3 on phones): labels render ≥ 11 px (FE-10).
      className="h-auto w-full max-w-[22rem] md:h-[76px] md:max-w-[30rem]"
      preserveAspectRatio="xMinYMin meet"
      role="img"
      aria-label={`Votos válidos para Presidente em Minas — ${aria}`}
    >
      {duel.map((r, i) => {
        const y = i * rowH;
        const wl = (r.lula.share / max) * barW;
        const wb = (r.bolsonaro.share / max) * barW;
        return (
          <g key={r.label}>
            <text x="0" y={y + 12} fontSize="10" style={INK}>
              {r.label}
            </text>
            <rect
              x={labelW}
              y={y + 2}
              width={wl}
              height="7"
              rx="2"
              style={{ fill: 'var(--map-lula)' }}
            >
              <title>{`Lula, ${r.label}: ${pct100(r.lula.share)}${r.lula.votes !== null ? ` (${formatInt(r.lula.votes)} votos)` : ''}`}</title>
            </rect>
            <text x={labelW + wl + 3} y={y + 8.8} fontSize="9.5" style={INK}>
              {pct100(r.lula.share)}
            </text>
            <rect
              x={labelW}
              y={y + 11}
              width={wb}
              height="7"
              rx="2"
              style={{ fill: 'var(--map-bolsonaro)' }}
            >
              <title>{`${r.bolsonaro.name}, ${r.label}: ${pct100(r.bolsonaro.share)}${r.bolsonaro.votes !== null ? ` (${formatInt(r.bolsonaro.votes)} votos)` : ''}`}</title>
            </rect>
            <text x={labelW + wb + 3} y={y + 18.2} fontSize="9.5" style={INK}>
              {pct100(r.bolsonaro.share)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MarginDot({ pp, votes }: { pp: number; votes: number }) {
  const W = 220;
  const span = 2; // ±2 p.p. — a deliberately narrow scale: the 2022 margin was tiny
  const x = (v: number) => 10 + ((v + span) / (2 * span)) * (W - 20);
  const cx = x(Math.max(-span, Math.min(span, pp)));
  return (
    <svg
      viewBox={`0 0 ${W} 30`}
      className="h-auto w-full max-w-[18rem]"
      preserveAspectRatio="xMinYMid meet"
      role="img"
      aria-label={`Margem de Lula em Minas no 2º turno de 2022: ${formatPp(pp, 2)}, ${formatInt(votes)} votos, numa escala de −2 a +2 pontos percentuais`}
    >
      <line
        x1="10"
        x2={W - 10}
        y1="12"
        y2="12"
        strokeWidth="1"
        style={{ stroke: 'var(--color-border-strong)' }}
      />
      <line
        x1={x(0)}
        x2={x(0)}
        y1="6"
        y2="18"
        strokeWidth="1"
        style={{ stroke: 'var(--color-border-strong)' }}
      />
      <line
        x1={x(0)}
        x2={cx - 6}
        y1="12"
        y2="12"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ stroke: 'var(--map-lula)' }}
      />
      <circle
        cx={cx}
        cy="12"
        r="5"
        strokeWidth="2"
        style={{ fill: 'var(--map-lula)', stroke: 'var(--color-surface-raised)' }}
      >
        <title>{`Lula +${formatInt(votes)} votos (${formatPp(pp, 2)})`}</title>
      </circle>
      <text x="10" y="28.5" fontSize="9" style={MUTED}>
        −2 p.p.
      </text>
      <text x={x(0)} y="28.5" fontSize="9" textAnchor="middle" style={MUTED}>
        empate
      </text>
      <text x={W - 10} y="28.5" fontSize="9" textAnchor="end" style={MUTED}>
        +2 p.p.
      </text>
    </svg>
  );
}

function SplitBar({ lula, bolsonaro }: { lula: number; bolsonaro: number }) {
  const W = 220;
  const total = lula + bolsonaro;
  const wl = (lula / total) * W - 1;
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} 10`}
        className="h-2.5 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Em 2026, Lula liderou em ${lula} municípios e Flávio Bolsonaro em ${bolsonaro}`}
      >
        <rect x="0" y="1" width={wl} height="8" rx="2" style={{ fill: 'var(--map-lula)' }}>
          <title>{`Lula liderou em ${lula} municípios`}</title>
        </rect>
        <rect
          x={wl + 2}
          y="1"
          width={W - wl - 2}
          height="8"
          rx="2"
          style={{ fill: 'var(--map-bolsonaro)' }}
        >
          <title>{`Flávio Bolsonaro liderou em ${bolsonaro} municípios`}</title>
        </rect>
      </svg>
      <p className="mt-1 flex justify-between text-[0.7rem] text-secondary">
        <span className="inline-flex items-center gap-1">
          <Swatch color="var(--map-lula)" /> Lula {formatInt(lula)}
        </span>
        <span className="inline-flex items-center gap-1">
          Bolsonaro {formatInt(bolsonaro)} <Swatch color="var(--map-bolsonaro)" />
        </span>
      </p>
    </div>
  );
}

function TurnoutStack({ t }: { t: Infographic['turnout'] }) {
  const W = 300;
  const bn = t.blankNull ?? 0;
  const seg = [
    { key: 'valid', v: t.turnout - bn, color: 'var(--map-fill-mid-high)', label: 'votos válidos' },
    { key: 'bn', v: bn, color: 'var(--map-fill-mid-low)', label: 'brancos e nulos' },
    { key: 'abst', v: t.abstention, color: 'var(--map-fill-none)', label: 'abstenção' },
  ].filter((s) => s.v > 0);
  const gaps = (seg.length - 1) * 2;
  let x = 0;
  const pctOf = (v: number) => formatPercent(v / t.eligible);
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} 10`}
        className="h-2.5 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Eleitorado apto em 2026, 1º turno: ${seg.map((s) => `${s.label} ${pctOf(s.v)} (${formatInt(s.v)})`).join('; ')}`}
      >
        {seg.map((s) => {
          const w = Math.max(1, (s.v / t.eligible) * (W - gaps));
          const r = (
            <rect key={s.key} x={x} y="1" width={w} height="8" rx="2" style={{ fill: s.color }}>
              <title>{`${s.label}: ${formatInt(s.v)} (${pctOf(s.v)} do eleitorado apto)`}</title>
            </rect>
          );
          x += w + 2;
          return r;
        })}
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[0.7rem] text-secondary">
        {seg.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <Swatch color={s.color} /> {s.label} {pctOf(s.v)}
          </span>
        ))}
      </p>
    </div>
  );
}

function Blocks({ pct }: { pct: number }) {
  // 10 blocks = eligible voters; filled blocks = share that voted for neither of the two.
  const n = 10;
  const filled = (pct / 100) * n;
  return (
    <svg
      viewBox="0 0 218 18"
      className="h-[18px] w-full max-w-[16rem]"
      preserveAspectRatio="xMinYMid meet"
      role="img"
      aria-label={`${pct100(pct)} do eleitorado apto não votou em Lula nem em Flávio Bolsonaro`}
    >
      {Array.from({ length: n }, (_, i) => {
        const part = Math.max(0, Math.min(1, filled - i));
        return (
          <g key={i}>
            <rect
              x={i * 22}
              y="1"
              width="20"
              height="16"
              rx="2"
              style={{ fill: 'var(--map-fill-none)' }}
            />
            {part > 0 ? (
              <rect
                x={i * 22}
                y="1"
                width={20 * part}
                height="16"
                rx="2"
                style={{ fill: 'var(--map-fill-high)' }}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** The six tiles; grid of equal rows from md, snap carousel on phones (tiles ≤ 160 px). */
export function WhyMinasInfographic({ data }: { data: Infographic }) {
  const last = data.duel[data.duel.length - 1];
  return (
    <Carousel
      label="Números de Minas Gerais"
      itemNoun="número"
      testId="why-minas-carousel"
      className="md:grid md:auto-rows-fr md:grid-cols-4"
    >
      <Tile
        testId="tile-nacional"
        big={pct100(data.national.sharePct)}
        label={`do eleitorado do Brasil · ${data.national.rank}º maior`}
        source="TSE"
      >
        <NationalBar sharePct={data.national.sharePct} />
      </Tile>
      {last ? (
        <Tile
          testId="tile-duelo"
          className="md:col-span-2"
          big={`${pct100(last.lula.share)} × ${pct100(last.bolsonaro.share)}`}
          // Colour key inline in the label (saves the legend row: the tile stays ≤ 160 px).
          label={
            <>
              <span className="inline-flex items-center gap-1">
                <Swatch color="var(--map-lula)" /> Lula
              </span>{' '}
              ×{' '}
              <span className="inline-flex items-center gap-1">
                <Swatch color="var(--map-bolsonaro)" /> Bolsonaro
              </span>{' '}
              (Jair 2022, Flávio 2026)
            </>
          }
          source="TSE"
        >
          <DuelBars duel={data.duel} />
        </Tile>
      ) : null}
      <Tile
        testId="tile-margem-2022"
        big={`+${formatInt(data.margin2022.votes)}`}
        label="votos: Lula venceu MG em 2022"
        source="TSE 2022"
      >
        <MarginDot pp={data.margin2022.pp} votes={data.margin2022.votes} />
      </Tile>
      <Tile
        testId="tile-municipios"
        big={formatInt(data.municipalities.total)}
        label="municípios · quem liderou em 2026"
        source="TSE · IBGE"
      >
        {data.municipalities.lula !== null && data.municipalities.bolsonaro !== null ? (
          <SplitBar lula={data.municipalities.lula} bolsonaro={data.municipalities.bolsonaro} />
        ) : null}
      </Tile>
      <Tile
        testId="tile-comparecimento"
        className="md:col-span-2"
        big={formatPercent(data.turnout.turnout / data.turnout.eligible)}
        label="foram votar no 1º turno de 2026"
        source="TSE"
      >
        <TurnoutStack t={data.turnout} />
      </Tile>
      {data.neither ? (
        <Tile
          testId="tile-nenhum"
          big={compactNumber(data.neither.people)}
          label="não votaram em nenhum dos dois"
          source="TSE"
        >
          {data.neither.pctEligible !== null ? <Blocks pct={data.neither.pctEligible} /> : null}
        </Tile>
      ) : null}
    </Carousel>
  );
}
