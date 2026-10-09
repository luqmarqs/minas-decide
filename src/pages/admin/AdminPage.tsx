import { PageShell } from '@/components/layouts/PageShell';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useMe, useSession } from '@/lib/auth';
import { ActivitiesQueue, GroupsQueue, SecurityEvents } from '@/features/admin/AdminQueues';
import { adminErrorMessage, ADMIN_FORBIDDEN_MESSAGE } from '@/features/admin/errors';
import { SendLinkForm } from '@/features/auth/SendLinkForm';

/** Admin entry — lazy chunk, never linked from public navigation. */
export default function AdminPage() {
  const session = useSession();
  const active = session.status === 'active' ? session.session : null;
  const me = useMe(active && !active.user.is_anonymous ? active : null);

  let body;
  if (session.status === 'loading' || (active && !active.user.is_anonymous && me.isLoading)) {
    body = <LoadingBlock label="Verificando permissões…" lines={3} />;
  } else if (session.status === 'unconfigured') {
    body = <Note tone="warning">Login não configurado neste ambiente.</Note>;
  } else if (!active || active.user.is_anonymous) {
    body = (
      <div className="flex flex-col gap-4">
        <Note>Área restrita. Entre com o e-mail de administrador; depois volte a esta página.</Note>
        <SendLinkForm idPrefix="admin-link" title="Entrar por e-mail" />
      </div>
    );
  } else if (me.error) {
    body = (
      <ErrorState
        message={adminErrorMessage(me.error)}
        onRetry={() => void me.refetch()}
        retrying={me.isFetching}
      />
    );
  } else if (!me.data?.is_admin) {
    body = (
      <div role="alert" className="rounded-md border border-error/40 bg-error-soft p-4">
        <p className="font-semibold">Sem permissão</p>
        <p className="mt-1 text-secondary">{ADMIN_FORBIDDEN_MESSAGE}</p>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Conectado como {me.data.email_masked ?? 'administrador'}. Toda decisão exige motivo e fica
          registrada na auditoria. O servidor exige MFA (aal2) fora do ambiente local.
        </p>
        <Tabs defaultValue="groups">
          <TabsList aria-label="Filas de moderação">
            <TabsTrigger value="groups">Grupos</TabsTrigger>
            <TabsTrigger value="activities">Atividades</TabsTrigger>
            <TabsTrigger value="security">Eventos de segurança</TabsTrigger>
          </TabsList>
          <TabsContent value="groups" className="mt-4">
            <GroupsQueue />
          </TabsContent>
          <TabsContent value="activities" className="mt-4">
            <ActivitiesQueue />
          </TabsContent>
          <TabsContent value="security" className="mt-4">
            <SecurityEvents />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <PageShell title="Administração" documentTitle="Administração" width="wide">
      <meta name="robots" content="noindex, nofollow" />
      {body}
    </PageShell>
  );
}
