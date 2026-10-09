import { Link } from 'react-router';
import { useSnapshot } from '@/features/electoral-map/hooks';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshot';

export function AppFooter() {
  const { data: snap } = useSnapshot();
  return (
    <footer className="border-t border-border bg-surface-alt text-secondary">
      <div className="mx-auto grid max-w-(--content-max) gap-8 px-(--gutter) py-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        <section aria-labelledby="ft-sobre">
          <h2 id="ft-sobre" className="font-display text-lg text-primary">
            Minas em Movimento
          </h2>
          <p className="mt-2 text-sm">
            Atlas eleitoral público de Minas Gerais e agenda de atividades presenciais abertas à
            participação voluntária.
          </p>
          <p className="mt-2 text-xs text-muted">Identidade visual provisória.</p>
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
          <p className="mt-2 text-sm">
            [A definir — nome e CNPJ/identificação da organização responsável]
          </p>
          <p className="mt-2 text-sm">Contato: [canal oficial a definir]</p>
        </section>
      </div>
    </footer>
  );
}
