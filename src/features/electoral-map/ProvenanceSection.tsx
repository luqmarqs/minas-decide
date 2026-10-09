import { formatDateNumeric, formatInt } from '@/lib/format';
import { useHighlights, usePois, useSnapshot } from './hooks';

/**
 * "Proveniência" (owner decision D32): the only place in the interface that lists files,
 * release, dates and hashes. Everywhere else the source is short ("Fonte: TSE").
 */
export function ProvenanceSection() {
  const { data: snap } = useSnapshot();
  const hq = useHighlights();
  const pq = usePois();
  if (!snap) return null;
  const tseDetails = [
    ...new Set(
      [...(hq.data?.items ?? []), ...(hq.data?.why_minas ?? [])]
        .flatMap((i) => (i.source_detail ?? i.source).split(/;\s+|\s·\s/))
        .map((t) => t.trim())
        .filter((t) => /TSE|Dados Abertos/i.test(t) && !/^Snapshot/i.test(t)),
    ),
  ];
  const m = snap.manifest;
  return (
    <section aria-labelledby="proveniencia-titulo" id="proveniencia">
      <h2 id="proveniencia-titulo">Proveniência</h2>
      <h3>Snapshot eleitoral</h3>
      <ul>
        <li>
          Release <span className="font-mono">{snap.releaseId}</span> ({m.status}), gerado em{' '}
          {formatDateNumeric(m.generated_at)}; pipeline{' '}
          <span className="font-mono">{m.pipeline_commit}</span>.
        </li>
        <li>
          {formatInt(m.files.length)} arquivos publicados, cada um com hash SHA-256 no{' '}
          <span className="font-mono">manifest.json</span>; {formatInt(m.records_count)} registros
          de {formatInt(m.territories_count)} territórios.
        </li>
        <li>Base de origem (somente leitura): {m.source_tables.join(', ') || '—'}.</li>
      </ul>
      <h3>TSE — dados abertos</h3>
      {tseDetails.length ? (
        <ul>
          {tseDetails.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p>Os arquivos do TSE usados nos destaques aparecem aqui quando publicados.</p>
      )}
      <h3>IBGE</h3>
      <ul>
        <li>
          Malha municipal do IBGE (API de malhas v3), servida como{' '}
          <span className="font-mono">/geo/mg-municipios.geojson</span>.
        </li>
        <li>
          Áreas de bairro aproximadas (<span className="font-mono">/geo/bairros/</span>): Voronoi
          dos locais de votação recortado pela malha municipal; não são limites oficiais.
        </li>
      </ul>
      <h3>OpenStreetMap</h3>
      <ul>
        {pq.data ? (
          <li>
            Terminais e estações: {pq.data.source} — licença {pq.data.license},{' '}
            {pq.data.attribution}; gerado em {formatDateNumeric(pq.data.generated_at)}.
          </li>
        ) : (
          <li>Terminais e estações: © OpenStreetMap contributors (ODbL).</li>
        )}
        <li>Mapa de fundo: © OpenFreeMap © OpenMapTiles, dados © OpenStreetMap contributors.</li>
      </ul>
    </section>
  );
}
