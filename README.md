# Hackblooma

Instituto Blooma product on the **convexplate** B2B foundation: **Organizations** with isolated data, **provisioned onboarding** (invite before sign-in), **org-scoped authorization**, and **Platform Admin** tooling.

Built on Vite, React, TypeScript, and Convex — with local dev, GitHub CI, and Railway deploy.

## Site da equipe de psicologia (grupo 2)

A equipe do hospital entra pelo convite (organização = hospital) e vê só as pacientes do próprio hospital.

**Entrar:** com e-mail e senha. No primeiro acesso, a pessoa usa o e-mail do convite, cria uma senha e confirma com um código de 6 números enviado por e-mail; "Esqueci minha senha" também usa um código. Só e-mails convidados conseguem criar a senha. Em desenvolvimento e na versão de teste do Railway, os e-mails ficam em `/dev/inbox`. Em produção, é preciso configurar `RESEND_API_KEY` e `RESEND_FROM` (um remetente de um domínio verificado no Resend).

**Cores:** paleta do Olhar Humano (regra 60-30-10), em variáveis do tema em `client/src/index.css` e nomes do Tailwind em `tailwind.config.ts`: `azul` #1B4765 (`azul-clarinho` #E1EBF2, `azul-medio` #4A6F8A, `azul-profundo` #0F2B3E), `lavanda` #C7C7F5 (`lavanda-clara` #E5E5FF, `roxo` #3F3FA6, `roxo-escuro` #2D2D80) e `laranja` #AD531F (`pessego` #FBE3D3, `laranja-claro` #FF9C62, `laranja-escuro` #7A3A15). Fundo branco. Blocos e etiquetas: tonalidade clarinha de fundo e escura da mesma cor no texto. Um botão laranja (`variant="principal"`) por tela, no máximo; laranja nunca sobre azul (use `laranja-claro`). Não use cores soltas no código.

**Logo:** a opção "Abraço" de [design/logo-opcoes.html](./design/logo-opcoes.html). A versão final é um arquivo só, [`client/public/logo.svg`](./client/public/logo.svg), igual em todo lugar (inclusive no tema escuro), com quadrado lavanda #E5E5FF, braços azul-marinho #1B4765 e roxo #3F3FA6 e pupila laranja #AD531F: o site mostra esse arquivo, e os ícones da aba (`favicon.png`, `favicon-staging.png`, `favicon-pr.png`) e a imagem dos e-mails (`logo-email.png`) são gerados a partir dele, em 256×256. Os e-mails mostram a imagem quando `SITE_URL` está configurado no Convex.

O menu fica num painel lateral: Fila, Sinal de risco, Robô não entendeu, Avisos, Pacientes, Equipe, Configurações e Meu perfil.

| Tela               | Endereço          | O que mostra                                                                                                |
| ------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Fila               | `/`               | Casos abertos: urgente, alta, moderada, baixa; na mesma prioridade, quem espera há mais tempo               |
| Todas as pacientes | `/pacientes`      | Todas as pacientes do hospital, com busca pelo nome completo                                                |
| Ficha              | `/pacientes/<id>` | Cadastro, alertas, todos os check-ins com respostas e pontos, conversa no WhatsApp, assumir e concluir caso |
| Meu perfil         | `/perfil`         | Nome e função que aparecem no começo de cada mensagem para a paciente                                       |

Como a triagem funciona no WhatsApp (cadastro, check-in semanal, escala de EXEMPLO e regra de prioridade): [docs/whatsapp/README.md](./docs/whatsapp/README.md#triagem-cadastro-check-in-e-prioridade). Backend: `convex/triagem.ts` (robô) e `convex/equipe.ts` (site).

## What You Get

- **Organizations** (multi-company isolation) via `@djpanda/convex-tenants`
- **Authorization** via `@djpanda/convex-authz` (org permissions + platform admin role)
- **Provisioning and invitations** (Resend; emulated locally)
- Google OAuth (emulated in dev; real provider in production)
- Reference org-scoped feature: todos with ABAC pattern
- Platform admin UI at `/admin`; org settings at `/settings/*`
- Agent skills in `.agents/skills/` (Claude Code: `.claude/skills/`)
- Demo mode before Convex is configured; Tailwind + shadcn/ui; lint/format/typecheck

## Quick Start (Local)

```bash
pnpm install
pnpm run setup
pnpm run dev:all
```

`dev:all` starts Google OAuth emulate (`:4002`), Resend emulate (`:4003`), local Convex, and Vite on `:5173`.

Sign in with a first-setup emulator user — **Dev User**, **Test User**, or `platform@example.com`. You land in **Acme Corp**.

Detailed walkthrough: [SETUP.md](./SETUP.md).

## Scripts

| Script                           | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `pnpm run setup`                 | One-time local Convex + auth + emulator env  |
| `pnpm run dev:all`               | Full dev stack (emulators, Convex, Vite)     |
| `pnpm run dev:backend`           | Convex dev (force-upgrade local backend)     |
| `pnpm run prefetch:convex:local` | Cache Convex local backend for Railway/CI    |
| `pnpm run dev`                   | Vite only                                    |
| `pnpm run build`                 | Convex codegen + production frontend build   |
| `pnpm run deploy:convex`         | Deploy Convex functions (Railway pre-deploy) |
| `pnpm run check`                 | Format, lint, and typecheck                  |

## Deploy (Railway)

- **Production**: `pnpm run build` → `pnpm run deploy:convex` → static serve via `node script/run.mjs railway serve`
- **PR previews**: Railway `local` / `pr` environments run the full local-Convex dev stack

See [railway.toml](./railway.toml) and [docs/environment.md](./docs/environment.md).

## Docs

- [SETUP.md](./SETUP.md) — first-run setup
- [docs/architecture.md](./docs/architecture.md) — tenancy, authz, onboarding
- [docs/updating-downstream.md](./docs/updating-downstream.md) — port template changes into forks
- [docs/testing.md](./docs/testing.md) — why tests are not advised
- [docs/environment.md](./docs/environment.md) — env vars and Railway
