import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatInt, formatPercent, formatPp } from '@/lib/format';
import { compactNumber, type DuelRound, type Infographic } from './infographic';

/*
 * "Por que Minas decide" como página dupla de jornal (redesign editorial, direção A — D4/D5/D10).
 *
 * Hierarquia por escala e posição, não por caixas: número âncora (10,3% do eleitorado) em
 * `.ed-figure-xl`; o comparativo 2022 → 2026 ocupa a maior coluna; a margem de 2022 vira uma
 * régua tipográfica logo abaixo; uma linha de pequenos múltiplos (municípios, participação,
 * nenhum dos dois) separada por filetes. Sem carrossel: no celular é uma lista vertical a toda
 * a largura, com os seis números sempre visíveis (D5).
 *
 * Marcas: barras retas (sem raio), espaço de 2 px entre segmentos que se tocam, texto sempre em
 * tokens de texto (nunca na cor da série). Cores partidárias (D25) SÓ no comparativo, na divisão
 * de municípios e na margem; o resto usa a escala neutra `--map-fill-*` (contraste ≥ 3:1 sobre a
 * superfície nos dois temas: `high` e `mid-high`; a abstenção é um segmento vazado com contorno
 * `--color-border-strong`). Cada gráfico é um único `role="img"` com todos os números no
 * `aria-label`; os filhos visuais são decorativos para tecnologia assistiva (o rótulo já diz tudo)
 * e as barras mantêm `<title>` para o detalhe ao passar o mouse.
 */

const pct100 = (v: number, d = 1) => formatPercent(v / 100, d);
const DUEL_MAX = 60; // escala 0–60% dos votos válidos (em MG os percentuais ficam abaixo de 60%)
const fill = (color: string): CSSProperties => ({ fill: color });

/** Bloco da grade: pergunta curta (h3) + número + texto + gráfico + uma linha de fonte. */
function Figure({
  testId,
  kicker,
  figure,
  figureSize = 'lg',
  label,
  source,
  children,
  className,
  alignSource = false,
}: {
  testId: string;
  kicker: string;
  figure: ReactNode;
  figureSize?: 'xl' | 'lg' | 'md';
  label: ReactNode;
  /** Short source; null when the block shares the source line of a neighbour (D10). */
  source: string | null;
  children: ReactNode;
  className?: string;
  /** Pin the source line to the bottom (small multiples side by side share a baseline). */
  alignSource?: boolean;
}) {
  return (
    <li data-testid={testId} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <h3 className="ed-kicker font-body">{kicker}</h3>
      <p
        className={cn(
          'ed-figure flex flex-wrap items-baseline gap-x-[0.25em] tabular-nums',
          figureSize === 'xl'
            ? 'ed-figure-xl'
            : figureSize === 'lg'
              ? 'ed-figure-lg'
              : 'ed-figure-md',
        )}
      >
        {figure}
      </p>
      <p className="ed-measure text-base leading-snug text-secondary">{label}</p>
      <div className="min-w-0">{children}</div>
      {source ? (
        <p className={cn('ed-caption pt-1', alignSource && 'mt-auto')}>Fonte: {source}</p>
      ) : null}
    </li>
  );
}

function Swatch({ color, hollow = false }: { color: string; hollow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0"
      style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { background: color }}
    />
  );
}

/* 1 · número âncora --------------------------------------------------------------------------- */

function NationalBar({ sharePct }: { sharePct: number }) {
  return (
    <div role="img" aria-label={`Minas tem ${pct100(sharePct)} do eleitorado do Brasil`}>
      {/* Contorno = Brasil (100%), em border-strong (≥ 3:1 nos dois temas); preenchimento = MG. */}
      <div aria-hidden="true" className="relative h-3.5 border-[1.5px] border-border-strong">
        <svg
          viewBox="0 0 1000 10"
          preserveAspectRatio="none"
          className="absolute inset-0 block h-full w-full"
        >
          <rect
            x="0"
            y="0"
            width={Math.max(4, sharePct * 10)}
            height="10"
            style={fill('var(--map-fill-high)')}
          >
            <title>{`Minas Gerais: ${pct100(sharePct)} do eleitorado do Brasil`}</title>
          </rect>
        </svg>
      </div>
      <p className="ed-caption mt-1.5 flex justify-between gap-2 tabular-nums" aria-hidden="true">
        <span className="font-semibold text-secondary">Minas Gerais {pct100(sharePct)}</span>
        <span>Brasil = 100%</span>
      </p>
    </div>
  );
}

