import { lazy, Suspense } from 'react';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { useAfterIdle } from '@/lib/idle';
import { JOIN_SECTION_ID, JOIN_TITLE_ID } from './join';
import './home-join.css';

// Zod, the Clerk sign-up flow and Turnstile only load after first paint (P-PERF-1).
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
      // Cartaz de fechamento (redesign editorial): faixa oliva `.ed-band-ink` (aliases
      // semânticos remapeados para o escuro) + `.join-band` (tokens de estado do formulário).
      className="join-band ed-band-ink ed-section scroll-mt-(--header-height)"
    >
      <div className="mx-auto grid max-w-(--content-max) grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:gap-12">
        <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:self-start">
          <hr className="ed-rule-strong" aria-hidden="true" />
          <p className="ed-kicker">Cadastro de voluntários</p>
          <h2
            id={JOIN_TITLE_ID}
            tabIndex={-1}
            className="brand-display text-[2.1rem] leading-[1.05] uppercase outline-none sm:text-5xl lg:text-6xl"
          >
            Entre para a campanha em Minas
          </h2>
          <p className="ed-measure max-w-md text-secondary sm:text-lg">
            Cadastro rápido: nome, e-mail, WhatsApp e onde você quer atuar. Em seguida mostramos o
            grupo da campanha na sua região.
          </p>
        </div>
        <div className="min-w-0 rounded-card border border-border-strong bg-surface-raised p-4 sm:p-6">
          {ready ? (
            <Suspense fallback={<FormPlaceholder />}>
              <ParticipationPanel
                lazySession
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
