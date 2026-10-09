import { Link } from 'react-router';
import type { TerritoryMetrics } from '@shared/contracts/metrics.ts';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { Badge } from '@/components/ui/Badge';
import { Note } from '@/components/ui/States';

const QUALITY_TEXT: Record<string, string> = {
  complete: 'Dados completos para este território.',
  incomplete: 'Dados incompletos: parte das seções não foi incluída.',
  estimated: 'Valores estimados.',
  approximate: 'Território aproximado (agregação por local de votação).',
  unavailable: 'Dados indisponíveis para este território.',
  demo: 'DADOS DEMONSTRATIVOS — valores sintéticos, sem relação com resultados reais.',
};

export function DataQualityNote({
  entry,
  metrics,
  releaseId,
}: {
  entry: TerritoryIndexEntry;
  metrics?: TerritoryMetrics | null;
  releaseId: string;
}) {
  const quality = metrics?.data_quality ?? entry.data_quality;
  const warnings = metrics?.warnings ?? [];
  return (
    <section aria-label="Qualidade e método dos dados" className="flex flex-col gap-2">
      {quality === 'demo' ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="demo">Dados demonstrativos</Badge>
          <span className="text-secondary">{QUALITY_TEXT.demo}</span>
        </p>
      ) : (
        <p className="text-sm text-secondary">{QUALITY_TEXT[quality] ?? ''}</p>
      )}
      {entry.type === 'neighborhood' ? (
        <Note>
          “Bairro” aqui é uma <strong>aproximação</strong>: agrega os locais de votação cujo
          endereço fica neste bairro. Quem vota nesses locais não necessariamente mora no bairro.
          Não há limites oficiais de bairro — por isso ele aparece como ponto no mapa.
        </Note>
      ) : null}
      {warnings.length ? (
        <Note tone="warning">
          <p className="font-semibold">Alertas de consistência</p>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Note>
      ) : null}
      <p className="text-xs text-muted">
        Fonte: snapshot <span className="font-mono">{releaseId}</span>
        {entry.polling_places !== undefined
          ? ` · ${entry.polling_places} locais de votação agregados`
          : ''}{' '}
        ·{' '}
        <Link to="/metodologia" className="inline-flex min-h-6 items-center underline">
          Metodologia
        </Link>
      </p>
    </section>
  );
}
