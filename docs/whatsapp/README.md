# Canal do WhatsApp

Tudo o que é específico do WhatsApp (Cloud API oficial da Meta) fica em [`convex/canal.ts`](../../convex/canal.ts). O resto do backend só conhece:

- **Mensagem recebida:** `{ telefone, texto, opcaoEscolhida }`. Ela chega em `entregarParaTriagem`, dentro de `canal.ts`, que é o único ponto onde a triagem se conecta.
- **Envio:** as funções internas `canal.enviarTexto`, `canal.enviarBotoes` (até 3), `canal.enviarLista` (até 10) e `canal.enviarMidia` (documento ou vídeo por link).

## Como o canal se comporta

| Situação                                                   | O que acontece                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Meta entrega a mesma mensagem duas vezes                 | A segunda é ignorada (pelo ID da mensagem).                                                                                                                                                 |
| A paciente toca num botão ou numa opção da lista           | `opcaoEscolhida` é o `id` da opção.                                                                                                                                                         |
| A paciente digita o número ("2", "2.", "opção 2")          | Vale como a opção 2 do último menu que ela recebeu.                                                                                                                                         |
| A paciente digita o nome ("insonia", "Insônia")            | Vale como a opção com esse nome, sem ligar para acento ou maiúscula. Aceita um erro pequeno de digitação ("ansieade") se só uma opção for parecida.                                         |
| Áudio, foto, figurinha etc.                                | Chega com `texto: ""` e `opcaoEscolhida: null`.                                                                                                                                             |
| A psicóloga ou o enfermeiro responde pelo site             | `enviarTexto` com `remetente: { tipo: 'profissional', nome, funcao }`. A mensagem começa com `*Ana (psicóloga):*`.                                                                          |
| A resposta sai mais de 24 h depois da última mensagem dela | A mensagem fica guardada e a paciente recebe o aviso aprovado (`nova_mensagem_equipe`). Quando ela responder, tudo o que estava guardado é enviado. A função devolve `aguardando_paciente`. |

## Modo simulado

Enquanto `WHATSAPP_TOKEN` ou `WHATSAPP_PHONE_NUMBER_ID` não estiverem definidos, nada sai de verdade: cada envio aparece nos logs do Convex como `[canal:simulado] enviaria {...}`, com o JSON exato que seria mandado à Meta.

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

| Variável                   | Para quê                                                                        |
| -------------------------- | ------------------------------------------------------------------------------- |
| `WHATSAPP_TOKEN`           | Token de acesso da Cloud API. Liga o envio real.                                |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número que envia as mensagens.                                            |
| `WHATSAPP_APP_SECRET`      | Segredo do app. Obrigatório no modo real: confere a assinatura de cada webhook. |
| `WHATSAPP_VERIFY_TOKEN`    | Texto combinado com a Meta para ela validar a URL do webhook.                   |
| `WHATSAPP_API_VERSION`     | Opcional. Versão da Graph API (padrão `v23.0`).                                 |
| `WHATSAPP_TEMPLATE_AVISO`  | Opcional. Nome do modelo de aviso (padrão `nova_mensagem_equipe`).              |
| `WHATSAPP_TEMPLATE_IDIOMA` | Opcional. Idioma do modelo (padrão `pt_BR`).                                    |

No painel da Meta, a URL do webhook é `<CONVEX_SITE_URL>/whatsapp/webhook`, com assinatura do campo `messages`. Também é preciso pedir a aprovação do modelo de aviso (por exemplo: "Você tem uma nova mensagem da equipe. Responda aqui para ver.").
