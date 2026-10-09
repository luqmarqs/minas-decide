# PRIVACY_LGPD_DRAFT — rascunho para revisão jurídica (NÃO publicar como final)

Este documento organiza os fatos técnicos verdadeiros do sistema para que a revisão jurídica produza a Política de Privacidade e os Termos. Os textos em `/privacidade` e `/termos` continuam marcados como rascunho até essa revisão. Pontos entre colchetes exigem decisão do controlador.

## 1. Agentes
- **Controlador:** [organização responsável — a definir]. **Operador(es):** Supabase (banco, região São Paulo), **Clerk** (autenticação e envio de códigos de verificação por e-mail; EUA — avaliar transferência internacional), Cloudflare (hospedagem/CDN/Turnstile), [provedor SMTP — a definir], OpenFreeMap (tiles do mapa; recebe IP ao carregar o mapa).
- **Encarregado (DPO) e canal do titular:** [e-mail — a definir]; o rodapé e `/privacidade` apontam para ele.

## 2. Dados tratados, finalidade, base legal (proposta) e retenção

| Dado | Quando | Finalidade | Base legal proposta | Retenção |
|---|---|---|---|---|
| Nome, e-mail, WhatsApp, município/bairro escolhido | cadastro | enviar o link do grupo territorial; autenticar; organizar atividades | consentimento (art. 7º, I) e/ou execução de serviço solicitado (art. 7º, V); **atenção: opinião política pode caracterizar dado sensível (art. 11) — avaliar consentimento específico e destacado** | enquanto a conta existir; exclusão a pedido |
| Consentimento de comunicações (opt-in separado, não pré-marcado) | cadastro | comunicações da organização | consentimento | até revogação |
| Nome, e-mail, WhatsApp do proponente de grupo | proposta de grupo | moderação e contato administrativo | consentimento / legítimo interesse de moderação | até decisão + [12 meses] |
| Responsáveis por grupo (nome, contato) | admin | gestão de grupos | execução de serviço / legítimo interesse | enquanto o grupo existir |
| Contato público do organizador | opt-in explícito | permitir contato de interessados | consentimento revogável a qualquer momento | até desligar |
| Identificador anônimo de dispositivo (cookie HMAC) para "Eu vou" | RSVP sem login | evitar duplicidade; contagem aproximada | legítimo interesse; sem perfilamento | 1 ano (cookie) |
| Eventos de abuso (hash de IP, rota, código) | bloqueios | segurança | legítimo interesse (art. 7º, IX) | [30 dias] |
| Trilha de auditoria (ação administrativa, ids) | moderação | prestação de contas | obrigação/legítimo interesse | [5 anos] |
| Logs técnicos (request_id, rota, status, duração) | sempre | operação | legítimo interesse | [7 dias] no provedor |

Não coletamos: CPF, RG, endereço residencial, senha, geolocalização do dispositivo (o ponto de atividade é escolhido manualmente), voto individual. Não inferimos opinião política de ninguém; indicadores eleitorais são agregados públicos (TSE).

## 3. Direitos do titular e como exercer
Acesso, correção (nome, telefone, território editáveis em `/me`), exclusão da conta [implementar endpoint `DELETE /me` ou fluxo manual pelo canal], revogação de consentimento (desligar contato público; opt-out de comunicações), portabilidade [avaliar].

## 4. Compartilhamento e transferência internacional
Supabase (São Paulo) — dados ficam no Brasil; Cloudflare — tráfego pela borda global (avaliar cláusula de transferência); SMTP [a definir]; OpenFreeMap (apenas IP/tiles). Nenhum dado é vendido ou compartilhado para publicidade.

## 5. Segurança (fatos)
RLS e grants mínimos; dados privados em schema não exposto; PII nunca em respostas públicas; segredos fora do código; CSP; auditoria de moderação; MFA para administradores; revelação de contato de proponente auditada.

## 6. Cookies e armazenamento local
`mm_device` (HttpOnly, 1 ano, antifraude de RSVP); sessão Supabase (localStorage); rascunhos de formulário (localStorage, 7 dias); preferências de UI. Sem cookies de publicidade; sem analytics que capturem formulários.

## 7. Pendências para o jurídico
1. Base legal definitiva e eventual tratamento como dado sensível (art. 11).
2. Prazos de retenção entre colchetes.
3. Texto de consentimento no formulário (duas caixas separadas: termos/privacidade e comunicações).
4. Procedimento de exclusão de conta e resposta a titulares (prazo de 15 dias).
5. Relatório de impacto (RIPD) se exigido pela natureza política.
