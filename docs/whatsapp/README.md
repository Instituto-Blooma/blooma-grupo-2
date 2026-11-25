# Canal do WhatsApp

Tudo o que é específico do WhatsApp (Cloud API oficial da Meta) fica em [`convex/canal.ts`](../../convex/canal.ts). O resto do backend só conhece:

- **Mensagem recebida:** `{ telefone, texto, opcaoEscolhida }`. Ela chega em `entregarParaTriagem`, dentro de `canal.ts`, e segue para [`convex/pacientes.ts`](../../convex/pacientes.ts) (aceite do termo e histórico). É ali que a triagem vai se conectar.
- **Envio:** as funções internas `canal.enviarTexto`, `canal.enviarBotoes` (até 3), `canal.enviarLista` (até 10) e `canal.enviarMidia` (documento ou vídeo por link).

## Como o canal se comporta

| Situação                                                   | O que acontece                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Meta entrega a mesma mensagem duas vezes                 | A segunda é ignorada (pelo ID da mensagem).                                                                                                                                                 |
| A paciente toca num botão ou numa opção da lista           | `opcaoEscolhida` é o `id` da opção. Um toque num botão de uma pergunta antiga conta como resposta errada.                                                                                   |
| A paciente digita o número ("2", "2.", "opção 2")          | Vale como a opção 2 da pergunta em aberto.                                                                                                                                                  |
| A paciente digita o nome ("insonia", "Insônia")            | Vale só se for o nome exato da opção, sem ligar para acento, maiúscula ou pontuação. Erro de digitação ("ansieade") não vale, a menos que `CANAL_TOLERAR_ERRO_DIGITACAO=true`.              |
| A resposta não é nenhuma opção                             | O robô diz "Não entendi sua resposta…" e repete a pergunta. A mensagem também segue para a triagem, para um pedido de ajuda escrito não se perder.                                          |
| 3ª resposta errada seguida na mesma pergunta               | O robô para de repetir, avisa que alguém da equipe vai continuar a conversa e manda a cartilha de novo (se `CANAL_CARTILHA_URL` estiver definida).                                          |
| Áudio, foto, figurinha etc.                                | Chega com `texto: ""` e `opcaoEscolhida: null`.                                                                                                                                             |
| A psicóloga ou o enfermeiro responde pelo site             | `enviarTexto` com `remetente: { tipo: 'profissional', nome, funcao }`. A mensagem começa com `*Ana (psicóloga):*`.                                                                          |
| A resposta sai mais de 24 h depois da última mensagem dela | A mensagem fica guardada e a paciente recebe o aviso aprovado (`nova_mensagem_equipe`). Quando ela responder, tudo o que estava guardado é enviado. A função devolve `aguardando_paciente`. |

## Pacientes, hospital, crise, aceite e histórico

Regras em [`convex/pacientes.ts`](../../convex/pacientes.ts), nesta ordem para cada mensagem:

1. **Palavras de risco** (lista editável, tabela `palavrasDeRisco`): se a mensagem tiver uma delas, o robô manda a mensagem fixa com o CVV (188) e o SAMU (192), e o hospital recebe um alerta só com telefone e horário. O texto não é guardado antes do aceite. Se ela ainda não escolheu o hospital, o alerta aparece para o hospital que ela escolher.
2. **"apagar meus dados"**: o robô confirma o recebimento e o pedido aparece para a equipe do hospital dela (`listarPedidosDeExclusao`), que confirma no site (`apagarDadosDaPaciente`). Isso apaga o cadastro, as mensagens, os alertas e os registros do canal; fica só um registro mínimo (`exclusoesRealizadas`: hospital, quem apagou e quando).
3. **Hospital**: se a mensagem tiver o código de um hospital ("Oi ACC"), ela fica ligada a ele. Sem código: com um hospital só cadastrado, ela é ligada a ele; com mais de um, o robô pergunta "Em qual hospital você faz tratamento?".
4. **Termo**: antes do aceite, nenhum texto é guardado. O robô manda o termo com "Aceito" e "Não aceito". Sem termo publicado, nada é guardado. Se o termo mudar de versão, o robô pede o aceite de novo.
5. **Histórico**: depois do aceite, toda mensagem que entra e sai vai para `mensagensConversa` (paciente, robô ou profissional).

## Triagem: cadastro, check-in e prioridade

