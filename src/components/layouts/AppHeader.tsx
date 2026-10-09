import { Link, NavLink } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium no-underline',
    'transition-colors duration-(--duration-fast) ease-(--easing-standard) hover:bg-surface-alt',
    isActive ? 'text-primary' : 'text-secondary',
  );

/**
 * Compact header (spec §12.3/§12.4): provisional typographic identity, essential
 * navigation, discreet "Participar" CTA. No admin entry in public navigation.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-(--z-header) border-b border-border bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-(--header-height) max-w-(--content-max) items-center gap-2 px-(--gutter) lg:max-w-none lg:px-6">
        <Link
          to="/"
          className="mr-auto flex min-h-11 items-center gap-2 rounded-md no-underline"
          aria-label="Minas em Movimento — página inicial"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-sm bg-action text-on-action"
          >
            <svg
              viewBox="0 0 32 32"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 23 L12 10 L17 18 L21 12 L27 23" />
            </svg>
          </span>
          <span className="font-display text-lg leading-none font-semibold tracking-(--tracking-display)">
            Minas em Movimento
          </span>
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          <NavLink to="/" end className={navClass}>
            Mapa
          </NavLink>
          <Link to={{ pathname: '/', hash: 'agenda' }} className={navClass({ isActive: false })}>
            Agenda
          </Link>
          <NavLink to="/metodologia" className={navClass}>
            Metodologia
          </NavLink>
        </nav>
        <Link
          to={{ pathname: '/', hash: 'busca' }}
          className="grid size-11 place-items-center rounded-md text-primary hover:bg-surface-alt md:hidden"
          aria-label="Buscar cidade ou bairro"
        >
          <Icon name="search" />
        </Link>
        <ButtonLink to="/participar" size="sm">
          Participar
        </ButtonLink>
      </div>
    </header>
  );
}