/* 2 · comparativo 2022 → 2026 ----------------------------------------------------------------- */

function leadNote(r: DuelRound): string | null {
  if (r.marginPp === null) return null;
  const abs = formatPp(Math.abs(r.marginPp)).replace(/^\+/, '');
  if (Number(r.marginPp.toFixed(1)) === 0) return 'empate técnico';
  const who = r.marginPp > 0 ? 'Lula' : r.bolsonaro.name;
  return `${who} à frente por ${abs}`;
}

function DuelBar({
  name,
  share,
  color,
  title,
}: {
  name: string;
  share: number;
  color: string;
  title: string;
}) {
  const w = Math.min(100, (share / DUEL_MAX) * 100);
  return (
    <div className="relative h-3.5">
      <svg
        aria-hidden="true"
        viewBox="0 0 10 10"
        preserveAspectRatio="none"
        className="block h-full"
        style={{ width: `${w}%` }}
      >
        <rect x="0" y="0" width="10" height="10" style={fill(color)}>
          <title>{title}</title>
        </rect>
      </svg>
      <span
        className="absolute top-1/2 -translate-y-1/2 bg-surface py-0.5 pr-1 pl-1.5 text-sm leading-none font-semibold whitespace-nowrap text-primary tabular-nums"
        style={{ left: `${w}%` }}
      >
        <span className="font-normal text-secondary">{name}</span> {pct100(share)}
      </span>
    </div>
  );
}

