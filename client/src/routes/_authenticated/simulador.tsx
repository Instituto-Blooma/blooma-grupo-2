import { createFileRoute } from '@tanstack/react-router';
import { SimuladorPage } from '@/pages/simulador';

export const Route = createFileRoute('/_authenticated/simulador')({
  component: SimuladorPage,
});
