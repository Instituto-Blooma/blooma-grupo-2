import { ConvexError } from 'convex/values';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Prioridade = 'urgente' | 'alta' | 'moderada' | 'baixa';
export type SituacaoCaso = 'aguardando' | 'em_atendimento' | 'concluido';
export type TipoAlerta = 'resposta_de_risco' | 'palavra_de_risco' | 'robo_nao_entendeu';

const PRIORIDADES: Record<Prioridade, { rotulo: string; classe: string }> = {
  urgente: {
    rotulo: 'Urgente',
    classe: 'bg-pessego text-laranja-escuro border-laranja-claro',
  },
  alta: {
    rotulo: 'Alta',
    classe: 'bg-lavanda-clara text-roxo-escuro border-lavanda-clara',
  },
  moderada: {
    rotulo: 'Moderada',
    classe: 'bg-white text-roxo-escuro border-lavanda',
  },
  baixa: {
    rotulo: 'Baixa',
    classe: 'bg-azul-clarinho text-azul-profundo border-azul-clarinho',
  },
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
    : {
        rotulo: 'Sem pontuação',
        classe: 'bg-white text-azul-medio border-azul-clarinho',
      };
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
  resposta_de_risco: 'Pergunta 9 do PHQ-9: resposta de risco',
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
  risco: 'border-pessego bg-pessego text-laranja-escuro',
  nao_entendeu: 'border-azul-clarinho bg-azul-clarinho text-azul-profundo',
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

/** "DT 7 · GAD-7 12 · PHQ-9 15" (only the scales she answered). */
export function resumoDasNotas(notas: { dt?: number; gad7?: number; phq9?: number }) {
  return [
    notas.dt !== undefined ? `DT ${notas.dt}` : null,
    notas.gad7 !== undefined ? `GAD-7 ${notas.gad7}` : null,
    notas.phq9 !== undefined ? `PHQ-9 ${notas.phq9}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "1 ponto", "0 pontos", "9 pontos". */
export function pontos(quantidade: number) {
  return `${quantidade} ${quantidade === 1 ? 'ponto' : 'pontos'}`;
}

export function mensagemDeErro(erro: unknown) {
  if (erro instanceof ConvexError && typeof erro.data === 'string') return erro.data;
  return 'Algo deu errado. Tente de novo.';
}
