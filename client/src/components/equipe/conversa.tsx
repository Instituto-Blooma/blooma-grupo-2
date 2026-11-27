import { useState, type FormEvent } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { dataHora, mensagemDeErro } from './formato';

type Mensagem = FunctionReturnType<typeof api.pacientes.listarMensagens>['page'][number];

const MENSAGENS_POR_PAGINA = 30;

/** WhatsApp history (newest at the bottom) and the box to write to the patient. */
export function Conversa({
  pacienteId,
  nomeDaPaciente,
  bloqueio,
}: {
  pacienteId: Id<'pacientes'>;
  nomeDaPaciente: string;
  /** Why the team cannot write now, or `null`. */
  bloqueio: string | null;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.pacientes.listarMensagens,
    { pacienteId },
    { initialNumItems: MENSAGENS_POR_PAGINA }
  );
  const mensagens = [...results].toReversed();

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Conversa no WhatsApp</CardTitle>
        <CardDescription>
          Tudo o que ela, o robô e a equipe escreveram depois do aceite do termo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="max-h-[32rem] space-y-3 overflow-y-auto rounded-lg border bg-background p-3">
          {status === 'CanLoadMore' || status === 'LoadingMore' ? (
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadMore(MENSAGENS_POR_PAGINA)}
                disabled={status === 'LoadingMore'}
              >
                Ver mensagens mais antigas
              </Button>
            </div>
          ) : null}
          {status === 'LoadingFirstPage' ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : mensagens.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma mensagem guardada ainda.
            </p>
          ) : (
            mensagens.map((mensagem) => (
              <Balao key={mensagem._id} mensagem={mensagem} nomeDaPaciente={nomeDaPaciente} />
            ))
          )}
        </div>
        <CampoDeMensagem pacienteId={pacienteId} bloqueio={bloqueio} />
      </CardContent>
    </Card>
  );
}

/**
 * Shows WhatsApp formatting like the phone does: *bold* and _italic_, without the symbols.
 * Text only (no HTML is ever interpreted).
 */
function TextoWhatsApp({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {partes.map((parte, indice) => {
        const chave = `${indice}-${parte.length}`;
        if (parte.length > 2 && parte.startsWith('*') && parte.endsWith('*')) {
          return <strong key={chave}>{parte.slice(1, -1)}</strong>;
        }
        if (parte.length > 2 && parte.startsWith('_') && parte.endsWith('_')) {
          return <em key={chave}>{parte.slice(1, -1)}</em>;
        }
        return <span key={chave}>{parte}</span>;
      })}
    </>
  );
}

/** Professional messages start with "*Ana (psicóloga):*" — shown as a bold first line. */
function separarAssinatura(texto: string) {
  const correspondencia = /^\*([^*\n]+):\*\n/.exec(texto);
  if (!correspondencia) return { assinatura: null, corpo: texto };
  return { assinatura: correspondencia[1], corpo: texto.slice(correspondencia[0].length) };
}

function Balao({ mensagem, nomeDaPaciente }: { mensagem: Mensagem; nomeDaPaciente: string }) {
  const daPaciente = mensagem.direcao === 'entrada';
  const { assinatura, corpo } = separarAssinatura(mensagem.texto);
  const autor = daPaciente
    ? nomeDaPaciente
    : mensagem.remetente === 'robo'
      ? 'Robô'
      : (assinatura ?? 'Equipe');
  return (
    <div className={cn('flex', daPaciente ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm',
          daPaciente
            ? 'border border-azul-clarinho bg-white text-azul'
            : mensagem.remetente === 'robo'
              ? 'bg-azul-clarinho text-azul-profundo'
              : 'bg-lavanda-clara text-roxo-escuro'
        )}
      >
        <p className="mb-0.5 text-xs font-semibold opacity-80">{autor}</p>
        <p className="whitespace-pre-wrap break-words">
          <TextoWhatsApp texto={corpo} />
        </p>
        <p className="mt-1 text-right text-[11px] opacity-75">{dataHora(mensagem.enviadaEm)}</p>
      </div>
    </div>
  );
}

function CampoDeMensagem({
  pacienteId,
  bloqueio,
}: {
  pacienteId: Id<'pacientes'>;
  bloqueio: string | null;
}) {
  const enviar = useMutation(api.equipe.enviarMensagem);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (bloqueio) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {bloqueio}
      </p>
    );
  }

  const aoEnviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const { situacao } = await enviar({ pacienteId, texto });
      setTexto('');
      if (situacao === 'enviada') {
        toast.success('Mensagem enviada pelo WhatsApp.');
      } else {
        toast.info(
          'Ela não escreve há mais de 24 horas. A mensagem ficou guardada e ela recebeu um aviso; quando responder, a mensagem chega.'
        );
      }
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={aoEnviar} className="space-y-2">
      <Textarea
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder="Escreva para a paciente..."
        aria-label="Mensagem para a paciente"
        rows={3}
        maxLength={3000}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Ela recebe no WhatsApp com o seu nome e a sua função no começo.
        </p>
        <Button type="submit" disabled={enviando || !texto.trim()}>
          <Send className="mr-2 h-4 w-4" aria-hidden />
          {enviando ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    </form>
  );
}
