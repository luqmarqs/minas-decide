import { Link } from 'react-router';
import { useSnapshot } from '@/features/electoral-map/hooks';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';

export function AppFooter() {
  // Passive: shows the release once a page has loaded the snapshot; never fetches it.
  const { data: snap } = useSnapshot({ enabled: false });
  return (
    <footer className="border-t border-border bg-surface-alt text-secondary">
      <div className="mx-auto grid max-w-(--content-max) gap-8 px-(--gutter) py-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        <section aria-labelledby="ft-sobre">
          <h2 id="ft-sobre" className="text-lg text-primary">
            Minas Decide
          </h2>
          <p className="mt-2 text-sm">
            Mobilização voluntária da campanha de Lula em Minas Gerais: agenda de atividades
            presenciais e mapa eleitoral público, cidade por cidade.
          </p>
          <p className="mt-2 text-sm">
            <Link
              to="/participar"
              className="inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline"
            >
              Participar da campanha
            </Link>
          </p>
        </section>
        <nav aria-labelledby="ft-info">
          <h2 id="ft-info" className="font-body text-sm font-semibold tracking-normal text-primary">
            Informações
          </h2>
          <ul className="mt-2 flex flex-col text-sm">
            <li>
              <Link
                to="/metodologia"
                className="inline-flex min-h-11 items-center underline-offset-2 hover:underline"
              >
                Metodologia
              </Link>
            </li>
            <li>
              <Link
                to="/privacidade"
                className="inline-flex min-h-11 items-center underline-offset-2 hover:underline"
              >
                Privacidade
              </Link>
            </li>
            <li>
              <Link
                to="/termos"
                className="inline-flex min-h-11 items-center underline-offset-2 hover:underline"
              >
                Termos de uso
              </Link>
            </li>
          </ul>
        </nav>
        <section aria-labelledby="ft-fonte">
          <h2
            id="ft-fonte"
            className="font-body text-sm font-semibold tracking-normal text-primary"
          >
            Fonte dos dados
          </h2>
          <p className="mt-2 text-sm">
            Indicadores eleitorais de um snapshot estático e versionado
            {snap ? (
              <>
                {' '}
                (<span className="font-mono text-xs">{snap.releaseId}</span> ·{' '}
                {SNAPSHOT_STATUS_LABEL[snap.status]})
              </>
            ) : null}
            . Bairros são aproximações por local de votação.
          </p>
          <p className="mt-2 text-xs text-muted">
            Mapa: © OpenFreeMap © OpenMapTiles Dados © OpenStreetMap contributors · Malha municipal:
            IBGE.
          </p>
        </section>
        <section aria-labelledby="ft-org">
          <h2 id="ft-org" className="font-body text-sm font-semibold tracking-normal text-primary">
            Organização responsável
          </h2>
          <p className="mt-2 text-sm" data-testid="footer-responsavel">
            <strong className="text-primary">Responsável:</strong> [a definir — nome e CNPJ/CPF]
          </p>
          <p className="mt-1 text-xs text-muted">
            Pendência legal: identificação do responsável pelo conteúdo de campanha ainda não
            informada.
          </p>
          <p className="mt-2 text-sm">Contato: [canal oficial a definir]</p>
        </section>
      </div>
    </footer>
  );
}
