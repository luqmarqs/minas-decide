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

## Adendo — 2026-10-09: áreas por bairro (D29) e limites oficiais onde existirem (DATA-6)

A pedido do proprietário (D29), o mapa passa a mostrar **áreas** por bairro, sem alterar a agregação (ids, pontos e métricas do snapshot continuam os mesmos):

1. **Limite oficial primeiro.** Se o município tem malha de bairros — arquivos do proprietário em `data/private/geo-input/` (prioridade máxima; substituem o IBGE no município inteiro) ou a malha de bairros do **IBGE, Censo 2022** (`MG_bairros_CD2022`, SIRGAS 2000/EPSG:4674 tratado como WGS84, diferença irrelevante na escala do mapa) —, cada bairro do índice cujo nome casa com um bairro oficial recebe o polígono oficial (`official = true`, `approx = false`). Casamento: `slugify` compartilhado (`shared/schemas/normalize.ts`); se não houver casamento direto, remove-se o prefixo "Bairro "/"Vila " de qualquer lado, aceitando só pares únicos. Nenhuma outra heurística (Jardim/Parque/grafias) — divergências ficam como pendência de curadoria.
2. **Voronoi como fallback** (`method = voronoi-polling-places`, `approx = true`): para os demais bairros, Voronoi dos locais de votação (coordenadas aproximadas descartadas quando o mesmo bairro tem coordenadas precisas), recortado pelo polígono municipal do IBGE **menos** as áreas oficiais casadas (sem sobreposição), células unidas por bairro. Município com um só bairro (e sem oficial) = polígono municipal inteiro.
3. Toda área Voronoi é rotulada como aproximada e **não é limite oficial**; distorce onde há poucos locais (áreas rurais enormes atribuídas ao local mais próximo). O ponto (média dos locais) continua sendo a representação do bairro em listas e métricas.
4. Bairros oficiais sem local de votação não aparecem (não são territórios do índice); sua área é absorvida pelo Voronoi dos bairros vizinhos sem limite oficial.
