import { lazy, Suspense } from 'react';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { useAfterIdle } from '@/lib/idle';
import { JOIN_SECTION_ID, JOIN_TITLE_ID } from './join';

// supabase-js, Zod and Turnstile only load after first paint (P-PERF-1).
const ParticipationPanel = lazy(() =>
  import('./ParticipationPanel').then((m) => ({ default: m.ParticipationPanel })),
);

function FormPlaceholder() {
  return (
    <div className="min-h-[34rem]">
      <LoadingBlock label="Carregando o cadastro…" lines={8} />
    </div>
  );
}

export interface HomeJoinSectionProps {
  /** Territory selected on the map/search (municipality or neighborhood), if any. */
  territoryId: string | null;
  /** Load the form right away (e.g. the page was opened at #participar). */
  start?: boolean;
}

/**
 * Sign-up at the end of the home page (owner decision D28): same panel as `/participar`
 * (Turnstile, server confirmation, then `/obrigado`), territory pre-filled from the map.
 * Labelled landmark section; `scroll-margin-top` keeps the title below the fixed header.
 */
export function HomeJoinSection({ territoryId, start }: HomeJoinSectionProps) {
  const ready = useAfterIdle(start);
  return (
    <section
      id={JOIN_SECTION_ID}
      aria-labelledby={JOIN_TITLE_ID}
      data-testid="home-participar"
      className="scroll-mt-(--header-height) border-t border-border bg-surface-alt px-(--gutter) py-10 lg:px-6"
    >
      <div className="mx-auto grid max-w-(--content-max) gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
        <div>
          <h2
            id={JOIN_TITLE_ID}
            tabIndex={-1}
            className="brand-display text-[2.1rem] leading-[1.05] uppercase outline-none sm:text-5xl"
          >
            Entre para a campanha em Minas
          </h2>
          <p className="mt-3 max-w-md text-secondary">
            Cadastro rápido: nome, e-mail, WhatsApp e onde você quer atuar. Em seguida mostramos o
            grupo da campanha na sua região.
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface-raised p-4 sm:p-6">
          {ready ? (
            <Suspense fallback={<FormPlaceholder />}>
              <ParticipationPanel
                territoryId={territoryId && territoryId !== 'mg' ? territoryId : null}
              />
            </Suspense>
          ) : (
            <FormPlaceholder />
          )}
        </div>
      </div>
    </section>
  );
}
