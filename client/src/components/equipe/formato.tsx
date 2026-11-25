import { ConvexError } from 'convex/values';
import { AlertTriangle, HelpCircle } from 'lucide-react';
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

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  urgente: PRIORIDADES.urgente.rotulo,
  alta: PRIORIDADES.alta.rotulo,
  moderada: PRIORIDADES.moderada.rotulo,
  baixa: PRIORIDADES.baixa.rotulo,
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

/** Two kinds of alert: real risk (red) and "the bot did not understand her" (grey). */
export type CategoriaAlerta = 'risco' | 'nao_entendeu';

export const ROTULO_CATEGORIA: Record<CategoriaAlerta, string> = {
  risco: 'Sinal de risco',
  nao_entendeu: 'Robô não entendeu',
};

export function categoriaDoAlerta(tipo: TipoAlerta): CategoriaAlerta {
  return tipo === 'robo_nao_entendeu' ? 'nao_entendeu' : 'risco';
}

export const CLASSE_CATEGORIA: Record<CategoriaAlerta, string> = {
  risco: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  nao_entendeu: 'border-slate-300 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
};

/** With `tipo`, shows the detail ("Resposta de risco no check-in"); else the category name. */
export function SeloAlerta({
  categoria,
  tipo,
}: {
  categoria?: CategoriaAlerta;
  tipo?: TipoAlerta;
}) {
  const qual = categoria ?? (tipo ? categoriaDoAlerta(tipo) : 'risco');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        CLASSE_CATEGORIA[qual]
      )}
    >
      {qual === 'risco' ? (
        <AlertTriangle className="h-3 w-3" aria-hidden />
      ) : (
        <HelpCircle className="h-3 w-3" aria-hidden />
      )}
      {tipo ? ROTULO_ALERTA[tipo] : ROTULO_CATEGORIA[qual]}
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
