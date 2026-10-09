# PRODUCT — Minas em Movimento (rodada 1)

**Proposição:** mapa público de dados eleitorais agregados de Minas Gerais + comunidade territorial (grupos de WhatsApp aprovados) + agenda de atividades presenciais com "Eu vou" sem login.

**Não é:** rede social, CRM de eleitores, ferramenta de inferência individual, cadastro público de coordenadores, painel de BI.

## Papéis

| Papel | Pode |
|---|---|
| Visitante | explorar mapa/território, buscar, clicar "Eu vou", cadastrar-se, propor grupo |
| Sessão provisória (cadastrado, e-mail não verificado) | tudo acima + ver próprio perfil mínimo; **não** cria atividades |
| Verificado | criar/gerenciar as próprias atividades (sempre com moderação) |
| Admin (MFA) | aprovar/rejeitar grupos e atividades, gerir responsáveis (privado), auditar |

## Jornadas implementadas na rodada 1

- A (exploração pública): home → busca → município → bairro → painel com indicadores, grupo, atividades; link compartilhável.
- B (cadastro): formulário curto → Turnstile → sessão provisória → obrigado com grupo aprovado / fallback municipal / proposta.
- C (proposta de grupo): formulário sem login → pendente → moderação.
- D ("Eu vou"): sem login, idempotente, desfazer; é intenção, não presença.
- E (criar atividade): só verificado; pendente de aprovação; contato público opt-in.
- F (admin): fila, aprovar/rejeitar com motivo, responsáveis privados.

## Métricas de sucesso (a instrumentar)

Tempo até localizar território; tempo até ver link do grupo; conclusão de cadastro (≠ adesão ao WhatsApp); grupos aprovados por território; atividades aprovadas e intenções; disponibilidade do mapa quando escrita suspensa; zero PII em respostas públicas.

## Frases que o produto nunca afirma

Clique no convite ≠ entrada no grupo; "Eu vou" ≠ presença; IP ≠ pessoa; agregado ≠ voto individual; diferença 2022→2026 ≠ transferência de votos.
