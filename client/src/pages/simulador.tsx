import { useEffect, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Bell, CalendarClock, FlaskConical, Loader2, Send, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, Card } from '@/components/triagem/app-shell';
import { ChatThread } from '@/components/triagem/chat-thread';
import { usePatientAccess } from '@/components/triagem/use-patient-access';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

const STAGE_TEXT = {
  novo: 'Nova (ainda não falou)',
  aguardando_consentimento: 'Esperando aceite do termo',
  aguardando_apelido: 'Esperando apelido',
  ocioso: 'Pronta para check-in',
  em_checkin: 'Respondendo check-in',
} as const;

function errorMessage(e: unknown) {
  if (e && typeof e === 'object' && 'data' in e && typeof (e as { data: unknown }).data === 'string') {
    return (e as { data: string }).data;
  }
  return 'Algo deu errado.';
}

export function SimuladorPage() {
  return (
    <AppShell>
      <Simulador />
    </AppShell>
  );
}

function Simulador() {
  const patients = useQuery(api.simulator.patients);
  const createPatient = useMutation(api.simulator.createPatient);
  const sendReminder = useMutation(api.simulator.sendReminderNow);
  const runWeekly = useMutation(api.simulator.runWeeklyRule);
  const [selected, setSelected] = useState<Id<'patients'> | null>(null);

  useEffect(() => {
    if (!selected && patients && patients.length > 0) setSelected(patients[0]._id);
  }, [patients, selected]);

  const current = patients?.find((p) => p._id === selected) ?? null;

  const onCreate = async () => {
    try {
      const id = await createPatient({});
      setSelected(id);
      toast.success('Paciente fictícia criada. Mande "oi" para começar.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-serif text-3xl font-semibold text-tri-azul">
          <FlaskConical className="h-7 w-7" aria-hidden="true" /> Simulador do WhatsApp
        </h1>
        <p className="mt-1 max-w-3xl text-tri-tinta/80">
          Tela de teste: você faz o papel da paciente. Usa a <strong>mesma lógica de conversa</strong> que o
          WhatsApp vai usar. Só funciona com pacientes fictícias.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-5 lg:col-span-1">
          <div className="space-y-2">
            <label htmlFor="sim-paciente" className="text-sm font-semibold">
              Paciente fictícia
            </label>
            {patients === undefined ? (
              <Loader2 className="h-5 w-5 animate-spin text-tri-azul" aria-label="Carregando" />
            ) : (
              <select
                id="sim-paciente"
                value={selected ?? ''}
                onChange={(e) => setSelected(e.target.value as Id<'patients'>)}
                className="w-full rounded-2xl border-2 border-tri-azul/20 bg-white p-3 focus:border-tri-azul focus:outline-none"
              >
                {patients.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} · {p.phone}
                  </option>
                ))}
              </select>
            )}
            {current ? (
              <p className="text-sm text-tri-tinta/80">
                Estado da conversa: <strong>{STAGE_TEXT[current.stage]}</strong>
                <br />
                Termo: <strong>{current.consentAccepted ? 'aceito' : 'não aceito'}</strong>
              </p>
            ) : null}
            {current ? (
              <Link
                to="/pacientes/$patientId"
                params={{ patientId: current._id }}
                className="inline-block text-sm font-semibold text-tri-azul underline"
              >
                Abrir a ficha desta paciente
              </Link>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void onCreate()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-tri-verde px-4 py-2.5 font-semibold text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tri-celeste"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Nova paciente fictícia
          </button>

          <div className="space-y-2 border-t border-tri-azul/10 pt-4">
            <p className="text-sm font-semibold">Lembrete semanal</p>
            <button
              type="button"
              disabled={!current}
              onClick={() =>
                current &&
                sendReminder({ patientId: current._id })
                  .then(() => toast.success('Lembrete enviado para a conversa.'))
                  .catch((e: unknown) => toast.error(errorMessage(e)))
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-tri-azul px-4 py-2 font-semibold text-tri-azul hover:bg-tri-azul hover:text-white disabled:opacity-50"
            >
              <Bell className="h-4 w-4" aria-hidden="true" /> Enviar lembrete agora
            </button>
            <button
              type="button"
              onClick={() =>
                runWeekly({})
                  .then((r) => toast.success(`Regra semanal rodou: ${r.marked} lembrete(s).`))
                  .catch((e: unknown) => toast.error(errorMessage(e)))
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-tri-azul/40 px-4 py-2 text-sm font-semibold text-tri-azul hover:border-tri-azul"
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" /> Rodar a regra do cron semanal
            </button>
            <p className="text-xs text-tri-tinta/70">
              O cron roda sozinho toda segunda às 9h (Brasília) e marca quem está há uma semana sem check-in.
            </p>
          </div>
        </Card>

        <div className="lg:col-span-2">
          {current ? <Phone key={current._id} patientId={current._id} name={current.name} /> : null}
        </div>
      </div>
    </div>
  );
}

function Phone({ patientId, name }: { patientId: Id<'patients'>; name: string }) {
  const { accessId, error } = usePatientAccess(patientId, 'simulador');
  const messages = useQuery(api.messages.list, accessId ? { patientId, accessId } : 'skip');
  const send = useMutation(api.simulator.sendAsPatient);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (args: { text?: string; buttonId?: string }) => {
    setBusy(true);
    try {
      await send({ patientId, ...args });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text;
    setText('');
    await run({ text: body });
  };

  if (error) return <p className="rounded-3xl bg-white p-6 shadow-sm">{error}</p>;

  return (
    <div className="mx-auto max-w-xl overflow-hidden rounded-[2rem] border-8 border-tri-tinta bg-white shadow-lg">
      <div className="flex items-center gap-3 bg-tri-azul px-5 py-3 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 font-bold" aria-hidden="true">
          Ψ
        </div>
        <div>
          <p className="font-semibold">Equipe de Psicologia</p>
          <p className="text-xs text-white/80">Simulação · você é {name}</p>
        </div>
      </div>
      {messages === undefined ? (
        <div className="flex h-[32rem] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-tri-azul" aria-label="Carregando" />
        </div>
      ) : (
        <ChatThread
          messages={messages}
          viewer="paciente"
          onButton={(buttonId) => void run({ buttonId })}
          disabled={busy}
          className="h-[32rem] rounded-none"
        />
      )}
      <form onSubmit={(e) => void onSubmit(e)} className="flex gap-2 border-t border-tri-azul/10 p-3">
        <label htmlFor="sim-texto" className="sr-only">
          Mensagem da paciente
        </label>
        <input
          id="sim-texto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Escreva como a paciente (ex.: "oi")'
          className="flex-1 rounded-full border-2 border-tri-azul/20 px-4 py-2 focus:border-tri-azul focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Enviar"
          className="inline-flex items-center justify-center rounded-full bg-tri-verde px-4 text-white disabled:opacity-50"
        >
          <Send className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