function DuelChart({ duel }: { duel: Infographic['duel'] }) {
  const aria = duel
    .map((r) => {
      const n = leadNote(r);
      return `${r.label}: Lula ${pct100(r.lula.share)}, ${r.bolsonaro.name} ${pct100(r.bolsonaro.share)}${n ? ` (${n})` : ''}`;
    })
    .join('; ');
  const ref = (50 / DUEL_MAX) * 100;
  return (
    <div
      role="img"
      aria-label={`Votos válidos para Presidente em Minas — ${aria}`}
      className="flex flex-col gap-4"
    >
      {duel.map((r, i) => {
        const note = leadNote(r);
        return (
          <div
            key={r.label}
            className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[11.5rem_minmax(0,1fr)] sm:items-center"
          >
            <p className="flex flex-wrap items-baseline gap-x-2 sm:flex-col sm:gap-0">
              <span className="text-sm font-semibold text-primary">{r.label}</span>
              {note ? <span className="ed-note tabular-nums">{note}</span> : null}
            </p>
            {/* Área das barras: 0–60% ocupa a largura menos o espaço do rótulo de valor (mr-24). */}
            <div className="relative mr-24 flex flex-col gap-1 py-1">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 border-l border-dashed border-border-strong"
                style={{ left: `${ref}%` }}
              />
              {i === 0 ? (
                <span
                  aria-hidden="true"
                  className="ed-caption absolute -top-4 hidden -translate-x-1/2 tabular-nums sm:block"
                  style={{ left: `${ref}%` }}
                >
                  50%
                </span>
              ) : null}
              <DuelBar
                name="Lula"
                share={r.lula.share}
                color="var(--map-lula)"
                title={`Lula, ${r.label}: ${pct100(r.lula.share)}${r.lula.votes !== null ? ` (${formatInt(r.lula.votes)} votos)` : ''}`}
              />
              <DuelBar
                name={r.bolsonaro.name.split(' ')[0] ?? r.bolsonaro.name}
                share={r.bolsonaro.share}
                color="var(--map-bolsonaro)"
                title={`${r.bolsonaro.name}, ${r.label}: ${pct100(r.bolsonaro.share)}${r.bolsonaro.votes !== null ? ` (${formatInt(r.bolsonaro.votes)} votos)` : ''}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DuelLegend() {
  // Rótulo direto em cada barra ("Lula 48,3%", "Jair 43,6%"); a legenda só associa cor e nome.
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-secondary">
      <span className="flex items-baseline gap-1.5">
        <Swatch color="var(--map-lula)" /> Lula
      </span>
      <span className="flex items-baseline gap-1.5">
        <Swatch color="var(--map-bolsonaro)" /> Bolsonaro (Jair em 2022, Flávio em 2026)
      </span>
    </p>
  );
}

/* 3 · margem de 2022 (régua tipográfica) ------------------------------------------------------ */

function MarginRuler({ pp, votes }: { pp: number; votes: number }) {
  const span = 2; // ±2 p.p. — escala propositalmente estreita: a margem de 2022 foi mínima
  const pos = (v: number) => ((Math.max(-span, Math.min(span, v)) + span) / (2 * span)) * 100;
  const at = pos(pp);
  const ticks: { v: number; label: string }[] = [
    { v: -2, label: '−2' },
    { v: -1, label: '−1' },
    { v: 0, label: 'empate' },
    { v: 1, label: '+1' },
    { v: 2, label: '+2 p.p.' },
  ];
  return (
    <div
      role="img"
      aria-label={`Margem de Lula em Minas no 2º turno de 2022: ${formatPp(pp, 2)}, ${formatInt(votes)} votos, numa escala de −2 a +2 pontos percentuais`}
      title={`Lula +${formatInt(votes)} votos (${formatPp(pp, 2)})`}
      className="relative h-[3.25rem] w-full max-w-[26rem]"
    >
      <div aria-hidden="true">
        {/* marcador e rótulo */}
        <span
          className="ed-caption absolute top-0 -translate-x-1/2 font-semibold whitespace-nowrap text-primary tabular-nums"
          style={{ left: `${at}%` }}
        >
          Lula {formatPp(pp)}
        </span>
        <span
          className="absolute top-[1.05rem] h-5 w-[3px] -translate-x-1/2"
          style={{ left: `${at}%`, background: 'var(--map-lula)' }}
        />
        {/* linha de base + trecho da margem */}
        <span
          className="absolute inset-x-0 top-[1.55rem] h-px"
          style={{ background: 'var(--color-border-strong)' }}
        />
        <span
          className="absolute top-[1.45rem] h-[3px]"
          style={{
            left: `${Math.min(50, at)}%`,
            width: `${Math.abs(at - 50)}%`,
            background: 'var(--map-lula)',
          }}
        />
        {ticks.map((t, i) => (
          <span key={t.v}>
            <span
              className="absolute top-[1.25rem] h-2.5 w-px"
              style={{ left: `${pos(t.v)}%`, background: 'var(--color-border-strong)' }}
            />
            <span
              className={cn(
                'ed-caption absolute top-[2.1rem] whitespace-nowrap tabular-nums',
                i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
              )}
              style={{ left: `${pos(t.v)}%` }}
            >
              {t.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* 4 · pequenos múltiplos ---------------------------------------------------------------------- */

function SplitBar({ lula, bolsonaro }: { lula: number; bolsonaro: number }) {
  const total = lula + bolsonaro;
  const W = 1000;
  const gap = 4;
  const wl = (lula / total) * (W - gap);
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} 14`}
        preserveAspectRatio="none"
        className="block h-3.5 w-full"
        role="img"
        aria-label={`Em 2026, Lula liderou em ${lula} municípios e Flávio Bolsonaro em ${bolsonaro}`}
      >
        <rect x="0" y="0" width={wl} height="14" style={fill('var(--map-lula)')}>
          <title>{`Lula liderou em ${lula} municípios`}</title>
        </rect>
        <rect
          x={wl + gap}
          y="0"
          width={W - wl - gap}
          height="14"
          style={fill('var(--map-bolsonaro)')}
        >
          <title>{`Flávio Bolsonaro liderou em ${bolsonaro} municípios`}</title>
        </rect>
      </svg>
      <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-sm text-secondary tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <Swatch color="var(--map-lula)" /> Lula {formatInt(lula)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          Flávio Bolsonaro {formatInt(bolsonaro)} <Swatch color="var(--map-bolsonaro)" />
        </span>
      </p>
    </div>
  );
}

function TurnoutStack({ t }: { t: Infographic['turnout'] }) {
  const W = 1000;
  const gap = 4;
  const bn = t.blankNull ?? 0;
  const seg = [
    {
      key: 'valid',
      v: t.turnout - bn,
      color: 'var(--map-fill-high)',
      hollow: false,
      label: 'votos válidos',
    },
    {
      key: 'bn',
      v: bn,
      color: 'var(--map-fill-mid-high)',
      hollow: false,
      label: 'brancos e nulos',
    },
    {
      key: 'abst',
      v: t.abstention,
      color: 'var(--color-border-strong)',
      hollow: true,
      label: 'abstenção',
    },
  ].filter((s) => s.v > 0);
  const usable = W - (seg.length - 1) * gap;
  const pctOf = (v: number) => formatPercent(v / t.eligible);
  let x = 0;
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} 14`}
        preserveAspectRatio="none"
        className="block h-3.5 w-full"
        role="img"
        aria-label={`Eleitorado apto em 2026, 1º turno: ${seg.map((s) => `${s.label} ${pctOf(s.v)} (${formatInt(s.v)})`).join('; ')}`}
      >
        {seg.map((s) => {
          const w = Math.max(2, (s.v / t.eligible) * usable);
          const r = (
            <rect
              key={s.key}
              x={x + (s.hollow ? 0.75 : 0)}
              y={s.hollow ? 0.75 : 0}
              width={s.hollow ? w - 1.5 : w}
              height={s.hollow ? 12.5 : 14}
              vectorEffect="non-scaling-stroke"
              strokeWidth={s.hollow ? 1.5 : 0}
              style={s.hollow ? { fill: 'none', stroke: s.color } : fill(s.color)}
            >
              <title>{`${s.label}: ${formatInt(s.v)} (${pctOf(s.v)} do eleitorado apto)`}</title>
            </rect>
          );
          x += w + gap;
          return r;
        })}
      </svg>
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-secondary tabular-nums">
        {seg.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <Swatch color={s.color} hollow={s.hollow} /> {s.label} {pctOf(s.v)}
          </span>
        ))}
      </p>
    </div>
  );
}

function Blocks({ pct }: { pct: number }) {
  // 10 blocos = eleitorado apto; parte preenchida = quem não votou em nenhum dos dois.
  const n = 10;
  const filled = (pct / 100) * n;
  return (
    <div>
      <svg
        viewBox="0 0 218 20"
        className="block h-auto w-full max-w-[18rem]"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label={`${pct100(pct)} do eleitorado apto não votou em Lula nem em Flávio Bolsonaro`}
      >
        {Array.from({ length: n }, (_, i) => {
          const part = Math.max(0, Math.min(1, filled - i));
          return (
            <g key={i}>
              <rect
                x={i * 22 + 0.5}
                y="0.5"
                width="19"
                height="19"
                strokeWidth="1"
                style={{ fill: 'none', stroke: 'var(--color-border-strong)' }}
              />
              {part > 0 ? (
                <rect
                  x={i * 22}
                  y="0"
                  width={20 * part}
                  height="20"
                  style={fill('var(--map-fill-high)')}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="mt-1.5 text-sm text-secondary tabular-nums">
        {pct100(pct)} do eleitorado apto · cada bloco = 10%
      </p>
    </div>
  );
}

/**
 * Seis números em grade editorial assimétrica (≥ lg: âncora 4 col + comparativo/margem 8 col;
 * múltiplos 4/4/4 · md: duas colunas · celular: lista vertical a toda a largura, sem carrossel).
 */
export function WhyMinasInfographic({ data }: { data: Infographic }) {
  const last = data.duel[data.duel.length - 1];
  const multiple = 'border-t border-border pt-5';
  return (
    <ul
      aria-label="Números de Minas Gerais"
      data-testid="why-minas-figures"
      // Phones: one column (editorial.css), tighter rhythm between blocks.
      className="ed-grid-12 max-md:gap-y-7!"
    >
      <Figure
        testId="fig-nacional"
        kicker="Peso no país"
        figureSize="xl"
        figure={pct100(data.national.sharePct)}
        label={
          <>
            do eleitorado do Brasil ·{' '}
            <strong className="text-primary">{data.national.rank}º maior</strong>
          </>
        }
        source="TSE"
        className="md:col-span-5 md:row-span-2 md:border-r md:border-border md:pr-6 lg:col-span-4 lg:col-start-1 lg:row-span-1 lg:row-start-1 lg:border-r-0 lg:pr-0"
      >
        <p className="ed-note mb-4 border-l-2 border-border-strong pl-2 tabular-nums">
          {compactNumber(data.national.eligible)} pessoas aptas a votar
        </p>
        <NationalBar sharePct={data.national.sharePct} />
      </Figure>

      {last ? (
        <Figure
          testId="fig-duelo"
          kicker="O que mudou de 2022 para 2026?"
          // LG, never XL: the 10,3% anchor stays the unambiguous first read (P3-1).
          figureSize="lg"
          figure={
            <>
              <span>{pct100(last.lula.share)}</span>
              <span className="text-muted">×</span>
              <span>{pct100(last.bolsonaro.share)}</span>
            </>
          }
          label="Lula × Flávio Bolsonaro no 1º turno de 2026, em votos válidos para Presidente. Em 2022, o adversário foi Jair Bolsonaro."
          source="TSE · 2022 e 2026 (inclui a margem de 2022)"
          className="border-t border-border pt-5 md:col-span-7 md:border-t-0 md:pt-0 lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1 lg:self-start lg:border-l lg:border-border lg:pl-10"
        >
          <DuelLegend />
          <div className="mt-6">
            <DuelChart duel={data.duel} />
          </div>
          <p className="ed-caption mt-3">
            Escala de 0 a 60% dos votos válidos; linha tracejada = 50%. Comparação de percentuais,
            não implica transferência de votos.
          </p>
        </Figure>
      ) : null}

      <Figure
        testId="fig-margem-2022"
        kicker="Quão apertado foi 2022?"
        figureSize="md"
        figure={`+${formatInt(data.margin2022.votes)}`}
        label={
          <>
            votos: Lula venceu MG em 2022 ·{' '}
            <span className="tabular-nums">{formatPp(data.margin2022.pp)}</span> no 2º turno
          </>
        }
        source={last ? null : 'TSE 2022'}
        // ≥ lg: left column under the anchor, bottom-aligned with the end of the comparison.
        className="border-t border-border pt-5 md:col-span-7 lg:col-span-4 lg:col-start-1 lg:row-start-2 lg:self-end"
      >
        <MarginRuler pp={data.margin2022.pp} votes={data.margin2022.votes} />
      </Figure>

      <Figure
        testId="fig-municipios"
        kicker="Quem liderou nos municípios?"
        figure={formatInt(data.municipalities.total)}
        label="municípios · quem liderou em 2026"
        source="TSE · IBGE"
        alignSource
        className={cn(multiple, 'md:col-span-6 lg:col-span-4')}
      >
        {data.municipalities.lula !== null && data.municipalities.bolsonaro !== null ? (
          <SplitBar lula={data.municipalities.lula} bolsonaro={data.municipalities.bolsonaro} />
        ) : null}
      </Figure>

      <Figure
        testId="fig-comparecimento"
        kicker="Quantos foram votar?"
        figure={formatPercent(data.turnout.turnout / data.turnout.eligible)}
        label="foram votar no 1º turno de 2026"
        source="TSE"
        alignSource
        className={cn(multiple, 'md:col-span-6 lg:col-span-4')}
      >
        <TurnoutStack t={data.turnout} />
      </Figure>

      {data.neither ? (
        <Figure
          testId="fig-nenhum"
          kicker="Quantos ficaram fora do duelo?"
          figure={compactNumber(data.neither.people)}
          label="não votaram em nenhum dos dois"
          source="TSE"
          alignSource
          className={cn(multiple, 'md:col-span-12 lg:col-span-4')}
        >
          {data.neither.pctEligible !== null ? <Blocks pct={data.neither.pctEligible} /> : null}
        </Figure>
      ) : null}
    </ul>
  );
}
