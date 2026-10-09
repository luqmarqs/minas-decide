# ELECTORAL_EXPORT_REPORT — spike, exportação e snapshot (rodada 1)

**Data:** 2026-10-08/09 (America/Sao_Paulo) · **Origem:** alias `electoral-source-readonly` (ver `DATA_SOURCE_AUDIT.md`) · **Executor:** Fable (sessão principal), com autorização do proprietário para leitura via CLI autenticado.

**Resultado em uma linha:** `INTEGRADOS: Minas Gerais completa (853 municípios, 6.077 bairros aproximados), eleição 2026 1º turno, histórico 2022 para 2 candidaturas` — snapshot `mg-2026r1-20261008`, status `validated`, 903 arquivos, 68,7 MB, 0 erros de validação, 1 advertência.

## 1. Plano de extração

- Acesso: Management API via `supabase db query --linked --workdir ~/.minas-em-movimento/source-readonly` (fora do repo). Role `postgres`; guard = `BEGIN READ ONLY; SET LOCAL statement_timeout; SET LOCAL lock_timeout = '1s'; … COMMIT;` (verificado: DDL falha com 25006).
- Extrator: `scripts/import-electoral/export.ts` — recusa SQL que não seja `SELECT`/`WITH`, múltiplos statements ou palavras de escrita; verifica `transaction_read_only = on` e 6 tabelas eleitorais; recusa se o workdir for o repositório ou se o ref coincidir com o TARGET; pausa 400 ms entre consultas; sem paralelismo; `--max-rows` (5 M); timeouts 45–60 s.
- Consultas: `municipios` (MG) → `locais` (MG) → `totais_local` × 5 cargos → `candidaturas` (MG) → votos por candidatura × local em lotes keyset de 40 candidaturas (majoritárias em lote único) → `historico_votos` (2022, níveis município e bairro).
- Saída privada: `data/private/extract/<release>/` (gitignored) + `extract-manifest.json` (linhas, bytes, ms, SHA-256 por arquivo, saúde antes/depois).

## 2. Spike — Mariana (IBGE 3140001)

| Item | Valor |
|---|---|
| Escolha | 40 locais, 32 bairros, 160 seções (município médio, muitos bairros) |
| Consultas | 56 (dimensões + 5 totais + 47 lotes de votos + histórico) |
| Linhas | 9.752 |
| Tempo total de consultas (parede, inclui overhead do CLI ~2,4 s/consulta) | 152,7 s; máximo por consulta 6,1 s |
| Saúde do SOURCE antes → depois | conexões 9 → 8; ativas 1 → 1; 482 MB |
| Validação (manual, Python) | sem votos negativos; `aptos` e `comparecimento` idênticos entre cargos; Senador com 2 votos/eleitor; divergências Σcandidaturas−válidos de 5 a 107 votos por cargo (≤ 0,32 %) |
| Candidaturas rastreadas no município | 2026 vs 2022 município: Dep. Federal 1.186 vs 1.140; Dep. Estadual 434 vs 228; 31 linhas de bairro 2022 cada |

Snapshot do spike (`--out` temporário): 34 territórios, 51 arquivos, 0,6 MB, status `partial`, 0 erros.

## 3. Decisão GO/NO-GO

**GO.** Banco pequeno (482 MB), índices adequados, nenhuma consulta acima de 6,1 s, sem impacto nas conexões. Exportação completa executada em seguida.

## 4. Exportação completa — Minas Gerais

| Item | Valor |
|---|---|
| Release | `mg-2026r1-20261008` |
| Consultas | 56 sequenciais |
| Linhas extraídas | 2.023.422 (votos: 1.946.904 pares candidatura×local; totais: 50.365; locais: 10.073; histórico 2022: 13.450; candidaturas: 1.777; municípios: 853) |
| Bytes privados | 113 MB (JSON) |
| Tempo de consultas (parede) | 183,7 s; máximo por consulta 5,5 s |
| Saúde antes → depois | conexões 8 → 8; ativas 1 → 1 |
| Erros/timeouts | 0 |

## 5. Construção do snapshot público