Regras em [`convex/triagem.ts`](../../convex/triagem.ts) e [`convex/lib/escala.ts`](../../convex/lib/escala.ts):

1. **Cadastro** (logo depois do aceite): o robô pergunta o nome completo, depois como ela gosta de ser chamada e depois o número do prontuário ("NÃO SEI" vale). A equipe pode corrigir no site.
2. **Check-in**: uma pergunta por vez, com botões (até 3 opções) ou lista (de 4 a 10). Cada resposta vale pontos.
3. **Regra fixa de prioridade**: qualquer resposta de risco → **urgente**. Sem risco, a soma decide: a partir de `altaAPartirDe` → **alta**; a partir de `moderadaAPartirDe` → **moderada**; abaixo → **baixa**. Nenhuma IA decide nada.
4. **Resposta de risco**: o caso fica urgente na fila na hora. A paciente termina o check-in e, na mensagem final, recebe o CVV (188) e o SAMU (192).
5. **Palavra de risco escrita**: o robô manda o CVV e o SAMU na hora (como antes), o check-in em andamento para e o caso fica urgente.
6. **Robô não entendeu** (3 respostas erradas seguidas): o check-in para e o caso vai para a fila com o alerta "o robô não entendeu".
7. **Toda semana**: segunda-feira às 9h (Brasília), toda paciente com cadastro completo recebe um check-in novo ([`convex/crons.ts`](../../convex/crons.ts)). Um check-in da semana anterior sem resposta fica como "interrompido".

Cada check-in concluído abre um caso na fila da equipe (ou atualiza o caso aberto). Num caso aberto, a prioridade só sobe: quem fecha o caso é a equipe.

### A escala é dado (EXEMPLO por enquanto)

A escala fica na tabela `escalasTriagem`; a mais recente vale para os próximos check-ins. Enquanto nenhuma for publicada, o sistema usa a **escala de EXEMPLO** de `convex/lib/escala.ts` (6 perguntas, pontos de corte de exemplo). Ela **não é validada** e aparece marcada como exemplo no site. Para trocar pela escala escolhida pelas psicólogas:

```bash
npx convex run triagem:publicarEscala '{"escala":{"versao":"1","nome":"Nome da escala","exemplo":false,"perguntas":[{"id":"tristeza","texto":"...","opcoes":[{"id":"nada","titulo":"Nada","pontos":0,"risco":false}]}],"faixas":{"altaAPartirDe":7,"moderadaAPartirDe":4}}}'
```

Os check-ins antigos guardam o texto das perguntas e respostas como foram mostrados, então continuam legíveis depois da troca.

Para mandar um check-in na hora (teste): `npx convex run triagem:enviarCheckinAgora '{"telefone":"5511999998888"}'`.

**Quem vê o quê:** cada hospital (organização) vê só as próprias pacientes, conversas, alertas e pedidos (`listarPacientes`, `listarMensagens`, `listarAlertasDeCrise`, `listarPedidosDeExclusao`). Uma paciente ainda sem hospital não aparece para ninguém.

### Configurar (até existirem telas para isso)

```bash
# Cadastrar um hospital no robô (o ID é o da organização, visto no painel do Convex ou no site)
npx convex run pacientes:definirCodigoDoHospital '{"organizationId":"<id>","codigo":"ACC"}'

# Palavras de risco (definidas pela equipe de psicologia)
npx convex run pacientes:adicionarPalavraDeRisco '{"termo":"..."}'
npx convex run pacientes:removerPalavraDeRisco '{"termo":"..."}'

# Termo de consentimento (texto curto, com o link do termo completo)
npx convex run pacientes:publicarTermo '{"versao":"1","texto":"..."}'

# Ver os hospitais cadastrados e o texto de cada link
npx convex run pacientes:listarHospitais
```

Esses comandos usam aspas simples, que funcionam no Git Bash, no macOS e no Linux. No PowerShell ou no Prompt de Comando do Windows, use o Git Bash ou o painel do Convex (aba Functions).

### Link wa.me por hospital

O link abre o WhatsApp com a mensagem já escrita. Formato:

```
https://wa.me/<número do robô só com dígitos>?text=Oi%20<CÓDIGO>
```

Exemplo, se o número do robô fosse +55 11 99999-0000 e o código ACC: `https://wa.me/5511999990000?text=Oi%20ACC`. O `%20` é o espaço. Esse link pode virar QR code em qualquer gerador de QR. O número é o que a Meta der para a conta do WhatsApp Business.

