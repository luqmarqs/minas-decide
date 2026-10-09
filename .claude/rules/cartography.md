# Regras de cartografia e dados eleitorais

- O SOURCE tem dados por **local de votação** (lat/lon + `bairro` textual do endereço do local). "Bairro" é, portanto, **aproximação metodológica**: eleitores de uma seção não necessariamente residem no bairro do local. Sempre rotular como aproximado.
- Não existem geometrias de bairro no SOURCE. Não inventar polígonos. Bairros são representados por **pontos/centroides** (média dos locais) e listas; municípios por centroide (lat/lon da fonte) e, se disponível, geometria oficial IBGE carregada separadamente com atribuição.
- Indicadores: aptos, comparecimento, abstenção (aptos − comparecimento), taxa de abstenção (÷ aptos), válidos, brancos, nulos; votos por candidatura e participação nos válidos (÷ válidos do cargo). Senador em 2026 tem 2 votos por eleitor.
- 2022 para a comparação presidencial (Lula × Bolsonaro) vem dos **dados abertos do TSE** (município exato; bairro aproximado por local de votação, com taxa de casamento registrada); o histórico de candidaturas rastreadas do SOURCE **não é destacado** (D24). Comparação em pontos percentuais e absolutos, sempre com nota de que não implica transferência de votos e sem cores partidárias nas escalas.
- Divergências (Σ candidatos ≠ válidos; válidos+brancos+nulos ≠ comparecimento) são **registradas** em `warnings`, nunca corrigidas silenciosamente. Tolerância de alerta: 0,5%.
- Nunca criar índice de persuasão, ranking político ou inferência individual.
- Cores do mapa: escala sequencial acessível (`--map-fill-low/mid/high`), unidade e fonte na legenda; não codificar valor como julgamento moral.
- Snapshot público: `manifest.json` com hashes SHA-256, `status` (`validated|partial|demo`), cobertura, metodologia. JSONs públicos sem PII, sem refs/URLs do SOURCE.