`scripts/import-electoral/build-snapshot.ts` agregou por estado, município (`mg-<ibge7>`) e bairro (`mg-<ibge7>-<slug>`):

| Item | Valor |
|---|---|
| Territórios | 6.931 (1 estado, 853 municípios, 6.077 bairros) |
| Arquivos | 903 (índice 2,1 MB; 854 arquivos de métricas, mediana 45 KB, maior 2,2 MB = Belo Horizonte; 46 camadas de mapa ≤ 17 KB; candidatos 274 KB; metodologia) |
| Registros de resultado | ver `manifest.records_count` |
| Conteúdo | totais (aptos, comparecimento, abstenção, válidos, brancos, nulos) por território; todas as candidaturas majoritárias; top 10 proporcionais por território + rastreadas; comparação 2022→2026 para 2 candidaturas |
| Status | `validated` |
| Validação (`npm run data:validate`) | 903/903 arquivos com SHA-256 e contratos conferidos; 0 erros; 1 advertência |

### Verificações cruzadas e divergências (não corrigidas)

- **Totais de MG (Presidente):** aptos 16.372.372; comparecimento 12.637.274; abstenção 3.735.098 (22,81 %); válidos 11.976.235; brancos 268.302; nulos 392.176 → válidos+brancos+nulos = 12.636.713 vs comparecimento 12.637.274 (diferença 561, 0,004 %).
- **Dep. Federal (MG):** Σ candidaturas 11.474.265 vs válidos 11.380.151 → diferença **94.114 (0,75 %)**, idêntica à diferença entre válidos+brancos+nulos (12.533.053) e comparecimento (12.627.167). Interpretação: a fonte exclui dos válidos os votos de candidaturas anuladas sub judice. Registrado como `warnings` no estado e nos territórios afetados; 1 bairro (Capoeirão, IBGE 3121605) tem candidatura com 99 votos acima de 77 válidos.
- **Grafias de bairro unificadas pela normalização:** 2 casos (acentos), listados em `manifest.warnings`.
- **183 locais com coordenada aproximada** (excluídos do centroide do bairro; contados nos totais).
- **Comparação 2022→2026 (estado):** Dep. Federal rastreada 208.332 → 229.535 votos (+0,16 pp dos válidos); Dep. Estadual rastreada 51.304 → 104.524 (+0,47 pp). Resultados públicos TSE; a nota de metodologia esclarece que não indicam transferência de votos.
- **Amostragem de 10 municípios:** NÃO EXECUTADA formalmente nesta rodada (apenas Mariana validada manualmente + validador automático em 6.931 territórios). Pendência P-DATA-1.

## 6. Privacidade e isolamento

- Nenhum arquivo publicado contém e-mail, telefone, CPF, ID de usuário, token, connection string, ref ou URL do SOURCE (`build-snapshot` recusa escrever; `data:validate` e `check:isolation` reverificam).
- Nomes de candidaturas (`nm_urna`), partidos e números são dados públicos de candidatura (TSE).
- `data/private/` permanece fora do Git e fora de `public/`.
- O frontend e o Worker não têm qualquer caminho para o SOURCE; o Worker responde 404 em `/territories/:id/metrics` indicando o snapshot estático.

## 7. Reprodução

`docs/IMPORT_GUIDE.md`. Comandos executados nesta rodada:

```
npm run etl:export -- --dry-run
npm run etl:export -- --municipality 3140001 --release spike-mariana
npm run etl:export -- --all-mg --release mg-2026r1-20261008
npm run etl:build -- --extract data/private/extract/mg-2026r1-20261008
npm run data:validate
```

## 8. Próximos passos de dados

1. Amostragem manual de 10 municípios contra totais oficiais do TSE (P-DATA-1).
2. 2º turno 2026 após 25/10: repetir extração com `round` 2 quando o SOURCE for atualizado (o pipeline precisa de um parâmetro de eleição; hoje assume 1º turno).
3. Criar usuário `SELECT`-only no SOURCE e migrar o extrator para `ELECTORAL_SOURCE_DATABASE_URL`.
4. Avaliar mover `public/data` (69 MB) para R2 com cache; hoje está em Static Assets/Git.
