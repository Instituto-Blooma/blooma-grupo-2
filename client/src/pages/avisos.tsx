import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, type Hospital } from '@/components/equipe/app-shell';
import {
  data,
  dataHora,
  mensagemDeErro,
  nomeDaPaciente,
  pontos,
  resumoDasNotas,
  SeloPrioridade,
} from '@/components/equipe/formato';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '../../../convex/_generated/api';

const POR_PAGINA = 20;
const formatoHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function AvisosPage() {
  return <AppShell secao="avisos">{(hospital) => <Avisos hospital={hospital} />}</AppShell>;
}

/** Low-priority check-ins: no case is opened, only a notice ("Fulana concluiu o check-in…"). */
function Avisos({ hospital }: { hospital: Hospital }) {
  const [verVistos, setVerVistos] = useState(false);
  const { results, status, loadMore } = usePaginatedQuery(
    api.equipe.avisos,
    { organizationId: hospital.organizationId, vistos: verVistos },
    { initialNumItems: POR_PAGINA }
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
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Avisos</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Check-ins com prioridade baixa. Eles não abrem caso, porque não há nada a resolver, mas as
          respostas ficam na ficha da paciente.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={verVistos ? 'outline' : 'default'}
          size="sm"
          onClick={() => setVerVistos(false)}
          aria-pressed={!verVistos}
        >
          Novos
        </Button>
        <Button
          variant={verVistos ? 'default' : 'outline'}
          size="sm"
          onClick={() => setVerVistos(true)}
          aria-pressed={verVistos}
        >
          Já vistos
        </Button>
        {!verVistos && results.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => executar(() => marcarTodos({ organizationId: hospital.organizationId }))}
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Marcar todos como vistos
          </Button>
        ) : null}
      </div>

      {status === 'LoadingFirstPage' ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {verVistos ? 'Nenhum aviso visto ainda.' : 'Nenhum aviso novo.'}
        </p>
      ) : (
        <ul className="max-w-3xl divide-y overflow-hidden rounded-xl border bg-card">
          {results.map((aviso) => (
            <li key={aviso._id} className={cn('space-y-3 p-4 text-sm', verVistos && 'opacity-80')}>
              <p className="leading-relaxed">
                <span className="font-semibold">{nomeDaPaciente(aviso)}</span> concluiu o check-in
                às {formatoHora.format(new Date(aviso.concluidoEm))} do dia{' '}
                {data(aviso.concluidoEm)}. A classificação da prioridade é{' '}
                <SeloPrioridade prioridade="baixa" />
                {aviso.notas
                  ? ` (${resumoDasNotas(aviso.notas)}${aviso.notas.gadPhqNaoAplicados ? '; GAD-7 e PHQ-9 não aplicados' : ''}).`
                  : aviso.pontuacao !== null && aviso.pontuacaoMaxima !== null
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
          onClick={() => loadMore(POR_PAGINA)}
          disabled={status === 'LoadingMore'}
        >
          Mostrar mais avisos
        </Button>
      ) : null}
    </div>
  );
}
