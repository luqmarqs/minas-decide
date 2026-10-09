# Geometrias públicas

## `mg-municipios.geojson`

- **Fonte:** IBGE — API de Malhas Geográficas v3
  (`https://servicodados.ibge.gov.br/api/v3/malhas/estados/31?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`).
- **Atribuição obrigatória:** "Malha municipal: IBGE" (exibida no rodapé do mapa).
- **Baixado em:** 2026-10-08, uma única vez.
- **Conteúdo:** 853 `Polygon`, um por município de MG. `properties.codarea` = código IBGE de 7 dígitos
  → id de território `mg-<codarea>`. Sem nomes (os nomes vêm do `territories-index.json` do snapshot).
- **Tamanho:** 499.892 bytes como baixado; 455.001 bytes após minificação (apenas remoção de espaços,
  coordenadas inalteradas — a API já entrega 4 casas decimais na qualidade "mínima"). Abaixo do limite de 3 MB,
  portanto **não** foi simplificado.
- **Carregamento:** `fetch` sob demanda pelo mapa (não entra no bundle JS).
- **Limitação:** qualidade "mínima" é generalizada (adequada a zoom estadual/regional); contornos não servem para
  análise de limites precisos.

Não existem geometrias de bairro: bairros são pontos (centroides de locais de votação), ver ADR 0002.
