# MINAS EM MOVIMENTO — ESPECIFICAÇÃO-MESTRE DE PRODUTO, ENGENHARIA E EXECUÇÃO AGÊNTICA

> **Versão:** 1.1 — 08/10/2026 (atualização: separação entre Supabase legado de dados eleitorais e Supabase operacional novo)  
> **Status:** documento de direcionamento para a primeira rodada de implementação  
> **Destinatário:** agente principal Claude Fable 5.1 operando Claude Code, com subagentes especializados  
> **Stack-base:** TypeScript; React + Vite; Cloudflare Workers com Static Assets; Hono; **novo** projeto Supabase PostgreSQL/Auth/PostGIS para dados operacionais; **projeto Supabase existente somente como origem de extração eleitoral, nunca runtime público**; MapLibre GL JS; MapLibre/PMTiles quando justificado  
> **Finalidade da rodada 1:** entregar um corte vertical funcional, revisável, documentado e demonstrável; **gerar obrigatoriamente `docs/RELATORIO_PRIMEIRA_RODADA.md`**  
> **Contexto:** plataforma pública de dados eleitorais agregados de Minas Gerais e organização voluntária de atividades presenciais, sem cadastro para explorar o mapa ou confirmar interesse em uma atividade. **Os dados eleitorais reais já estão em um Supabase existente acessível por CLI no computador do proprietário; o banco existente é relatado como pesado.**

---

# 0. COMO ESTE DOCUMENTO DEVE SER EXECUTADO

Este documento não é um convite para improvisação. É a fonte de requisitos aprovada para iniciar o trabalho, respeitadas as decisões pendentes explicitadas neste arquivo. O agente principal deve lê-lo integralmente, criar um plano verificável e delegar trabalho sem comprometer qualidade, segurança ou escopo.

**Ordem de precedência:** (1) instruções mais recentes do proprietário; (2) obrigações legais e de segurança; (3) este documento; (4) decisões arquiteturais registradas (ADRs); (5) convenções locais de projeto. Se houver conflito, registrar a divergência e adotar a interpretação mais segura, sem inventar requisitos críticos.

**Não fazer na primeira rodada:** provisionar custos pagos sem autorização, executar migrations em produção, emitir mensagens em massa, publicar dados pessoais, fazer deploy no domínio definitivo sem autorização, integrar contas reais sem permissão expressa, alegar que testes passaram sem executá-los, criar dados eleitorais inventados como se fossem reais. **Jamais executar escrita, migrations, DDL, reset, vacuum, criação de índices, otimização invasiva ou mudança de políticas no Supabase eleitoral existente. Jamais ligar o frontend ou a API pública ao projeto legado.**

**Pode fazer:** scaffolding do repositório, implementar frontend responsivo, construir API e migrations localmente, usar dados de demonstração inequivocamente marcados, preparar testes, configurar deploy de *staging* se o proprietário já autorizou acesso ao ambiente e publicar o relatório obrigatório. **Pode descobrir os projetos Supabase associados ao CLI e fazer inspeção de leitura em baixo impacto para localizar e caracterizar o conjunto de dados eleitorais, respeitando permissões já existentes. A extração de produção depende de avaliar impacto, permissões e volume; nunca exigir isso para implementar o restante.**

**Critério de sucesso da primeira rodada:** o proprietário consegue abrir a aplicação localmente, explorar a navegação e um mapa demonstrativo, compreender os fluxos de cadastro, grupos e atividades, verificar o código do backend, executar testes relevantes e encaminhar um único arquivo de relatório para análise externa.

**O que não é sucesso:** montar componentes visualmente atraentes sem integração de estado, fingir que o backend existe, esconder pendências em mensagens dispersas, testar apenas o happy path, ou chamar uma tela simulada de integração concluída.

---

# 1. VISÃO EXECUTIVA E DEFINIÇÃO DE PRODUTO

## 1.1 Proposição de valor

**Minas em Movimento** é um nome provisório para uma aplicação web mobile-first que combina um **atlas eleitoral público de Minas Gerais** com **informação sobre comunidades territoriais e atividades presenciais abertas à participação voluntária**.

Três ideias são inegociáveis:

1. **Entender o território:** mapa, busca por município/bairro e dados eleitorais agregados com metodologia transparente, incluindo eleições de 2022 e 2026 quando os dados forem validados.
2. **Encontrar uma comunidade:** o participante escolhe onde mora ou onde quer participar, cadastra-se de maneira simples e recebe, na página de confirmação, o link de WhatsApp do grupo territorial aprovado; se não existir grupo, pode propor um.
3. **Participar de atividades:** atividades aprovadas aparecem no mapa e na agenda; qualquer visitante pode clicar em **“Eu vou”** sem login; quem deseja criar/gerenciar atividades precisa de conta autenticada e e-mail verificado, com aprovação administrativa antes da publicação.

## 1.2 Natureza e limites do produto

- Não é uma rede social.
- Não é um CRM de eleitores individualizados.
- Não é um sistema para inferir o voto de pessoas a partir de bairro, seção, ausência ou característica pessoal.
- Não é uma plataforma para classificar indivíduos ou otimizar mensagens de persuasão política individualizada.
- Não é um cadastro público de coordenadores.
- Não é um painel de inteligência com navegação complexa.
- É **um mapa público informativo com organização voluntária local** e separação rigorosa entre conteúdo público e dados privados.

Os dados eleitorais podem ser exibidos e comparados de forma descritiva. A publicação e a coordenação de atividades devem ser conduzidas segundo critérios logísticos e escolhas voluntárias explícitas, não pela inferência de preferências individuais de eleitores.

## 1.3 Objetivos mensuráveis

- Tempo reduzido entre abertura do site e localização de um território.
- Tempo reduzido entre decisão de cadastro e exibição do link do grupo.
- Taxa de conclusão de cadastro, sem confundir com adesão efetiva ao WhatsApp.
- Número de grupos aprovados e quantidade de territórios com grupo disponível.
- Número de atividades aprovadas, inscrições de intenção (“Eu vou”) e confirmações de presença, mantendo esses conceitos separados.
- Estabilidade e disponibilidade do mapa mesmo quando funcionalidades de escrita forem temporariamente limitadas.
- Desempenho e acessibilidade mensuráveis em dispositivos móveis.
- Ausência de exposição de dados pessoais nas respostas públicas da API, em bundles ou em erros.

**Nunca afirmar:** que o clique num convite comprova entrada no grupo; que “Eu vou” comprova presença; que IP é identidade única; que resultados agregados comprovam a preferência de uma pessoa; ou que diferenças eleitorais entre 2022 e 2026 são necessariamente transferência de votos.

## 1.4 Horizonte de entrega

O contexto de uso aponta para uma janela curta de lançamento. Favorecer **escopo enxuto, qualidade de núcleo e capacidade de correção rápida**, e não infraestruturas volumosas. Sem prazos fabricados: o agente deve fornecer estimativas baseadas no estado real do repositório, dependências e testes, não promessas vagas.

---

# 2. DECISÕES DE PRODUTO JÁ TOMADAS

| Tema | Decisão vinculante |
|---|---|
| Escala | Minas Gerais; município e bairro; eventualmente atividade pontual com coordenadas |
| Território do usuário | Ele escolhe a cidade/bairro onde **mora ou quer participar**; não precisa coincidir com o local onde votou |
| Página inicial | Mapa e busca por município/bairro, com entrada direta na navegação |
| Dados | Mostrar indicadores eleitorais de 2022 e 2026, com recortes existentes no **projeto Supabase legado** identificado no CLI; leitura controlada, extração reproduzível e publicação de snapshots estáticos |
| Cadastro | Nome, e-mail obrigatório, WhatsApp, município/bairro e consentimentos pertinentes |
| Autenticação ao cadastrar | A pessoa deve sair com sessão ativa no dispositivo |
| Verificação de e-mail | Pode ocorrer depois do cadastro; exigida antes de propor/publicar atividades conforme política definida |
| Login futuro | Link mágico enviado por e-mail; sem senha obrigatória |
| Grupo existente | Após cadastro, página de obrigado oferece o link territorial aprovado |
| Grupo inexistente | Usuário pode **propor o cadastro de um novo grupo**, sem login obrigatório; aprovação por admins |
| Responsáveis pelos grupos | Dados pessoais e contato **apenas no admin**; nunca lista pública |
| Cadastro de atividade | Login e e-mail verificado; envio sujeito à aprovação dos admins |
| Contato da atividade | Criador pode **optar** por divulgar contato para interessados; desligado por padrão |
| Atividade no mapa | Apenas depois de aprovada e com local válido |
| “Eu vou” | Aberto, sem login; com proteção de abuso e deduplicação best-effort |
| Confirmação de comparecimento | Diferente de “Eu vou”; registrar somente com mecanismo confiável se for implementada |
| Bots | Tentar bloquear crawlers indesejados e automações maliciosas; Googlebot autêntico pode ser exceção em conteúdo público |
| IP suspeito | Em regra restringir **escrita/cadastro**, não leitura do mapa; bloquear o site inteiro somente sob abuso realmente grave |
| CAPTCHA | Cloudflare Turnstile Managed; validação obrigatória no servidor |
| Infra | React + Vite + Workers + **Supabase operacional novo e isolado**; Supabase legado **exclusivamente como fonte offline**; substituir Vercel neste projeto-piloto |
| Design | Moderno, fluido, expressivo; arte oficial chegará depois e exigirá adaptação |
| Agentes | Fable arquiteta e supervisiona; Opus 5.5 em complexidade alta; Sonnet 5.5 desenvolvimento comum; Haiku 5.5 tarefas mecânicas |
| Relatório | Ao fim da primeira rodada criar `docs/RELATORIO_PRIMEIRA_RODADA.md`, completo e auditável |

---

# 3. PERSONAS, PAPÉIS, JORNADAS E TELAS

## 3.1 Papéis

1. **Visitante público:** consulta dados/atividades, busca território, clica em “Eu vou”, solicita ingresso por cadastro e pode enviar proposta de grupo.
2. **Participante cadastrado com sessão provisória:** concluiu cadastro e tem sessão, mas ainda não verificou e-mail; pode usar navegação pública e visualizar dados próprios mínimos; não recebe privilégios de organizador.
3. **Usuário verificado:** conta vinculada a e-mail verificado; pode propor e administrar as **próprias** atividades; toda nova atividade fica em moderação.
4. **Administrador:** aprova/rejeita grupos e atividades, controla responsáveis, bloqueia abusos, consulta dados privados estritamente necessários, audita mudanças. MFA exigido.

**Não criar um papel separado de responsável local no MVP**, salvo se uma necessidade real o justificar. Responsável por grupo é um relacionamento administrativo, não autorização automática para obter dados de voluntários.

## 3.2 Jornada A — exploração pública

1. Abre site no celular.
2. Vê título, busca destacada e mapa interativo de Minas Gerais.
3. Digita nome de cidade; seleciona opção desambiguada.
4. Visualiza limites da cidade, indicadores e bairros disponíveis.
5. Seleciona bairro no mapa ou pela busca.
6. Visualiza dados do território, contexto metodológico, grupos disponíveis e atividades próximas.
7. Pode voltar, copiar link direto ou mudar camada sem perder contexto.

**Estados:** carregando, sem dado de bairro, sem resultado na busca, sem WebGL, erro de rede, mapa disponível sem atividades.

## 3.3 Jornada B — cadastro e WhatsApp

1. Clica em participar/entrar no grupo.
2. O território selecionado já preenche cidade/bairro, mas é editável.
3. Formulário: nome, e-mail obrigatório, WhatsApp, município, bairro (quando houver), consentimentos necessários.
4. Turnstile Managed resolve/verifica quando solicitado.
5. Servidor valida, controla duplicidade e cria registro de participante com sessão ativa provisória.
6. Página de obrigado oferece grupo aprovado daquele bairro. Se inexistente, considerar fallback para grupo municipal **aprovado**; se nenhum existir, oferecer proposta de criação de grupo.
7. A confirmação do e-mail pode ocorrer depois, sem impedir ver grupo, mas o site deve explicar a diferença entre sessão provisória e conta verificada.

**Crucial:** não enviar confirmação falsa de adesão ao WhatsApp. O sistema apenas fornece um link. A entrada e a permanência no grupo ocorrem no WhatsApp e não são conhecidas automaticamente pela aplicação.

## 3.4 Jornada C — proposta de novo grupo

1. Na página do bairro sem grupo: “Criar/cadastrar um grupo para esta região”.
2. Formulário mínimo: nome público do grupo; município; bairro; link de convite; nome, e-mail e WhatsApp da pessoa proponente; declaração de responsabilidade e consentimento relativo ao tratamento de dados.
3. Antispam: Turnstile, rate limit, validação do URL e deduplicação.
4. Cria proposta `pending`, não publicável.
5. Admin revisa o link, correspondência com território, integridade e dados de contato; aprova/rejeita com motivo auditável.
6. Somente após aprovação o grupo fica visível para visitantes.

Não exigir que a pessoa registre uma segunda conta apenas para propor o grupo. Se já existir sessão, reaproveitar dados consentidos e pedir apenas os campos faltantes.

## 3.5 Jornada D — “Eu vou” sem login

1. Pessoa escolhe marcador/atividade aprovada e lê detalhes.
2. Pressiona “Eu vou”.
3. API valida a atividade, limites e token anônimo de dispositivo; registra intenção de participação de maneira idempotente.
4. UI mostra “Confirmado” e opção de cancelar.
5. Se identificada por sessão, sua confirmação pode ser associada à conta; caso contrário, só um identificador opaco sem perfil pessoal.
6. Opcionalmente, pessoa pode **voluntariamente** informar contato para receber informações da atividade; isso é um fluxo adicional e claramente consentido.

**Não equiparar confirmação anônima a lista confiável de nomes.** Não contar reenvios repetidos como pessoas novas; não prometer resistência perfeita a fraude no modo anônimo.

## 3.6 Jornada E — criar atividade

1. Clique em “Propor atividade”.
2. Se não autenticado: solicitar identificação; quem já se cadastrou e manteve sessão avança.
3. Se sessão provisória/e-mail não confirmado: solicitar verificação de e-mail, preservando rascunho.
4. Formulário: título, categoria (panfletagem, encontro etc.), descrição, cidade, bairro opcional, endereço/ponto no mapa, dia, hora, fuso America/Sao_Paulo, contato público opcional, regras locais relevantes.
5. Envio gera `pending_review`.
6. Admin aprova/rejeita com motivo; se aprovado, publica ponto no mapa e na agenda.
7. Criador verificado pode gerenciar próprias atividades dentro das regras; edições críticas exigem nova aprovação.

## 3.7 Jornada F — admin

- Login verificado + MFA.
- Dashboard restrito: fila de propostas de grupos e atividades; visões por status; busca, aprovação, rejeição, arquivamento.
- Grupos: gestão privada de responsáveis e contatos, links, território, estado ativo/inativo.
- Atividades: autor, horário, localização, status, histórico, opção de suspensão.
- Pessoas: acesso estritamente necessário aos dados, com permissões e auditoria.
- Proteções: limitar acesso a logs e dados sensíveis; exportações somente se expressamente necessárias.

## 3.8 Sitemap proposto

```text
/
  busca global + mapa + dados gerais
/territorio/:slug
  dados públicos do território + grupos + atividades
/atividade/:id
  detalhes públicos + Eu vou + contato opcional do organizador
/participar?territorio=...
  cadastro e consentimentos
/obrigado
  link de grupo territorial/fallback; ação sem grupo
/propor-grupo?territorio=...
  proposta pendente, sem autenticação obrigatória
/criar-atividade
  rota com autenticação e verificação de e-mail
/minhas-atividades
  acesso autenticado; propostas e status
/autenticacao/retorno
  tratamento seguro de magic link / email
/admin
  interface administrativa restrita
/privacidade
/termos
/metodologia
/404
```

O agente pode melhorar URLs e agrupamento técnico, mas não adicionar telas sem propósito claro.

---

# 4. DADOS ELEITORAIS E CARTOGRAFIA

## 4.1 Premissa

