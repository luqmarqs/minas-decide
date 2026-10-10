import { PlateHeading } from '@/components/editorial/PlateHeading';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { shortSource } from '@/lib/source';
import { useAfterIdle } from '@/lib/idle';
import { useHighlights, useSnapshot } from '@/features/electoral-map/hooks';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import { buildStripCards, type StripCard } from './cards';
import { Carousel } from './Carousel';
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
    <li className="flex w-[calc(100%-1.25rem)] min-w-0 shrink-0 snap-start flex-col rounded-md border border-border bg-surface-raised p-3 sm:w-[45%] md:w-auto">
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
  // Same skeleton shape as the editorial grid (anchor + wide comparison + three multiples).
  return (
    <div role="status" aria-label="Carregando números de Minas Gerais">
      <div className="ed-grid-12 max-md:gap-y-7!" aria-hidden="true">
        <div className="md:col-span-5 lg:col-span-4">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-3 h-20 w-2/3" />
          <Skeleton className="mt-4 h-4 w-full" />
        </div>
        <div className="md:col-span-7 lg:col-span-8">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-3 h-12 w-1/2" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="mt-4 h-3 w-3/4" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-t border-border pt-5 md:col-span-6 lg:col-span-4">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-3 h-10 w-1/3" />
            <Skeleton className="mt-4 h-3 w-full" />
          </div>
        ))}
      </div>
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
      <Carousel
        label="Números de Minas Gerais"
        itemNoun="número"
        testId="why-minas-cards"
        className="md:grid md:auto-rows-fr md:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]"
      >
        {cards.map((c) => (
          <Card key={c.key} c={c} />
        ))}
      </Carousel>
    ) : (
      <Note>Os números-chave de Minas Gerais ainda não foram publicados neste snapshot.</Note>
    );
  }

  return (
    <section
      aria-labelledby="why-minas-title"
      className={cn('ed-section bg-surface', className)}
      data-testid="why-minas"
    >
      <div className="mx-auto max-w-(--content-max)">
        <PlateHeading
          number={2}
          kicker="Números"
          title="Por que Minas decide"
          id="why-minas-title"
          aside={demo ? <Badge variant="demo">{SNAPSHOT_STATUS_LABEL.demo}</Badge> : undefined}
          className="mb-8 lg:mb-10"
        />
        {body}
      </div>
    </section>
  );
}
