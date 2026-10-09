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
  releaseId: _releaseId,
}: {
  entry: TerritoryIndexEntry;
  metrics?: TerritoryMetrics | null;
  releaseId: string;
}) {
  const quality = metrics?.data_quality ?? entry.data_quality;
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
          Não há limites oficiais de bairro: no mapa, a área do bairro é aproximada pelos locais de
          votação (Voronoi) e não é um limite oficial.
        </Note>
      ) : entry.type === 'municipality' ? (
        <p className="text-sm text-secondary" data-testid="neighborhood-areas-note">
          Bairros no mapa: áreas aproximadas pelos locais de votação (Voronoi), não são limites
          oficiais.
        </p>
      ) : null}
      {/* D30: snapshot warnings stay in the files and the methodology data, not in the UI. */}
      <p className="text-xs text-muted">
        Fonte: TSE
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
