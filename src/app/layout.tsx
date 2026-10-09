import { isRouteErrorResponse, Link, Outlet, ScrollRestoration, useRouteError } from 'react-router';
import { AppFooter } from '@/components/layouts/AppFooter';
import { AppHeader } from '@/components/layouts/AppHeader';
import { PageShell } from '@/components/layouts/PageShell';
import { ErrorState } from '@/components/ui/States';

function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--z-toast) focus:rounded-md focus:bg-surface-raised focus:px-4 focus:py-3 focus:shadow-raised"
    >
      Pular para o conteúdo
    </a>
  );
}

export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppHeader />
      <main id="conteudo" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <AppFooter />
      <ScrollRestoration />
    </div>
  );
}

export function RouteError() {
  const err = useRouteError();
  const notFound = isRouteErrorResponse(err) && err.status === 404;
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppHeader />
      <main id="conteudo" className="flex-1">
        <PageShell title={notFound ? 'Página não encontrada' : 'Algo deu errado'}>
          <ErrorState
            title={notFound ? 'Endereço inexistente' : 'Erro inesperado ao abrir esta página'}
            message={
              <p>
                {notFound
                  ? 'Confira o endereço.'
                  : 'Recarregue a página. Se persistir, tente mais tarde.'}{' '}
                <Link to="/" className="underline">
                  Voltar ao mapa
                </Link>
              </p>
            }
          />
        </PageShell>
      </main>
    </div>
  );
}
