import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { AlertTriangle, Bell, CheckCheck, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, type Hospital } from '@/components/equipe/app-shell';
import {
  data,
  dataHora,
  mensagemDeErro,
  nomeDaPaciente,
  pontos,
  SeloPrioridade,
} from '@/components/equipe/formato';
import { LinhasPacientes } from '@/components/equipe/linhas-pacientes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '../../../convex/_generated/api';

const POR_PAGINA = 25;
const AVISOS_POR_PAGINA = 10;

type Filtro = 'todos' | 'risco' | 'nao_entendeu';
type Contagem = { total: number; mais: boolean };

function numero(contagem: Contagem | undefined) {
  if (!contagem) return '…';
  return contagem.mais ? `${contagem.total}+` : String(contagem.total);
}

export function FilaPage() {
  return <AppShell secao="fila">{(hospital) => <Fila hospital={hospital} />}</AppShell>;
}

function Fila({ hospital }: { hospital: Hospital }) {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const resumo = useQuery(api.equipe.resumoDaFila, { organizationId: hospital.organizationId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.equipe.fila,
    { organizationId: hospital.organizationId, filtro },
    { initialNumItems: POR_PAGINA }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Fila</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Casos abertos, do mais urgente para o menos urgente. Na mesma prioridade, quem espera há
          mais tempo vem antes.
        </p>
      </div>

      <AlertasDaFila resumo={resumo} aoEscolher={setFiltro} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar a fila">
            <BotaoFiltro ativo={filtro === 'todos'} aoClicar={() => setFiltro('todos')}>
              Todos os casos
            </BotaoFiltro>
            <BotaoFiltro ativo={filtro === 'risco'} aoClicar={() => setFiltro('risco')}>
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Sinal de risco ({numero(resumo?.risco)})
            </BotaoFiltro>
            <BotaoFiltro
              ativo={filtro === 'nao_entendeu'}
              aoClicar={() => setFiltro('nao_entendeu')}
            >
              <HelpCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Robô não entendeu ({numero(resumo?.naoEntendeu)})
            </BotaoFiltro>
          </div>
          <LinhasPacientes
            linhas={results}
            status={status}
            carregarMais={() => loadMore(POR_PAGINA)}
            vazio={
              filtro === 'risco'
                ? 'Nenhum caso aberto com sinal de risco.'
                : filtro === 'nao_entendeu'
                  ? 'Nenhum caso aberto em que o robô não entendeu as respostas.'
                  : 'Nenhum caso aberto agora. Check-ins com prioridade urgente, alta ou moderada aparecem aqui.'
            }
            mostrarCaso="fila"
          />
        </div>
        <Avisos hospital={hospital} naoVistos={resumo?.avisosNaoVistos} />
      </div>
    </div>
  );
}

function BotaoFiltro({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={ativo ? 'default' : 'outline'}
      size="sm"
      onClick={aoClicar}
      aria-pressed={ativo}
    >
      {children}
    </Button>
  );
}

/** Red banner for real risk, grey banner for "the bot did not understand". */
function AlertasDaFila({
  resumo,
  aoEscolher,
}: {
  resumo: { risco: Contagem; naoEntendeu: Contagem } | undefined;
  aoEscolher: (filtro: Filtro) => void;
}) {
  if (!resumo || (resumo.risco.total === 0 && resumo.naoEntendeu.total === 0)) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {resumo.risco.total > 0 ? (
        <button
          type="button"
          onClick={() => aoEscolher('risco')}
          className="flex items-start gap-3 rounded-lg border-2 border-marca-laranja-base bg-marca-laranja-claro p-4 text-left text-marca-titulo hover:border-marca-laranja-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>
            <span className="block font-subtitulo text-lg font-semibold">
              {numero(resumo.risco)}{' '}
              {resumo.risco.total === 1
                ? 'paciente com sinal de risco'
                : 'pacientes com sinal de risco'}
            </span>
            <span className="text-sm">
              Escolheram uma resposta de risco no check-in ou escreveram uma palavra de risco.
              Clique para ver.
            </span>
          </span>
        </button>
      ) : null}
      {resumo.naoEntendeu.total > 0 ? (
        <button
          type="button"
          onClick={() => aoEscolher('nao_entendeu')}
          className="flex items-start gap-3 rounded-lg border-2 border-marca-azul-base bg-marca-azul-claro p-4 text-left text-marca-titulo hover:border-marca-azul-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>
            <span className="block font-subtitulo text-lg font-semibold">
              {numero(resumo.naoEntendeu)}{' '}
              {resumo.naoEntendeu.total === 1
                ? 'paciente que o robô não entendeu'
                : 'pacientes que o robô não entendeu'}
            </span>
            <span className="text-sm">
              Responderam 3 vezes seguidas algo que o robô não reconheceu. Alguém da equipe precisa
              continuar a conversa. Clique para ver.
            </span>
          </span>
        </button>
      ) : null}
    </div>
  );
}

