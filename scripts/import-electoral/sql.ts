/**
 * SQL templates for the SOURCE extraction. Only SELECT statements; parameters are
 * validated before interpolation (digits-only codes, integer ids).
 * Table names reflect the inventoried SOURCE schema (docs/DATA_SOURCE_AUDIT.md).
 */

export const ELECTORAL_TABLES = [
  'municipios',
  'locais',
  'totais_local',
  'candidaturas',
  'votos_cand',
  'historico_votos',
] as const;

/** TSE cargo codes present in SOURCE → public office codes */
export const CARGO_TO_OFFICE: Record<number, string> = {
  1: 'president',
  3: 'governor',
  5: 'senator',
  6: 'federal_deputy',
  7: 'state_deputy',
};
export const MAJORITARIAN_CARGOS = [1, 3, 5];
export const PROPORTIONAL_CARGOS = [6, 7];

function assertCode(v: string): string {
  if (!/^\d{1,7}$/.test(v)) throw new Error(`invalid code: ${v}`);
  return v;
}
function assertInt(v: number): number {
  if (!Number.isInteger(v) || v < 0) throw new Error(`invalid int: ${v}`);
  return v;
}

export const q = {
  probe: () =>
    `SELECT current_database() AS db, current_setting('transaction_read_only') AS read_only, current_setting('statement_timeout') AS statement_timeout, (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${ELECTORAL_TABLES.map((t) => `'${t}'`).join(',')})) AS electoral_tables`,

  health: () =>
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size, (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()) AS connections, (SELECT count(*) FROM pg_stat_activity WHERE state='active' AND datname=current_database()) AS active`,

  municipalities: (uf: string) =>
    `SELECT cd_municipio, cd_ibge, nome, lat, lon, uf FROM municipios WHERE uf='${uf.replace(/[^A-Z]/g, '')}' ORDER BY cd_ibge`,

  municipalityByIbge: (ibge: string) =>
    `SELECT cd_municipio, cd_ibge, nome, lat, lon, uf FROM municipios WHERE cd_ibge=${assertCode(ibge)}`,

  locais: (where: string) =>
    `SELECT id, cd_municipio, cd_ibge, nr_zona, nr_local, nome, bairro, lat, lon, coord_aproximada, qt_secoes FROM locais l WHERE ${where} ORDER BY id`,

  totais: (where: string, cargo: number) =>
    `SELECT t.local_id, t.cd_cargo, t.aptos, t.comparecimento, t.validos, t.brancos, t.nulos FROM totais_local t JOIN locais l ON l.id=t.local_id WHERE ${where} AND t.cd_cargo=${assertInt(cargo)} ORDER BY t.local_id`,

  candidaturas: (uf: string) =>
    `SELECT id, cd_eleicao, cd_cargo, ds_cargo, tipo, numero, nm_urna, sg_partido, nr_partido, votos_total, situacao FROM candidaturas WHERE uf='${uf.replace(/[^A-Z]/g, '')}' ORDER BY cd_cargo, id`,

  /** candidate ids for keyset batching */
  candidateIds: (uf: string, cargo: number) =>
    `SELECT id FROM candidaturas WHERE uf='${uf.replace(/[^A-Z]/g, '')}' AND cd_cargo=${assertInt(cargo)} ORDER BY id`,

  /** (candidate, polling place, votes) pairs for a batch of candidate ids restricted to polling places matching `where` (on alias l) */
  votes: (candidateIds: number[], where: string) =>
    `WITH ids AS (SELECT id FROM locais l WHERE ${where}) SELECT vc.candidatura_id, u.local_id, u.votos FROM votos_cand vc CROSS JOIN LATERAL unnest(vc.locais, vc.votos) AS u(local_id, votos) WHERE vc.candidatura_id IN (${candidateIds.map(assertInt).join(',')}) AND u.local_id IN (SELECT id FROM ids) AND u.votos > 0 ORDER BY vc.candidatura_id, u.local_id`,

  historico: (where: string) =>
    `SELECT h.candidatura_id, h.ano, h.nivel, h.cd_municipio, h.chave, h.votos, h.validos FROM historico_votos h WHERE h.nivel IN ('municipio','bairro') AND h.cd_municipio IN (SELECT cd_municipio FROM locais l WHERE ${where} GROUP BY cd_municipio) ORDER BY 1,2,3,4,5`,
};

/** WHERE fragment on alias `l` (locais) for the requested scope. */
export function scopeWhere(scope: { uf: string; ibge?: string }): string {
  const uf = scope.uf.replace(/[^A-Z]/g, '');
  return scope.ibge ? `l.uf='${uf}' AND l.cd_ibge=${assertCode(scope.ibge)}` : `l.uf='${uf}'`;
}
