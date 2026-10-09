# TSE_SAMPLE_REPORT — amostragem do snapshot contra totais oficiais do TSE (P-DATA-1)

Gerado por `scripts/tse/sample-check.ts` em 2026-10-09T03:33:45.474Z. Snapshot conferido: `mg-2026r1-20261008` (1º turno de 2026).

## Fonte oficial

- Portal de Dados Abertos do TSE, conjunto "Resultados - 2026" (<https://dadosabertos.tse.jus.br/dataset/resultados-2026>).
- Totais: `https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip` (Last-Modified HTTP: Thu, 08 Oct 2026 19:47:18 GMT; geração TSE: 08/10/2026 16:32:38).
- Candidaturas: `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip` (Last-Modified HTTP: Thu, 08 Oct 2026 23:12:53 GMT; geração TSE: 08/10/2026 19:31:37); lido por HTTP Range (somente as entradas MG e BR; CRC-32 verificado).
- A API JSON `resultados.tse.jus.br/oficial/ele2026/...` **não foi usada**: nas tentativas a raiz e os caminhos de 2022/2026 responderam 404 (ver "Tentativas HTTP").
- Totais de Presidente vêm da entrada `BR` do arquivo (o Presidente é publicado só no arquivo nacional, por UF); os demais cargos, da entrada `MG`.
- Dado oficial somado por zona eleitoral (linhas `munzona`, `ST_VOTO_EM_TRANSITO = N`). Comparação de candidaturas usa `QT_VOTOS_NOMINAIS_VALIDOS` (válidos, exclui anulados/sub judice).

## Resultado

- Municípios amostrados: 10 de 10. Indicadores comparados: **330**; idênticos: **312**; divergentes: **18**.
- Maior diferença absoluta: 238.
- Aptos, comparecimento, abstenção, brancos e válidos (5 cargos): 90 comparações, **0 divergentes**.
- Votos nulos de Presidente divergentes: 9; candidaturas divergentes: 9 (ver explicações; nenhuma divergência é "sem explicação" se a coluna não disser isso).
- Divergências marcadas "SEM EXPLICAÇÃO": 0.

### Divergências

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| BELO HORIZONTE | Votos nulos (Presidente) | 41.594 | 41.661 | -67 | -0,161 % | DIFERENÇA — TSE registra 67 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| BELO HORIZONTE | Governador 29 HENRIQUE ÁREAS | 238 | 0 | 238 | — | DIFERENÇA — TSE classifica 238 de 238 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| MARIANA | Votos nulos (Presidente) | 1.842 | 1.848 | -6 | -0,325 % | DIFERENÇA — TSE registra 6 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| MARIANA | Governador 29 HENRIQUE ÁREAS | 5 | 0 | 5 | — | DIFERENÇA — TSE classifica 5 de 5 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| CONTAGEM | Votos nulos (Presidente) | 11.935 | 11.955 | -20 | -0,167 % | DIFERENÇA — TSE registra 20 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| CONTAGEM | Governador 29 HENRIQUE ÁREAS | 45 | 0 | 45 | — | DIFERENÇA — TSE classifica 45 de 45 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| JUIZ DE FORA | Votos nulos (Presidente) | 10.192 | 10.205 | -13 | -0,127 % | DIFERENÇA — TSE registra 13 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| JUIZ DE FORA | Governador 29 HENRIQUE ÁREAS | 52 | 0 | 52 | — | DIFERENÇA — TSE classifica 52 de 52 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| UBERLÂNDIA | Votos nulos (Presidente) | 11.823 | 11.832 | -9 | -0,076 % | DIFERENÇA — TSE registra 9 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| UBERLÂNDIA | Governador 29 HENRIQUE ÁREAS | 80 | 0 | 80 | — | DIFERENÇA — TSE classifica 80 de 80 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| MONTES CLAROS | Votos nulos (Presidente) | 7.524 | 7.534 | -10 | -0,133 % | DIFERENÇA — TSE registra 10 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| MONTES CLAROS | Governador 29 HENRIQUE ÁREAS | 33 | 0 | 33 | — | DIFERENÇA — TSE classifica 33 de 33 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| POÇOS DE CALDAS | Votos nulos (Presidente) | 2.670 | 2.674 | -4 | -0,150 % | DIFERENÇA — TSE registra 4 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| POÇOS DE CALDAS | Governador 29 HENRIQUE ÁREAS | 9 | 0 | 9 | — | DIFERENÇA — TSE classifica 9 de 9 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| TEÓFILO OTONI | Votos nulos (Presidente) | 2.381 | 2.385 | -4 | -0,168 % | DIFERENÇA — TSE registra 4 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| TEÓFILO OTONI | Governador 29 HENRIQUE ÁREAS | 8 | 0 | 8 | — | DIFERENÇA — TSE classifica 8 de 8 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| GOVERNADOR VALADARES | Votos nulos (Presidente) | 3.419 | 3.424 | -5 | -0,146 % | DIFERENÇA — TSE registra 5 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| GOVERNADOR VALADARES | Governador 29 HENRIQUE ÁREAS | 10 | 0 | 10 | — | DIFERENÇA — TSE classifica 10 de 10 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |

## Tabela completa

Dif. = snapshot − oficial. Dif. % relativa ao oficial.


### BELO HORIZONTE (IBGE 3106200) — Capital / RMBH

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| BELO HORIZONTE | Aptos (eleitorado) | 1.966.966 | 1.966.966 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Comparecimento | 1.502.632 | 1.502.632 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Abstenção | 464.334 | 464.334 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Votos válidos (Presidente) | 1.430.488 | 1.430.488 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Votos brancos (Presidente) | 30.483 | 30.483 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Votos nulos (Presidente) | 41.594 | 41.661 | -67 | -0,161 % | DIFERENÇA — TSE registra 67 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| BELO HORIZONTE | Votos válidos (Governador) | 1.382.936 | 1.382.936 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Votos válidos (Senador) | 2.551.775 | 2.551.775 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Votos válidos (Dep. Federal) | 1.354.166 | 1.354.166 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Votos válidos (Dep. Estadual) | 1.334.180 | 1.334.180 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 13 LULA | 592.037 | 592.037 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 14 RENAN SANTOS | 39.081 | 39.081 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 16 HERTZ DIAS | 969 | 969 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 21 EDMILSON COSTA | 315 | 315 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 22 FLAVIO BOLSONARO | 690.960 | 690.960 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 27 CLARIANA BARAO | 554 | 554 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 29 RUI COSTA PIMENTA | 335 | 335 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 30 ZEMA | 17.464 | 17.464 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 35 VETERINÁRIO WILSON GRASSI | 273 | 273 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 55 RONALDO CAIADO | 33.055 | 33.055 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 70 ESCRITOR AUGUSTO CURY | 52.809 | 52.809 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Presidente 80 SAMARA | 2.636 | 2.636 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 10 CLEITINHO AZEVEDO | 562.539 | 562.539 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 12 ALEXANDRE KALIL | 130.745 | 130.745 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 13 PATRUS ANANIAS | 412.737 | 412.737 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 14 BEN MENDES | 11.690 | 11.690 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 15 GABRIEL | 75.451 | 75.451 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 16 RAFAEL DUDA | 662 | 662 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 21 PROFESSOR TÚLIO LOPES | 1.315 | 1.315 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 22 FLÁVIO ROSCOE | 125.203 | 125.203 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 29 HENRIQUE ÁREAS | 238 | 0 | 238 | — | DIFERENÇA — TSE classifica 238 de 238 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| BELO HORIZONTE | Governador 55 MATEUS SIMÕES | 58.931 | 58.931 | 0 | 0,000 % | idêntico |
| BELO HORIZONTE | Governador 80 INDIRA XAVIER | 3.663 | 3.663 | 0 | 0,000 % | idêntico |

### MARIANA (IBGE 3140001) — Central (Mariana)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| MARIANA | Aptos (eleitorado) | 52.424 | 52.424 | 0 | 0,000 % | idêntico |
| MARIANA | Comparecimento | 40.170 | 40.170 | 0 | 0,000 % | idêntico |
| MARIANA | Abstenção | 12.254 | 12.254 | 0 | 0,000 % | idêntico |
| MARIANA | Votos válidos (Presidente) | 37.006 | 37.006 | 0 | 0,000 % | idêntico |
| MARIANA | Votos brancos (Presidente) | 1.316 | 1.316 | 0 | 0,000 % | idêntico |
| MARIANA | Votos nulos (Presidente) | 1.842 | 1.848 | -6 | -0,325 % | DIFERENÇA — TSE registra 6 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| MARIANA | Votos válidos (Governador) | 33.282 | 33.282 | 0 | 0,000 % | idêntico |
| MARIANA | Votos válidos (Senador) | 56.866 | 56.866 | 0 | 0,000 % | idêntico |
| MARIANA | Votos válidos (Dep. Federal) | 33.602 | 33.602 | 0 | 0,000 % | idêntico |
| MARIANA | Votos válidos (Dep. Estadual) | 32.561 | 32.561 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 13 LULA | 21.541 | 21.541 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 14 RENAN SANTOS | 869 | 869 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 16 HERTZ DIAS | 25 | 25 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 21 EDMILSON COSTA | 15 | 15 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 22 FLAVIO BOLSONARO | 11.762 | 11.762 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 27 CLARIANA BARAO | 23 | 23 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 29 RUI COSTA PIMENTA | 5 | 5 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 30 ZEMA | 264 | 264 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 35 VETERINÁRIO WILSON GRASSI | 6 | 6 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 55 RONALDO CAIADO | 571 | 571 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 70 ESCRITOR AUGUSTO CURY | 1.878 | 1.878 | 0 | 0,000 % | idêntico |
| MARIANA | Presidente 80 SAMARA | 47 | 47 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 10 CLEITINHO AZEVEDO | 14.998 | 14.998 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 12 ALEXANDRE KALIL | 1.872 | 1.872 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 13 PATRUS ANANIAS | 12.717 | 12.717 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 14 BEN MENDES | 280 | 280 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 15 GABRIEL | 657 | 657 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 16 RAFAEL DUDA | 29 | 29 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 21 PROFESSOR TÚLIO LOPES | 33 | 33 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 22 FLÁVIO ROSCOE | 1.737 | 1.737 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 29 HENRIQUE ÁREAS | 5 | 0 | 5 | — | DIFERENÇA — TSE classifica 5 de 5 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| MARIANA | Governador 55 MATEUS SIMÕES | 847 | 847 | 0 | 0,000 % | idêntico |
| MARIANA | Governador 80 INDIRA XAVIER | 112 | 112 | 0 | 0,000 % | idêntico |

### CONTAGEM (IBGE 3118601) — RMBH (Contagem)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| CONTAGEM | Aptos (eleitorado) | 463.466 | 463.466 | 0 | 0,000 % | idêntico |
| CONTAGEM | Comparecimento | 375.467 | 375.467 | 0 | 0,000 % | idêntico |
| CONTAGEM | Abstenção | 87.999 | 87.999 | 0 | 0,000 % | idêntico |
| CONTAGEM | Votos válidos (Presidente) | 355.282 | 355.282 | 0 | 0,000 % | idêntico |
| CONTAGEM | Votos brancos (Presidente) | 8.230 | 8.230 | 0 | 0,000 % | idêntico |
| CONTAGEM | Votos nulos (Presidente) | 11.935 | 11.955 | -20 | -0,167 % | DIFERENÇA — TSE registra 20 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| CONTAGEM | Votos válidos (Governador) | 339.745 | 339.745 | 0 | 0,000 % | idêntico |
| CONTAGEM | Votos válidos (Senador) | 632.205 | 632.205 | 0 | 0,000 % | idêntico |
| CONTAGEM | Votos válidos (Dep. Federal) | 334.176 | 334.176 | 0 | 0,000 % | idêntico |
| CONTAGEM | Votos válidos (Dep. Estadual) | 329.328 | 329.328 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 13 LULA | 139.596 | 139.596 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 14 RENAN SANTOS | 9.893 | 9.893 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 16 HERTZ DIAS | 211 | 211 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 21 EDMILSON COSTA | 64 | 64 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 22 FLAVIO BOLSONARO | 178.639 | 178.639 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 27 CLARIANA BARAO | 141 | 141 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 29 RUI COSTA PIMENTA | 52 | 52 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 30 ZEMA | 3.767 | 3.767 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 35 VETERINÁRIO WILSON GRASSI | 58 | 58 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 55 RONALDO CAIADO | 7.692 | 7.692 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 70 ESCRITOR AUGUSTO CURY | 14.664 | 14.664 | 0 | 0,000 % | idêntico |
| CONTAGEM | Presidente 80 SAMARA | 505 | 505 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 10 CLEITINHO AZEVEDO | 165.941 | 165.941 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 12 ALEXANDRE KALIL | 21.248 | 21.248 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 13 PATRUS ANANIAS | 96.277 | 96.277 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 14 BEN MENDES | 3.334 | 3.334 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 15 GABRIEL | 11.379 | 11.379 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 16 RAFAEL DUDA | 194 | 194 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 21 PROFESSOR TÚLIO LOPES | 373 | 373 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 22 FLÁVIO ROSCOE | 30.345 | 30.345 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 29 HENRIQUE ÁREAS | 45 | 0 | 45 | — | DIFERENÇA — TSE classifica 45 de 45 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| CONTAGEM | Governador 55 MATEUS SIMÕES | 9.936 | 9.936 | 0 | 0,000 % | idêntico |
| CONTAGEM | Governador 80 INDIRA XAVIER | 718 | 718 | 0 | 0,000 % | idêntico |

### JUIZ DE FORA (IBGE 3136702) — Zona da Mata (Juiz de Fora)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| JUIZ DE FORA | Aptos (eleitorado) | 395.457 | 395.457 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Comparecimento | 322.505 | 322.505 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Abstenção | 72.952 | 72.952 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Votos válidos (Presidente) | 305.690 | 305.690 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Votos brancos (Presidente) | 6.610 | 6.610 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Votos nulos (Presidente) | 10.192 | 10.205 | -13 | -0,127 % | DIFERENÇA — TSE registra 13 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| JUIZ DE FORA | Votos válidos (Governador) | 282.221 | 282.221 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Votos válidos (Senador) | 508.614 | 508.614 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Votos válidos (Dep. Federal) | 282.798 | 282.798 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Votos válidos (Dep. Estadual) | 280.277 | 280.277 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 13 LULA | 151.552 | 151.552 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 14 RENAN SANTOS | 7.846 | 7.846 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 16 HERTZ DIAS | 226 | 226 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 21 EDMILSON COSTA | 93 | 93 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 22 FLAVIO BOLSONARO | 126.964 | 126.964 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 27 CLARIANA BARAO | 106 | 106 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 29 RUI COSTA PIMENTA | 59 | 59 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 30 ZEMA | 2.530 | 2.530 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 35 VETERINÁRIO WILSON GRASSI | 87 | 87 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 55 RONALDO CAIADO | 5.276 | 5.276 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 70 ESCRITOR AUGUSTO CURY | 10.517 | 10.517 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Presidente 80 SAMARA | 434 | 434 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 10 CLEITINHO AZEVEDO | 118.858 | 118.858 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 12 ALEXANDRE KALIL | 8.592 | 8.592 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 13 PATRUS ANANIAS | 109.912 | 109.912 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 14 BEN MENDES | 3.191 | 3.191 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 15 GABRIEL | 7.009 | 7.009 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 16 RAFAEL DUDA | 219 | 219 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 21 PROFESSOR TÚLIO LOPES | 453 | 453 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 22 FLÁVIO ROSCOE | 24.259 | 24.259 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 29 HENRIQUE ÁREAS | 52 | 0 | 52 | — | DIFERENÇA — TSE classifica 52 de 52 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| JUIZ DE FORA | Governador 55 MATEUS SIMÕES | 8.788 | 8.788 | 0 | 0,000 % | idêntico |
| JUIZ DE FORA | Governador 80 INDIRA XAVIER | 940 | 940 | 0 | 0,000 % | idêntico |

### UBERLÂNDIA (IBGE 3170206) — Triângulo (Uberlândia)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| UBERLÂNDIA | Aptos (eleitorado) | 540.033 | 540.033 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Comparecimento | 429.516 | 429.516 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Abstenção | 110.517 | 110.517 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Votos válidos (Presidente) | 409.921 | 409.921 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Votos brancos (Presidente) | 7.763 | 7.763 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Votos nulos (Presidente) | 11.823 | 11.832 | -9 | -0,076 % | DIFERENÇA — TSE registra 9 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| UBERLÂNDIA | Votos válidos (Governador) | 380.932 | 380.932 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Votos válidos (Senador) | 685.115 | 685.115 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Votos válidos (Dep. Federal) | 388.995 | 388.995 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Votos válidos (Dep. Estadual) | 383.725 | 383.725 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 13 LULA | 163.879 | 163.879 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 14 RENAN SANTOS | 10.535 | 10.535 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 16 HERTZ DIAS | 147 | 147 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 21 EDMILSON COSTA | 82 | 82 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 22 FLAVIO BOLSONARO | 206.793 | 206.793 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 27 CLARIANA BARAO | 153 | 153 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 29 RUI COSTA PIMENTA | 51 | 51 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 30 ZEMA | 3.921 | 3.921 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 35 VETERINÁRIO WILSON GRASSI | 62 | 62 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 55 RONALDO CAIADO | 12.145 | 12.145 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 70 ESCRITOR AUGUSTO CURY | 11.754 | 11.754 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Presidente 80 SAMARA | 399 | 399 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 10 CLEITINHO AZEVEDO | 199.797 | 199.797 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 12 ALEXANDRE KALIL | 6.889 | 6.889 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 13 PATRUS ANANIAS | 101.200 | 101.200 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 14 BEN MENDES | 4.417 | 4.417 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 15 GABRIEL | 8.090 | 8.090 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 16 RAFAEL DUDA | 205 | 205 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 21 PROFESSOR TÚLIO LOPES | 594 | 594 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 22 FLÁVIO ROSCOE | 33.532 | 33.532 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 29 HENRIQUE ÁREAS | 80 | 0 | 80 | — | DIFERENÇA — TSE classifica 80 de 80 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| UBERLÂNDIA | Governador 55 MATEUS SIMÕES | 24.767 | 24.767 | 0 | 0,000 % | idêntico |
| UBERLÂNDIA | Governador 80 INDIRA XAVIER | 1.441 | 1.441 | 0 | 0,000 % | idêntico |

### MONTES CLAROS (IBGE 3143302) — Norte (Montes Claros)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| MONTES CLAROS | Aptos (eleitorado) | 283.875 | 283.875 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Comparecimento | 233.349 | 233.349 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Abstenção | 50.526 | 50.526 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Votos válidos (Presidente) | 221.074 | 221.074 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Votos brancos (Presidente) | 4.741 | 4.741 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Votos nulos (Presidente) | 7.524 | 7.534 | -10 | -0,133 % | DIFERENÇA — TSE registra 10 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| MONTES CLAROS | Votos válidos (Governador) | 208.006 | 208.006 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Votos válidos (Senador) | 375.125 | 375.125 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Votos válidos (Dep. Federal) | 185.641 | 185.641 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Votos válidos (Dep. Estadual) | 206.267 | 206.267 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 13 LULA | 94.112 | 94.112 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 14 RENAN SANTOS | 4.267 | 4.267 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 16 HERTZ DIAS | 67 | 67 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 21 EDMILSON COSTA | 41 | 41 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 22 FLAVIO BOLSONARO | 108.875 | 108.875 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 27 CLARIANA BARAO | 52 | 52 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 29 RUI COSTA PIMENTA | 25 | 25 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 30 ZEMA | 1.809 | 1.809 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 35 VETERINÁRIO WILSON GRASSI | 21 | 21 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 55 RONALDO CAIADO | 3.477 | 3.477 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 70 ESCRITOR AUGUSTO CURY | 8.142 | 8.142 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Presidente 80 SAMARA | 186 | 186 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 10 CLEITINHO AZEVEDO | 112.359 | 112.359 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 12 ALEXANDRE KALIL | 4.977 | 4.977 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 13 PATRUS ANANIAS | 57.805 | 57.805 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 14 BEN MENDES | 1.436 | 1.436 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 15 GABRIEL | 6.008 | 6.008 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 16 RAFAEL DUDA | 64 | 64 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 21 PROFESSOR TÚLIO LOPES | 230 | 230 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 22 FLÁVIO ROSCOE | 14.970 | 14.970 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 29 HENRIQUE ÁREAS | 33 | 0 | 33 | — | DIFERENÇA — TSE classifica 33 de 33 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| MONTES CLAROS | Governador 55 MATEUS SIMÕES | 9.800 | 9.800 | 0 | 0,000 % | idêntico |
| MONTES CLAROS | Governador 80 INDIRA XAVIER | 357 | 357 | 0 | 0,000 % | idêntico |

### POÇOS DE CALDAS (IBGE 3151800) — Sul (Poços de Caldas)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| POÇOS DE CALDAS | Aptos (eleitorado) | 122.866 | 122.866 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Comparecimento | 90.264 | 90.264 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Abstenção | 32.602 | 32.602 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Votos válidos (Presidente) | 85.738 | 85.738 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Votos brancos (Presidente) | 1.852 | 1.852 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Votos nulos (Presidente) | 2.670 | 2.674 | -4 | -0,150 % | DIFERENÇA — TSE registra 4 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| POÇOS DE CALDAS | Votos válidos (Governador) | 80.566 | 80.566 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Votos válidos (Senador) | 144.709 | 144.709 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Votos válidos (Dep. Federal) | 80.165 | 80.165 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Votos válidos (Dep. Estadual) | 79.070 | 79.070 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 13 LULA | 31.033 | 31.033 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 14 RENAN SANTOS | 2.422 | 2.422 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 16 HERTZ DIAS | 38 | 38 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 21 EDMILSON COSTA | 25 | 25 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 22 FLAVIO BOLSONARO | 45.922 | 45.922 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 27 CLARIANA BARAO | 27 | 27 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 29 RUI COSTA PIMENTA | 8 | 8 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 30 ZEMA | 1.400 | 1.400 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 35 VETERINÁRIO WILSON GRASSI | 16 | 16 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 55 RONALDO CAIADO | 1.743 | 1.743 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 70 ESCRITOR AUGUSTO CURY | 2.982 | 2.982 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Presidente 80 SAMARA | 122 | 122 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 10 CLEITINHO AZEVEDO | 40.429 | 40.429 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 12 ALEXANDRE KALIL | 3.675 | 3.675 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 13 PATRUS ANANIAS | 20.670 | 20.670 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 14 BEN MENDES | 1.019 | 1.019 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 15 GABRIEL | 1.428 | 1.428 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 16 RAFAEL DUDA | 44 | 44 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 21 PROFESSOR TÚLIO LOPES | 115 | 115 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 22 FLÁVIO ROSCOE | 9.864 | 9.864 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 29 HENRIQUE ÁREAS | 9 | 0 | 9 | — | DIFERENÇA — TSE classifica 9 de 9 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| POÇOS DE CALDAS | Governador 55 MATEUS SIMÕES | 2.925 | 2.925 | 0 | 0,000 % | idêntico |
| POÇOS DE CALDAS | Governador 80 INDIRA XAVIER | 397 | 397 | 0 | 0,000 % | idêntico |

### TEÓFILO OTONI (IBGE 3168606) — Mucuri (Teófilo Otoni)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| TEÓFILO OTONI | Aptos (eleitorado) | 106.567 | 106.567 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Comparecimento | 77.223 | 77.223 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Abstenção | 29.344 | 29.344 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Votos válidos (Presidente) | 73.389 | 73.389 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Votos brancos (Presidente) | 1.449 | 1.449 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Votos nulos (Presidente) | 2.381 | 2.385 | -4 | -0,168 % | DIFERENÇA — TSE registra 4 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| TEÓFILO OTONI | Votos válidos (Governador) | 70.362 | 70.362 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Votos válidos (Senador) | 127.207 | 127.207 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Votos válidos (Dep. Federal) | 71.294 | 71.294 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Votos válidos (Dep. Estadual) | 71.975 | 71.975 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 13 LULA | 34.828 | 34.828 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 14 RENAN SANTOS | 1.347 | 1.347 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 16 HERTZ DIAS | 17 | 17 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 21 EDMILSON COSTA | 10 | 10 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 22 FLAVIO BOLSONARO | 34.422 | 34.422 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 27 CLARIANA BARAO | 13 | 13 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 29 RUI COSTA PIMENTA | 6 | 6 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 30 ZEMA | 510 | 510 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 35 VETERINÁRIO WILSON GRASSI | 9 | 9 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 55 RONALDO CAIADO | 665 | 665 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 70 ESCRITOR AUGUSTO CURY | 1.539 | 1.539 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Presidente 80 SAMARA | 23 | 23 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 10 CLEITINHO AZEVEDO | 38.255 | 38.255 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 12 ALEXANDRE KALIL | 1.312 | 1.312 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 13 PATRUS ANANIAS | 22.969 | 22.969 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 14 BEN MENDES | 380 | 380 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 15 GABRIEL | 587 | 587 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 16 RAFAEL DUDA | 21 | 21 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 21 PROFESSOR TÚLIO LOPES | 40 | 40 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 22 FLÁVIO ROSCOE | 4.771 | 4.771 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 29 HENRIQUE ÁREAS | 8 | 0 | 8 | — | DIFERENÇA — TSE classifica 8 de 8 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| TEÓFILO OTONI | Governador 55 MATEUS SIMÕES | 1.951 | 1.951 | 0 | 0,000 % | idêntico |
| TEÓFILO OTONI | Governador 80 INDIRA XAVIER | 76 | 76 | 0 | 0,000 % | idêntico |

### GOVERNADOR VALADARES (IBGE 3127701) — Rio Doce (Governador Valadares)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| GOVERNADOR VALADARES | Aptos (eleitorado) | 193.573 | 193.573 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Comparecimento | 148.641 | 148.641 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Abstenção | 44.932 | 44.932 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Votos válidos (Presidente) | 142.283 | 142.283 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Votos brancos (Presidente) | 2.934 | 2.934 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Votos nulos (Presidente) | 3.419 | 3.424 | -5 | -0,146 % | DIFERENÇA — TSE registra 5 nulos técnicos; a atribuição exata não é verificável só com estes campos |
| GOVERNADOR VALADARES | Votos válidos (Governador) | 134.247 | 134.247 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Votos válidos (Senador) | 243.598 | 243.598 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Votos válidos (Dep. Federal) | 134.368 | 134.368 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Votos válidos (Dep. Estadual) | 131.849 | 131.849 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 13 LULA | 48.763 | 48.763 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 14 RENAN SANTOS | 2.895 | 2.895 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 16 HERTZ DIAS | 44 | 44 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 21 EDMILSON COSTA | 20 | 20 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 22 FLAVIO BOLSONARO | 84.782 | 84.782 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 27 CLARIANA BARAO | 50 | 50 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 29 RUI COSTA PIMENTA | 15 | 15 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 30 ZEMA | 1.047 | 1.047 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 35 VETERINÁRIO WILSON GRASSI | 13 | 13 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 55 RONALDO CAIADO | 1.458 | 1.458 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 70 ESCRITOR AUGUSTO CURY | 3.108 | 3.108 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Presidente 80 SAMARA | 88 | 88 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 10 CLEITINHO AZEVEDO | 70.453 | 70.453 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 12 ALEXANDRE KALIL | 3.377 | 3.377 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 13 PATRUS ANANIAS | 31.595 | 31.595 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 14 BEN MENDES | 1.272 | 1.272 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 15 GABRIEL | 2.030 | 2.030 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 16 RAFAEL DUDA | 27 | 27 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 21 PROFESSOR TÚLIO LOPES | 119 | 119 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 22 FLÁVIO ROSCOE | 19.334 | 19.334 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 29 HENRIQUE ÁREAS | 10 | 0 | 10 | — | DIFERENÇA — TSE classifica 10 de 10 votos nominais como "Anulado sub judice" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = 0); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial |
| GOVERNADOR VALADARES | Governador 55 MATEUS SIMÕES | 5.827 | 5.827 | 0 | 0,000 % | idêntico |
| GOVERNADOR VALADARES | Governador 80 INDIRA XAVIER | 213 | 213 | 0 | 0,000 % | idêntico |

