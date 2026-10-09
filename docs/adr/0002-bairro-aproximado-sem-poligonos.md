# ADR 0002 — "Bairro" como aproximação por local de votação; sem polígonos de bairro

**Status:** aceito — 2026-10-08

## Contexto
O SOURCE tem resultados por **local de votação** (`locais` com lat/lon e campo `bairro` textual vindo do endereço) e totais por local × cargo. Não há geometrias de bairro nem de município. A spec (§4.4) proíbe inventar limites e exige documentar o algoritmo de associação.

## Decisão
- Território "bairro" = `mg-<ibge7>-<slug(bairro)>`, agregando todos os locais do município cujo campo `bairro` normalizado coincide. Representado por **ponto** (média das coordenadas dos locais) e lista; `data_quality = 'approximate'`.
- Município = `mg-<ibge7>`, agregando todos os locais; `data_quality = 'complete'` quando todos os cargos têm totais.
- Mapa municipal usa malha oficial do IBGE (fonte separada, pública, com atribuição), carregada sob demanda; fallback por centroides do SOURCE.
- Toda tela e legenda que mostre bairro traz a nota: "Bairro derivado do endereço do local de votação; eleitores de uma seção podem residir em outro bairro".
- Locais com `coord_aproximada = true` (183 em MG) mantêm-se na agregação, com contagem reportada em `warnings` do território.

## Consequências
- Nomes de bairro podem variar por grafia entre locais do mesmo município (ex.: "CENTRO" vs "Centro"); a normalização (`normalizeText`) unifica caixa e acentos, mas grafias distintas permanecem distintas e são listadas como pendência de curadoria.
- Comparação 2022→2026 por bairro só é válida quando `historico_votos.chave` (`<cd_municipio>|<BAIRRO>`) casa com a mesma normalização.