**Atualização vinculante (v1.1):** os dados reais eleitorais estão no **Supabase existente**, e há uma sessão do CLI Supabase autenticada no computador onde Fable desenvolverá o projeto. O proprietário não tem os arquivos originais nesta máquina. A base existente já é considerada pesada.

A autenticação do CLI **não comprova por si só** que o agente dispõe de credenciais SQL, permissão para ler todas as tabelas ou que o projeto atualmente vinculado é o repositório eleitoral correto. Antes de qualquer consulta, identificar sem ambiguidade o projeto, confirmar permissões e registrar limitações. Se houver vários projetos compatíveis e a identidade não puder ser determinada com segurança, interromper **apenas a integração real dos dados** e trabalhar com fixtures; não escolher arbitrariamente.

**Decisão arquitetural não negociável:** o Supabase existente é somente **fonte para inspeção/exportação controlada fora do fluxo de produção**. A nova aplicação utiliza **OUTRO projeto Supabase independente** para Auth, perfis, grupos, atividades e moderação. O mapa consome **snapshots de dados públicos agregados, pré-processados e versionados em Cloudflare Static Assets/R2/CDN**, e jamais lê o banco legado em tempo de requisição.

Na primeira rodada, o agente deve descobrir as tabelas e disponibilizar um extrator reproduzível. Quando a leitura de origem for autorizada e viável, priorizar uma amostra de um município, com custo de consulta conhecido, antes de ampliar para Minas Gerais. Não presumir disponibilidade de dados 2022/2026 ou granularidade por bairro sem examinar os esquemas. Jamais inventar resultados eleitorais.

## 4.2 Separação rigorosa entre geografia e indicador

- `territories`: estrutura de identificação e relacionamentos entre estado, municípios e bairros; geocódigos de fonte quando existirem.
- `electoral_metrics`: medidas por ano, turno, candidato, denominador e recorte territorial.
- `boundaries`: geometrias e metadados de proveniência, simplificação e precisão; expostas preferencialmente por tiles.
- `data_releases`: versão de importação, fonte, data, checagens e hash de integridade.
- `public_activities`: localização operacional real, independente de estatística eleitoral.

Uma atividade pode acontecer em bairro A com participantes provenientes de bairros B e C. Local da atividade **não equivale** à residência de voluntários.

## 4.3 Indicadores mínimos no mapa

- Votos absolutos por candidatura disponível e ano/turno.
- Participação percentual dos votos válidos, indicando denominador.
- Eleitorado apto, comparecimento absoluto, ausência absoluta e taxa de abstenção.
- Votos brancos/nulos, se disponíveis e metodologicamente consistentes.
- Variação 2022 → 2026 em **pontos percentuais** e em **valores absolutos**, com denominador claro.
- Campo de qualidade/cobertura por recorte: dado completo, incompleto, estimado, agregado aproximado ou indisponível.

**Não** criar automaticamente “índice de persuasão”, pontuação de vulnerabilidade eleitoral, ranking de bairros para abordagem política com base em preferências presumidas, nem inferências individuais a partir de dados agregados.

## 4.4 Problema importante: “bairro” nem sempre é unidade oficial do TSE

- Se os dados vierem de seções ou locais de votação, documentar algoritmo de associação territorial.
- Um local de votação no bairro X não comprova que todos os eleitores residem no bairro X.
- Se cruzar áreas territoriais distintas, indicar aproximação, margens e limitações.
- Não inventar limites de bairro onde não houver geometria confiável.
- Permitir que a busca mostre município mesmo sem dado submunicipal.
- Salvar a proveniência por território, indicador e versão.

## 4.5 Pipeline dos dados

```text
Supabase legado existente (projeto eleitoral, já pesado)
  -> CLI: descobrir projetos, identificar projeto CORRETO e permissões
  -> monitorar saúde do banco e inventariar schema (READ-ONLY)
  -> medir impacto de consultas / planejar extração segura
  -> exportar amostra pequena (1 município) fora da aplicação pública
  -> validar tipos, chaves, denominadores, anos, turnos e cobertura
  -> extrair agregados em lotes controlados com usuário SELECT-only
  -> snapshot bruto minimizado em diretório privado, não publicado
  -> normalizar/validar/gerar indicadores para município e bairro
  -> produzir Parquet intermediário opcional em build pipeline
  -> gerar JSON público pequeno / GeoJSON ou tiles / PMTiles
  -> manifest versionado com fontes, metodologia e hashes
  -> Cloudflare Static Assets ou R2 + CDN
                  |
                  v
     Navegador React + mapa (NÃO consulta o Supabase legado)
                  |
                  v
     API Workers -> NOVO Supabase operacional separado
                    (Auth, perfis, grupos, atividades, RSVP, admin)
```

**Executar o pipeline preferencialmente como processo de build/deploy manual ou versionado, nunca como consulta dinâmica dos visitantes nem cron de extração contínua no MVP.** Não criar uma sincronização bidirecional de bancos.

**Controles obrigatórios:** contagens por ano/município; valores não negativos; percentuais em limites válidos; consistência entre comparecimento e abstenção conforme fonte; amostragem manual de dez municípios; registro de divergências; validação de chave de território. Não silenciosamente corrigir discrepâncias.

## 4.6 Formatos e desempenho

- Arquivos brutos/parquet **não devem** ser baixados pelo navegador sem propósito específico.
- JSON resumido e paginado para painéis; MapLibre para renderização geográfica.
- GeoJSON simplificado pode bastar no primeiro corte se o peso for pequeno; PMTiles/vector tiles para cobertura grande e geometrias densas.
- Se arquivo individual passar do limite de assets do Workers, considerar Cloudflare R2 com leitura e cache adequados.
- Evitar centenas de polígonos pesados em estado React, um marcador por elemento DOM e queries N+1.
- Atribuição de fontes cartográficas e licenças dos tiles obrigatória.

## 4.7 Busca territorial

- Busca normaliza acentos, hífen, caixa e whitespace.
- Priorizar municípios com código padronizado; permitir busca por bairros com desambiguação `Bairro — Município/MG`.
- Combinar busca textual com seleção pelo mapa.
- Ao abrir link profundo, restaurar câmera, seleção e painel.
- Não geolocalizar usuário sem interação explícita e permissão.

## 4.8 Escopo de dados da primeira rodada

O primeiro passo é verificar se o Supabase legado acessível pelo CLI contém os dados necessários. A rodada deve procurar **conectar a origem existente sem modificar a origem**, documentar a auditoria e, se seguro, completar um **snapshot real limitado** de um município para validar toda a cadeia. Só extrapolar para Minas Gerais após testar impacto, formato, integridade e desempenho.

Se não houver credenciais de leitura, se o projeto não estiver identificado com confiança, se a extração ameaçar sobrecarregar o banco ou se as tabelas não estiverem prontas: entregar esquema/importador documentado, fixtures sintéticas rotuladas, mapa demonstrável e testes que rejeitam indicadores malformados. Marcar no relatório **“DADOS REAIS NÃO INTEGRADOS”** ou **“INTEGRADOS PARCIALMENTE: [MUNICÍPIO, ANOS, FONTE]”**, sem ambiguidade.

## 4.9 Arquitetura formal: dois projetos Supabase e zero consultas públicas à origem

| Componente | Papel | Acesso permitido | Relação com a produção |
|---|---|---|---|
| **Supabase LEGADO (SOURCE)** | Fonte de dados eleitorais já existentes | Metadados e `SELECT` sob limites estritos; usuário somente leitura quando possível | **Nunca** ligado ao app público, API Workers ou navegador; sem migrations |
| **Pipeline local/CI privado (ETL)** | Extração, normalização, validação e geração de artefatos | Conexão limitada à origem apenas durante execução autorizada; grava em disco privado | Offline; não executa em visita ao site |
| **Cloudflare Static Assets/R2** | Publicação dos indicadores eleitorais agregados e mapas | Arquivos públicos já revisados | Entrega por CDN/cache, independentemente do banco de origem |
| **Supabase NOVO (TARGET)** | Auth, perfis, grupos, responsáveis, propostas, atividades, RSVP e auditoria | Apenas endpoints autorizados ou clientes sujeitos a RLS | Banco operacional; migrations somente aqui e em ambientes locais/teste |
| **Workers/Hono** | API de negócio | Conexões somente ao TARGET e aos assets publicados; nunca ao SOURCE | Rate limiting, validação, autenticação, aprovação |

**Proibição técnica verificável:** variáveis de ambiente do Worker, frontend, staging e deploy de produção **não podem conter URL, projeto, service-role, connection string, senha ou token de acesso ao SOURCE**. Não deve existir `SUPABASE_SOURCE_*` no `wrangler.toml/jsonc`, em secrets de deploy ou em qualquer artefato cliente. Somente o comando local de ETL isolado pode ler credenciais de origem, de forma transitória e fora do repositório.

## 4.10 Descoberta da origem no CLI — sequência conservadora

1. Executar `supabase --version`, `supabase projects list` e identificar os projetos disponíveis. A ligação local (`supabase link`) **não** deve ser alterada precipitadamente: ela pode estar apontando para outro projeto. A lista de projetos não autoriza a leitura irrestrita de todos.
2. Verificar o projeto/ID candidato, organização, ambiente e nomes de schemas **sem mostrar URLs contendo credenciais**. Nunca copiar token da autenticação CLI ou string de conexão para o relatório.
3. Obter autorização e estabelecer credencial com privilégios **somente de leitura (`SELECT` nos objetos específicos necessários)** sempre que possível. Se a credencial disponível for administrativa e não houver modo de reduzir privilégios, não executar comandos exploratórios destrutivos; usar apenas instruções de consulta limitadas, com revisão prévia do escopo.
4. Antes de extrair, consultar os relatórios do Supabase sobre CPU, RAM, I/O, conexões e queries caras, se houver acesso. Registrar se o banco já está próximo de saturação. Distinguir **volume de armazenamento** de **sobrecarga de compute**; são problemas diferentes.
5. Inventariar schemas, tabelas, colunas, relações, índices, linhas estimadas e tamanho por tabela com metadados (`pg_catalog`, `information_schema`, `pg_stat_user_tables`), minimizando scans. Evitar `COUNT(*)` em tabelas grandes sem justificativa.
6. Identificar candidatos que contenham município, `codigo_ibge`, bairro, zona/seção/local, eleição/ano/turno, candidato, votos, abstenção, comparecimento; indicar exatamente qual recorte os dados suportam. Não assumir nomes de tabela nem confundir fontes pagas, de seguidores ou Meta Ads com a base eleitoral.
7. Confirmar se a base reúne 2022 e 2026, se resultados estão consolidados ou parciais, se possui apenas alguns estados, se abstenção é por seção ou município, e se a associação a bairro já foi produzida.
8. Registrar o resultado em `docs/DATA_SOURCE_AUDIT.md` com **nomes técnicos, métricas agregadas, riscos e incertezas**, jamais amostras contendo PII.

**Exemplos não destrutivos para diagnóstico, somente após identificar a conexão correta:**

```bash
supabase --version
supabase projects list
# O CLI pode oferecer 'supabase inspect db ...' conforme versão e link.
# Confira 'supabase inspect db --help' antes de usar comandos específicos.
# NÃO executar supabase db reset, db push, migration up, db diff
# com apply, ou qualquer comando que modifique o projeto legado.
```

```sql
-- Executar exclusivamente no banco SOURCE identificado e com acesso autorizado.
-- Em sessão de leitura, aplicar limites de duração; comandos SET LOCAL
-- exigem transação e devem ser revisados conforme o cliente.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SELECT schemaname, relname AS tabela,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamanho_total,
       n_live_tup AS linhas_estimadas
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
COMMIT;
```

A consulta acima retorna **estimativas de catálogo**, não contagens exatas. Se o banco estiver saturado, até consultas relativamente pequenas devem ser adiadas. `EXPLAIN` sem `ANALYZE` pode auxiliar a estimar custo, mas não substitui cautela operacional.

## 4.11 Política de leitura e extração sem impacto indevido

- **Fonte intacta:** nenhuma escrita ou DDL; sem migrations, extensões, índices, tabelas temporárias remotas, `VACUUM`, `ANALYZE`, `REINDEX`, triggers, alterações RLS, criação de views ou funções no SOURCE.
- **Escopo mínimo:** consultar somente tabelas e colunas eleitorais necessárias para os indicadores públicos. Não exportar `auth.users`, contatos, voluntários, dados pessoais de outras aplicações, logs ou tabelas sem relação com eleições.
- **Sessão controlada:** privilégios SELECT-only, `statement_timeout`, `lock_timeout`, conexões e concorrência baixas; operações em lote, com checkpoint e possibilidade de cancelar.
- **Planejamento:** estimar bytes/linhas e medir duração da amostra antes do snapshot completo. Não iniciar um `SELECT *` ou `COPY` de base inteira sem comprovar viabilidade.
- **Extração incremental:** paginar por chave estável (`id`, município/código, data de referência, quando apropriado), preferir keyset a OFFSET para conjuntos enormes, usar snapshots consistentes e deduplicar por identificador determinístico.
- **Carga:** iniciar com um município de menor custo, monitorar o impacto; continuar em lotes curtos somente se leitura e validações forem satisfatórias. Evitar paralelismo agressivo e agregações pesadas dentro do SOURCE.
- **Privacidade:** produzir somente agregados públicos e guardar arquivos intermediários potencialmente sensíveis fora de `public/`, `dist/`, storage público ou repositório Git.
- **Falhas:** limite estourado, timeout, CPU alta, divergências de schema, credencial insuficiente ou risco de privacidade devem fazer o ETL **parar com erro explícito**, mantendo a aplicação em modo demo ou usando o último snapshot validado.
- **Repetibilidade:** um operador autorizado pode repetir o processo em uma máquina com acesso à origem; não exigir a máquina original nem armazenar suas credenciais no projeto.

## 4.12 Contrato dos snapshots eleitorais públicos

Gerar um conjunto determinístico com nomenclatura e versionamento, por exemplo:

```text
data/generated/
  manifest.json
  municipalities.json
  territories-index.json
  metrics/
    2022-round-1.json
    2026-round-1.json
  geo/
    municipalities.pmtiles        # somente se necessário
    neighborhoods.pmtiles         # somente quando a geometria for confiável
  methodology.json
```

`data/generated/` é exemplo lógico: a publicação deve copiar apenas **artefatos públicos minimizados** para Static Assets ou R2. Arquivos intermediários como `.parquet` e extratos SQL/CSV ficam em `data/private/` (gitignored), com controle de acesso e retenção definidos.

O `manifest.json` deve incluir pelo menos: `schema_version`, `release_id`, `generated_at`, `source_project_alias` sem project ref confidencial desnecessário, `source_tables` quando não sensíveis, eleições/turnos abrangidos, níveis geográficos, número de territórios, total de registros, tipos de indicador, hash SHA-256 de cada arquivo, bytes, metodologia, limites de cobertura, status `validated|partial|demo`, e versão do pipeline/commit.

Exemplo de forma (valores são **placeholders, nunca resultados eleitorais reais**):

```json
{
  "schema_version": 1,
  "release_id": "<versao-deterministica>",
  "status": "partial",
  "generated_at": "<UTC-ISO8601>",
  "years": [2022, 2026],
  "geographic_levels": ["municipality", "neighborhood"],
  "source_project_alias": "electoral-source-readonly",
  "pipeline_commit": "<git-sha>",
  "files": [{"path": "metrics/2026-round-1.json", "sha256": "<hash>", "bytes": 0}],
  "coverage_notes": ["<descrever cobertura efetiva, nao presumir totalidade>"]
}
```

**`status` não pode ser `validated` se a fonte, cobertura, totais, chaves, precisão ou integridade ainda não forem verificadas.** Ativos publicamente visíveis devem carregar referência à versão e à metodologia. Planejar rollback para o último snapshot válido.

## 4.13 Validações e verificações cruzadas

