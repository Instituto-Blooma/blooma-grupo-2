import { createFileRoute } from '@tanstack/react-router';
import { FichaPage } from '@/pages/ficha';
import type { Id } from '../../../../convex/_generated/dataModel';

export const Route = createFileRoute('/_authenticated/pacientes/$pacienteId')({
  component: FichaRoute,
});

function FichaRoute() {
  const { pacienteId } = Route.useParams();
  // Only the internal ID goes in the address; the server checks access to this patient.
  return <FichaPage key={pacienteId} pacienteId={pacienteId as Id<'pacientes'>} />;
}
