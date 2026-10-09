import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { safeRedirectPath, useSession } from '@/lib/auth';
import { SignInCodeForm } from '@/features/auth/SignInCodeForm';

/** /entrar — sign-in by e-mail code (ADR 0005). `?next=` is validated (no open redirect). */
export default function EntrarPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const next = safeRedirectPath(sp.get('next'));
  const session = useSession();

  let body;
  if (session.status === 'loading') {
    body = <LoadingBlock label="Verificando sua sessão…" lines={2} />;
  } else if (session.status === 'unconfigured') {
    body = <Note tone="warning">Login não configurado neste ambiente.</Note>;
  } else if (session.status === 'active') {
    body = (
      <div className="flex flex-col gap-4">
        <Note>
          Você já entrou
          {session.session.user.email ? ` como ${session.session.user.email}` : ''}.
        </Note>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={next}>Continuar</ButtonLink>
          <ButtonLink to="/minhas-atividades" variant="secondary">
            Minhas atividades
          </ButtonLink>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <SignInCodeForm onSignedIn={() => navigate(next, { replace: true })} />
        <p className="text-sm text-secondary">
          Ainda não tem cadastro?{' '}
          <Link to="/participar" className="underline">
            Cadastre-se para participar
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <PageShell
      title="Entrar"
      lead="Para quem já tem cadastro: entre com um código enviado ao seu e-mail. Não há senha."
    >
      {body}
    </PageShell>
  );
}
