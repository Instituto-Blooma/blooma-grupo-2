import { ConvexError } from 'convex/values';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Prioridade = 'urgente' | 'alta' | 'moderada' | 'baixa';
export type SituacaoCaso = 'aguardando' | 'em_atendimento' | 'concluido';
export type TipoAlerta = 'resposta_de_risco' | 'palavra_de_risco' | 'robo_nao_entendeu';

const PRIORIDADES: Record<Prioridade, { rotulo: string; classe: string }> = {
  urgente: { rotulo: 'Urgente', classe: 'bg-red-600 text-white border-red-700' },
  alta: { rotulo: 'Alta', classe: 'bg-orange-100 text-orange-900 border-orange-300' },
  moderada: { rotulo: 'Moderada', classe: 'bg-amber-50 text-amber-900 border-amber-300' },
  baixa: { rotulo: 'Baixa', classe: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
};

export function SeloPrioridade({ prioridade }: { prioridade: Prioridade | null }) {
  const dados = prioridade
    ? PRIORIDADES[prioridade]
    : { rotulo: 'Sem pontuação', classe: 'bg-muted text-muted-foreground border-border' };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold',
        dados.classe
      )}
    >
      {dados.rotulo}
    </span>
  );
}

export const ROTULO_SITUACAO: Record<SituacaoCaso, string> = {
  aguardando: 'Aguardando a equipe',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
};

export const ROTULO_ALERTA: Record<TipoAlerta, string> = {
  resposta_de_risco: 'Resposta de risco no check-in',
  palavra_de_risco: 'Escreveu uma palavra de risco',
  robo_nao_entendeu: 'O robô não entendeu as respostas',
};

export function SeloAlerta({ tipo }: { tipo: TipoAlerta }) {
  const grave = tipo !== 'robo_nao_entendeu';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        grave
          ? 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
          : 'border-slate-300 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200'
      )}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {ROTULO_ALERTA[tipo]}
    </span>
  );
}

export function nomeDaPaciente(paciente: {
  apelido: string | null;
  nomeCompleto: string | null;
  telefone: string;
}) {
  return paciente.nomeCompleto ?? paciente.apelido ?? formatarTelefone(paciente.telefone);
}

/** "5511999998888" → "+55 11 99999-8888". */
export function formatarTelefone(telefone: string) {
  const correspondencia = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(telefone);
  if (!correspondencia) return `+${telefone}`;
  const [, ddd, inicio, fim] = correspondencia;
  return `+55 ${ddd} ${inicio}-${fim}`;
}

const formatoDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});
const formatoData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

export function dataHora(momento: number) {
  return formatoDataHora.format(new Date(momento));
}

export function data(momento: number) {
  return formatoData.format(new Date(momento));
}

export function mensagemDeErro(erro: unknown) {
  if (erro instanceof ConvexError && typeof erro.data === 'string') return erro.data;
  return 'Algo deu errado. Tente de novo.';
}
