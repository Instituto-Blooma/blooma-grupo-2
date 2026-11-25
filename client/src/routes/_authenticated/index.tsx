import { createFileRoute } from '@tanstack/react-router';
import { FilaPage } from '@/pages/fila';

export const Route = createFileRoute('/_authenticated/')({
  component: FilaPage,
});
