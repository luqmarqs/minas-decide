# ADR 0004 — Formato e publicação do snapshot eleitoral estático

**Status:** aceito — 2026-10-08

## Contexto
Spec §4.5/§4.6/§4.12: o navegador consome agregados pré-processados e versionados; nada pesado no estado React; manifest com hashes e status.

## Decisão
Layout (ver `shared/contracts/snapshot.ts`):

```
public/data/manifest.json                        SnapshotManifest (status validated|partial|demo, SHA-256 por arquivo)
public/data/<release>/territories-index.json     índice de territórios (busca client-side)
public/data/<release>/candidates.json            índice de candidaturas (sem PII; dados públicos TSE)
public/data/<release>/methodology.json           metodologia pt-BR
public/data/<release>/layers/<ano>-r<turno>-<camada>[-<cand>].json   valores por território para colorir o mapa
public/data/<release>/metrics/mg.json            métricas do estado
public/data/<release>/metrics/mg-<ibge7>.json    métricas do município + seus bairros
```

- Um arquivo por município (853) mantém cada download pequeno (dezenas de KB) e cacheável; o painel de bairro carrega apenas o arquivo do município pai.
- Camadas de mapa são arquivos únicos por (ano, turno, camada[, candidatura]) com `values: {territory_id: number}` — ~853 entradas para municípios; bairros são coloridos a partir do arquivo de métricas do município selecionado.
- Conteúdo público mínimo (ADR D07): totais por território para os 5 cargos; todas as candidaturas majoritárias; top 10 proporcionais por território + candidaturas com histórico 2022.
- Intermediários (`data/private/extract/<release>/`) ficam gitignored; nunca são publicados.
- `status` só é `validated` quando as validações de `scripts/validate-data` passam sem erro bloqueante; divergências toleradas viram `warnings`.

## Consequências
- Para o estado inteiro, `metrics/` soma ~853 arquivos; Static Assets do Workers suportam (limite por arquivo e total verificados no build).
- Rollback = republicar o `manifest.json` apontando para o release anterior (arquivos de releases antigos podem coexistir).
