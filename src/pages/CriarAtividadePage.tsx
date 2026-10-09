import { useState } from 'react';
import type { MyActivity } from '@shared/contracts/activities.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import { messageForError } from '@/lib/api';
import { formatActivityWhen } from '@/lib/format';
import { useMe, useSession } from '@/lib/auth';
import { ProfileReviewGate } from '@/features/account/ProfileReview';
import { ActivityEditor } from '@/features/activities/ActivityEditor';
import { SendLinkForm } from '@/features/auth/SendLinkForm';

const NEXT = '/criar-atividade';

export default function CriarAtividadePage() {
  const session = useSession();
  const me = useMe(session.status === 'active' ? session.session : null);
  const [saved, setSaved] = useState<MyActivity | null>(null);

  let body;
  if (saved) {
    body = (
      <section
        role="status"
        aria-labelledby="act-sent"
        className="flex flex-col gap-3 rounded-md border border-success/40 bg-success-soft p-4"
      >
        <h2 id="act-sent" className="font-body text-xl font-semibold tracking-normal">
          Atividade enviada para análise
        </h2>
        <p>
          “{saved.title}” — {formatActivityWhen(saved.starts_at, saved.ends_at)}. A equipe vai
          revisar antes de publicar no mapa e na agenda. <strong>Ainda não está pública.</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/minhas-atividades">Acompanhar em Minhas atividades</ButtonLink>
          <ButtonLink to="/" variant="secondary">
            Voltar ao mapa
          </ButtonLink>
        </div>
      </section>
    );
  } else if (session.status === 'loading' || (session.status === 'active' && me.isLoading)) {
    body = <LoadingBlock label="Verificando sua sessão…" lines={3} />;
  } else if (session.status === 'unconfigured') {
    body = (
      <Note tone="warning">
        Login não configurado neste ambiente: não é possível criar atividades.
      </Note>
    );
  } else if (session.status === 'none') {
    body = (
      <div className="flex flex-col gap-6">
        <Note>
          Para organizar uma atividade é preciso ter cadastro com <strong>e-mail verificado</strong>
          . Assim a equipe sabe com quem falar, e o mapa não recebe propostas anônimas.
        </Note>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/participar">Fazer cadastro</ButtonLink>
        </div>
        <SendLinkForm
          idPrefix="criar-link"
          next={NEXT}
          title="Já tenho cadastro: entrar por e-mail"
        />
      </div>
    );
  } else if (me.error) {
    body = (
      <ErrorState
        title="Não foi possível verificar sua conta"
        message={messageForError(me.error)}
        onRetry={() => void me.refetch()}
        retrying={me.isFetching}
      />
    );
  } else if (me.data?.account_state === 'suspended') {
    body = <Note tone="warning">Sua conta está suspensa e não pode propor atividades.</Note>;
  } else if (me.data && !me.data.email_verified) {
    body = (
      <div className="flex flex-col gap-6">
        <section
          aria-labelledby="verifique"
          className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-soft p-4"
        >
          <h2 id="verifique" className="font-body text-xl font-semibold tracking-normal">
            Verifique seu e-mail para continuar
          </h2>
          <p>
            Sua sessão neste navegador é <strong>provisória</strong>
            {me.data.email_masked ? ` (${me.data.email_masked})` : ''}. Abra o link que enviamos por
            e-mail <strong>neste navegador</strong> para confirmar. Você pode ir preenchendo a
            atividade abaixo: o rascunho fica guardado neste navegador por até 7 dias.
          </p>
        </section>
        <SendLinkForm idPrefix="criar-link" next={NEXT} title="Reenviar link de confirmação" />
        <ActivityEditor
          mode="create"
          draftOwner={me.data.user_id}
          blockedReason="Envio liberado depois que o e-mail for confirmado. O rascunho continua guardado neste navegador."
          onSaved={setSaved}
        />
      </div>
    );
  } else if (me.data?.profile_review_required) {
    // P-SEC-1: the editor (and its draft) stays behind the review until confirmed.
    body = (
      <ProfileReviewGate me={me.data}>
        <ActivityEditor mode="create" draftOwner={me.data.user_id} onSaved={setSaved} />
      </ProfileReviewGate>
    );
  } else {
    body = <ActivityEditor mode="create" draftOwner={me.data?.user_id} onSaved={setSaved} />;
  }

  return (
    <PageShell
      title="Propor uma atividade da campanha"
      lead="Panfletagem, encontro, caminhada… mobilize sua região pela campanha de Lula. A atividade é revisada antes de aparecer no mapa."
    >
      {body}
    </PageShell>
  );
}
