import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { shortSource } from '@/lib/source';
import { useAfterIdle } from '@/lib/idle';
import { useHighlights, useSnapshot } from '@/features/electoral-map/hooks';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import { buildStripCards, type StripCard } from './cards';
import { buildInfographic } from './infographic';
import { WhyMinasInfographic } from './WhyMinasInfographic';

/**
 * Short source line (D32: "Fonte: TSE", "TSE 2022", "IBGE"…). Files, releases and dates
 * are listed only on /metodologia ("Proveniência"), so cards stay short and uniform (D28).
 */
function SourceLine({ source }: { source: string }) {
  return <p className="mt-auto pt-2 text-xs text-muted">Fonte: {shortSource(source)}</p>;
}

function Card({ c }: { c: StripCard }) {
  return (
    <li className="flex w-[78%] min-w-0 shrink-0 snap-start flex-col rounded-md border border-border bg-surface-raised p-3 sm:w-[45%] md:w-auto">
      <p className="text-xs leading-snug font-semibold text-secondary">{c.label}</p>
      <p className="mt-1 text-2xl leading-tight font-bold tabular-nums break-words">{c.value}</p>
      {c.detail.map((d) => (
        <p key={d} className="text-sm text-secondary">
          {d}
        </p>
      ))}
      {c.note ? <p className="mt-1 text-xs text-muted">{c.note}</p> : null}
      <SourceLine source={c.source} />
    </li>
  );
}

function StripSkeleton() {
  return (
    <div role="status" aria-label="Carregando números de Minas Gerais">
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="rounded-md border border-border bg-surface-raised p-3">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="mt-2 h-7 w-1/2" />
            <Skeleton className="mt-2 h-3 w-2/3" />
            <Skeleton className="mt-4 h-2 w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface WhyMinasStripProps {
  className?: string;
  /** Start loading now (otherwise after load + idle, never before first paint). */
  start?: boolean;
}

/**
 * "Por que Minas decide" (rodada 3, owner decision): key numbers right below the hero,
 * before the map. Values come only from `<release>/highlights.json` (pt-BR formatting,
 * source under every card); honest skeleton / empty / error states; DEMO label when the
 * snapshot is synthetic.
 */
export function WhyMinasStrip({ className, start }: WhyMinasStripProps) {
  const idle = useAfterIdle(start);
  const q = useHighlights({ enabled: idle });
  const { data: snap } = useSnapshot({ enabled: false });
  const demo = snap?.status === 'demo';
  const h = q.data;

  let body;
  if (!idle || q.isLoading) body = <StripSkeleton />;
  else if (q.error)
    body = (
      <Note tone="warning">
        Não foi possível carregar os números de Minas Gerais agora. O mapa continua disponível.
      </Note>
    );
  else if (!h || (!h.items.length && !h.why_minas.length))
    body = (
      <Note>
        Os números-chave de Minas Gerais ainda não foram publicados neste snapshot. Nenhum número é
        digitado à mão: eles aparecem aqui quando o arquivo de destaques for gerado a partir dos
        dados oficiais.
      </Note>
    );
  else {
    const info = buildInfographic(h);
    const cards = info ? [] : buildStripCards(h);
    // D34: infographic (no paragraphs); the long why_minas texts stay on /metodologia only.
    body = info ? (
      <WhyMinasInfographic data={info} />
    ) : cards.length ? (
      // Fallback (demo or unknown file): compact cards; phones get a snap carousel.
      <ul
        aria-label="Números de Minas Gerais"
        tabIndex={0}
        data-testid="why-minas-cards"
        className="-mx-(--gutter) flex snap-x snap-mandatory gap-2 overflow-x-auto px-(--gutter) pb-2 [scrollbar-width:thin] md:mx-0 md:grid md:auto-rows-fr md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]"
      >
        {cards.map((c) => (
          <Card key={c.key} c={c} />
        ))}
      </ul>
    ) : (
      <Note>Os números-chave de Minas Gerais ainda não foram publicados neste snapshot.</Note>
    );
  }

  return (
    <section
      aria-labelledby="why-minas-title"
      className={cn('border-b border-border bg-surface px-(--gutter) py-6 lg:px-6', className)}
      data-testid="why-minas"
    >
      <div className="mx-auto max-w-(--content-max) xl:max-w-none">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="why-minas-title" className="text-xl sm:text-2xl">
            Por que Minas decide
          </h2>
          {demo ? <Badge variant="demo">{SNAPSHOT_STATUS_LABEL.demo}</Badge> : null}
        </div>
        {body}
      </div>
    </section>
  );
}
