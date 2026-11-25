# Triagem · Equipe de Psicologia (HackaBlooma 2026, grupo 2)

Painel da equipe de psicologia para a triagem semanal de pacientes com câncer pelo WhatsApp.
Uma **regra fixa** soma a pontuação e define a prioridade. Nenhuma IA decide nada.
É uma triagem, não terapia nem diagnóstico: quem cuida é sempre a equipe.

## Como rodar

```powershell
pnpm install
pnpm run dev:all
```

Abra http://localhost:5173 e entre com o Google simulado usando a conta **dev@example.com**.
Essa conta aparece como "Psicóloga Demo" e já tem o papel `psicologa`.
A conta platform@example.com **não** tem o papel, então serve para mostrar a tela "Acesso restrito".

## Popular com o seed (pacientes fictícias)

O `dev:all` cria as pacientes sozinho na primeira vez. Para **apagar e recriar** o cenário do pitch
(com o `dev:all` já rodando, em outro terminal):

```powershell
pnpm run seed:triagem
```

São 9 pacientes fictícias, com telefones `+55 00 00000-0001` a `-0009`:
- **Maria** (a do roteiro): prioridade média, 4 check-ins e piorando aos poucos.
- **Joana**: sinal de risco no check-in mais recente.
- Luíza e Teresa (alta); Cláudia e Sônia (média); Rita e Helena (baixa); Beatriz (sem check-in).

## Roteiro para os prints

1. **Simulador** (menu "Simulador do WhatsApp"): clique em "Nova paciente fictícia", escreva `oi`
   e você recebe as boas-vindas e o termo.
2. Toque em "Aceito", diga um apelido e toque em "Começar check-in". Responda pelos botões. Na
   última pergunta, escolha qualquer opção diferente de "Nenhuma vez" e aparece o aviso com o
   **CVV 188** e o **SAMU 192**.
3. **Fila**: a paciente nova sobe para o topo, com o selo "Sinal de risco".
4. **Ficha da Maria**: histórico, gráfico da pontuação e botão "Assumir caso".
5. **Conversa**: escreva na ficha. A mensagem aparece também no simulador, na conversa da paciente.

No simulador também dá para testar o lembrete semanal, com "Enviar lembrete agora" ou "Rodar a
regra do cron semanal".

## Testes

```powershell
pnpm test
```

São 22 testes, cobrindo a regra de prioridade (`convex/lib/priority.ts`) e a máquina de conversa
(`convex/lib/conversation.ts`).

## Onde está cada coisa

| O quê | Arquivo |
|---|---|
| Regra de prioridade (pura, com configuração) | `convex/lib/priority.ts` |
| Perguntas e escalas de exemplo | `convex/lib/questionnaire.ts` |
| Textos enviados à paciente | `convex/lib/scripts.ts` |
| Máquina de conversa (não depende do provedor) | `convex/lib/conversation.ts` |
| Ligação da máquina com o banco (usada pelo simulador e pelo WhatsApp) | `convex/lib/conversationRunner.ts` |
| Provedores: simulado (pronto) e WhatsApp (TODO) | `convex/lib/providers.ts` |
| Checagem de login e papel no servidor | `convex/lib/staff.ts` |
| Log de auditoria obrigatório para abrir a ficha | `convex/lib/access.ts` |
| Cron do lembrete semanal | `convex/crons.ts` e `convex/reminders.ts` |
| Seed | `convex/seed.ts` |
| Telas | `client/src/pages/fila.tsx`, `ficha.tsx`, `simulador.tsx` |

## Segurança e LGPD

- Toda função que toca dado de paciente chama `requirePsicologa` **no servidor**.
- A ficha e a conversa só abrem depois de gravar no `auditLog` quem acessou e quando. A ficha mostra
  esse registro.
- A URL leva só o ID interno. Nada de dado de paciente vai para log ou para o `localStorage`.
- O simulador só funciona com pacientes fictícias e pode ser desligado no servidor com
  `SIMULADOR_DESLIGADO=1`.

## PROVISÓRIO (aparece marcado no código e na tela)

- As escalas ("Escala A" e "Escala B"), as perguntas, as opções e a regra de sinal de risco são
  **exemplos**.
- Os pesos e os pontos de corte (alta a partir de 60, média a partir de 30, numa escala de 0 a 100)
  também são exemplos.
- Os textos do termo de consentimento e da mensagem de crise são rascunhos.

## O que ainda depende de vocês (TODOs)

- Escolher as escalas validadas, os pontos de corte e os pesos, junto com as psicólogas do
  A.C.Camargo.
- Escolher o **provedor do WhatsApp** e implementar `whatsappProvider.deliver` e a rota do webhook
  em `convex/http.ts`. Pontos de atenção: o limite de 3 botões e o uso de template fora da janela
  de 24h.
- Definir o nome do produto (`PRODUCT_NAME` em `client/src/components/triagem/app-shell.tsx`).
- Revisar o termo de consentimento com o jurídico e decidir o que fazer com os dados de quem recusa.
- Definir se a equipe recebe aviso ativo de sinal de risco (e-mail, push, plantão). Hoje a paciente
  vai para o topo da fila em tempo real.
- Decidir se o check-in continua depois de um sinal de risco. Hoje continua.
- Confirmar o dia e o horário do lembrete. Hoje é segunda-feira às 9h de Brasília.
- Definir quem libera o papel `psicologa` em produção. Hoje isso se faz com
  `npx convex run staff:grantPsicologa` passando o e-mail.
