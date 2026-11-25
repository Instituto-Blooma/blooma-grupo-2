import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { AlertTriangle, ArrowLeft, ChevronDown, Loader2, Send, ShieldCheck, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, Card } from '@/components/triagem/app-shell';
import { PriorityBadge, RiskBadge } from '@/components/triagem/badges';
import { ChatThread } from '@/components/triagem/chat-thread';
import { formatAgo, formatDateTime } from '@/components/triagem/format';
import { ScoreChart } from '@/components/triagem/score-chart';
import { usePatientAccess } from '@/components/triagem/use-patient-access';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export function FichaPage({ patientId }: { patientId: Id<'patients'> }) {
  return (
    <AppShell>
      <Ficha patientId={patientId} />
    </AppShell>
  );
}

const ACTION_TEXT = {
  abrir_ficha: 'abriu a ficha',
  abrir_simulador: 'abriu no simulador',
  assumir_caso: 'assumiu o caso',
  enviar_mensagem: 'enviou mensagem',
} as const;

function Ficha({ patientId }: { patientId: Id<'patients'> }) {
  const { accessId, error } = usePatientAccess(patientId, 'ficha');
  const data = useQuery(api.patients.ficha, accessId ? { patientId, accessId } : 'skip');
  const me = useQuery(api.staff.me);
  const assume = useMutation(api.patients.assume);
  const [openCheckin, setOpenCheckin] = useState<string | null>(null);

  if (error) return <p className="rounded-3xl bg-white p-6 shadow-sm">{error}</p>;
  if (!data || !me) {
    return (
      <div className="flex items-center gap-2 text-tri-azul">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Abrindo ficha…
      </div>
    );
  }

  const { patient, checkins } = data;
  const completed = checkins.filter((c) => c.status === 'concluido' && c.score !== null);
  const points = [...completed].reverse().map((c) => ({
    at: c.completedAt ?? c.startedAt,
    score: c.score ?? 0,
    priority: c.priority,
    riskSignal: c.riskSignal,
  }));
  const expanded = openCheckin ?? checkins[0]?._id ?? null;

  const onAssume = async () => {
    try {
      await assume({ patientId });
      toast.success('Caso assumido por você.');
    } catch {
      toast.error('Não foi possível assumir o caso.');
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-tri-azul hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para a fila
      </Link>

      {/* Cabeçalho da ficha */}
      <Card className={cn(patient.hasRiskSignal && 'ring-2 ring-tri-ferrugem')}>
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-[12rem] flex-1 space-y-3">
            <h1 className="font-serif text-3xl font-semibold text-tri-azul">{patient.name}</h1>
            <div className="flex flex-wrap gap-2">
              <PriorityBadge level={patient.priority} />
              {patient.hasRiskSignal ? <RiskBadge /> : null}
              {patient.inCheckin ? (
                <span className="rounded-full bg-tri-menta px-3 py-1 text-sm font-semibold">Respondendo agora</span>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-tri-tinta/70">Pontuação atual</dt>
                <dd className="text-lg font-bold">{patient.score ?? '—'}{patient.score !== null ? ' / 100' : ''}</dd>
              </div>
              <div>
                <dt className="text-tri-tinta/70">Último check-in</dt>
                <dd className="font-semibold">
                  {patient.lastCheckinAt ? formatAgo(patient.lastCheckinAt) : 'Ainda não fez'}
                </dd>
              </div>
              <div>
                <dt className="text-tri-tinta/70">Termo aceito em</dt>
                <dd className="font-semibold">
                  {patient.consentAcceptedAt ? formatDateTime(patient.consentAcceptedAt) : 'Não aceito'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="w-full space-y-3 rounded-2xl bg-tri-creme p-4 sm:w-72">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="h-4 w-4" aria-hidden="true" /> Responsável
            </p>
            {patient.assignedToName ? (
              <p className="text-sm">
                {patient.assignedToMe ? 'Você' : patient.assignedToName} assumiu
                {patient.assignedAt ? ` em ${formatDateTime(patient.assignedAt)}` : ''}.
              </p>
            ) : (
              <p className="text-sm">Ninguém assumiu este caso ainda.</p>
            )}
            {!patient.assignedToMe ? (
              <button
                type="button"
                onClick={() => void onAssume()}
                className="w-full rounded-full bg-tri-verde px-4 py-2.5 font-semibold text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tri-celeste"
              >
                {patient.assignedToName ? 'Assumir no lugar' : 'Assumir caso'}
              </button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Alerta de risco: quais respostas dispararam */}
      {checkins.some((c) => c.riskSignal) ? <RiskSummary checkins={checkins} /> : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <h2 className="mb-4 font-serif text-xl font-semibold text-tri-azul">Evolução da pontuação</h2>
            <ScoreChart points={points} cutoffs={me.priorityConfig.cutoffs} />
          </Card>

          <Card>
            <h2 className="mb-4 font-serif text-xl font-semibold text-tri-azul">Histórico de check-ins</h2>
            {checkins.length === 0 ? (
              <p className="text-sm text-tri-tinta/80">Nenhum check-in ainda.</p>
            ) : (
              <ul className="space-y-3">
                {checkins.map((c) => {
                  const isOpen = expanded === c._id;
                  return (
                    <li key={c._id} className={cn('rounded-2xl border border-tri-azul/10', c.riskSignal && 'border-2 border-tri-ferrugem')}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenCheckin(isOpen ? '' : c._id)}
                        className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
                      >
                        <span className="font-semibold">{formatDateTime(c.completedAt ?? c.startedAt)}</span>
                        {c.status === 'em_andamento' ? (
                          <span className="rounded-full bg-tri-menta px-3 py-1 text-xs font-semibold">Em andamento</span>
                        ) : (
                          <PriorityBadge level={c.priority} className="text-xs" />
                        )}
                        {c.riskSignal ? <RiskBadge className="text-xs" /> : null}
                        <span className="ml-auto text-sm">
                          {c.score !== null ? (
                            <>
                              <strong>{c.score}</strong> / 100
                            </>
                          ) : null}
                        </span>
                        <ChevronDown className={cn('h-5 w-5 text-tri-azul transition', isOpen && 'rotate-180')} aria-hidden="true" />
                      </button>
                      {isOpen ? (
                        <div className="space-y-4 border-t border-tri-azul/10 p-4">
                          {c.scaleScores.length > 0 ? (
                            <div className="flex flex-wrap gap-3">
                              {c.scaleScores.map((s) => (
                                <div key={s.scaleId} className="rounded-2xl bg-tri-lavanda/60 px-4 py-2 text-sm">
                                  <p className="text-tri-roxo">{s.label}</p>
                                  <p className="text-lg font-bold text-tri-tinta">
                                    {s.score} <span className="text-sm font-normal">de {s.max}</span>
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <ol className="space-y-2">
                            {c.answers.map((a, i) => (
                              <li
                                key={a.questionId}
                                className={cn(
                                  'rounded-xl p-3 text-sm',
                                  a.triggeredRisk ? 'border-2 border-tri-ferrugem bg-white' : 'bg-tri-creme'
                                )}
                              >
                                <p className="text-tri-tinta/80">
                                  {i + 1}. {a.questionText}
                                </p>
                                <p className="mt-1 font-semibold">
                                  Resposta: {a.optionLabel}{' '}
                                  <span className="font-normal text-tri-tinta/70">({a.value} ponto{a.value === 1 ? '' : 's'})</span>
                                </p>
                                {a.triggeredRisk ? (
                                  <p className="mt-1 flex items-center gap-1 font-semibold text-tri-ferrugem">
                                    <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Esta resposta disparou o
                                    sinal de risco (CVV e SAMU enviados na hora)
                                  </p>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                          {c.configVersion ? (
                            <p className="text-xs text-tri-tinta/70">Regra usada: {c.configVersion} (provisória)</p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {accessId ? <Conversa patientId={patientId} accessId={accessId} /> : null}

          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold text-tri-azul">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" /> Quem acessou esta ficha
            </h2>
            <ul className="space-y-1 text-sm">
              {data.recentAccesses.map((a) => (
                <li key={a._id}>
                  <strong>{a.userName}</strong> {ACTION_TEXT[a.action]} · {formatDateTime(a.at)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-tri-tinta/70">Registro de auditoria (LGPD).</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

type FichaCheckin = {
  _id: string;
  riskSignal: boolean;
  completedAt: number | null;
  startedAt: number;
  answers: { questionId: string; questionText: string; optionLabel: string; triggeredRisk: boolean }[];
};

function RiskSummary({ checkins }: { checkins: FichaCheckin[] }) {
  const latest = checkins.find((c) => c.riskSignal);
  if (!latest) return null;
  const triggers = latest.answers.filter((a) => a.triggeredRisk);
  return (
    <section className="rounded-3xl border-2 border-tri-ferrugem bg-white p-5 sm:p-6" aria-labelledby="titulo-risco">
      <h2 id="titulo-risco" className="flex items-center gap-2 font-serif text-xl font-semibold text-tri-ferrugem">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" /> Sinal de risco em {formatDateTime(latest.completedAt ?? latest.startedAt)}
      </h2>
      <p className="mt-2 text-sm">
        A paciente recebeu na hora os contatos do CVV (188) e do SAMU (192). Respostas que dispararam o
        sinal:
      </p>
      <ul className="mt-3 space-y-2">
        {triggers.map((a) => (
          <li key={a.questionId} className="rounded-xl bg-tri-laranja/20 p-3 text-sm">
            <p>{a.questionText}</p>
            <p className="mt-1 font-semibold">Resposta: {a.optionLabel}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Conversa({ patientId, accessId }: { patientId: Id<'patients'>; accessId: Id<'auditLog'> }) {
  const messages = useQuery(api.messages.list, { patientId, accessId });
  const send = useMutation(api.messages.sendFromStaff);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await send({ patientId, text });
      setText('');
    } catch {
      toast.error('Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-3 font-serif text-xl font-semibold text-tri-azul">Conversa</h2>
      {messages === undefined ? (
        <Loader2 className="h-5 w-5 animate-spin text-tri-azul" aria-label="Carregando" />
      ) : (
        <ChatThread messages={messages} viewer="equipe" className="max-h-[28rem]" />
      )}
      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-2">
        <label htmlFor="mensagem" className="text-sm font-semibold">
          Escrever para a paciente (vai para o WhatsApp dela)
        </label>
        <textarea
          id="mensagem"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-2xl border-2 border-tri-azul/20 bg-white p-3 text-[15px] focus:border-tri-azul focus:outline-none"
          placeholder="Ex.: Oi, Maria. Vi seu check-in de hoje. Podemos conversar amanhã?"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-tri-tinta/70">
            WhatsApp ainda não configurado: por enquanto a mensagem aparece no simulador.
          </p>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-tri-azul px-5 py-2.5 font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tri-celeste"
          >
            <Send className="h-4 w-4" aria-hidden="true" /> Enviar
          </button>
        </div>
      </form>
    </Card>
  );
}