1. Conferir anos e turnos; não misturar 1º/2º turnos nem data de extração com data da eleição.
2. Validar código IBGE, chaves e territórios repetidos; resolução municipal não implica resolução por bairro.
3. Conferir votos, comparecimento, abstenção, eleitorado e percentuais com os denominadores usados no SOURCE.
4. Comparar somatórios por município contra agregações e totais oficiais disponíveis; relatar discrepâncias sem "corrigir" invisivelmente.
5. Não interpretar um endereço de local de votação como residência do eleitor; rotular bairros derivados de seção como aproximações metodológicas quando aplicável.
6. Guardar relatórios de amostragem (pelo menos dez municípios quando houver cobertura suficiente) e casos faltantes; identificar o município de spike e seu volume.
7. Garantir que os JSONs publicados não exponham e-mail, telefone, CPF, RG, ID de usuário, token, connection string, chaves Supabase, dados de seções individualizáveis quando não pertinentes, ou campos internos irrelevantes.
8. Testar que o navegador funciona sem conectividade ao SOURCE; confirmar que logs de rede não contêm a URL do banco eleitoral antigo.

## 4.14 Entregáveis obrigatórios do pipeline na primeira rodada

- `docs/DATA_SOURCE_AUDIT.md`: identificação por **alias** da origem, status de permissão, schemas/tabelas relevantes, anos/turnos/cobertura, tamanho estimado, métricas de saúde se consultadas, riscos, evidências e limitações.
- `docs/ELECTORAL_EXPORT_REPORT.md`: plano de extração, comandos de execução segura, recorte amostral, métricas reais do spike se executado, validações, divergências, hashes/manifest e decisão `GO/NO-GO` para exportação completa.
- `docs/IMPORT_GUIDE.md`: como reconstruir um snapshot a partir do SOURCE com acesso autorizado, sem depender de caminhos absolutos da máquina ou de credenciais versionadas.
- `scripts/import-electoral/` (ou `scripts/export-electoral/`): CLI/script reutilizável com flags `--dry-run`, `--municipality`, `--years`, `--output`, `--max-rows` ou equivalentes, limites explícitos e tratamento de falhas.
- `docs/RELATORIO_PRIMEIRA_RODADA.md`: resumo auditável da integração real, parcial, simulada ou bloqueada, com referências aos documentos acima.

**Critério de aceite:** não apresentar dados reais se não houve extração/validação; não extrair tudo se a amostra produzir custo inaceitável; não usar o Supabase legado para login, RSVP ou atividade; não criar contas no SOURCE.

---

# 5. STACK, COMPONENTES E PRINCÍPIOS DE ENGENHARIA

## 5.1 Decisão-base

**Frontend:** React + Vite + TypeScript estrito + React Router + Tailwind CSS + tokens CSS + biblioteca de componentes acessíveis (Radix/shadcn como base técnica, mas sem aparência padrão) + TanStack Query para dados remotos + Motion para React apenas onde agrega valor + MapLibre GL JS.

**Backend:** Cloudflare Workers com Hono + validação Zod + SDK de Supabase ou REST autenticado + contratos compartilhados via schemas; sem segundo backend desnecessário.

**Persistência operacional:** **novo projeto Supabase** PostgreSQL com RLS, Auth e PostGIS se necessário; banco legado só entra em ETL offline via credencial temporária de leitura, nunca na API pública.

**Dados cartográficos:** snapshots eleitorais agregados e geometria estáticos na CDN/Worker Static Assets; PMTiles ou R2 se necessário; banco operacional apenas para mudanças frequentes. Nunca depender do SOURCE para renderizar o mapa.

**Testes e CI:** TypeScript `tsc --noEmit`, ESLint, Vitest, testes de integração de API com banco de teste, Playwright E2E, testes de política RLS, GitHub Actions.

**Observabilidade:** logs estruturados minimizados, métricas agregadas de erros, latência, volume de API, taxa de desafio/rejeição; alertas e incident runbook.

## 5.2 Critérios para dependências

- Preferir bibliotecas maduras, mantidas e necessárias.
- Verificar versões atuais no momento da implementação; travar versões no lockfile.
- Não adicionar Next.js, SSR, Redis, fila, n8n, microserviços ou monorepo complexo por tendência.
- Não adotar ORM sem benefício claro; SQL versionado e tipagem gerada podem bastar.
- Não implementar serviços próprios de autenticação/criptografia.
- Nenhum pacote com histórico de manutenção problemático ou dependência opaca sem análise.

## 5.3 Organização de repositório sugerida

```text
minas-em-movimento/
├─ README.md
├─ CLAUDE.md
├─ package.json
├─ package-lock.json (ou pnpm-lock.yaml; escolher um)
├─ wrangler.jsonc
├─ vite.config.ts
├─ tsconfig*.json
├─ .env.example
├─ .gitignore
├─ .github/
│  └─ workflows/ci.yml
├─ .claude/
│  ├─ agents/
│  │  ├─ architect-review.md
│  │  ├─ backend-engineer.md
│  │  ├─ frontend-engineer.md
│  │  ├─ feature-builder.md
│  │  ├─ code-explorer.md
│  │  ├─ qa-security.md
│  │  └─ visual-review.md
│  ├─ rules/
│  │  ├─ architecture.md
│  │  ├─ security.md
│  │  ├─ frontend.md
│  │  ├─ database.md
│  │  ├─ cartography.md
│  │  └─ reporting.md
│  └─ skills/
│     ├─ design-review/SKILL.md
│     └─ pre-release/SKILL.md
├─ docs/
│  ├─ PRODUCT.md
│  ├─ ARCHITECTURE.md
│  ├─ DATA_DICTIONARY.md
│  ├─ SECURITY.md
│  ├─ DESIGN_SYSTEM.md
│  ├─ API_CONTRACTS.md
│  ├─ TEST_PLAN.md
│  ├─ IMPORT_GUIDE.md
│  ├─ DATA_SOURCE_AUDIT.md     # inventário somente leitura da origem
│  ├─ ELECTORAL_EXPORT_REPORT.md # spike e decisão sobre extração real
│  ├─ RUNBOOK.md
│  ├─ DECISIONS.md
│  ├─ RELATORIO_PRIMEIRA_RODADA.md  # obrigatoriamente ao final da rodada 1
│  ├─ screenshots/
│  └─ adr/
├─ src/
│  ├─ app/              # providers, router, layout
│  ├─ pages/            # landing, território, atividade, cadastro, obrigado, admin
│  ├─ features/
│  │  ├─ territory/
│  │  ├─ electoral-map/
│  │  ├─ registration/
│  │  ├─ whatsapp-groups/
│  │  ├─ activities/
│  │  ├─ auth/
│  │  └─ admin/
│  ├─ components/
│  │  ├─ ui/
│  │  ├─ map/
│  │  └─ layouts/
│  ├─ styles/           # CSS tokens, typography, transitions
│  ├─ lib/              # browser APIs, fetch client, validators
│  ├─ fixtures/         # dados fictícios marcados
│  └─ tests/
├─ worker/
│  ├─ index.ts
│  ├─ app.ts
│  ├─ routes/
│  ├─ middleware/
│  ├─ services/
│  ├─ repositories/
│  ├─ schemas/
│  └─ tests/
├─ shared/
│  ├─ contracts/
│  ├─ schemas/
│  └─ types/
├─ supabase/
│  ├─ migrations/
│  ├─ seed.sql         # apenas dados sintéticos locais
│  └─ tests/
├─ scripts/
│  ├─ import-electoral/       # ETL offline, READ ONLY no SOURCE
│  ├─ generate-tiles/
│  └─ validate-data/
└─ e2e/
```

É uma **estrutura de referência**, não ordem para gerar dezenas de pastas vazias. Criar arquivos quando forem necessários e evitar abstrações que só embrulham outras abstrações.

## 5.4 Padrões de implementação

- TypeScript estrito sem `any` por conveniência.
- Lógicas sensíveis no servidor; validação no frontend como UX, nunca única proteção.
- Contratos de entrada/saída explícitos, versões quando necessário.
- Erros padronizados com `request_id`, código estável e mensagem genérica ao público.
- Repository/service somente se reduzir acoplamento real.
- Componentes organizados por recurso (feature), sem duplicação de estilos.
- Mutação de dados via endpoints controlados; não permitir que o navegador acesse tabelas operacionais com permissões amplas.
- Idempotência, controle de concorrência e limites na criação de registros.

---

# 6. ESTRUTURA AGÊNTICA (OBRIGATÓRIA)

## 6.1 Missão da orquestração

Usar capacidade elevada de Fable para garantir qualidade de produto, arquitetura e direção visual, porém delegar tarefas cujo resultado pode ser testado e revisado a modelos menos custosos. **Não criar um teatro de agentes:** delegações precisam ter objetivo mensurável, arquivos delimitados, critério de aceite e resultado verificável.

## 6.2 Modelos-alvo e aliases

- **Arquiteto/orquestrador principal:** `claude-fable-5-1`.
- **Engenharia complexa / revisão de risco:** `claude-opus-5-5`.
- **Desenvolvimento delimitado do dia a dia:** `claude-sonnet-5-5`.
- **Exploração e rotinas mecânicas:** `claude-haiku-5-5`.

Os aliases correspondem à documentação pública da Anthropic em outubro de 2026, mas disponibilidade, quotas e suporte a cada mecanismo variam por conta/cliente/versão. O agente principal deve testar a compatibilidade da versão do Claude Code instalada antes de escrever frontmatter definitivo; substituir pelo alias suportado mais próximo **e registrar a substituição no relatório** se necessário.

## 6.3 Estrutura de responsabilidades

| Agente | Modelo | Responsabilidade | Limites |
|---|---|---|---|
| `orchestrator` | Fable (sessão principal) | Escopo, decomposição, contratos, ADRs, arquitetura, design direction, revisão final | Não refazer indiscriminadamente trabalho pronto |
| `backend-engineer` | Opus | Worker/Hono, contratos, migrations, RLS, Auth, validações de segurança | Proibido executar migrations em produção |
| `frontend-engineer` | Opus | Mapa, UX mobile, componentes fundacionais, design system | Não mudar contratos unilateralmente |
| `feature-builder` | Sonnet | Telas e endpoints bem especificados, integração e testes | Não introduzir arquitetura paralela |
| `code-explorer` | Haiku | Localização de arquivos, dependências, inventários e leituras | Preferencialmente somente leitura |
| `qa-security` | Opus | Auditoria independente de Auth, RLS, APIs, dados sensíveis, bugs lógicos | Não aprova o próprio código |
| `visual-review` | Sonnet ou Opus conforme complexidade | Screenshots, UX, consistência, acessibilidade e regressão visual | Reporta evidências, não preferência subjetiva isolada |

## 6.4 Política objetiva de roteamento

- **Trivial:** pesquisa de repositório, reorganização literal, testes boilerplate → Haiku.
- **Simples:** componentes definidos, validações locais, integrações pouco arriscadas → Sonnet.
- **Média:** formulário com fluxos, API com contrato, estado interativo → Sonnet com revisão ou Opus quando complexidade exigir.
- **Alta:** sessão provisória e verificação, RLS, modelagem relacional, cartografia complexa, infraestrutura de produção → Opus.
- **Crítica/transversal:** trade-offs do produto, arquitetura, privacidade, conflitos de módulos, critérios de qualidade → Fable.

**Escalonar somente com evidência**: requisito ambíguo, falha de testes não trivial, riscos de dados, dependências circulares, mais de duas tentativas fracassadas ou necessidade de decisão transversal. Não escalar por hábito.

## 6.5 Protocolo de delegação

Todo despacho de tarefa deve incluir:

```text
ID da tarefa:
Objetivo verificável:
Contexto e contratos:
Arquivos que pode editar:
Arquivos que NÃO pode editar:
Dependências:
Critérios de aceite:
Comandos de testes exigidos:
Riscos e dados sensíveis envolvidos:
Modelo escolhido e motivo:
Formato de retorno: diff/arquivos, testes reais, dúvidas, riscos.
```

**Retorno obrigatório do subagente:** lista dos arquivos alterados, resumo das mudanças, comandos e resultados de teste, pontos não resolvidos, eventuais alterações de contrato, dependências introduzidas, falhas e explicitação do que não foi validado.

## 6.6 Paralelismo

- Limite operacional inicial: no máximo **3–4 subagentes concorrentes**, condicionado às capacidades reais da ferramenta e às quotas do usuário.
- Worktrees isoladas quando suportadas e quando mais de um agente for escrever.
- Nunca permitir dois agentes editando o mesmo arquivo/migration ao mesmo tempo.
- Migrations sequenciais e revisadas antes de merge.
- Agent Teams só para tarefas verdadeiramente paralelizáveis; subagents como padrão.
- O agente principal não deve bloquear trabalho por esperar retorno de uma tarefa que não é pré-requisito.

## 6.6.1 Isolamento obrigatório na delegação do banco legado

- A descoberta da origem cabe inicialmente ao agente explorador somente leitura, que retorna **identificadores técnicos e metadados não sensíveis**, não um dump de tabelas.
- O agente de dados prepara plano de consulta e estima carga; Opus revisa a query e Fable autoriza internamente a execução apenas se ela obedecer às restrições deste documento e às permissões disponíveis.
- Nenhum subagente tem autorização para instalar extensão, criar índice, ajustar RLS, fazer migration ou modificar dados no SOURCE; prompts de agentes e hooks devem proibir comandos de escrita contra a origem, além de restringir credenciais de produção.
- Worktrees de agentes não devem receber `.env` com segredos do SOURCE. Passagem de credencial ocorre somente na execução local controlada do extrator, fora do histórico de chat, commits e logs.
- Agentes que implementam React, Worker e Auth só recebem snapshots públicos previamente validados ou fixtures; não recebem acesso à origem.
- Caso dados reais não estejam disponíveis sem sobrecarga, a equipe prossegue com a aplicação funcional em demo e relata o impedimento; não solicita privilegios de produção por conveniência.

## 6.7 Política de aprovação

| Tipo de mudança | Executor | Revisor obrigatório |
|---|---|---|
| CSS isolado, texto de interface sem mudança de regra | Sonnet | testes + revisão visual amostral |
| Mapa e lógica espacial | Opus/Sonnet | revisão de UX e validação de dados |
| Schema/Migration | Opus | Fable + testes DB |
| Auth/RLS/permissões | Opus | `qa-security` independente + Fable |
| Regras WAF/CAPTCHA | Opus | `qa-security` + teste anti-falso-positivo |
| Deploy produção/segredos | Humano autoriza | sem execução autônoma |

## 6.8 Arquivos operacionais do Claude

O agente principal deve gerar:

- `CLAUDE.md` curto (não duplicar toda esta especificação): missão, decisões-chave, comandos, padrões de teste, restrições e links para `docs/`.
- `.claude/agents/*.md` com frontmatter realmente aceito pela versão instalada.
- `.claude/rules/*.md` com regras por domínio, sem instruções contraditórias.
- `.claude/skills/...` apenas para workflows reutilizáveis que tragam benefício.
- `.claude/settings.json` com permissões, hooks e preferências **verificadas na documentação local**, não chaves de configuração inventadas.

Exemplo conceitual do agente (validar campos suportados na instalação):

```md
---
name: backend-engineer
description: Implementação complexa de Workers, Supabase Auth, banco e RLS.
model: claude-opus-5-5
isolation: worktree
---

Implemente somente tarefas recebidas com contratos explícitos.
Nunca acesse produção nem exponha segredos.
Entregue alterações, testes executados, evidências e pendências.
```

Não assumir sem checagem que variáveis de ambiente experimentais para limitar subagents estão disponíveis na versão instalada. Preferir suporte documentado e comportamento demonstrável.

## 6.9 Hooks e contenção de agentes

- Hooks de pré-execução podem bloquear operações destrutivas, gravação de segredo e comandos fora do repositório.
- Hooks não substituem CI, permissões do sistema, credenciais restritas nem revisão humana.
- Negar por padrão comandos que escrevam em produção, removam banco de dados, mexam em DNS ou publiquem novos domínios sem autorização.
- Evitar que tarefas exploratórias tenham permissão de escrita.
- Toda exceção de segurança relevante precisa de aprovação humana e registro.

## 6.10 Gestão de contexto, qualidade e custo

