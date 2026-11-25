import { Link } from '@tanstack/react-router';
import type { FunctionReturnType } from 'convex/server';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '../../../../convex/_generated/api';
import {
  data,
  formatarTelefone,
  nomeDaPaciente,
  ROTULO_PRIORIDADE,
  ROTULO_SITUACAO,
  SeloAlerta,
  SeloPrioridade,
} from './formato';

export type LinhaPaciente = FunctionReturnType<typeof api.equipe.fila>['page'][number];

/** One clickable row per patient, used by the queue and by the list of all patients. */
export function LinhasPacientes({
  linhas,
  status,
  carregarMais,
  vazio,
  mostrarCaso,
}: {
  linhas: LinhaPaciente[];
  status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
  carregarMais: () => void;
  vazio: string;
  /** In the list of all patients, closed cases show "Sem caso aberto". */
  mostrarCaso: 'fila' | 'lista';
}) {
  if (status === 'LoadingFirstPage') {
    return <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>;
  }
  if (linhas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {vazio}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {linhas.map((linha, indice) => (
          <li key={linha._id}>
            <Link
              to="/pacientes/$pacienteId"
              params={{ pacienteId: linha._id }}
              className="flex items-center gap-3 p-4 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
            >
              {mostrarCaso === 'fila' ? (
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {indice + 1}
                </span>
              ) : null}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{nomeDaPaciente(linha)}</span>
                  {linha.apelido && linha.nomeCompleto ? (
                    <span className="text-sm text-muted-foreground">({linha.apelido})</span>
                  ) : null}
                  {linha.naFila || mostrarCaso === 'fila' ? (
                    <SeloPrioridade prioridade={linha.prioridade} />
                  ) : null}
                  {linha.casoComRisco ? <SeloAlerta categoria="risco" /> : null}
                  {linha.casoNaoEntendido ? <SeloAlerta categoria="nao_entendeu" /> : null}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatarTelefone(linha.telefone)}</span>
                  {linha.ultimaPontuacao !== null && linha.ultimoCheckinEm !== null ? (
                    <span>
                      Último check-in: {data(linha.ultimoCheckinEm)} · {linha.ultimaPontuacao}{' '}
                      pontos
                      {linha.ultimaPrioridade
                        ? ` · prioridade ${ROTULO_PRIORIDADE[linha.ultimaPrioridade].toLowerCase()}`
                        : ''}
                    </span>
                  ) : (
                    <span>Sem check-in concluído</span>
                  )}
                  {linha.checkinEmAndamento ? <span>Check-in em andamento</span> : null}
                  {!linha.aceitouTermo ? <span>Ainda não aceitou o termo</span> : null}
                  {linha.aceitouTermo && !linha.cadastroCompleto ? (
                    <span>Cadastro incompleto</span>
                  ) : null}
                  {linha.exclusaoPedida ? (
                    <span className="font-medium text-red-700 dark:text-red-300">
                      Pediu para apagar os dados
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="hidden shrink-0 text-right text-xs sm:block">
                {linha.naFila && linha.situacaoCaso ? (
                  <>
                    <p className="font-medium">{ROTULO_SITUACAO[linha.situacaoCaso]}</p>
                    {linha.responsavel ? (
                      <p className="text-muted-foreground">{linha.responsavel}</p>
                    ) : null}
                    {linha.naFilaDesde ? (
                      <p className="text-muted-foreground">
                        Na fila desde {data(linha.naFilaDesde)}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">Sem caso aberto</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {status === 'CanLoadMore' || status === 'LoadingMore' ? (
        <div className="text-center">
          <Button variant="outline" onClick={carregarMais} disabled={status === 'LoadingMore'}>
            {status === 'LoadingMore' ? 'Carregando...' : 'Mostrar mais'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
