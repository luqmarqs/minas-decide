import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useGroups } from './groups';

export interface GroupCardProps {
  territoryId: string;
  territoryName: string;
  municipalityName?: string | null;
  className?: string;
}

/**
 * Group state for a territory (spec §12.6): approved group / municipal fallback /
 * none. The join link itself is only revealed after registration (/obrigado), so
 * the CTA always goes through /participar preserving the territory.
 */
export function GroupCard({
  territoryId,
  territoryName,
  municipalityName,
  className,
}: GroupCardProps) {
  const q = useGroups(territoryId);
  const participar = `/participar?territorio=${encodeURIComponent(territoryId)}`;
  const propor = `/propor-grupo?territorio=${encodeURIComponent(territoryId)}`;

  let title: string;
  let body: ReactNode;
  let primary: ReactNode = (
    <ButtonLink to={participar} size="sm">
      Participar do grupo
    </ButtonLink>
  );
  let secondary: ReactNode = (
    <ButtonLink to={propor} variant="secondary" size="sm">
      Propor um grupo
    </ButtonLink>
  );

  if (q.isLoading) {
    return (
      <section
        className={cn('rounded-md border border-border p-4', className)}
        aria-label="Grupo de WhatsApp"
      >
        <LoadingBlock label="Verificando grupos…" lines={2} />
      </section>
    );
  }

  if (q.error) {
    title = 'Grupos: não foi possível verificar agora';
    body = (
      <p>
        A consulta de grupos não respondeu. Você ainda pode se cadastrar — o território escolhido
        fica guardado — ou propor um grupo.
      </p>
    );
    primary = (
      <ButtonLink to={participar} size="sm">
        Quero participar
      </ButtonLink>
    );
  } else if (q.data?.fallback === 'exact' && q.data.items[0]) {
    title = q.data.items[0].display_name;
    body = (
      <p>
        Grupo aprovado para {territoryName}. O link de entrada aparece depois do cadastro rápido.
      </p>
    );
    secondary = null;
  } else if (q.data?.fallback === 'municipality' && q.data.items[0]) {
    title = `Grupo municipal: ${q.data.items[0].display_name}`;
    body = (
      <p>
        Ainda não há grupo específico para {territoryName}. Você pode entrar no grupo de{' '}
        {municipalityName ?? 'seu município'} ou propor um grupo para este território.
      </p>
    );
    secondary = (
      <ButtonLink to={propor} variant="secondary" size="sm">
        Propor grupo para {territoryName}
      </ButtonLink>
    );
  } else {
    title = 'Nenhum grupo aprovado aqui ainda';
    body = (
      <p>
        Seja a primeira pessoa a organizar {territoryName}: proponha um grupo — ele passa por
        revisão antes de aparecer.
      </p>
    );
    primary = (
      <ButtonLink to={propor} size="sm">
        Propor um grupo
      </ButtonLink>
    );
    secondary = (
      <ButtonLink to={participar} variant="secondary" size="sm">
        Cadastrar interesse
      </ButtonLink>
    );
  }

  return (
    <section
      className={cn('rounded-md border border-border bg-surface p-4 text-primary', className)}
      aria-label="Grupo de WhatsApp"
    >
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <Icon name="users" size={16} /> Grupo de WhatsApp
      </p>
      <h3 className="font-body text-base font-semibold tracking-normal">{title}</h3>
      <div className="mt-1 text-sm text-secondary">{body}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {primary}
        {secondary}
      </div>
    </section>
  );
}