- Não despejar logs enormes em contexto de Fable; resumir achados e apontar paths/linhas.
- Retornar evidências compactas (testes e screenshots) e não reescrever arquivos inteiros na conversa.
- Reutilizar documentação do projeto e ADRs; evitar explicações repetidas.
- Manter um quadro de tarefas com estado: `todo`, `in_progress`, `blocked`, `review`, `done`.
- Definir orçamento de tokens/concurrency quando a ferramenta permitir.
- Quando um agente menor falhar reiteradamente, escalar; quando uma tarefa Opus estiver totalmente especificada, quebrar a implementação e delegar partes mecânicas a Sonnet.
- Não declarar “qualidade Fable” por estilo retórico: demonstrar com arquitetura consistente, testes, screenshots e revisão.

# 7. BACKEND, API E CONTRATOS

## 7.1 Responsabilidade da API

**Invariante de isolamento:** os Workers interagem com o **novo Supabase operacional** e, quando necessário, com o catálogo de snapshots publicado na CDN. A API pública não possui acesso, rota de proxy, credencial ou conexão com o Supabase eleitoral legado. Nenhum endpoint de produção pode disparar extração do SOURCE.

Uma única API HTTP em Cloudflare Workers, usando Hono, deve executar:

- Validação de entrada e resposta.
- Rate limiting e validação Turnstile nos endpoints necessários.
- Verificação de credenciais, identidade e permissões.
- Transações/operations de banco para cadastro, propostas, RSVP, moderação.
- Prevenção de duplicidade e normalização.
- Respostas públicas com projeções mínimas e sem dados sensíveis.
- Trilha auditável de ações administrativas.

Não usar Cloudflare Workers apenas como proxy cego com chave privilegiada repassando qualquer operação do navegador. Cada rota precisa de autorização específica e teste negativo.

## 7.2 Padrão de respostas

Sucesso (exemplo):

```json
{
  "data": { "id": "uuid", "status": "pending_review" },
  "meta": { "request_id": "opaque-id" }
}
```

Falha (exemplo):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revise os dados informados.",
    "fields": { "email": "E-mail inválido" }
  },
  "meta": { "request_id": "opaque-id" }
}
```

Padrões:

- `400` campos inválidos; `401` não autenticado; `403` sem permissão; `404` recurso inexistente/não publicado; `409` conflito idempotente; `422` semântica incompatível; `429` taxa excedida; `5xx` sem vazamento interno.
- Não retornar o conteúdo integral de `profiles`, `group_managers` ou `audit_events` em recursos públicos.
- Cabeçalhos de cache diferenciados para conteúdo público e privado; `Cache-Control: no-store` em endpoints de conta, cadastro e administração.
- IDs de registros preferencialmente UUID/ULID; autorização por servidor, jamais confiar em “IDs difíceis de adivinhar”.
- Paginação por cursor nas listagens operacionais; limites de `limit` estritos; evitar consultas arbitrárias.

## 7.3 Endpoints públicos sugeridos

| Método | Endpoint | Função | Proteção |
|---|---|---|---|
| GET | `/api/v1/health` | Status técnico sem segredos | Limites básicos; sem versão detalhada interna |
| GET | `/api/v1/territories/search?q=` | Buscar município/bairro | Cache + limites de consulta |
| GET | `/api/v1/territories/:id` | Resumo público do território | Cache |
| GET | `/api/v1/territories/:id/metrics?year=&round=` | Indicadores consolidados | Cache imutável/versionado |
| GET | `/api/v1/groups?territory_id=` | Grupos **aprovados**, dados públicos | Cache curto; nunca responsável/telefone pessoal |
| POST | `/api/v1/groups/proposals` | Propor novo grupo | Turnstile + limites + validação de URL |
| GET | `/api/v1/activities?bbox=&from=&to=` | Lista de atividades aprovadas no mapa | Bbox limitado; cache curto; paginação |
| GET | `/api/v1/activities/:id` | Detalhe de atividade publicada | Cache curto |
| POST | `/api/v1/activities/:id/rsvp` | Registrar “Eu vou” | Rate limit, cookie anônimo, idempotência |
| DELETE | `/api/v1/activities/:id/rsvp` | Desmarcar “Eu vou” | Identidade do token ou sessão original |
| POST | `/api/v1/registrations` | Cadastro e seleção territorial | Turnstile + controles de duplicidade; integração segura com Auth |

**Nota:** cadastro e criação de sessão podem envolver chamadas próprias de Supabase Auth. O agente deve validar um fluxo íntegro em que os endpoints públicos da API não sejam contornados por chamadas diretas com menor proteção. Se Auth permanecer acessível diretamente, habilitar CAPTCHA/limites de Auth independentemente da API.

## 7.4 Endpoints autenticados

| Método | Endpoint | Exigência |
|---|---|---|
| GET | `/api/v1/me` | Sessão; campos próprios mínimos |
| PATCH | `/api/v1/me` | Sessão; apenas campos permitidos |
| GET | `/api/v1/my-activities` | E-mail verificado; só atividades próprias |
| POST | `/api/v1/activities` | E-mail verificado + Turnstile conforme risco + moderação |
| PATCH | `/api/v1/activities/:id` | Autor ou admin; edições sensíveis retornam a revisão |
| POST | `/api/v1/activities/:id/cancel` | Autor ou admin; auditar cancelamento |
| POST | `/api/v1/auth/send-link` | Anti-enumeração, limites por IP/email e proteção de Auth |

## 7.5 Endpoints de admin

| Método | Endpoint | Exigência |
|---|---|---|
| GET | `/api/v1/admin/queue` | Admin + MFA; paginada |
| POST | `/api/v1/admin/groups/:id/approve` | Admin + decisão auditada |
| POST | `/api/v1/admin/groups/:id/reject` | Admin + motivo |
| POST | `/api/v1/admin/activities/:id/approve` | Admin + decisão auditada |
| POST | `/api/v1/admin/activities/:id/reject` | Admin + motivo |
| PATCH | `/api/v1/admin/groups/:id` | Admin; gestão de links/estado |
| POST | `/api/v1/admin/groups/:id/managers` | Admin; responsáveis privados |
| GET | `/api/v1/admin/security-events` | Admin; logs minimizados e paginados |

Preferir ações REST claras a um endpoint administrativo genérico que aceite operações arbitrárias.

## 7.6 Contratos relevantes

**Grupo público:** `id`, `display_name`, `territory_id`, `join_url`, `status=active`, `updated_at`; **nunca** `manager_name`, `manager_phone`, `proposer_email`, logs ou motivo de moderação.

**Atividade pública:** `id`, `title`, `type`, `description_sanitized`, `starts_at`, `ends_at?`, `timezone`, `location_public`, `coordinates`, `territory_id`, `status=published`, `rsvp_count_approx`, `contact_public?`, `updated_at`.

**Atividade interna:** dados públicos acima + `creator_user_id`, `reviewer_id`, `reviewed_at`, notas de moderação, histórico interno; não expor esses campos por acidente.

**RSVP público:** endpoint retorna apenas o estado daquela sessão/dispositivo e contagem agregada, nunca lista de outros participantes.

## 7.7 Transações e corridas

- Inserções idempotentes; registrar chave de idempotência com escopo, validade e unicidade adequada.
- Duplo clique em “Eu vou” não deve criar duas linhas.
- Reenvio de formulário por timeout não deve criar duas propostas idênticas sem avaliação.
- Aprovação simultânea de uma mesma proposta por dois admins não pode gerar grupos duplicados.
- Atividade cancelada não pode aceitar novos RSVPs.
- Recontagem deve partir de registros válidos, não de contador incremental cego.
- Atualizações críticas sempre com verificação de versão/estado ou transação condicional.

---

# 8. SUPABASE **NOVO**: DADOS OPERACIONAIS, AUTENTICAÇÃO, POLÍTICAS E MIGRATIONS

## 8.1 Postgres e separação por exposição

**Tudo neste capítulo se refere exclusivamente ao NOVO projeto Supabase operacional**, salvo menção explícita a um pipeline offline. O banco antigo é somente uma fonte de snapshots, não uma instância operacional reutilizada. Ter tabelas eleitorais no schema local como staging é opcional; não copiar a base histórica inteira para o novo Supabase.

Estruturar tabelas privadas em schema não exposto quando possível (por exemplo, `app_private`) e recursos públicos em schema/tabelas/views intencionalmente expostos. Se usar `public`, revogar grants excessivos e criar RLS desde a migration inicial. RLS não substitui grants, e views mal configuradas podem contorná-la.

**Nunca** expor `service_role` em variáveis `VITE_*` nem inserir chave privilegiada em código frontend; chave de serviço só em secrets do Worker ou processo administrativo legitimado. Qualquer Worker com privilégios elevados deve aplicar autorizações antes de consultar o banco.

## 8.2 Modelo mínimo de entidades

### `territories`

- `id uuid pk`
- `type enum/state|municipality|neighborhood`
- `name text not null`
- `normalized_name text not null`
- `parent_id uuid fk territories nullable`
- `state_code char(2)` sempre MG neste projeto
- `ibge_code text nullable`
- `slug text` com regra de unicidade contextual
- `centroid geography(Point,4326) nullable`
- `boundary_version text nullable`
- `data_quality enum`
- `created_at timestamptz`

Índices por `(parent_id, normalized_name)`; unicidade de município por código IBGE quando disponível; bairro pode repetir nome em municípios diferentes.

### `data_releases`

- `id uuid pk`, `release_tag unique`, `source_url/source_label`, `imported_at`, `content_hash`, `methodology_version`, `warnings jsonb`, `is_published`.

### `electoral_metrics` — **opcional no TARGET**

- `territory_id fk`, `release_id fk`, `election_year int`, `round int`, `candidate_id`, `metric_code`, `value_numeric`, `denominator_code`, `source_precision`, `notes`; chave composta ou unique que impeça colisões; validações de intervalo/denominador.

**Não é obrigatório replicar dados eleitorais históricos no banco novo.** Os resultados agregados são preferencialmente distribuídos por snapshots públicos na CDN. Se houver necessidade real de consulta relacional interna, importar **somente indicadores agregados e minimizados** para uma tabela pequena/materializada no TARGET depois de justificar volume, manutenção e custo. A importação não pode estabelecer queries entre os dois bancos em runtime.

### `profiles` (privado)

- `user_id uuid pk references auth.users`, `display_name`, `email_contact`, `email_verification_state`, `phone_e164`, `selected_territory_id`, `consent_version`, `contact_opt_in_at nullable`, `created_at`, `updated_at`, `account_state`.

**Atenção:** `email_contact` informado em formulário não prova identidade. Somente o estado validado pelo provedor Auth permite `email_verified=true`; nunca derivar de um campo editável pelo usuário. Não transformar e-mail de contato pendente em mecanismo para assumir outra conta.

### `whatsapp_groups`

- `id uuid pk`, `territory_id fk`, `display_name`, `join_url`, `status enum pending/active/inactive/rejected`, `created_by nullable`, `approved_by nullable`, `approved_at nullable`, `created_at`, `updated_at`, `last_checked_at nullable`.

Índice por `territory_id, status`; política clara se um bairro pode ter vários grupos. Sugestão MVP: um grupo preferencial ativo por bairro + possibilidade de outros geridos pelo admin.

### `group_proposals` (privado)

- `id`, `territory_id`, `name_proposed`, `join_url_proposed`, `proposer_name`, `proposer_email`, `proposer_phone`, `proposer_user_id nullable`, `status`, `reviewed_by`, `reviewed_at`, `review_reason`, `created_at`, fingerprint antiabuso com retenção limitada.

O cadastro de proposta não publica diretamente a tabela de grupos. Aprovação deve criar/ativar grupo por operação transacional.

### `group_managers` (privado somente admin)

- `id`, `group_id fk`, `name`, `email nullable`, `phone nullable`, `role_label`, `created_at`, `updated_at`.

**Não expor em views públicas.** Não presumir que coordenador possa ver toda a base de inscritos.

### `activities`

- `id uuid pk`
- `creator_user_id uuid fk`
- `territory_id uuid fk` (cidade/bairro relacionado, não residência obrigatória)
- `title`, `type`, `description`, `starts_at`, `ends_at nullable`, `timezone` (`America/Sao_Paulo` para contexto), `public_address`, `location geography(Point,4326)`, `location_precision`, `status enum draft/pending_review/published/rejected/cancelled/archived`, `public_contact_type nullable`, `public_contact_value nullable`, `public_contact_opt_in boolean default false`, `reviewed_by`, `reviewed_at`, `review_reason`, `created_at`, `updated_at`, `version int`.

O contato público só pode ser exibido se `public_contact_opt_in` verdadeiro; validar formato e permitir desligá-lo. Não preencher automaticamente o contato público com dados privados do perfil.

### `activity_rsvps`

- `id uuid pk`, `activity_id fk`, `user_id nullable fk`, `anonymous_subject_hash nullable`, `status enum going/cancelled`, `created_at`, `updated_at`, `source`, `idempotency_key_hash nullable`.

**Unicidade recomendada:** índice parcial para `(activity_id,user_id)` quando `user_id IS NOT NULL`; outro para `(activity_id,anonymous_subject_hash)` quando token anônimo presente. A proteção contra repetição entre dispositivos diferentes é limitada e deve ser explicitamente tratada como best-effort.

### `audit_events` (privado)

- `id`, `actor_user_id nullable`, `action`, `entity_type`, `entity_id`, `before_hash/after_hash ou diffs minimizados`, `request_id`, `created_at`, `reason`, `retention_class`.

Evitar armazenar conteúdo de contatos/PII em logs. Audit trail deve ser consultável apenas por admin autorizado e com política de retenção.

### `abuse_events` ou métrica operacional equivalente

- Identificadores minimizados, rota, tipo de evento, código de bloqueio, timestamp, score/categoria disponível. Não usar armazenagem indefinida de IP bruto por padrão; documentação de retenção é obrigatória.

## 8.3 Diagrama lógico resumido

```text
territories (hierarquia MG -> municípios -> bairros)
  |-- electoral_metrics --> data_releases
  |-- whatsapp_groups --< group_managers [privado]
  |-- group_proposals [privado]
  |-- activities --< activity_rsvps
  \-- profiles [território escolhido; privado]

auth.users --> profiles
           --> activities (creator)
           --> activity_rsvps (quando autenticado)
