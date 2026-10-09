# Regras de frontend

- Mobile-first, PT-BR, `America/Sao_Paulo`. WCAG 2.2 AA: contraste, foco visível, teclado, labels, `aria-live` discreto, áreas de toque ≥ 44px.
- Tokens em `src/styles/tokens.css` (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--duration-*`, `--easing-*`, `--map-fill-*`). Componentes consomem tokens via Tailwind `@theme` / CSS vars; nunca hex solto em componentes.
- Sem aparência de dashboard SaaS genérico; sem cards com sombra gratuitos; mapa é navegável e informativo, não fundo.
- Motion: hover 100–180ms, painel 180–280ms, bottom sheet 220–350ms, flyTo 350–650ms; `prefers-reduced-motion` desliga animações e flyTo vira jump. Nenhuma animação bloqueia submit.
- MapLibre carregado por lazy import; fallback textual/lista quando WebGL indisponível ou tiles falham. Atribuição de fontes cartográficas obrigatória.
- Dados demo sempre com selo visível "DEMO" / "dados sintéticos". Status do snapshot (`validated|partial|demo`) vem do manifest e aparece na legenda.
- Formulários: `autocomplete` correto (`name`, `email`, `tel`), `inputmode="tel"`, erro associado ao campo (`aria-describedby`) + resumo. Nunca sucesso antes da resposta do servidor.
- Nunca renderizar HTML de usuário; texto puro.
- Estado remoto via TanStack Query; fetch client em `src/lib/api.ts` valida respostas com os contratos Zod de `shared/contracts`.
- Links externos (WhatsApp) com `rel="noopener noreferrer"` e domínio visível.
- Não geolocalizar sem interação explícita.
- Rotas administrativas em lazy chunk separado; nada de admin na navegação pública.
