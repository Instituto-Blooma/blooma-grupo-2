import { createFileRoute } from '@tanstack/react-router';
import { AvisosPage } from '@/pages/avisos';

export const Route = createFileRoute('/_authenticated/avisos')({
  component: AvisosPage,
});
