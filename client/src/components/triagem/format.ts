import { format, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatDateTime(ms: number) {
  return format(ms, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatShortDate(ms: number) {
  return format(ms, 'dd/MM', { locale: ptBR });
}

export function formatAgo(ms: number) {
  return `há ${formatDistanceToNowStrict(ms, { locale: ptBR })}`;
}