### Apagar os dados de teste

```bash
pnpm run dados:apagar-teste          # pacientes, mensagens, alertas, exclusões e registros do canal
pnpm run dados:apagar-teste --tudo   # também códigos de hospital, palavras de risco e termos
```

O comando se recusa a rodar se o WhatsApp real estiver ligado (com `WHATSAPP_TOKEN`).

## Modo simulado

Enquanto `WHATSAPP_TOKEN` ou `WHATSAPP_PHONE_NUMBER_ID` não estiverem definidos, nada sai de verdade: cada envio aparece nos logs do Convex como `[canal:simulado] enviaria {...}`, com o JSON exato que seria mandado à Meta. O texto das pacientes só aparece nos logs no modo simulado; no modo real, o log guarda só o nome do evento.

### Testar sem a Meta

Com `pnpm run dev:all` rodando, envie um dos exemplos de [`exemplos/`](./exemplos):

```bash
pnpm run whatsapp:simular 01-texto-oi
```

O script troca o horário pelo atual e gera um ID novo, para o mesmo exemplo poder ser enviado várias vezes. Para testar a mensagem repetida, envie duas vezes com `--mesmo-id`:

```bash
pnpm run whatsapp:simular 01-texto-oi --mesmo-id
```

Para testar os envios, chame as funções diretamente:

```bash
npx convex run canal:enviarLista '{"telefone":"5511999998888","texto":"Sobre o que você quer conversar?","textoBotao":"Ver opções","opcoes":[{"id":"ansiedade","titulo":"Ansiedade"},{"id":"insonia","titulo":"Insônia"},{"id":"outro","titulo":"Outro assunto"}]}'
```

Sugestão de roteiro: `01-texto-oi` (a paciente escreve), depois o `enviarLista` acima e então `04-numero-digitado` ou `05-nome-digitado`. As duas devem chegar com `opcaoEscolhida: "insonia"`.

| Exemplo              | O que simula                             |
| -------------------- | ---------------------------------------- |
| `01-texto-oi`        | Mensagem de texto                        |
| `02-botao-tocado`    | Toque num botão (`ansiedade`)            |
| `03-lista-escolhida` | Escolha numa lista (`insonia`)           |
| `04-numero-digitado` | Digitou "2"                              |
| `05-nome-digitado`   | Digitou "insonia"                        |
| `06-audio`           | Mensagem de voz (tipo ainda não tratado) |
| `07-status-entregue` | Aviso de entrega da Meta (é ignorado)    |

## Quando a conta da Meta existir

Defina no Convex (`npx convex env set NOME valor`):

| Variável                       | Para quê                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `WHATSAPP_TOKEN`               | Token de acesso da Cloud API. Liga o envio real.                                |
| `WHATSAPP_PHONE_NUMBER_ID`     | ID do número que envia as mensagens.                                            |
| `WHATSAPP_APP_SECRET`          | Segredo do app. Obrigatório no modo real: confere a assinatura de cada webhook. |
| `WHATSAPP_VERIFY_TOKEN`        | Texto combinado com a Meta para ela validar a URL do webhook.                   |
| `WHATSAPP_API_VERSION`         | Opcional. Versão da Graph API (padrão `v23.0`).                                 |
| `WHATSAPP_TEMPLATE_AVISO`      | Opcional. Nome do modelo de aviso (padrão `nova_mensagem_equipe`).              |
| `WHATSAPP_TEMPLATE_IDIOMA`     | Opcional. Idioma do modelo (padrão `pt_BR`).                                    |
| `CANAL_CARTILHA_URL`           | Opcional. Link público do PDF da cartilha de como usar o atendimento.           |
| `CANAL_CARTILHA_NOME`          | Opcional. Nome do arquivo da cartilha (padrão `cartilha.pdf`).                  |
| `CANAL_TOLERAR_ERRO_DIGITACAO` | Opcional. `true` aceita um erro pequeno de digitação no nome da opção.          |

No painel da Meta, a URL do webhook é `<CONVEX_SITE_URL>/whatsapp/webhook`, com assinatura do campo `messages`. Também é preciso pedir a aprovação do modelo de aviso (por exemplo: "Você tem uma nova mensagem da equipe. Responda aqui para ver.").
