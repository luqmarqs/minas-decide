import { useQuery } from '@tanstack/react-query';
import { isWhatsAppInviteUrl, PublicGroupsResponse } from '@shared/contracts/groups.ts';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { apiRequest, messageForError } from '@/lib/api';
import { buttonClasses } from '@/components/ui/buttonStyles';

/**
 * Groups for the thank-you page. Never cached between visits/users (spec §12.8):
 * staleTime 0 + gcTime 0 and a page-specific key.
 */
function useInviteGroups(territoryId: string | null) {
  return useQuery({
    queryKey: ['groups', 'obrigado', territoryId],
    enabled: !!territoryId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      apiRequest('/groups', PublicGroupsResponse, {
        query: { territory_id: territoryId },
        signal,
      }),
  });
}

export interface GroupInviteProps {
  territoryId: string;
  territoryName: string;
}

/**
 * Exact group → invite button; municipal fallback → explained; none → propose.
 * Opening the link is not joining: membership happens in WhatsApp and the app
 * never learns about it (spec §3.3).
 */
export function GroupInvite({ territoryId, territoryName }: GroupInviteProps) {
  const q = useInviteGroups(territoryId);
  const propor = `/propor-grupo?territorio=${encodeURIComponent(territoryId)}`;

  if (q.isLoading) return <LoadingBlock label="Buscando o grupo da sua região…" lines={3} />;
  if (q.error) {
    return (
      <ErrorState
        title="Não foi possível consultar os grupos agora"
        message={`${messageForError(q.error)} Seu cadastro não é afetado.`}
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  // Only official invite URLs are ever rendered as links.
  const group = q.data?.items.find((g) => isWhatsAppInviteUrl(g.join_url));
  if (!group || q.data?.fallback === 'none') {
    return (
      <EmptyState
        title={`Ainda não há grupo aprovado para ${territoryName}`}
        description={
          <p>
            Nenhum grupo desta região (nem do município) foi aprovado até agora. Se você já organiza
            um grupo ou quer criar um, proponha — ele passa por revisão antes de aparecer.
          </p>
        }
        action={<ButtonLink to={propor}>Propor um grupo para esta região</ButtonLink>}
      />
    );
  }

  const host = new URL(group.join_url).hostname;
  const municipal = q.data?.fallback === 'municipality';
  return (
    <section
      aria-labelledby="grupo-titulo"
      className="rounded-md border border-border bg-surface p-4 text-primary"
    >
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <Icon name="users" size={16} /> {municipal ? 'Grupo do município' : 'Grupo da sua região'}
      </p>
      <h2 id="grupo-titulo" className="font-body text-xl font-semibold tracking-normal">
        {group.display_name}
      </h2>
      {municipal ? (
        <p className="mt-1 text-secondary">
          Ainda não há grupo aprovado específico para {territoryName}. Este é o grupo aprovado da
          cidade. Você também pode propor um grupo só para a sua região.
        </p>
      ) : (
        <p className="mt-1 text-secondary">Grupo aprovado para {territoryName}.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={group.join_url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses('primary', 'lg', 'no-underline')}
        >
          Abrir convite no WhatsApp
          <Icon name="external" size={18} />
        </a>
        <span className="text-sm text-muted">
          Abre <span className="font-mono">{host}</span>
        </span>
      </div>
      <p className="mt-3 text-sm text-muted">
        O link só abre o convite. Entrar e permanecer no grupo acontece no WhatsApp — este site não
        sabe se você entrou.
      </p>
      {municipal ? (
        <div className="mt-3">
          <ButtonLink to={propor} variant="secondary" size="sm">
            Propor grupo para {territoryName}
          </ButtonLink>
        </div>
      ) : null}
    </section>
  );
}
