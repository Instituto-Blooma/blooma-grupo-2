import { usePaginatedQuery } from 'convex/react';
import { AppShell, type Hospital } from '@/components/equipe/app-shell';
import { LinhasPacientes } from '@/components/equipe/linhas-pacientes';
import { api } from '../../../convex/_generated/api';

const POR_PAGINA = 25;

export function FilaPage() {
  return <AppShell secao="fila">{(hospital) => <Fila hospital={hospital} />}</AppShell>;
}

function Fila({ hospital }: { hospital: Hospital }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.equipe.fila,
    { organizationId: hospital.organizationId },
    { initialNumItems: POR_PAGINA }
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Fila</h1>
        <p className="mt-1 text-muted-foreground">
          Casos abertos de {hospital.nome}. Quem precisa mais aparece primeiro: urgente, alta,
          moderada e baixa. Na mesma prioridade, quem espera há mais tempo vem antes.
        </p>
      </div>
      <LinhasPacientes
        linhas={results}
        status={status}
        carregarMais={() => loadMore(POR_PAGINA)}
        vazio="Nenhum caso aberto agora. Quando uma paciente terminar um check-in, ela aparece aqui."
        mostrarCaso="fila"
      />
    </div>
  );
}