admin identity --> audit_events / decisões de moderação
```

## 8.4 Autenticação: decisão de implementação detalhada

**Requisito simultâneo:** e-mail obrigatório no formulário; sessão ativa imediatamente ao concluir cadastro; verificação de e-mail necessária para ações de organização; login futuro por magic link.

Uma implementação possível (validar com projeto Supabase de teste):

1. Proteger requisição de cadastro com Turnstile validado no servidor e políticas antiabuso.
2. Criar/obter identidade **anônima autenticada** com Supabase Auth (`signInAnonymously`) ao efetuar o cadastro, sem dar privilégios elevados.
3. Associar o perfil mínimo à identidade real (`auth.uid`) e registrar e-mail de contato como **não verificado**. Usar backend transacional/compensação para que falhas não deixem perfis inconsistentes.
4. Solicitar vinculação de identidade e verificação de e-mail usando fluxo oficialmente suportado (`updateUser({ email })` e confirmação de e-mail/OTP) em contexto seguro. O momento exato desse passo deve ser validado por spike antes da implementação final.
5. Após confirmar e-mail, marcar a identidade como permanente conforme estado do Auth; permitir ações de organizador apenas se JWT e banco confirmarem e-mail verificado e papel adequado.
6. No retorno futuro, usar magic link/OTP do Supabase e restaurar sessão; usuário provisório que perdeu o dispositivo deve ter fluxo claro de recuperação sem tomada de conta.

**Pontos que exigem spike:** disponibilização do serviço de cadastro anônimo no projeto; validação de que contas provisórias não assumem e-mail previamente cadastrado; linking seguro; expiração/refresh de sessão; compatibilidade Turnstile/Auth; comportamento ao solicitar login mágico de e-mail já existente; cookies e proteção contra CSRF se usar sessão cookie-based.

**Não fazer:** desabilitar confirmação de e-mail em todo o projeto apenas para ganhar sessão imediata; dar permissão `organizer` com base em qualquer texto de email; emitir JWT artesanal; persistir tokens em URLs longamente; aceitar credencial enviada como campo arbitrário.

O Supabase documenta que usuários anônimos autenticados usam a role Postgres `authenticated`; **o claim `is_anonymous` e a verificação de identidade devem entrar nas políticas de acesso**, sob pena de uma conta provisória ser tratada como conta permanente.

## 8.5 Magic link

- E-mail sem senha, sem revelar se existe conta antes do desafio.
- Limites por endereço, IP e dispositivo; mensagens neutras de envio.
- Link de uso único e prazo limitado conforme Auth.
- URLs de redirecionamento em allowlist, sem open redirect.
- Não incluir tokens em analytics, logs nem URLs externas.
- Em admin, exigir MFA adicional.

## 8.6 RLS: matriz de princípios

| Recurso | Anônimo sem sessão | Sessão provisória | E-mail verificado | Admin |
|---|---:|---:|---:|---:|
| Mapas e indicadores públicos | Leitura | Leitura | Leitura | Leitura |
| Grupo aprovado (projeção pública) | Leitura | Leitura | Leitura | Leitura |
| Responsáveis por grupo | Nenhum | Nenhum | Nenhum | CRUD |
| Propostas de grupos | Criar via API validada | Criar via API | Criar via API | Revisar |
| Perfil pessoal | Nenhum | Somente próprio | Somente próprio | Acesso justificado |
| Atividade aprovada | Leitura | Leitura | Leitura | CRUD |
| Atividade pendente | Nenhum | Nenhum | Próprias | Todas |
| Criar atividade | Não | Não | Sim via API | Sim |
| “Eu vou” | API aberta protegida | API aberta | API aberta ou sessão | API aberta |
| Auditoria/moderação | Nenhum | Nenhum | Nenhum | Acesso restrito |

Verificar tanto **GRANTs** quanto políticas `USING` e `WITH CHECK`. Preferir política default deny para todo recurso novo. Policies de usuário verificado não devem confiar somente em `role='authenticated'`.

## 8.7 Admin e elevação de privilégios

- Lista de admins provisionada por operação autorizada, não pelo frontend.
- Nenhum endpoint público pode promover um usuário.
- Tokens e claims de role revistos conforme atualizações do Auth; avaliar checagem server-side contra tabela de permissões.
- MFA obrigatório antes de operações de moderação ou visualização de contatos privados.
- Registrar aprovador, horário, tipo de decisão e motivo; botão de desfazer/suspender.

## 8.8 Migrations, seed e rollback

**Todas as migrations SQL, comandos `db push`, schemas de Auth, tabelas de grupos e políticas RLS destinam-se somente ao projeto operacional novo (ou local/teste).** Antes de qualquer execução remota, conferir explicitamente Project Ref e ambiente, e impedir que `supabase link` aponte para o SOURCE. Preferir diretórios/configurações ou perfis de CLI separados para não confundir os projetos. O projeto legado deve permanecer completamente inalterado.

- Toda alteração do schema em migration idempotente/testável.
- `seed.sql` somente com exemplos sintéticos, identificados.
- Testar migration num projeto Supabase local ou banco isolado.
- Documentar rollback ou caminho de correção, inclusive para extensões e índices.
- Não executar `db reset` contra produção.
- Criar testes negativos de RLS após mudanças.

---

## 8.9 Secrets, ambientes e duas identidades de projeto

- `SUPABASE_OPERATIONAL_URL`, `SUPABASE_OPERATIONAL_ANON_KEY` (ou variáveis equivalentes documentadas) referem-se **somente ao TARGET**; chaves administrativas ficam em secret store do Worker, nunca no frontend.
- `ELECTORAL_SOURCE_DATABASE_URL` ou equivalente deve existir **somente no ambiente local restrito do ETL**, com privilégio SELECT quando possível. Jamais em `.env.example` com valor, deploy, CI pública, logs ou Git; usar placeholder e documentação de configuração segura.
- Comandos que alterem Auth, policies ou migrations devem ter mecanismo de verificação explícita do projeto alvo e proteção contra execução acidental contra o SOURCE.
- Separar `source:readonly`, `operational:dev`, `operational:staging`, `operational:prod` em documentos de arquitetura e scripts, sem compartilhar secrets entre os ambientes.
- O relatório externo não deve incluir Project Ref confidencial, URLs com tokens, dados pessoais, nomes de credenciais, logs de conexão nem capturas do painel com informações sigilosas.

---

# 9. SEGURANÇA: MODELO DE AMEAÇAS E DEFESA ADAPTATIVA

## 9.1 Premissa

O site pode enfrentar scraping, cadastros automatizados, spam, falsos RSVPs, propostas maliciosas de grupos, exploração de APIs, DDoS, tomada de conta de organizador, extração de dados e tentativas de derrubar serviços externos. A arquitetura deve limitar dano, não prometer invulnerabilidade.

“Não investigável” significa aqui **mínima exposição de dados privados, ausência de segredos no cliente e superfície de ataque pequena**; não significa impedir inspeção legítima, esconder o operador, mascarar finalidades ou tornar informações públicas secretas.

## 9.2 Defesa em camadas

1. **Borda Cloudflare:** DDoS, regras WAF compatíveis com plano, filtragem de bots conhecida, limites por rota.
2. **Aplicação Worker:** schemas, autenticação, rate limits específicos, validação Turnstile, limites de tamanho/campo, antifraude.
3. **Banco Supabase:** grants mínimos, RLS, unique constraints, transações, separação de schemas, trilha de moderação.
4. **Frontend:** UX de erro, CSP, escaping/sanitização, permissões corretas, sem tokens/segredos expostos.
5. **Operação:** revisão de dependências, deploy isolado, auditoria, alertas, recuperação e rollback.

## 9.3 Tratamento por risco

| Situação | Leitura de mapa/site | Cadastro/proposta | RSVP | Administração |
|---|---|---|---|---|
| Normal | Liberada | Turnstile/limites | Limites suaves | Sessão + MFA |
| VPN/proxy ou datacenter conhecido | Em princípio liberada | Desafio + limites mais rígidos | Limites preventivos | MFA + monitoração |
| Alta taxa de cadastros | Liberada | 429/espera/desafio | Independente | Normal se legítima |
| Automação inequívoca ou ataque grave | WAF pode bloquear origem | Bloqueado | Bloqueado | Reforçado |
| Falha generalizada de banco/API | Conteúdo estático deve continuar | Suspender com mensagem honesta | Suspender com mensagem honesta | Modo manutenção |

**Não bloquear redes inteiras por serem VPN sem avaliar falsos positivos.** CGNAT torna IP inadequado como identidade individual.

## 9.4 Turnstile Managed

- Instalar em cadastro e proposta de grupo; considerar em proposta de atividade e em padrões suspeitos de RSVP.
- Modo Managed pode mostrar checkbox/clique quando julgar necessário; **não garante clique em todos os acessos**.
- Frontend recebe sitekey pública; servidor guarda secret.
- Servidor valida Siteverify; verificar `success`, hostname e action esperada quando disponível, expiração e reutilização.
- Token de 5 min e uso único; resetar widget após erro; experiências de fallback acessíveis.
- Separar widgets por ambiente conforme necessário.
- Testar submissão com token ausente, inválido, expirada, repetido, de outro hostname e payload alterado.

## 9.5 Bots e Googlebot

Objetivo: dificultar crawlers não desejados e permitir **Googlebot autenticado** em páginas públicas, se realmente necessário.

- `robots.txt` e `noindex` são preferências de indexação, não controle de acesso.
- User-Agent é falsificável; não confiar em `Googlebot` como string.
- `cf.client.bot` / verified bots não equivale **somente** a Googlebot; inclui vários serviços.
- Caso seja indispensável liberar exclusivamente Googlebot, verificar identificação/origem de maneira realmente suportada pelo plano, como faixas oficiais e checagem de autenticidade, sem reduzir a segurança do restante.
- **Não assumir acesso a `cf.bot_management.score`:** campo depende de Bot Management Enterprise; capacidades gratuitas/Pro variam.
- Bot Fight Mode Free pode ser indiscriminado e não permite sempre exceções por rota; evitar promessa de combinação granular impossível no plano.
- Não bloquear automaticamente monitoramento necessário a saúde ou verificações legítimas sem avaliar.
- Não vender “100% de bloqueio de bots” como requisito atendido.

Documentar no relatório a política real configurável **no plano existente**, e não uma política fictícia de Enterprise.

## 9.6 IP, reputação e identificação

- IP/ASN de servidor ou proxy é **sinal**, não prova.
- Usar sinais disponíveis da Cloudflare no plano real; inteligência de reputação terceirizada somente se justificar custo, cobertura e privacidade.
- Não armazenar IP bruto por prazo indefinido; retenção e finalidade justificadas.
- Separar limites por IP, rota, sessão e atividade conforme caso.
- Não confiar em `X-Forwarded-For` fornecido pelo cliente sem fronteira de confiança; usar apenas metadados confiáveis da infraestrutura.
- Se combinar identificadores anônimos, definir rotação de segredo e TTL.

## 9.7 RSVP anônimo: modelo antifraude honesto

- Ao primeiro acesso de escrita, gerar identificador aleatório opaco de dispositivo e guardar cookie `Secure`, `SameSite=Lax`, preferencialmente `HttpOnly` assinado/validado pelo Worker.
- Backend gera hash/HMAC do identificador (não expor hash ao cliente) com segredo do servidor para indexar.
- Unique constraint no banco para atividade + identificador, além de user id quando há sessão.
- Aplicar rate limit por IP e atividade, com limiar calibrado por testes; não usar IP isolado para bloquear redes compartilhadas inteiras.
- Criar RSVP em endpoint idempotente; permitir desfazer apenas por mesma identidade/sessão.
- Ao efetuar login/cadastro, avaliar vínculo do RSVP anterior à identidade registrada sem gerar duplicata.
- Explicar ao usuário que é **confirmação de intenção**, não registro de presença.
- Contadores podem sofrer manipulação por múltiplos dispositivos; documentar essa limitação e monitorar anomalias sem perfilar pessoas.

**Não** exibir nomes ou contatos de quem clicou “Eu vou”. Coleta opcional de contato para evento precisa consentimento separado e acesso restrito.

## 9.8 URLs de grupos e contatos

- Aceitar apenas URLs de formato/host permitido de convite oficial do WhatsApp (validar no servidor; tolerar variantes oficiais documentadas).
- Mostrar o domínio de destino antes de abrir quando relevante; links externos com `rel="noopener noreferrer"`.
- Não permitir links encurtados opacos como substitutos de convite sem validação adicional.
- Moderação obrigatória antes da publicação.
- Sanitização contra XSS em títulos/descrições; não permitir HTML arbitrário.
- O contato do organizador só aparece se opt-in explícito e pode ser removido por ele; nunca herdar perfil privado automaticamente.

## 9.9 Configuração do cliente e cabeçalhos

- CSP adequada para Vite, Turnstile, tile providers e Supabase; preferir allowlist explícita e revisar dependências.
- `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, HSTS no domínio HTTPS.
- Cookies de sessão protegidos, controle de CSRF no desenho adotado, validação de origem das mutações.
- Desabilitar source maps públicos de produção **sem tratá-lo como controle de segurança principal**.
- Não publicar `.env`, backups, arquivos originais de dados pessoais nem metadados internos.
- `VITE_*` é público: só colocar nele configurações não secretas.
- Não inserir mensagens de erro SQL, stacktraces nem versão detalhada de infraestrutura em respostas.

## 9.10 API e Supabase direto

**Verificação obrigatória em CI:** procurar URLs e identificadores do SOURCE no bundle Vite, códigos de Workers, arquivos de deploy, `.env.example`, artefatos JSON públicos, logs e headers. Se aparecer uma conexão ao banco legado em runtime, a build deve falhar. A aprovação do relatório de isolamento é um requisito de segurança, não uma otimização facultativa.

- Endpoints de Supabase Auth podem ser acessíveis diretamente; protegê-los com seus próprios limites e CAPTCHA/controles nativos.
- A API não deve depender de cabeçalhos facilmente falsificáveis para autorizar.
- Auditar se API pública do Supabase/Data API oferece acesso a tabelas além das rotas planejadas.
- Se uma tabela é gerenciada exclusivamente pelo Worker com credenciais privilegiadas, revogar grants diretos para papéis de cliente e testar.
- Revisar views, funções SQL `SECURITY DEFINER`, search path, invocação e controle de execução.

## 9.11 Moderação e auditoria

- Todas as propostas começam não publicadas.
- Aprovação e rejeição registram responsável administrativo, horário e motivo.
- Edições de link de grupo e de localização/horário de atividade são alterações sensíveis; exigir revisão ou operação de admin.
- Botão de suspender rapidamente atividade/grupo abusivo.
- Lista de denúncias pode vir depois; no MVP, disponibilizar canal operacional para reportar links indevidos.

## 9.12 Privacidade/LGPD e governança

Uma aplicação identificada com organização político-eleitoral pode tratar informações que revelem opinião política — potencialmente **dados pessoais sensíveis**. Antes da produção:

- Identificar controlador, operador, finalidade e base legal adequadas; revisão jurídica local obrigatória.
- Informar termos e política de privacidade acessíveis, períodos de retenção e canal de titular.
- Minimizar dados e não coletar documento, endereço residencial completo ou voto individual.
- Consentimento de comunicações distinto de aceite dos termos; não usar caixas pré-marcadas.
- Permitir revogação do consentimento e solicitação de exclusão quando cabível.
- Restringir exportações, administrador e retenção de logs.
- Avaliar transferência internacional conforme provedores e regulamentação aplicável.
- Não inferir opinião política de pessoas que apenas residem numa localidade.
- Não usar analytics que capturem automaticamente formulários, e-mail, telefone ou URLs com tokens.

**Nota:** implementação técnica não substitui avaliação legal; registrar pendências jurídicas como bloqueantes para publicar formulário real.

## 9.13 Disponibilidade sob ataque

- Dados cartográficos/eleitorais servidos estaticamente, cacheados e versionados.
- Feature flag `writes_enabled` ou chave operacional equivalente para suspender cadastro/propostas/RSVP em incidente.
- Mostrar mensagem clara e oferecer consulta pública quando escrita estiver suspensa.
- Definir limites máximos por endpoint, request size, timeout e retries prudentes.
- Monitorar erros 4xx/5xx e latência, com runbook de mudança e rollback.
- Fazer backups do banco e ensaiar restauração em ambiente isolado.

---

# 10. CLOUDFLARE: HOSPEDAGEM, ROTEAMENTO E CUSTO

## 10.1 Layout de deploy

- Vite gera `/dist` com HTML, JavaScript, CSS e assets.
- Cloudflare Workers Static Assets serve arquivos estáticos sem invocar Worker para cada arquivo quando configurado corretamente.
- Worker processa apenas `/api/*` e rotas de callback que exigirem servidor.
- Supabase fica como banco e Auth externos.
- Dados geográficos grandes podem ir para R2 com cache e Range requests quando necessário.

## 10.2 Exemplo **ilustrativo** de Wrangler (validar no projeto)

