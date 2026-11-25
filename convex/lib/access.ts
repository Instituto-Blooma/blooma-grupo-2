import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Auditoria obrigatória: para ler a ficha (ou a conversa no simulador), a tela
 * primeiro chama `patients.open`, que grava no auditLog quem abriu e quando, e
 * recebe um `accessId`. As queries só devolvem dados com um `accessId` válido
 * da mesma pessoa para a mesma paciente — então não dá para ler sem registrar.
 */
export async function requireLoggedAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  patientId: Id<'patients'>,
  accessId: Id<'auditLog'>
): Promise<Doc<'patients'>> {
  const access = await ctx.db.get(accessId);
  if (
    !access ||
    access.userId !== userId ||
    access.patientId !== patientId ||
    (access.action !== 'abrir_ficha' && access.action !== 'abrir_simulador')
  ) {
    throw new ConvexError('Acesso não registrado. Abra a ficha novamente.');
  }
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new ConvexError('Paciente não encontrada.');
  return patient;
}

export function patientLabel(patient: Doc<'patients'>) {
  return patient.displayName ?? 'Paciente sem apelido';
}
