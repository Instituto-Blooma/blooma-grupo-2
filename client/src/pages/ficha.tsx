import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { AlertTriangle, ArrowLeft, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, Aviso } from '@/components/equipe/app-shell';
import { Conversa } from '@/components/equipe/conversa';
import {
  dataHora,
  formatarTelefone,
  mensagemDeErro,
  nomeDaPaciente,
  pontos,
  ROTULO_SITUACAO,
  categoriaDoAlerta,
  SeloAlerta,
  SeloPrioridade,
} from '@/components/equipe/formato';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type Ficha = NonNullable<FunctionReturnType<typeof api.equipe.ficha>>;
type Checkin = FunctionReturnType<typeof api.equipe.listarCheckins>['page'][number];

const CHECKINS_POR_PAGINA = 5;

export function FichaPage({ pacienteId }: { pacienteId: Id<'pacientes'> }) {
  return <AppShell>{() => <ConteudoFicha pacienteId={pacienteId} />}</AppShell>;
}

function ConteudoFicha({ pacienteId }: { pacienteId: Id<'pacientes'> }) {
  const ficha = useQuery(api.equipe.ficha, { pacienteId });
  if (ficha === undefined) return <Aviso>Carregando...</Aviso>;
  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar para a fila
      </Link>
      <CabecalhoFicha ficha={ficha} pacienteId={pacienteId} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <AlertasCard ficha={ficha} />
          <CheckinsCard pacienteId={pacienteId} />
        </div>
        <div className="space-y-6">
          <Conversa
            pacienteId={pacienteId}
            nomeDaPaciente={ficha.linha.apelido ?? nomeDaPaciente(ficha.linha)}
            bloqueio={bloqueioDaConversa(ficha)}
          />
          <CadastroCard ficha={ficha} pacienteId={pacienteId} />
          <HistoricoDoCasoCard ficha={ficha} />
        </div>
      </div>
    </div>
  );
}

function CabecalhoFicha({ ficha, pacienteId }: { ficha: Ficha; pacienteId: Id<'pacientes'> }) {
  const { linha } = ficha;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-3xl sm:text-4xl">{nomeDaPaciente(linha)}</h1>
        {linha.apelido && linha.nomeCompleto ? (
          <span className="text-muted-foreground">({linha.apelido})</span>
        ) : null}
        <SeloPrioridade prioridade={linha.prioridade} />
      </div>
      <p className="text-sm text-muted-foreground">
        {formatarTelefone(linha.telefone)} ·{' '}
        {linha.naFila && linha.situacaoCaso
          ? `${ROTULO_SITUACAO[linha.situacaoCaso]}${linha.responsavel ? ` com ${linha.responsavel}` : ''}`
          : 'Sem caso aberto'}
      </p>
      <BotoesDoCaso ficha={ficha} pacienteId={pacienteId} />
      <PedidoDeExclusao ficha={ficha} pacienteId={pacienteId} />
    </div>
  );
}

function bloqueioDaConversa(ficha: Ficha) {
  if (ficha.linha.exclusaoPedida) {
    return 'Ela pediu para apagar os dados: não é possível mandar mensagens.';
  }
  if (!ficha.linha.aceitouTermo) {
    return 'Ela ainda não aceitou o termo de consentimento: não é possível mandar mensagens.';
  }
  return null;
}

