import { createFileRoute } from '@tanstack/react-router';
import { FilaPage } from '@/pages/fila';

type BuscaDaFila = { filtro?: 'risco' | 'nao_entendeu' };

export const Route = createFileRoute('/_authenticated/')({
  // "?filtro=risco" or "?filtro=nao_entendeu" opens the queue already filtered.
  validateSearch: (busca: Record<string, unknown>): BuscaDaFila =>
    busca.filtro === 'risco' || busca.filtro === 'nao_entendeu' ? { filtro: busca.filtro } : {},
  component: FilaPage,
});
