import { createFileRoute } from '@tanstack/react-router';
import { FichaPage } from '@/pages/ficha';
import type { Id } from '../../../../convex/_generated/dataModel';

// A URL leva só o ID interno do Convex — nunca nome, telefone ou outro dado da paciente.
export const Route = createFileRoute('/_authenticated/pacientes/$patientId')({
  component: FichaRoute,
});

function FichaRoute() {
  const { patientId } = Route.useParams();
  return <FichaPage key={patientId} patientId={patientId as Id<'patients'>} />;
}
