import { Icon } from '@/components/ui/Icon';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { VIRA_VOTO_GROUP_URL } from '@/lib/campaign';
import { cn } from '@/lib/cn';

export interface ViraVotoGroupProps {
  /** `compact` for the territory panel; `full` on /obrigado. */
  variant?: 'full' | 'compact';
  className?: string;
}

/**
 * Grupo único do vira-voto (D54): substitui os grupos por território e a proposta de grupos.
 * Abrir o link não é entrar: a entrada acontece no WhatsApp e o site não fica sabendo.
 */
export function ViraVotoGroup({ variant = 'full', className }: ViraVotoGroupProps) {
  const host = new URL(VIRA_VOTO_GROUP_URL).hostname;
  const full = variant === 'full';
  return (
    <section
      aria-labelledby="vira-voto-titulo"
      data-testid="vira-voto-group"
      className={cn('rounded-md border border-border bg-surface p-4 text-primary', className)}
    >
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <Icon name="users" size={16} /> Grupo de WhatsApp
      </p>
      <h2
        id="vira-voto-titulo"
        className={cn('font-body font-semibold tracking-normal', full ? 'text-xl' : 'text-base')}
      >
        Entre no grupo do vira-voto!
      </h2>
      <p className="mt-1 text-secondary">
        Receba as ações da semana e combine com quem está virando votos em Minas.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={VIRA_VOTO_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses('primary', full ? 'lg' : 'sm', 'no-underline')}
        >
          Entrar no grupo
          <Icon name="external" size={full ? 18 : 16} />
        </a>
        <span className="text-sm text-muted">
          Abre <span className="font-mono">{host}</span>
        </span>
      </div>
      {full ? (
        <p className="mt-3 text-sm text-muted">
          O link só abre o convite. Entrar e permanecer no grupo acontece no WhatsApp — este site
          não sabe se você entrou.
        </p>
      ) : null}
    </section>
  );
}