```jsonc
{
  "name": "minas-em-movimento",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-10-08",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

Não copiar sem verificar a versão atual do Wrangler e as rotas de callback da autenticação. **Atenção:** uma navegação direta pelo browser em `/api/...` em modo SPA pode ter comportamento diferente do `fetch` se o roteamento não for explícito; testar sempre requests GET/POST com ferramentas HTTP e navegação real.

## 10.3 Tarifação inicial e limites

**Dois Supabases não significam obrigatoriamente duas assinaturas Pro.** Em uma organização paga, a assinatura é por organização, mas **cada projeto consome compute faturado separadamente**, além dos limites e excedentes aplicáveis. Conferir plano e cobrança reais antes de criar o projeto novo. No plano gratuito, considerar restrições de tamanho e suspensão por inatividade; não presumir que será adequado a uma aplicação de prazo crítico. Não provisionar projeto pago sem autorização.

O custo do SOURCE existente continua associado ao projeto de origem. **Não duplicar toda a base eleitoral nem operar queries do mapa naquele banco**: a publicação estática permite independência de carga. A única atividade adicional permitida sobre o SOURCE é a inspeção/exportação offline, dentro do orçamento de impacto definido na seção 4.

**Atenção a mudanças de planos:** consultar o painel e documentação antes de contratar. Referência em outubro/2026:

- Workers Free: até 100 mil chamadas dinâmicas/dia; restrição de CPU por invocação.
- Workers Paid: mínimo aproximado de US$ 5/mês, com franquias maiores e cobrança por excesso.
- Requisições que retornam Static Assets corretamente podem ser gratuitas e sem limite de solicitações, segundo a documentação.
- R2, serviços de logs/observabilidade, bot management, e-mails e Supabase têm limites e tarifas próprios.
- Recursos avançados de score de bots podem requerer **Enterprise**; não usar tais recursos no orçamento do MVP gratuito.

Medições obrigatórias: total de Worker invocations, CPU/duração, hits dos assets, leitura no Supabase, tempo de resposta e erros. Produzir estimativa por 10 mil, 100 mil e 1 milhão de visitas **com premissas explicitadas** depois que houver medições reais.

## 10.4 Ambientes

- `local`: Supabase local/teste, fixtures sintéticas; secrets locais nunca commitados.
- `staging`: subdomínio protegido/teste, Auth/DB separados de produção; Turnstile keys de teste; sem dados reais de cadastro.
- `production`: domínio público, segredos próprios, backup, MFA, verificações e política de privacidade aprovada.

Nunca copiar banco de produção contendo contatos para staging sem anonimização e autorização.

## 10.5 Domínios, DNS e deploy

- Configuração do DNS via procedimento documentado, sem mudança irreversível autônoma.
- CI faz lint, typecheck, testes e build antes de permitir deploy.
- Deploy para staging após autorização e disponibilidade de credenciais; deploy de produção somente com confirmação humana.
- Guardar capacidade de rollback de versão de Worker e release estático.
- Validar cache e invalidação por assets com hash, não invalidar globalmente sem necessidade.

## 10.6 E-mails transacionais

- Magic links/OTP dependem de entrega confiável: verificar limites do remetente padrão do Supabase e considerar SMTP transacional autorizado.
- Proteger endpoints de envio para não virar mecanismo de spam.
- SPF, DKIM e DMARC no domínio remetente conforme provedor; não configurar em domínio principal sem aprovação.
- Separar autenticação transacional de comunicações opt-in de voluntários.

---

# 11. FILAS, EDGE FUNCTIONS, REDIS E N8N: CRITÉRIOS DE ADOÇÃO

**Decisão MVP:** sem fila dedicada, sem Redis próprio, sem Supabase Edge Function redundante e sem n8n no caminho crítico. **Também sem cron de sincronização entre Supabases no MVP:** atualização eleitoral será um pipeline offline explícito e versionado, até existir justificativa para agendamento.

| Necessidade | Solução MVP | Quando evoluir |
|---|---|---|
| Registrar RSVP | Worker + transação/unique no Postgres | Continuar síncrono |
| Cadastrar participante | Worker/Auth/DB com consistência e antiabuso | Trabalho assíncrono somente para integrações auxiliares |
| Aviso de aprovação | E-mail transacional eventual, com processamento confiável | Fila quando volume/retries exigirem |
| Muitas notificações | Fora do MVP | Supabase Queues/pgmq ou Cloudflare Queues com decisão fundamentada |
| Relatórios internos | SQL/painel admin básico | Jobs programados se necessário |
| Integração com sistemas de comunicação | Fora do core | n8n via eventos/webhooks assinados e idempotentes |
| Rate limiting | WAF/Worker + constraints DB | KV/DO/serviço próprio se métricas mostrarem insuficiência |

Nunca colocar n8n publicamente exposto como único endpoint capaz de criar usuários, atividades ou RSVPs. Nunca usar fila para esconder problemas de consistência em operações curtas.

---

# 12. FRONTEND: DIREÇÃO DE ARTE, UX E SISTEMA VISUAL

## 12.1 Princípio da experiência

**Um produto com sofisticação visual e fricção mínima.** Um mapa com dados que convida à exploração, mas não obriga a pessoa a entender métricas para se cadastrar ou participar. Interface mobile-first, editorial, humana, contemporânea e responsiva.

A arte oficial da campanha/organização será recebida depois. Portanto, a primeira versão deve ser **visualmente boa, mas semanticamente desacoplada da identidade gráfica provisória**. Não inventar logotipo definitivo nem usar símbolos oficiais sem assets autorizados.

## 12.2 Evitar clichês

- Não usar aparência de dashboard SaaS genérico com sidebar onipresente.
- Não usar dezenas de cards com sombra e gradientes decorativos sem intenção.
- Não esconder funções básicas em menus profundos.
- Não usar mapa como fundo meramente estético: deve ser navegável e informativo.
- Não fazer animações que atrasem cadastro, leitura ou abertura do painel.
- Não usar emojis como identidade gráfica principal, salvo justificativa clara.
- Não renderizar elementos vazios nem estados falsos como se houvesse atividade real.

## 12.3 Layout desktop

- Header compacto com identidade temporária, navegação essencial e CTA discreto para participar.
- Mapa ocupa maior parte da área principal.
- Busca de cidade/bairro acessível no topo do mapa e por teclado.
- Painel lateral contextual, expansível/colapsável, com métricas, grupos e atividades do território selecionado.
- Camadas de mapa acessíveis por seletor legível: “Abstenção”, “Comparecimento”, “Votação”, “2022 × 2026”, “Atividades”.
- As escalas cartográficas/legendas devem mudar com as métricas e sempre indicar unidade e fonte.
- O modo “Atividades” sobrepõe marcadores com clustering quando necessário; clicar revela popover/painel, não modal gigante.

## 12.4 Layout mobile

- Header compacto, botão de busca visível, nenhum menu administrativo na navegação pública.
- Mapa usa espaço disponível, compatível com gestos nativos e safe-area.
- **Bottom sheet** contextual: collapsed / half / expanded, com foco e rolagem previsíveis; implementar primeiro com biblioteca acessível ou padrão robusto, não com gestos artesanais frágeis.
- Botões de participação com área de toque confortável.
- Formulários de entrada simples, autofill apropriado, teclado numérico para WhatsApp, seleção territorial reaproveitada.
- O mapa não deve “capturar” scroll de toda a página indevidamente.
- Em telas de baixa capacidade ou sem WebGL, renderizar lista/busca textual funcional.

## 12.5 Homepage: ordem de informação

1. Marca temporária e ação principal.
2. Mensagem curta que apresenta utilidade da plataforma, sem parede de texto.
3. Campo de busca “Cidade ou bairro em Minas Gerais”.
4. Mapa interativo + seletor de camadas.
5. Painel contextual ao selecionar território.
6. Acesso à agenda de atividades (também em lista para acessibilidade).
7. Rodapé: metodologia, privacidade, organização responsável, informação de fonte e canal de contato.

## 12.6 Página de território

Componentes:

- Breadcrumb estado → cidade → bairro.
- Nome, breve contextualização e estado da cobertura dos dados.
- Indicadores com ano/turno, percentuais e absolutos, denominadores claros.
- Alternância de ano/turno sem perder seleção; comparação 2022–2026 com nota metodológica.
- Mapa contextual com contorno e atividades públicas na área.
- Estado de grupo: grupo aprovado / fallback municipal / nenhum grupo.
- CTA “Participar do grupo” conduz a cadastro quando necessário; cadastro preserva território escolhido.
- Agenda compacta de atividades próximas, com link direto.
- Fonte, data de atualização e método de agregação acessíveis.

## 12.7 Página de atividade

- Título, categoria, descrição curta, data/hora no fuso local, bairro/cidade e endereço/ponto no mapa.
- Botão **“Eu vou”** sem login, com feedback imediato mas confirmado pelo servidor (não afirmar sucesso antes da resposta).
- Estado “Vou”/“Desfazer confirmação”.
- Contador de intenções rotulado corretamente; mostrar discreto se susceptible a números baixos/abuso.
- Contato do organizador somente quando este autorizou publicamente.
- Compartilhamento via Web Share API com fallback copiar link.
- Mensagens de cancelamento, mudança de horário e encerramento quando aplicáveis.

## 12.8 Cadastro e obrigado

- Formulário curto: nome, e-mail, WhatsApp, território, consentimentos.
- `autocomplete=name`, `autocomplete=email`, `autocomplete=tel`; validação acessível.
- CPF, RG, endereço residencial, senha e localização precisa **não entram**.
- Turnstile em área adequada e com tratamento de indisponibilidade.
- Confirmação de sessão autenticada provisória e orientação de verificação de e-mail sem bloquear link de grupo.
- Página de obrigado nunca admite link de grupo pendente/rejeitado.
- Se não houver grupo aprovado: comunicar honestamente e oferecer proposta de grupo.
- Página de obrigado não deve carregar dados de outro usuário por cache.

## 12.9 Criar atividade

- Fluxo guiado compacto (uma tela ou wizard curto se necessário, sem passos artificiais).
- Validações imediatas não intrusivas.
- Selecionar ponto no mapa **ou** pesquisar endereço; confirmação manual para evitar coordenada errada.
- Data/hora sem conversão silenciosa de fuso; persistir UTC + time zone declarada.
- Checkbox explícito: “Quero disponibilizar meu contato para interessados”, com escolha e preview do contato público.
- Estado “enviada para análise” claro; não prometer publicação imediata.
- Se e-mail não verificado, preservar rascunho e conduzir à verificação.

## 12.10 Painel administrativo

- Visual simples e orientado a trabalho, não precisa copiar art direction expressiva da página pública.
- Filtros “Pendente / Aprovado / Rejeitado / Suspenso”.
- Tela de revisão com comparação do que é público e do que permanece privado.
- Aprovar/rejeitar exige confirmação e registra decisão.
- Responsáveis por grupo apenas aqui; contato pessoal protegida por permissão.
- Dados sensíveis mascarados por padrão sempre que viável, com ação deliberada para revelar.
- Paginação e busca; sem download em massa no MVP.

## 12.11 Design tokens: obrigatórios

Criar sistema de tokens semânticos em CSS custom properties para:

```css
:root {
  --color-surface: ...;
  --color-surface-alt: ...;
  --color-text-primary: ...;
  --color-text-muted: ...;
  --color-action-primary: ...;
  --color-action-hover: ...;
  --color-success: ...;
  --color-warning: ...;
  --color-error: ...;
  --color-border: ...;
  --color-focus: ...;
  --font-display: ...;
  --font-body: ...;
  --space-1: ...;
  --radius-card: ...;
  --duration-fast: ...;
  --duration-panel: ...;
  --easing-standard: ...;
  --map-fill-low: ...;
  --map-fill-mid: ...;
  --map-fill-high: ...;
}
```

Os `...` são placeholders conceituais, não CSS pronto. Valores, escalas e nomenclaturas finais devem ser implementados e documentados pelo Fable. Cores de mapa devem distinguir séries e quantidades de forma acessível; **não codificar valor estatístico como julgamento moral por cor**.

Os componentes devem consumir tokens, não uma paleta colada em classes arbitrárias espalhadas por toda a aplicação. Ter estilos específicos por tema quando necessário.

## 12.12 Biblioteca de componentes

**Fundacionais:** Button, Input, Field, Checkbox, Select/Combobox, Dialog, Drawer/BottomSheet, Toast, Tabs, Badge, Skeleton, Loading, ErrorState, EmptyState, Tooltip, FormError, FocusRing.

**Produto:** TerritorySearch, MapShell, MapLayerSelector, TerritoryPanel, MetricCard, ComparisonBlock, DataQualityNote, ActivityMarker, ActivityCard, RSVPButton, GroupCard, GroupProposalForm, RegistrationForm, ActivityEditor, ModerationQueue.

**Padrões:** todos possuem estados hover/focus/disabled/loading/error/success conforme aplicável, sem estilos divergentes entre páginas.

## 12.13 Motion system

Animações não devem parecer trailer cinematográfico. Qualidade vem de feedback e transição espacial coerente:

- Hover/press: aproximadamente 100–180 ms, discretos.
- Entrada de painel: 180–280 ms, easing consistente.
- Expansão do bottom sheet: 220–350 ms, dependendo de gesto.
- Zoom/flyTo do mapa: 350–650 ms quando útil, e instantâneo se `prefers-reduced-motion`.
- Troca de camada com transição curta e legenda correta.
- Feedback do “Eu vou”: transição sem celebração exagerada, com acessibilidade `aria-live`.
- Loading skeleton com animação moderada; evitar shimmer excessivo.
- Marcadores em massa não devem animar independentemente de forma pesada.

**Regras:** respeitar `prefers-reduced-motion`; nenhuma animação bloqueia submit; não depender de motion para comunicar estado; medir impacto em dispositivos medianos.

## 12.14 Acessibilidade e internacionalização

- PT-BR como idioma inicial, conteúdo e datas em `pt-BR`, timezone `America/Sao_Paulo`.
- WCAG 2.2 AA como objetivo; contraste, rótulos, foco visível, teclado, escape/back, áreas de toque, sem armadilhas de foco.
- Mapa acessível por alternativa textual/lista, não apenas mouse.
- A busca deve funcionar por teclado e leitor de tela.
- Formulários com erro associado a campo e mensagem resumida.
- Estados dinâmicos anunciados de forma discreta com live region.
- Ícones não podem ser único indicador de significado.
- Formato brasileiro do WhatsApp validado e normalizado E.164 quando armazenado.
- Legendas de mapa visíveis e explicações numéricas, inclusive para daltônicos.

## 12.15 Performance budgets iniciais — metas, não promessas

- Lighthouse mobile em ambiente de teste: buscar Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 90; ajustar por limitação justificável do mapa.
- LCP p75 alvo ≤ 2,5s em cenário móvel representativo; INP p75 ≤ 200ms; CLS ≤ 0,1.
- Lazy load de MapLibre e rotas administrativas.
- Prefetch inteligente de resumo territorial, sem antecipar download de todo o estado.
- Controlar JS inicial, fontes, assets e polyfills.
- Cache estático com content hash.
- Sem 1000 marcadores DOM: usar camada WebGL/clustering.
- Testar com emulação de rede lenta e CPU limitada.

Estas são referências de engenharia; registrar medições reais do projeto e não declarar aprovação por estimativa.

---

# 13. PROCESSO DE INCORPORAÇÃO DA IDENTIDADE VISUAL DEFINITIVA

## 13.1 Arte oficial ainda não fornecida

A versão inicial deve ser coesa visualmente, mas **retematizável**, sem depender de arte não recebida. Usar placeholders declarados e assets de demonstração de direitos claros. Nunca simular falsamente marca oficial.

## 13.2 Procedimento obrigatório quando a arte chegar

O Fable executará uma **auditoria visual de identidade** ANTES de reescrever estilos. O relatório `docs/IDENTITY_AUDIT.md` deverá conter:

1. Inventário de arquivos (PNG/JPG/SVG/PDF/AI/Figma etc.) e licença/uso conhecido.
2. Extração/observação de paleta (HEX e semântica), contraste em fundos claros/escuros.
3. Tipografia display/corpo, variantes e alternativas web legalmente utilizáveis; nunca redistribuir fonts sem licença.
4. Logotipo/símbolos e proporções/zonas de respiro.
5. Padrões gráficos, texturas, ilustração, fotografia e recorte de imagem.
6. Tom visual/editorial e adequação para UI de dados.
7. Componentes existentes impactados e plano de adaptação por tokens.
8. Tratamento de mapas, legendas, categorias de atividade e acessibilidade.
9. Páginas-chave redesenhadas em captura/screenshot ou protótipo antes da implementação em lote.
10. Comparação antes/depois, riscos, alternativas e aceite do proprietário.

## 13.3 Regras de adaptação

- A arte de campanha para cartaz/banner não precisa virar literalmente um botão ou card.
- Reservar padrões gráficos expressivos para locais de maior impacto (hero, divisórias, highlights), mantendo formulários muito legíveis.
- Não trocar cores de dados indiscriminadamente por cores políticas se comprometer interpretação estatística.
- Evitar que texturas pesadas dificultem uso de mapas e painéis.
- Construir variações responsivas de assets quando necessário.
- Nunca ajustar imagem institucional por deformação ou crop que comprometa a marca.

## 13.4 Referências externas (links para estudo, não templates a copiar)

**Design e movimento**

- Awwwards — inspiração crítica de composições e motion: https://www.awwwards.com/
- Godly — curadoria de interfaces expressivas: https://godly.website/
- Linear — consistência de microinterações e produto: https://linear.app/
- Motion for React — motion e acessibilidade: https://motion.dev/docs/react
- Material Design Motion — princípios de transição: https://m3.material.io/styles/motion/overview

**Cartografia e dados**

- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Exemplos MapLibre: https://maplibre.org/maplibre-gl-js/docs/examples/
- Exemplo oficial MapLibre + PMTiles: https://maplibre.org/maplibre-gl-js/docs/examples/pmtiles/
- Protomaps/PMTiles: https://docs.protomaps.com/pmtiles/
- Observable — exemplos de visualização: https://observablehq.com/
- Datawrapper Academy — boas práticas de mapas e escalas: https://academy.datawrapper.de/

**Acessibilidade e componentes**

- W3C WAI: https://www.w3.org/WAI/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Radix UI: https://www.radix-ui.com/
- React Aria: https://react-spectrum.adobe.com/react-aria/
- shadcn/ui: https://ui.shadcn.com/

**Produtos de referência funcional (comparar fluxos, não replicar orientação política)**

- Mobilize: https://www.mobilize.us/
- MapLibre exemplos de mapas operacionais: https://maplibre.org/maplibre-gl-js/docs/examples/

**Entrega visual da primeira rodada:** screenshots reais da home desktop, home mobile, território, atividade, cadastro, obrigado e admin (se implementado), incluindo estado sem dados e erro, e descrição do raciocínio visual.

---

# 14. QUALIDADE, TESTES E OBSERVABILIDADE

## 14.1 Pirâmide de testes

- **Unitários:** normalização de telefone, busca territorial, cálculo de indicadores, validadores Zod, formatação de datas, estados e fallback de grupo.
- **Integração:** endpoints com banco de testes, auth provisória, verificação de e-mail, criação de grupo pendente, aprovação, RSVP e idempotência.
- **Banco/RLS:** consultas permitidas e negadas por papel, grants, constraints, views, funções privilegiadas.
- **E2E browser:** jornada de mapa, cadastro, obrigado, magic link em ambiente controlado, proposta de grupo, “Eu vou”, proposta de atividade, moderação.
- **Security regression:** token Turnstile falsificado/repetido, campos excessivos, IDOR, exposição de dados de responsável, submit flood controlado, XSS, CSRF se necessário.
- **Visual:** screenshots por breakpoint, focus states, erros, loading, sem dados, reduced motion.

## 14.2 Casos de teste obrigatórios (seleção)

| ID | Cenário | Resultado esperado |
|---|---|---|
| T01 | Usuário pesquisa bairro homônimo em duas cidades | Busca desambigua corretamente |
| T02 | Município sem bairros confiáveis | Não inventa dados de bairro; mantém fluxo municipal |
| T03 | Cadastrar com e-mail inválido | Erro por campo sem registro |
| T04 | Cadastro com Turnstile ausente/inválido | Bloqueio no servidor |
| T05 | Cadastro válido | Sessão provisória + redirecionamento seguro para obrigado |
| T06 | Sessão provisória tenta criar atividade | 403/fluxo de verificação |
| T07 | E-mail verificado cria atividade | Estado pendente, não aparece na busca pública |
| T08 | Admin aprova atividade | Aparece no mapa e na agenda |
| T09 | Visitante clica “Eu vou” repetidamente | Apenas uma intenção por identidade anônima |
| T10 | Usuário cancela a própria intenção | Status atualizado sem tocar em outros RSVPs |
| T11 | Visitante tenta cancelar RSVP alheio | Não autorizado |
| T12 | Visitante propõe grupo | Fica pendente e link não aparece público |
| T13 | Admin aprova grupo | Link aprovado disponível no território |
| T14 | Resposta pública de grupos | Sem responsável, telefone/email do proponente |
| T15 | Admin com sessão sem MFA tenta ver contatos | Negado conforme política |
| T16 | Usuário insere HTML/script em descrição | Neutralização; não executa código |
| T17 | Token de Turnstile reutilizado | Rejeitado |
| T18 | Falha na API de cadastro | Não exibe sucesso falso e não corrompe perfil |
| T19 | API bloqueada por incidente | Mapa e dados estáticos continuam disponíveis |
| T20 | Tela mobile sem WebGL | Acesso textual a territórios/atividades preservado |
| T21 | Edição sensível de atividade publicada | Reaprovada ou retida conforme regra |
| T22 | Acesso administrativo sem permissão | 403 e log de segurança minimizado |
| T23 | Requisição direta ao Supabase Data API | Tabelas sensíveis inacessíveis |
| T24 | Usuário compartilha link do bairro | Estado e seleção restaurados |
| T25 | Mudança de fuso/horário de verão (se relevante) | Horário correto com timezone explícito |
| T26 | Proposta de grupo com URL fora dos hosts permitidos | Rejeitada |
| T27 | Mudança de contato público para off | Contato deixa de aparecer imediatamente |
| T28 | Dois admins aprovam mesmo grupo simultaneamente | Sem duplicação |
| T29 | Carregamento de tiles geográficos com falha | Mensagem e fallback funcional |
| T30 | Leitor de tela e teclado | Acesso a todas as ações principais |

## 14.3 Testes de carga e abuso controlados

- Rodar apenas em ambiente de teste autorizado e com massa sintética.
- Definir cenários graduais por endpoint; medir latência, erros, rate limit, CPU, impacto no Supabase.
- Nunca testar flood contra produção de terceiros nem passar por defesas deliberadamente sem autorização.
- Medir falsos positivos em conexões compartilhadas e dispositivos móveis.
- Relatar quais capacidades anti-bot dependem de plano pago.

## 14.4 CI mínimo

```text
install lockfile
  -> lint
  -> format check
  -> typecheck
  -> unit tests
  -> API integration tests (ambiente isolado)
  -> database/RLS tests
  -> build
  -> e2e smoke (quando disponível)
  -> artifact/screenshots
