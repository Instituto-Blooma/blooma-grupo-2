import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

/**
 * Registra o acesso no log de auditoria (servidor) e devolve o `accessId`
 * que as queries exigem. Fica só na memória da tela — nada em localStorage.
 */
export function usePatientAccess(patientId: Id<'patients'> | null, context: 'ficha' | 'simulador') {
  const open = useMutation(api.patients.open);
  const [access, setAccess] = useState<{ patientId: string; accessId: Id<'auditLog'> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!patientId || requested.current === patientId) return;
    requested.current = patientId;
    setError(null);
    open({ patientId, context })
      .then((accessId) => setAccess({ patientId, accessId }))
      .catch(() => setError('Não foi possível abrir. Verifique se você tem acesso.'));
  }, [patientId, context, open]);

  const accessId = access && access.patientId === patientId ? access.accessId : null;
  return { accessId, error };
}