### SERRA DA SAUDADE (IBGE 3166600) — Pequeno (Serra da Saudade)

| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |
|---|---|---:|---:|---:|---:|---|
| SERRA DA SAUDADE | Aptos (eleitorado) | 1.281 | 1.281 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Comparecimento | 989 | 989 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Abstenção | 292 | 292 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Votos válidos (Presidente) | 963 | 963 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Votos brancos (Presidente) | 5 | 5 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Votos nulos (Presidente) | 21 | 21 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Votos válidos (Governador) | 967 | 967 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Votos válidos (Senador) | 1.838 | 1.838 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Votos válidos (Dep. Federal) | 967 | 967 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Votos válidos (Dep. Estadual) | 968 | 968 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Presidente 13 LULA | 360 | 360 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Presidente 14 RENAN SANTOS | 12 | 12 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Presidente 16 HERTZ DIAS | 0 | 0 | 0 | — | idêntico |
| SERRA DA SAUDADE | Presidente 21 EDMILSON COSTA | 0 | 0 | 0 | — | idêntico |
| SERRA DA SAUDADE | Presidente 22 FLAVIO BOLSONARO | 531 | 531 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Presidente 27 CLARIANA BARAO | 0 | 0 | 0 | — | idêntico |
| SERRA DA SAUDADE | Presidente 29 RUI COSTA PIMENTA | 0 | 0 | 0 | — | idêntico |
| SERRA DA SAUDADE | Presidente 30 ZEMA | 13 | 13 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Presidente 35 VETERINÁRIO WILSON GRASSI | 0 | 0 | 0 | — | idêntico |
| SERRA DA SAUDADE | Presidente 55 RONALDO CAIADO | 25 | 25 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Presidente 70 ESCRITOR AUGUSTO CURY | 22 | 22 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Presidente 80 SAMARA | 0 | 0 | 0 | — | idêntico |
| SERRA DA SAUDADE | Governador 10 CLEITINHO AZEVEDO | 697 | 697 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Governador 12 ALEXANDRE KALIL | 6 | 6 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Governador 13 PATRUS ANANIAS | 157 | 157 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Governador 14 BEN MENDES | 2 | 2 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Governador 15 GABRIEL | 9 | 9 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Governador 16 RAFAEL DUDA | 0 | 0 | 0 | — | idêntico |
| SERRA DA SAUDADE | Governador 21 PROFESSOR TÚLIO LOPES | 1 | 1 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Governador 22 FLÁVIO ROSCOE | 28 | 28 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Governador 29 HENRIQUE ÁREAS | 0 | 0 | 0 | — | idêntico |
| SERRA DA SAUDADE | Governador 55 MATEUS SIMÕES | 66 | 66 | 0 | 0,000 % | idêntico |
| SERRA DA SAUDADE | Governador 80 INDIRA XAVIER | 1 | 1 | 0 | 0,000 % | idêntico |