```

Merge/deploy bloqueado se teste essencial falha; não aceitar “fix” removendo teste ou diminuindo cobertura sem justificativa.

## 14.5 Logging e privacidade

- Campos mínimos: request_id, rota normalizada, duração, código, ambiente e flag de rate-limit.
- Redigir ou omitir PII, link mágico, JWT, cookies, Turnstile tokens, payloads pessoais e URLs sensíveis.
- Retenção curta e definida para eventos de abuso; logs de auditoria com política específica.
- Métricas para 5xx, 429, auth emails, propostas pendentes, taxa de Turnstile error, erros do banco, carregamento de mapas.
- Identificar incidentes de privacidade e recuperação sem divulgar contatos.

## 14.6 Critérios de aceite globais

- Build e typecheck sem erro.
- Contratos API coerentes com frontend; testados ao menos por fixtures de integração.
- Privacidade checada com tentativas explícitas de leitura não autorizada.
- Nenhum dado pessoal em response público.
- Cadastro e sessão cumprem regra escolhida, ou bloqueio explicitamente marcado no relatório.
- Frontend mobile e desktop revisados com screenshots reais.
- Mapa funcional com dados demonstrativos e origem identificada até importação real.
- Fluxo RSVP não infla contador com duplo clique na mesma identidade.
- Documentação atualizada e relatório obrigatório gerado.

---

# 15. SEQUÊNCIA DE EXECUÇÃO DA PRIMEIRA RODADA

> **Regra de prioridade:** entregar uma aplicação coesa e demonstrável, com arquitetura correta, sem simular integrações inexistentes. Se faltar acesso externo ou dado real, implementar fallback de demonstração rotulado e não mentir sobre a execução.

## Fase 0 — Descoberta curta e contrato de trabalho

Responsável: Fable + Haiku para inventário.

1. Inspecionar versão de Node, gerenciador de pacotes, Git, Wrangler, Claude Code, SDK Supabase e permissões disponíveis.
2. Confirmar modelos realmente disponíveis e sintaxe de agentes.
3. Verificar se o diretório está vazio ou há código anterior a preservar.
4. Descobrir quais projetos Supabase estão visíveis no CLI; **identificar o SOURCE eleitoral** sem mudar o projeto vinculado nem expor credenciais. Inspecionar schemas, tamanhos estimados e saúde com **baixo impacto**. Criar `docs/DATA_SOURCE_AUDIT.md`, mesmo que o status seja "acesso indisponível".
5. Explicitar, por ADR, a separação entre SOURCE somente leitura, snapshot estático e TARGET operacional novo; verificar custo e limite de criação do TARGET sem provisionar plano pago.
6. Criar `docs/DECISIONS.md`, registrar escolhas e riscos.
7. Criar plano de implementação/kanban com dependências e responsáveis.
8. Validar estimativa de escopo; não pedir confirmação para ajustes triviais, mas **não provisionar serviço externo sem autorização**.

**Saída:** `CLAUDE.md`, primeiras ADRs, plano, agentes básicos funcionais.

## Fase 1 — Fundação do produto e design system

Responsável: Fable direção + Opus frontend estrutura + Sonnet componentes.

1. Scaffold Vite/React/TypeScript/Hono/Worker.
2. Configurar Tailwind (se adotado), tokens CSS, componentes base.
3. Criar shell responsivo e rotas.
4. Implementar busca de município/bairro com fixture, panel/bottom sheet.
5. Implementar mapa MapLibre demonstrativo com dados e atribuições corretas.
6. Criar legenda de camadas, skeleton, empty/error, WebGL fallback.
7. Aplicar motion de alta qualidade em transições centrais.
8. Validar screenshots reais mobile/desktop e corrigir defeitos.

**Saída:** navegação e visual coerentes, sem dados reais fingidos.

## Fase 2 — Contratos, dados e API

Responsável: Opus backend + Sonnet contracts + Fable validação.

1. Modelar tabelas e migrations **apenas do Supabase novo** em ambiente local/teste; provar que os comandos de migrations não apontam para o legado.
2. Finalizar inventário do SOURCE. Desenhar extrator offline configurável com acesso SELECT-only, limites de timeout/concorrência, `--dry-run`, cursor por chave, logs sem segredos e verificação de origem.
3. Se a saúde do banco permitir, fazer **spike de exportação de um único município** e validar indicadores/versões de 2022 e 2026; não disparar carga ampla na origem sem validações. Se não permitir, usar fixtures visivelmente fictícias.
4. Produzir `docs/ELECTORAL_EXPORT_REPORT.md` e um `manifest.json` do snapshot (real parcial, real completo ou demo) com hashes, cobertura e metodologia.
5. Criar endpoints GET públicos com paginação/cache **apenas para dados operacionais**; dados eleitorais estáticos devem chegar pela CDN sem consultar SOURCE.
6. Criar endpoints de grupos/atividades no TARGET; separar somente aprovados no público.
7. Executar testes RLS, isolamento entre projetos e respostas sem PII.
8. Produzir `DATA_DICTIONARY.md`, `API_CONTRACTS.md` e `IMPORT_GUIDE.md`.

**Saída:** backend funcional com massa sintética ou snapshot real validado, sem dependência operacional do SOURCE e com contrato estável.

## Fase 3 — Cadastro, grupos, atividade e RSVP

Responsável: Opus Auth/Security + Sonnet formulários/integração.

1. Implementar cadastro com campos obrigatórios e Turnstile.
2. Fazer spike real do fluxo Supabase sessão provisória → verificação → magic link.
3. Página de obrigado: grupo aprovado/fallback municipal/sem grupo.
4. Formulário de proposta de grupo com fila de moderação.
5. Criar/editar atividade para e-mail verificado e status pendente.
6. Exibir atividades aprovadas no mapa e agenda.
7. Botão “Eu vou” aberto, idempotência, rate limit, desfazer.
8. UI de moderação mínima, restrita e auditável.
9. Testar fluxos completos e ataques previsíveis.

**Saída:** **corte vertical funcional** completo com dados fictícios; se credenciais externas não existirem, deixar integrações com adapters mockados **claramente identificados**, não declarar como reais.

## Fase 4 — QA, hardening e relatório

Responsável: `qa-security`, `visual-review`, Fable.

1. Revisão de API, RLS, Auth, exposure e WAF compatível com plano real.
2. Rodar lint, typecheck, testes unitários, integração, banco e E2E.
3. Fazer screenshots em desktop/mobile com indicação de ambiente.
4. Corrigir problemas críticos/altos; documentar os demais.
5. Revisar README, `.env.example`, scripts e runbook.
6. Preparar staging somente se permitido; registrar URL real apenas depois de verificar disponibilidade.
7. Gerar obrigatoriamente `docs/RELATORIO_PRIMEIRA_RODADA.md` seguindo integralmente a seção 16.
8. Encerrar a rodada com resumo curto e caminho do relatório.

## Critérios de corte caso tempo/credenciais faltem

**Mínimo inegociável antes de chamar de primeira versão:** mapa e busca demonstráveis; telas essenciais; backend e esquema revisados; formulários com contratos; política de privacidade estrutural; rotas privadas não expostas; documento de relatório fiel.

**Se Auth real falhar:** marcar fluxo como **NÃO OPERACIONAL**, expor uma demonstração segura separada e relatar bloqueio com passos de resolução. **Não ativar inscrição real sem controles.**

**Se dados reais não estiverem disponíveis:** carregar fixtures rotuladas em toda tela/legenda e no README; nunca apresentar dados demonstrativos como votação real em Minas. A autenticação CLI por si só não autoriza um dump; se o banco estiver muito carregado, preservar a origem e deixar o pipeline pronto para execução posterior.

**Se staging não estiver autorizado:** rodar localmente, capturar screenshot real e registrar “SEM DEPLOY”. Não inventar URL.

---

# 16. RELATÓRIO OBRIGATÓRIO PARA ANÁLISE EXTERNA

## 16.1 Local e momento

Na **conclusão da primeira rodada**, o Fable **DEVE GERAR O ARQUIVO**:

`docs/RELATORIO_PRIMEIRA_RODADA.md`

Além disso, exportar/copiar para raiz como `RELATORIO_PRIMEIRA_RODADA.md` se facilitar compartilhamento, sem criar divergência de versões. Este arquivo será encaminhado pelo proprietário a um revisor externo (ChatGPT), acompanhado, quando possível, de screenshots, URL de staging e/ou trechos de código pertinentes.

**Não basta** apresentar um resumo no chat. O relatório precisa existir no repositório e apontar evidências.

## 16.2 Template obrigatório do relatório

```md
# RELATÓRIO DA PRIMEIRA RODADA — MINAS EM MOVIMENTO

**Data e hora (America/Sao_Paulo):**
**Commit Git / branch:**
**Ambiente:** local | staging | produção (não esperado)
**URL verificada, se existir:**
**Modelos utilizados e disponibilidade real:**
**Agentes acionados, tarefas e resultados:**

## 1. Resumo executivo (até 15 linhas)
O que está operacional, o que está demonstrativo, o que falta,
os riscos bloqueantes e o que o usuário deve testar.

## 2. Entregáveis por módulo
| Módulo | Status: real / mock / parcial / não iniciado | Evidência (arquivo/URL/teste) |
| ... |

## 3. Arquitetura implementada
Diagrama real, fluxo de dados, stack efetivamente usada,
justificativas de desvios e ADRs.

## 4. Estrutura agentica executada
Agentes criados; modelos concretos; delegações;
conflitos de worktree/merge; decisões que Fable assumiu.

## 5. Schema e RLS
Lista de migrations; relacionamentos;
matriz de acesso; testes negativos executados;
pontos que permaneceram sem cobertura.

## 6. Autenticação
Descrever exatamente cadastro → sessão → verificação de email
→ login mágico. Diferenciar teste real de simulação.
Provar que conta provisória não cria atividades.

