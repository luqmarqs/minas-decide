# Geometrias públicas

## `mg-municipios.geojson`

- **Fonte:** IBGE — API de Malhas Geográficas v3
  (`https://servicodados.ibge.gov.br/api/v3/malhas/estados/31?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`).
- **Atribuição obrigatória:** "Malha municipal: IBGE" (exibida no rodapé do mapa).
- **Baixado em:** 2026-10-08, uma única vez.
- **Conteúdo:** 853 `Polygon`, um por município de MG. `properties.codarea` = código IBGE de 7 dígitos
  → id de território `mg-<codarea>`. Sem nomes (os nomes vêm do `territories-index.json` do snapshot).
- **Tamanho:** 499.892 bytes como baixado; 796.449 bytes após minificação (apenas remoção de espaços,
  coordenadas inalteradas — a API já entrega 4 casas decimais na qualidade "mínima"). Abaixo do limite de 3 MB,
  portanto **não** foi simplificado.
- **Carregamento:** `fetch` sob demanda pelo mapa (não entra no bundle JS).
- **Limitação:** qualidade "mínima" é generalizada (adequada a zoom estadual/regional); contornos não servem para
  análise de limites precisos.

## `bairros/<ibge7>.geojson` e `bairros/index.json` (D29 / DATA-6)

Uma `FeatureCollection` por município (853 arquivos), uma feição `MultiPolygon` por bairro do snapshot
(`properties.territory_id` = `mg-<ibge7>-<slug>` do `territories-index.json`). Gerado por `npm run geo:bairros`,
validado por `npm run geo:validate`. Campos: ver `docs/DATA_DICTIONARY.md` (seção "Geometrias de bairro").

**Método (por município):**

1. **Limite oficial, quando existe** (`method: "official-ibge-cd2022"` ou `"owner-provided"`, `official: true`,
   `approx: false`): malha de bairros do **IBGE, Censo Demográfico 2022**
   (`https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/shp/UF/MG_bairros_CD2022.zip`,
   Last-Modified 12/11/2024, baixado em 09/10/2026; SIRGAS 2000 / EPSG:4674, usado como WGS84) ou arquivos do
   proprietário em `data/private/geo-input/` (prioridade máxima). O bairro do snapshot recebe o polígono oficial se o
   nome casar (mesmo `slugify`; senão, sem o prefixo "Bairro "/"Vila ", só pares únicos). Polígonos oficiais
   simplificados (Douglas–Peucker, 1e-5° ≈ 1 m) e arredondados a 5 casas; não são recortados pela malha municipal
   "mínima" (podem ultrapassá-la em alguns %, por generalização desta).
2. **Área aproximada nos demais** (`method: "voronoi-polling-places"`, `official: false`, `approx: true`): diagrama de
   Voronoi dos locais de votação do bairro (coordenadas `coord_aproximada` descartadas quando o mesmo bairro tem
   coordenadas precisas; pontos coincidentes de bairros distintos espalhados num círculo de 1e-6°–1e-3°), recortado
   pelo polígono municipal (`mg-municipios.geojson`) **menos** as áreas oficiais casadas, células unidas por bairro.
   Município com um único bairro e sem malha oficial: o polígono municipal inteiro (`whole_municipality: true`).

**Limitações:** as áreas Voronoi **não são limites oficiais de bairro** — são uma aproximação a partir de onde estão
os locais de votação; distorcem muito onde há poucos locais (áreas rurais inteiras atribuídas ao local mais próximo) e
herdam a generalização da malha municipal "mínima". Eleitores de uma seção podem morar em outro bairro (ADR 0002).
Bairros oficiais sem local de votação não aparecem. Nomes que diferem entre a malha oficial e o endereço do local
(ex.: "Jóckei Club" × "Joquei Clube") não casam e ficam com área aproximada.

**Licença / atribuição:** "Malha municipal e de bairros: IBGE" (dados públicos do IBGE, uso livre com citação da
fonte). As áreas aproximadas são obra derivada da malha municipal do IBGE e das coordenadas dos locais de votação
(TSE/extrato do snapshot).

**Tamanho:** ~5,2 MB no total (5 casas decimais); maior arquivo Belo Horizonte (~610 KB). Carregar sob demanda ao
selecionar um município. Cache: `/geo/*` com `max-age=86400` em `public/_headers`.

Fora dessas áreas, bairros continuam representados por pontos (centroides de locais de votação), ver ADR 0002.