## Tentativas HTTP

Sondagem manual prévia (curl, 2026-10-09) da API de resultados, **sem sucesso**:

- https://resultados.tse.jus.br/oficial/ → 404 (application/xml)
- https://resultados.tse.jus.br/oficial/ele2026/ → 404 (application/xml)
- https://resultados.tse.jus.br/oficial/ele2026/config/ele-c.json → 404
- https://resultados.tse.jus.br/oficial/ele2022/544/dados/mg/mg41238-c0001-e000544-u.json → 404 (padrão de 2022 não se aplica)
- https://dadosabertos.tse.jus.br/ e /dataset/resultados-2026 → 200 (lista os arquivos .zip em cdn.tse.jus.br usados aqui)

Requisições feitas por este script:

- https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip (Range bytes=-262144) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip (Range bytes=226585-226614) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip (Range bytes=226650-355544) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip (Range bytes=401619-401648) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip (Range bytes=401684-702436) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip (Range bytes=-262144) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip (Range bytes=29385586-29385615) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip (Range bytes=29385653-80020913) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip (Range bytes=84525178-84525207) → 206
- https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip (Range bytes=84525245-86336105) → 206

## Reprodução

```
npx tsx scripts/tse/sample-check.ts            # baixa (Range) e compara; cache em data/private/tse/
npx tsx scripts/tse/sample-check.ts --offline   # reusa o cache
```

Impressão digital dos resultados (sha256 de 330 linhas, 16 hex): `f170685dcbbba9e6`.
