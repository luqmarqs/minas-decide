import { PageShell, Prose } from '@/components/layouts/PageShell';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { formatDateNumeric } from '@/lib/format';
import { StatusBadge } from '@/features/electoral-map/MapLegend';
import { useMethodology, useSnapshot } from '@/features/electoral-map/hooks';

export default function MetodologiaPage() {
  const { data: snap } = useSnapshot();
  const q = useMethodology();

  return (
    <PageShell
      title="Metodologia"
      lead="De onde vêm os números, como são calculados e quais são seus limites."
      eyebrow={snap ? <StatusBadge status={snap.status} /> : null}
    >
      {q.isLoading || !snap ? (
        <LoadingBlock label="Carregando metodologia…" lines={6} />
      ) : q.error || !q.data ? (
        <ErrorState
          message="A metodologia deste snapshot não carregou."
          onRetry={() => void q.refetch()}
        />
      ) : (
        <Prose>
          <p>{q.data.summary}</p>

          <h2>Snapshot em uso</h2>
          <ul>
            <li>
              Versão: <span className="font-mono">{snap.releaseId}</span> (metodologia{' '}
              {q.data.version})
            </li>
            <li>Gerado em: {formatDateNumeric(snap.manifest.generated_at)}</li>
            <li>
              Anos: {snap.manifest.years.join(', ')} · turnos: {snap.manifest.rounds.join(', ')}
            </li>
            <li>Territórios: {snap.manifest.territories_count}</li>
            {snap.manifest.coverage_notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {snap.manifest.warnings.length ? (
            <>
              <h3>Alertas registrados</h3>
              <ul>
                {snap.manifest.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          ) : null}

          <h2>Bairros são aproximados</h2>
          <p>{q.data.neighborhood_note}</p>

          <h2>Como cada indicador é calculado</h2>
          <dl className="grid gap-2 sm:grid-cols-[14rem_1fr]">
            {Object.entries(q.data.denominators).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-primary">{k}</dt>
                <dd className="text-secondary">{v}</dd>
              </div>
            ))}
          </dl>

          <h2>Comparação 2022 × 2026</h2>
          <p>{q.data.comparison_note}</p>

          <h2>Fontes</h2>
          <ul>
            {q.data.sources.map((s) => (
              <li key={s.label}>
                <strong className="text-primary">{s.label}:</strong> {s.note}
              </li>
            ))}
            <li>
              <strong className="text-primary">Mapa de fundo:</strong> © OpenFreeMap © OpenMapTiles
              Dados © OpenStreetMap contributors.
            </li>
            <li>
              <strong className="text-primary">Malha municipal:</strong> IBGE (API de malhas,
              qualidade mínima).
            </li>
          </ul>

          <h2>Limitações</h2>
          <ul>
            {q.data.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>

          <h2>O que não fazemos</h2>
          <ul>
            <li>
              Não criamos índices de persuasão, rankings políticos nem inferências sobre pessoas.
            </li>
            <li>Não corrigimos divergências silenciosamente: elas aparecem como alertas.</li>
            <li>
              O mapa não consulta bancos de dados em tempo real: usa arquivos estáticos versionados.
            </li>
          </ul>
        </Prose>
      )}
    </PageShell>
  );
}
