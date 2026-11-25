import type { ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { AppShell, type Hospital } from '@/components/equipe/app-shell';
import { LinhasPacientes } from '@/components/equipe/linhas-pacientes';
import { Button } from '@/components/ui/button';
import { api } from '../../../convex/_generated/api';

const POR_PAGINA = 25;

type Filtro = 'todos' | 'risco' | 'nao_entendeu';
type Contagem = { total: number; mais: boolean };

function numero(contagem: Contagem | undefined) {
  if (!contagem) return '…';
  return contagem.mais ? `${contagem.total}+` : String(contagem.total);
}

export function FilaPage() {
  const { filtro } = useSearch({ from: '/_authenticated/' });
  const secao =
    filtro === 'risco' ? 'urgentes' : filtro === 'nao_entendeu' ? 'nao_entendeu' : 'fila';
  return (
    <AppShell secao={secao}>
      {(hospital) => <Fila hospital={hospital} filtro={filtro ?? 'todos'} />}
    </AppShell>
  );
}

function Fila({ hospital, filtro }: { hospital: Hospital; filtro: Filtro }) {
  const navegar = useNavigate();
  const setFiltro = (novo: Filtro) =>
    void navegar({ to: '/', search: novo === 'todos' ? {} : { filtro: novo } });
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

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar a fila">
          <BotaoFiltro ativo={filtro === 'todos'} aoClicar={() => setFiltro('todos')}>
            Todos os casos
          </BotaoFiltro>
          <BotaoFiltro ativo={filtro === 'risco'} aoClicar={() => setFiltro('risco')}>
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Sinal de risco ({numero(resumo?.risco)})
          </BotaoFiltro>
          <BotaoFiltro ativo={filtro === 'nao_entendeu'} aoClicar={() => setFiltro('nao_entendeu')}>
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
  children: ReactNode;
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