/** "Assumir caso" and "Concluir caso". */
function BotoesDoCaso({ ficha, pacienteId }: { ficha: Ficha; pacienteId: Id<'pacientes'> }) {
  const assumir = useMutation(api.equipe.assumirCaso);
  const concluir = useMutation(api.equipe.concluirCaso);
  const [ocupado, setOcupado] = useState(false);
  const { linha } = ficha;
  const podeAssumir = !linha.naFila || !ficha.souResponsavel;

  const executar = async (acao: () => Promise<null>, sucesso: string) => {
    setOcupado(true);
    try {
      await acao();
      toast.success(sucesso);
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    } finally {
      setOcupado(false);
    }
  };

  const confirmarConclusao = () => {
    if (
      window.confirm(
        'Concluir este caso? Ela sai da fila. Se ela tiver um novo check-in ou alerta, um caso novo é aberto.'
      )
    ) {
      void executar(() => concluir({ pacienteId }), 'Caso concluído.');
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {podeAssumir ? (
        <Button
          onClick={() => executar(() => assumir({ pacienteId }), 'Você assumiu o caso.')}
          disabled={ocupado}
        >
          {linha.naFila && linha.responsavel ? 'Assumir no lugar' : 'Assumir caso'}
        </Button>
      ) : null}
      {linha.naFila ? (
        <Button variant="outline" onClick={confirmarConclusao} disabled={ocupado}>
          Concluir caso
        </Button>
      ) : null}
    </div>
  );
}

function PedidoDeExclusao({ ficha, pacienteId }: { ficha: Ficha; pacienteId: Id<'pacientes'> }) {
  const apagar = useMutation(api.pacientes.apagarDadosDaPaciente);
  const navegar = useNavigate();
  if (!ficha.linha.exclusaoPedida) return null;
  const confirmar = async () => {
    if (
      !window.confirm(
        'Apagar todos os dados desta paciente? Isso apaga o cadastro, a conversa, os check-ins e os alertas, e não pode ser desfeito.'
      )
    ) {
      return;
    }
    try {
      await apagar({ pacienteId });
      toast.success('Dados apagados.');
      await navegar({ to: '/pacientes' });
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-marca-laranja-base bg-marca-laranja-claro p-4 text-sm text-marca-titulo">
      <p>Ela pediu pelo WhatsApp para apagar os dados.</p>
      <Button variant="destructive" size="sm" onClick={confirmar}>
        Apagar os dados dela
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

function AlertasCard({ ficha }: { ficha: Ficha }) {
  const deRisco = ficha.alertas.filter((alerta) => categoriaDoAlerta(alerta.tipo) === 'risco');
  const naoEntendidos = ficha.alertas.filter(
    (alerta) => categoriaDoAlerta(alerta.tipo) === 'nao_entendeu'
  );
  // Risk words written before the sign-up existed are only in the hospital-wide crisis list.
  const riscoAntigo = deRisco.length === 0 ? ficha.alertasDeCrise : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas</CardTitle>
        <CardDescription>
          Separados em dois tipos: sinal de risco real e respostas que o robô não entendeu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-marca-laranja-escuro dark:text-marca-laranja-base">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Sinais de risco
          </h3>
          {deRisco.length === 0 && riscoAntigo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum sinal de risco.</p>
          ) : (
            <ul className="space-y-2">
              {deRisco.map((alerta) => (
                <LinhaAlerta key={alerta._id} tipo={alerta.tipo} em={alerta.criadoEm} />
              ))}
              {riscoAntigo.map((momento) => (
                <LinhaAlerta key={momento} tipo="palavra_de_risco" em={momento} />
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-marca-azul-escuro dark:text-marca-azul-base">
            <HelpCircle className="h-4 w-4" aria-hidden />
            Respostas que o robô não entendeu
          </h3>
          {naoEntendidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {naoEntendidos.map((alerta) => (
                  <LinhaAlerta key={alerta._id} tipo={alerta.tipo} em={alerta.criadoEm} />
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                O que ela escreveu está na conversa. O check-in parou ali; continue pela conversa.
              </p>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function LinhaAlerta({ tipo, em }: { tipo: Parameters<typeof categoriaDoAlerta>[0]; em: number }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <SeloAlerta tipo={tipo} />
      <span className="text-xs text-muted-foreground">{dataHora(em)}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

function CheckinsCard({ pacienteId }: { pacienteId: Id<'pacientes'> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.equipe.listarCheckins,
    { pacienteId },
    { initialNumItems: CHECKINS_POR_PAGINA }
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check-ins</CardTitle>
        <CardDescription>
          Respostas e pontos de cada check-in, do mais recente para o mais antigo. A prioridade vem
          de uma regra fixa: qualquer resposta de risco deixa o caso urgente; sem risco, a soma dos
          pontos decide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'LoadingFirstPage' ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum check-in ainda.</p>
        ) : (
          results.map((checkin) => <CheckinItem key={checkin._id} checkin={checkin} />)
        )}
        {status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadMore(CHECKINS_POR_PAGINA)}
            disabled={status === 'LoadingMore'}
          >
            Ver check-ins mais antigos
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

const ROTULO_SITUACAO_CHECKIN: Record<Checkin['situacao'], string> = {
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  interrompido: 'Interrompido',
};

const ROTULO_INTERRUPCAO: Record<NonNullable<Checkin['motivoInterrupcao']>, string> = {
  sem_resposta: 'ela não terminou de responder',
  palavra_de_risco: 'ela escreveu uma palavra de risco',
  robo_nao_entendeu: 'o robô não entendeu as respostas',
};

function CheckinItem({ checkin }: { checkin: Checkin }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            {dataHora(checkin.iniciadoEm)} ·{' '}
            {checkin.motivo === 'semanal' ? 'Check-in semanal' : 'Primeiro check-in'}
          </p>
          <p className="text-xs text-muted-foreground">
            {ROTULO_SITUACAO_CHECKIN[checkin.situacao]}
            {checkin.motivoInterrupcao
              ? `: ${ROTULO_INTERRUPCAO[checkin.motivoInterrupcao]}`
              : ''}{' '}
            · {checkin.escalaNome}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {checkin.pontuacao} de {pontos(checkin.pontuacaoMaxima)}
          </span>
          {checkin.prioridade ? <SeloPrioridade prioridade={checkin.prioridade} /> : null}
        </div>
      </div>
      {checkin.escalaExemplo ? (
        <p className="rounded-md bg-marca-lavanda-claro px-3 py-2 text-xs text-marca-lavanda-escuro">
          Escala de EXEMPLO, ainda não validada pela equipe de psicologia. Use a pontuação só como
          teste.
        </p>
      ) : null}
      {checkin.respostas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma resposta.</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {checkin.respostas.map((resposta, indice) => (
            <li
              key={resposta.perguntaId}
              className={cn(
                'flex items-start justify-between gap-3 rounded-md px-2 py-1',
                resposta.risco && 'bg-marca-laranja-claro text-marca-marinho'
              )}
            >
              <span>
                <span className="text-muted-foreground">{indice + 1}. </span>
                {resposta.perguntaTexto}
                <br />
                <span className="font-medium">{resposta.opcaoTitulo}</span>
                {resposta.risco ? (
                  <span className="ml-2 text-xs font-semibold text-marca-laranja-escuro">
                    resposta de risco
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {resposta.pontos} pt
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign-up data and case history
// ---------------------------------------------------------------------------

const ROTULO_ETAPA: Record<NonNullable<Ficha['etapaCadastro']>, string> = {
  nome: 'o robô está esperando o nome completo',
  apelido: 'o robô está esperando como ela gosta de ser chamada',
  prontuario: 'o robô está esperando o número do prontuário',
};

function CadastroCard({ ficha, pacienteId }: { ficha: Ficha; pacienteId: Id<'pacientes'> }) {
  const [editando, setEditando] = useState(false);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Cadastro</CardTitle>
          <CardDescription>Respondido por ela no WhatsApp. A equipe pode corrigir.</CardDescription>
        </div>
        {!editando ? (
          <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
            Corrigir
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {editando ? (
          <EditarCadastro
            ficha={ficha}
            pacienteId={pacienteId}
            aoTerminar={() => setEditando(false)}
          />
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Campo nome="Nome completo">{ficha.linha.nomeCompleto ?? '—'}</Campo>
            <Campo nome="Como gosta de ser chamada">{ficha.linha.apelido ?? '—'}</Campo>
            <Campo nome="Prontuário">{ficha.prontuario ?? 'Não informado'}</Campo>
            <Campo nome="Telefone">{formatarTelefone(ficha.linha.telefone)}</Campo>
            <Campo nome="Termo">
              {ficha.linha.aceitouTermo && ficha.consentimentoEm
                ? `Aceito em ${dataHora(ficha.consentimentoEm)}`
                : 'Ainda não aceitou a versão atual'}
            </Campo>
            {ficha.etapaCadastro ? (
              <Campo nome="Cadastro">Incompleto: {ROTULO_ETAPA[ficha.etapaCadastro]}</Campo>
            ) : null}
            <Campo nome="Primeiro contato">{dataHora(ficha.linha.criadaEm)}</Campo>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Campo({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{nome}</dt>
      <dd>{children}</dd>
    </>
  );
}

function EditarCadastro({
  ficha,
  pacienteId,
  aoTerminar,
}: {
  ficha: Ficha;
  pacienteId: Id<'pacientes'>;
  aoTerminar: () => void;
}) {
  const editar = useMutation(api.equipe.editarCadastro);
  const [nomeCompleto, setNomeCompleto] = useState(ficha.linha.nomeCompleto ?? '');
  const [apelido, setApelido] = useState(ficha.linha.apelido ?? '');
  const [prontuario, setProntuario] = useState(ficha.prontuario ?? '');
  const [salvando, setSalvando] = useState(false);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      await editar({ pacienteId, nomeCompleto, apelido, prontuario });
      toast.success('Cadastro corrigido.');
      aoTerminar();
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="cadastro-nome">Nome completo</Label>
        <Input
          id="cadastro-nome"
          value={nomeCompleto}
          onChange={(evento) => setNomeCompleto(evento.target.value)}
          maxLength={120}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cadastro-apelido">Como gosta de ser chamada</Label>
        <Input
          id="cadastro-apelido"
          value={apelido}
          onChange={(evento) => setApelido(evento.target.value)}
          maxLength={40}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cadastro-prontuario">Número do prontuário</Label>
        <Input
          id="cadastro-prontuario"
          value={prontuario}
          onChange={(evento) => setProntuario(evento.target.value)}
          maxLength={30}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={aoTerminar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function HistoricoDoCasoCard({ ficha }: { ficha: Ficha }) {
  if (ficha.eventos.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico do caso</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {ficha.eventos.map((evento) => (
            <li key={evento._id} className="flex flex-wrap justify-between gap-2">
              <span>
                {evento.quem} {evento.tipo === 'assumiu' ? 'assumiu o caso' : 'concluiu o caso'}
              </span>
              <span className="text-xs text-muted-foreground">{dataHora(evento.em)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
