import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { useAfterIdle } from '@/lib/idle';
import { useHighlights, useSnapshot } from '@/features/electoral-map/hooks';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import { buildStripCards, type StripCard } from './cards';

function Card({ c }: { c: StripCard }) {
  return (
    <li className="flex min-w-0 flex-col rounded-md border border-border bg-surface-raised p-3">
      <p className="text-xs leading-snug font-semibold text-secondary">{c.label}</p>
      <p className="mt-1 text-2xl leading-tight font-bold tabular-nums break-words">{c.value}</p>
      {c.detail.map((d) => (
        <p key={d} className="text-sm text-secondary">
          {d}
        </p>
      ))}
      {c.note ? <p className="mt-1 text-xs text-muted">{c.note}</p> : null}
      <p className="mt-auto pt-2 text-[0.7rem] leading-snug text-muted">Fonte: {c.source}</p>
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
    const cards = buildStripCards(h);
    body = (
      <div className="flex flex-col gap-4">
        {cards.length ? (
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {cards.map((c) => (
              <Card key={c.key} c={c} />
            ))}
          </ul>
        ) : null}
        {h.why_minas.length ? (
          <ul className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2 xl:grid-cols-3">
            {h.why_minas.slice(0, 6).map((w) => (
              <li key={w.title} className="min-w-0">
                <p className="font-semibold text-primary">{w.title}</p>
                <p className="text-secondary">{w.text}</p>
                <p className="mt-0.5 text-[0.7rem] leading-snug text-muted">Fonte: {w.source}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
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