## 7. Endpoints
Tabela de métodos, rotas, autorização, validação,
limites, testes e status real/mock.

## 8. Proteção antiabuso
Turnstile, WAF configurável vs realmente configurado,
rate limit, RSVP idempotente, limites do plano Cloudflare.

## 9. Dados eleitorais e mapa
Descrever separadamente SOURCE (Supabase legado somente leitura),
ETL offline, snapshot CDN e TARGET operacional.
Referenciar `docs/DATA_SOURCE_AUDIT.md` e `docs/ELECTORAL_EXPORT_REPORT.md`.
Identificação por alias do projeto inspecionado; esquema e tabelas;
anos, turnos, municípios/bairros, estimativa de linhas/bytes;
saúde do banco antes/depois do spike quando mensurada;
quais consultas realmente rodaram, latência, volume e erros;
município amostral; decisão GO/NO-GO para exportação total;
fonte efetivamente publicada, manifest/hash, metodologia,
formato, peso, qualidade e advertências.
Se houver fixtures, destacar explicitamente; nunca alegar
extração real apenas por haver CLI autenticado.
Provar que o site não consulta o SOURCE em runtime e que
nenhuma migration, escrita ou configuração foi alterada nele.

## 10. UX e identidade visual
Tokens, componentes, motion, responsividade,
referências e planos para futura arte oficial.
Incluir caminhos de screenshots mobile e desktop.

## 11. Evidência de testes
| Comando ou caso | Executado? | Resultado | Log/arquivo |
| ... |
Informar número de testes passando/falhando/pulados,
não escrever apenas 'testes OK'.

## 12. Segurança e privacidade
Checklist de exposição, RLS, dados privados, logs,
segredos, CSP, vulnerabilidades conhecidas,
revisão independente e pendências legais.

## 13. Desempenho e custos
Valores MEDIDOS quando disponíveis; distinção entre
medição e estimativa; dependências pagas.

## 14. Alterações e diff
Commit(s), principais arquivos, dependências,
migrations e alterações potencialmente incompatíveis.

## 15. Pendências priorizadas
| ID | Gravidade | Impacto | Como corrigir | Responsável sugerido |
| ... |

## 16. Decisões pedidas ao proprietário
Somente escolhas realmente necessárias;
para cada uma, indicar recomendação e trade-offs.

## 17. Instruções para executar e testar
Comandos reproduzíveis, variáveis .env.example,
criação de dados locais e rotas para validar.

## 18. Próxima rodada sugerida
No máximo cinco frentes priorizadas com critérios de aceite.

## 19. Checklist de veracidade
- [ ] Nenhum mock foi declarado como real.
- [ ] Nenhum teste foi alegado sem execução.
- [ ] Nenhuma URL de staging foi inventada.
- [ ] Riscos de segurança estão destacados.
- [ ] Screenshots correspondem à versão/commit relatados.
- [ ] Dados eleitorais têm origem identificada; status demo/parcial/real é inequívoco.
- [ ] O projeto SOURCE foi identificado ou a falta de identificação foi documentada.
- [ ] Nenhuma escrita, migration, `db reset`, modificação de configuração ou upgrade ocorreu no SOURCE.
- [ ] Os relatórios `DATA_SOURCE_AUDIT.md` e `ELECTORAL_EXPORT_REPORT.md` existem.
- [ ] Não há segredo ou conexão do SOURCE no frontend/Worker/CI pública.
- [ ] O relatório foi gerado em arquivo .md.
```

## 16.2.1 Evidências exigidas especificamente sobre Supabase legado

- O relatório da primeira rodada deve apontar a **origem encontrada ou o bloqueio de acesso**, não apenas afirmar que dados existem.
- Descrever comandos SQL/CLI de leitura, duração aproximada se medida, recorte, impacto observado e autorização/contexto, sem logs com tokens ou PII.
- Incluir diferença entre schema inventariado, dados amostrados, snapshots validados e dados efetivamente publicados.
- Mostrar como o extrator verifica que sua conexão é somente leitura e aponta para o projeto correto antes de executar consultas.
- Registrar o novo Supabase operacional como **não criado / criado em dev / conectado em staging** conforme resultado verdadeiro; nunca confundir os projetos.
- Se a exportação completa não ocorreu, explicar motivo e próximo comando seguro/requisito faltante.

## 16.3 Regras de evidência

- Nomear screenshots com dispositivo/viewport/data/estado.
- Registrar versão/commit ao capturar.
- Logs resumidos, mas reproduzíveis; não copiar segredos ou contatos.
- Se um teste não foi executado, marcar **NÃO EXECUTADO** e explicar por quê.
- Se a ferramenta ou plano não permitiu configurar algo, marcar **INVIÁVEL NO PLANO ATUAL**, não “implementado”.
- Diferenciar “código escrito”, “testes locais”, “integração externa validada” e “staging validado”.
- Incluir riscos que um revisor externo possa identificar, não apenas vitórias.

## 16.4 Prompt de encerramento que Fable deve aplicar a si mesmo

> **Você concluiu a primeira rodada?** Antes de encerrar, abra esta especificação, compare cada decisão com o repositório, execute o máximo de testes autorizados, produza screenshots da interface, verifique que dados pessoais e segredos não vazam, **audite a origem Supabase somente leitura e o isolamento do novo projeto**, crie `docs/DATA_SOURCE_AUDIT.md` e `docs/ELECTORAL_EXPORT_REPORT.md`, e gere `docs/RELATORIO_PRIMEIRA_RODADA.md` preenchido com evidências e pendências verdadeiras. Não substitua o arquivo por mensagem no chat. Reporte ao proprietário o path exato e as cinco prioridades seguintes.

---

# 17. BACKLOG DE EVOLUÇÃO — NÃO IMPLEMENTAR SEM NECESSIDADE

Estas são possibilidades futuras, não requisitos escondidos da rodada 1:

1. Moderação descentralizada por responsáveis verificados, sem expor base geral de contatos.
2. Agenda com capacidade de inscritos, check-in verificável e lembretes opt-in.
3. Análise operacional agregada de realização de atividades, sem ranquear usuários politicamente.
4. Exportação de agenda em calendários, com proteção de privacidade.
5. Busca por acessibilidade, tipo de local, disponibilidade de transporte e horários de atividades.
6. Integrações n8n com provedores autorizados, por eventos assinados.
7. Fila de e-mail/notificação quando volume e falhas justificarem.
8. Multi-idioma somente se uso real demandar.
9. PWA instalável e cache offline de consulta pública, se houver benefício mensurável.
10. Exportação pública de dados eleitorais agregados com documentação de licença, se desejado.

---

# 18. REFERÊNCIAS TÉCNICAS PRIMÁRIAS — CONFERIDAS EM 08/10/2026

**Cloudflare**

- Workers Pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Workers Static Assets e cobrança: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- Routing SPA com `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Turnstile — validação no servidor: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Turnstile — modos de widget: https://developers.cloudflare.com/turnstile/concepts/widget/
- WAF/Bot Management e requisitos de plano: https://developers.cloudflare.com/bots/get-started/bot-management/
- Limitações das regras com `bot score`: https://developers.cloudflare.com/waf/custom-rules/use-cases/challenge-bad-bots/
- Interoperabilidade Bot Fight Mode, Super Bot Fight e WAF: https://developers.cloudflare.com/waf/feature-interoperability/

**Supabase**

- Anonymous sign-ins e conversão de conta: https://supabase.com/docs/guides/auth/auth-anonymous
- Auth Users e diferenças de identidades: https://supabase.com/docs/guides/auth/users
- Row Level Security e GRANTs: https://supabase.com/docs/guides/database/postgres/row-level-security
- Docs Supabase: https://supabase.com/docs/
- Supabase CLI — referência de comandos (`db dump`, `inspect` e validação de flags): https://supabase.com/docs/reference/cli/introduction
- Projetos independentes, compute e disco: https://supabase.com/docs/guides/platform/compute-and-disk
- Cobrança por organização versus compute por projeto: https://supabase.com/docs/guides/platform/billing-on-supabase
- Relatórios e saúde do banco: https://supabase.com/docs/guides/observability/reports
- Desempenho e conexões: https://supabase.com/docs/guides/platform/performance
- Tamanho de banco e limites: https://supabase.com/docs/guides/platform/database-size

**Mapas**

- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- MapLibre + PMTiles: https://maplibre.org/maplibre-gl-js/docs/examples/pmtiles/

**Agentes/modelos**

- Anthropic — catálogo e IDs: https://platform.claude.com/docs/en/models/overview
- Claude Code Docs: https://code.claude.com/docs/en/overview
- Claude Code — subagents (verificar documentação na instalação): https://code.claude.com/docs/en/sub-agents
- Claude Code — hooks: https://code.claude.com/docs/en/hooks

**Acessibilidade e referência visual**

- https://www.w3.org/TR/WCAG22/
- https://motion.dev/docs/react
- https://www.awwwards.com/
- https://godly.website/
- https://academy.datawrapper.de/

Todas as referências acima são ponto de partida. A documentação do provedor prevalece no momento da implementação para sintaxe, limites e preços. Onde houver divergência, registrar ADR e relatório.

---

# 19. CHECKLIST DE ACEITAÇÃO FINAL DA RODADA 1

### Produto e UX

- [ ] Existe mapa navegável e busca territorial com resultado claro.
- [ ] É possível abrir página de território e compartilhar URL.
- [ ] Camadas têm unidades, fontes e estados de cobertura.
- [ ] Dados sintéticos estão rotulados caso dados reais ainda não existam.
- [ ] Se os dados vieram do SOURCE, o mapa usa apenas snapshot público validado, com metodologia, cobertura e hashes.
- [ ] Há tela de atividade e botão “Eu vou” sem login.
- [ ] Há cadastro com nome, e-mail, WhatsApp e território.
- [ ] Há obrigado com estado de grupo ativo/fallback/ausente.
- [ ] Há proposta de grupo pendente de aprovação.
- [ ] Há fluxo de criação de atividade mediante e-mail verificado.
- [ ] Há contato público do organizador opcional e revogável.
- [ ] Responsáveis por grupo não aparecem em qualquer resposta pública.

### Técnica e segurança

- [ ] Workers Static Assets e API têm configuração coerente.
- [ ] RLS/GRANTs testados com papéis distintos.
- [ ] Nenhum segredo no bundle frontend ou no Git.
- [ ] Turnstile só conta como implementado após Siteverify real.
- [ ] Rate limit + idempotência impedem duplo clique trivial.
- [ ] Sessão provisória e verificação de e-mail foram testadas ou bloqueadas explicitamente.
- [ ] Admin só com autenticação forte; moderação auditável.
- [ ] Escritas podem ser suspensas sem derrubar mapa estático.
- [ ] Migrations versionadas e testes reprodutíveis.
- [ ] Banco Supabase legado identificado e tratado como SOURCE somente leitura.
- [ ] Nenhuma conta, autenticação, cadastro, RSVP ou atividade usa o SOURCE.
- [ ] Nenhuma credencial do SOURCE aparece em Worker, frontend, deploy ou arquivos públicos.
- [ ] O relatório da fonte, a auditoria do impacto e a decisão sobre exportação estão documentados.
- [ ] Novo Supabase operacional isolado; nenhuma migration preparada para a origem.
- [ ] CI e testes essenciais passam; falhas documentadas.

### Design e entrega

- [ ] Interface desktop e mobile revisadas por screenshot real.
- [ ] Tokens de tema centralizados e preparados para arte futura.
- [ ] Motion adequado e reduced motion respeitado.
- [ ] Formulários acessíveis com estados corretos.
- [ ] README inclui setup local e variáveis necessárias.
- [ ] ADRs e docs principais refletem o código entregue.
- [ ] **`docs/RELATORIO_PRIMEIRA_RODADA.md` existe e está integralmente preenchido.**

---

# 20. PROMPT DE INÍCIO PARA O CLAUDE FABLE (COPIAR E COLAR)

```text
Você é Claude Fable 5.1, arquiteto principal e orquestrador técnico
responsável por construir o projeto MINAS EM MOVIMENTO com qualidade
de produto final, segurança e baixo custo operacional.

Leia integralmente o arquivo:
ESPECIFICACAO_COMPLETA_MINAS_EM_MOVIMENTO.md

Considere-o a especificação-mestre do projeto. Não pule capítulos.
Siga as decisões já tomadas. Identifique riscos ou contradições
reais e registre sua solução em ADR, sem inventar requisitos.

Sua primeira tarefa é estruturar um desenvolvimento agêntico:
- Fable para arquitetura, decisões complexas e revisão final;
- Opus 5.5 para engenharia e revisão de alto risco;
- Sonnet 5.5 para implementação delimitada;
- Haiku 5.5 para exploração e trabalho mecânico.

Verifique se esses modelos e os recursos de subagentes estão
realmente disponíveis na sua instalação antes de configurar.
Evite agentes redundantes e disputas de edição. Delegue com
contratos, limites de arquivos e critérios de aceite.

NOVO REQUISITO VINCULANTE SOBRE DADOS:
Os dados eleitorais reais já estão em um Supabase LEGADO, possivelmente
pesado, acessível por uma sessão CLI desta máquina. Identifique com
cautela o projeto correto e faça somente consultas de leitura de baixo
impacto, respeitando permissões e limites. Não execute migrations,
DDL, escrita, mudança de configuração, `db reset` ou dump integral
não planejado no Supabase legado. Não vincule frontend/Workers a ele.
Crie um NOVO Supabase, ou prepare sua configuração sem provisionar
serviços pagos sem autorização, para Auth, cadastros, grupos,
atividades e RSVP. Exporte somente agregados eleitorais necessários,
em pipeline offline, para snapshots estáticos versionados na Cloudflare.
Comece com um município e valide desempenho, cobertura e integridade.
Se a extração real não for segura/viável, use fixtures claramente
marcadas e mantenha a aplicação funcional.
Crie `docs/DATA_SOURCE_AUDIT.md` e `docs/ELECTORAL_EXPORT_REPORT.md`.

Construa o projeto em fases conforme a seção 15. Faça uma
primeira rodada com um corte vertical demonstrável:
mapa e busca territorial; design system; formulário e fluxo
de cadastro; grupos e propostas; atividades, "Eu vou" e
moderação; contratos da API, banco e proteções. Use somente
snapshots eleitorais realmente validados da origem Supabase, ou
fixtures sintéticas claramente identificadas até que existam.

Mantenha frontend profissional, moderno e mobile-first,
com animações bem executadas, identidade provisória coesa
e possibilidade de incorporar posteriormente a arte oficial.

Proíba deploy de produção, operações destrutivas, contratação
de serviços, ou exposição de credenciais sem autorização.
Não esconda mocks, falhas ou dependências não configuradas.
Execute testes de verdade e faça capturas do navegador.

OBRIGAÇÃO ABSOLUTA AO FINAL DA PRIMEIRA RODADA:
CRIAR O ARQUIVO docs/RELATORIO_PRIMEIRA_RODADA.md
preenchido exatamente conforme a seção 16, incluindo obrigatoriamente
a auditoria de origem Supabase, seu impacto, a separação dos bancos
e os arquivos docs/DATA_SOURCE_AUDIT.md e
docs/ELECTORAL_EXPORT_REPORT.md, com evidências,
comandos executados, falhas, screenshots, decisões e
pendências. Não substitua esse arquivo por uma mensagem.
O proprietário enviará o relatório a um revisor externo e
posteriormente compartilhará a primeira versão da aplicação
para uma auditoria visual e funcional.

Comece inspecionando o ambiente, estruturando agentes,
criando plano e ADRs; em seguida execute a implementação
com as restrições deste documento. Apresente resultados
ao longo do trabalho, sem aguardar autorização para cada
microdecisão e sem alegar conclusão antes de validar.
```

---

## FIM DA ESPECIFICAÇÃO

**Responsabilidade do agente principal:** entregar software funcional, documentado, honesto sobre suas limitações, protegido contra abusos previsíveis e preparado para absorver a identidade gráfica oficial quando ela chegar. **O relatório da primeira rodada é um entregável obrigatório, não opcional.**
