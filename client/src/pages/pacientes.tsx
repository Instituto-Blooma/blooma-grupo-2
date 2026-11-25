import { useEffect, useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import { Search } from 'lucide-react';
import { AppShell, type Hospital } from '@/components/equipe/app-shell';
import { LinhasPacientes } from '@/components/equipe/linhas-pacientes';
import { Input } from '@/components/ui/input';
import { api } from '../../../convex/_generated/api';

const POR_PAGINA = 25;

export function PacientesPage() {
  return <AppShell secao="pacientes">{(hospital) => <Pacientes hospital={hospital} />}</AppShell>;
}

function Pacientes({ hospital }: { hospital: Hospital }) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  // Waits a moment after typing before searching.
  useEffect(() => {
    const espera = setTimeout(() => setBusca(texto.trim()), 300);
    return () => clearTimeout(espera);
  }, [texto]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.equipe.todasAsPacientes,
    { organizationId: hospital.organizationId, ...(busca ? { busca } : {}) },
    { initialNumItems: POR_PAGINA }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
          Todas as pacientes
        </h1>
        <p className="mt-1 text-muted-foreground">
          Todas as pacientes de {hospital.nome}, as mais recentes primeiro. Abra uma para ver a
          conversa e todos os check-ins.
        </p>
      </div>
      <div className="relative max-w-md">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Buscar pelo nome completo"
          aria-label="Buscar pelo nome completo"
          className="pl-9"
        />
      </div>
      <LinhasPacientes
        linhas={results}
        status={status}
        carregarMais={() => loadMore(POR_PAGINA)}
        vazio={
          busca
            ? 'Nenhuma paciente com esse nome.'
            : 'Ainda não há pacientes. Elas aparecem aqui quando mandam a primeira mensagem no WhatsApp.'
        }
        mostrarCaso="lista"
      />
    </div>
  );
}
