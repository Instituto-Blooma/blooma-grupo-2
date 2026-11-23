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

## Pacientes, aceite do termo e histórico

Regras em [`convex/pacientes.ts`](../../convex/pacientes.ts):

- **Antes do aceite, nenhum texto é guardado.** Fica só o telefone. No primeiro contato o robô manda o termo com os botões "Aceito" e "Não aceito". Sem termo publicado, nada é guardado.
- **Depois do aceite,** toda mensagem que entra e sai vai para `mensagensConversa`: da paciente, do robô ou da profissional. Se o termo mudar de versão, o robô pede o aceite de novo.
- **Quem vê o quê:** a equipe central (administradores da plataforma) vê só as pacientes sem hospital (`listarSemHospital`) e as encaminha (`encaminharParaHospital`). Cada hospital vê só as próprias pacientes (`listarDoHospital`, `listarMensagens`).
- **Apagar os dados:** a paciente escreve "apagar meus dados"; ela aparece em `listarPedidosDeExclusao` e a equipe central confirma com `apagarDadosDaPaciente`. Isso remove o cadastro, as mensagens e os registros do canal ligados ao telefone dela.

Publicar o termo (até existir uma tela para isso):

```bash
npx convex run pacientes:publicarTermo '{"versao":"1","texto":"Texto curto do termo, com o link do termo completo"}'
```

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
