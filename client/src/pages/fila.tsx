import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { ChevronRight, Loader2, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppShell } from '@/components/triagem/app-shell';
import { PriorityBadge, RiskBadge } from '@/components/triagem/badges';
import { formatAgo, formatDateTime } from '@/components/triagem/format';
import { api } from '../../../convex/_generated/api';

type Filter = 'todas' | 'alta' | 'media' | 'baixa' | 'sem_checkin';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Média' },
  { value: 'baixa', label: 'Baixa' },
  { value: 'sem_checkin', label: 'Sem check-in' },
];

export function FilaPage() {
  return (
    <AppShell>
      <Fila />
    </AppShell>
  );
}

function Fila() {
  const [filter, setFilter] = useState<Filter>('todas');
  const [onlyRisk, setOnlyRisk] = useState(false);
  const rows = useQuery(api.patients.queue, { filter, onlyRisk });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-tri-azul">Fila de acompanhamento</h1>
          <p className="mt-1 text-tri-tinta/80">
            Ordenada por prioridade e, dentro de cada uma, pelo check-in mais recente. Atualiza
            sozinha.
          </p>
        </div>
        {rows ? (
          <p className="text-sm font-semibold text-tri-tinta/80" aria-live="polite">
            {rows.length} {rows.length === 1 ? 'paciente' : 'pacientes'}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-white p-4 shadow-sm">
        <span className="text-sm font-semibold" id="filtro-prioridade">
          Prioridade:
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="filtro-prioridade">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-full border-2 px-4 py-1.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tri-celeste',
                filter === f.value
                  ? 'border-tri-azul bg-tri-azul text-white'
                  : 'border-tri-azul/25 bg-white text-tri-azul hover:border-tri-azul'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={onlyRisk}
            onChange={(e) => setOnlyRisk(e.target.checked)}
            className="h-5 w-5 accent-tri-ferrugem"
          />
          Só com sinal de risco
        </label>
      </div>

      {rows === undefined ? (
        <div className="flex items-center gap-2 text-tri-azul">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando fila…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-3xl bg-white p-8 text-center text-tri-tinta/80 shadow-sm">
          Nenhuma paciente com esses filtros.
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((p, i) => (
            <li key={p._id}>
              <Link
                to="/pacientes/$patientId"
                params={{ patientId: p._id }}
                className={cn(
                  'group flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white p-5 shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tri-celeste',
                  p.hasRiskSignal && 'ring-2 ring-tri-ferrugem'
                )}
              >
                <span className="w-6 text-right text-sm font-semibold text-tri-tinta/60" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="min-w-[10rem] flex-1">
                  <p className="text-lg font-semibold">{p.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-tri-tinta/80">
                    {p.assignedToName ? (
                      <>
                        <UserCheck className="h-4 w-4" aria-hidden="true" />
                        {p.assignedToMe ? 'Assumido por você' : `Assumido por ${p.assignedToName}`}
                      </>
                    ) : (
                      'Sem responsável'
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge level={p.priority} />
                  {p.hasRiskSignal ? <RiskBadge /> : null}
                  {p.inCheckin ? (
                    <span className="rounded-full bg-tri-menta px-3 py-1 text-sm font-semibold text-tri-tinta">
                      Respondendo agora
                    </span>
                  ) : null}
                </div>
                <div className="w-28 text-sm">
                  <p className="text-tri-tinta/70">Pontuação</p>
                  <p className="text-lg font-bold">
                    {p.score ?? '—'}
                    <span className="text-sm font-normal text-tri-tinta/70">{p.score !== null ? ' / 100' : ''}</span>
                  </p>
                </div>
                <div className="w-44 text-sm">
                  <p className="text-tri-tinta/70">Último check-in</p>
                  {p.lastCheckinAt ? (
                    <p>
                      <span className="font-semibold">{formatAgo(p.lastCheckinAt)}</span>
                      <br />
                      <span className="text-tri-tinta/70">{formatDateTime(p.lastCheckinAt)}</span>
                    </p>
                  ) : (
                    <p className="font-semibold">Ainda não fez</p>
                  )}
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-tri-azul" aria-hidden="true" />
                <span className="sr-only">Abrir ficha</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