/** Low-priority check-ins: no case, only a notice ("Fulana concluiu o check-in…"). */
function Avisos({ hospital, naoVistos }: { hospital: Hospital; naoVistos: Contagem | undefined }) {
  const [verVistos, setVerVistos] = useState(false);
  const { results, status, loadMore } = usePaginatedQuery(
    api.equipe.avisos,
    { organizationId: hospital.organizationId, vistos: verVistos },
    { initialNumItems: AVISOS_POR_PAGINA }
  );
  const marcar = useMutation(api.equipe.marcarAvisoComoVisto);
  const marcarTodos = useMutation(api.equipe.marcarTodosOsAvisosComoVistos);

  const executar = async (acao: () => Promise<null>) => {
    try {
      await acao();
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    }
  };

  return (
    <Card className="h-fit border-marca-menta-base bg-marca-menta-claro text-marca-marinho dark:border-border dark:bg-card dark:text-card-foreground">
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-4 w-4" aria-hidden />
          Avisos
          {naoVistos && naoVistos.total > 0 ? (
            <span className="rounded-full bg-marca-menta-escuro px-2 py-0.5 font-sans text-xs text-white">
              {numero(naoVistos)}
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          Check-ins com prioridade baixa. Não abrem caso, porque não há nada a resolver, mas as
          respostas ficam na ficha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={verVistos ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => setVerVistos(false)}
          >
            Novos
          </Button>
          <Button
            variant={verVistos ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setVerVistos(true)}
          >
            Já vistos
          </Button>
          {!verVistos && results.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                executar(() => marcarTodos({ organizationId: hospital.organizationId }))
              }
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Marcar todos como vistos
            </Button>
          ) : null}
        </div>
        {status === 'LoadingFirstPage' ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {verVistos ? 'Nenhum aviso visto ainda.' : 'Nenhum aviso novo.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((aviso) => (
              <li
                key={aviso._id}
                className={cn(
                  'space-y-2 rounded-lg border border-marca-menta-base bg-white p-3 text-sm text-marca-marinho dark:border-border dark:bg-background dark:text-foreground',
                  verVistos && 'opacity-80'
                )}
              >
                <p>
                  <span className="font-semibold">{nomeDaPaciente(aviso)}</span> concluiu o check-in
                  às {horaDe(aviso.concluidoEm)} do dia {data(aviso.concluidoEm)}. A classificação
                  da prioridade é <SeloPrioridade prioridade="baixa" />
                  {aviso.pontuacao !== null && aviso.pontuacaoMaxima !== null
                    ? ` (${aviso.pontuacao} de ${pontos(aviso.pontuacaoMaxima)}).`
                    : '.'}
                </p>
                {aviso.vistoPor && aviso.vistoEm ? (
                  <p className="text-xs text-muted-foreground">
                    Visto por {aviso.vistoPor} em {dataHora(aviso.vistoEm)}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link to="/pacientes/$pacienteId" params={{ pacienteId: aviso.pacienteId }}>
                    <Button variant="outline" size="sm">
                      Ver respostas
                    </Button>
                  </Link>
                  {!verVistos ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => executar(() => marcar({ avisoId: aviso._id }))}
                    >
                      Marcar como visto
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadMore(AVISOS_POR_PAGINA)}
            disabled={status === 'LoadingMore'}
          >
            Mostrar mais avisos
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

const formatoHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

function horaDe(momento: number) {
  return formatoHora.format(new Date(momento));
}
