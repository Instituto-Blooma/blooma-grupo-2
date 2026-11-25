import { useEffect, useRef } from 'react';
import { AlertTriangle, Bell, Bot, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from './format';

export type ChatMessage = {
  _id: string;
  direction: 'entrada' | 'saida';
  origin: 'paciente' | 'bot' | 'psicologa' | 'lembrete' | 'crise';
  text: string;
  buttons: { id: string; label: string }[];
  status: 'recebida' | 'pendente' | 'enviada' | 'falhou';
  providerError: string | null;
  createdAt: number;
  authorName: string | null;
};

function originLabel(m: ChatMessage, viewer: 'equipe' | 'paciente') {
  switch (m.origin) {
    case 'paciente':
      return viewer === 'paciente' ? 'Você (paciente)' : 'Paciente';
    case 'bot':
      return 'Mensagem automática';
    case 'lembrete':
      return 'Lembrete semanal';
    case 'crise':
      return 'Aviso de apoio imediato (CVV/SAMU)';
    case 'psicologa':
      return `Equipe de psicologia${m.authorName ? ` · ${m.authorName}` : ''}`;
  }
}

function OriginIcon({ origin }: { origin: ChatMessage['origin'] }) {
  const cls = 'h-3.5 w-3.5';
  if (origin === 'crise') return <AlertTriangle className={cls} aria-hidden="true" />;
  if (origin === 'lembrete') return <Bell className={cls} aria-hidden="true" />;
  if (origin === 'paciente' || origin === 'psicologa') return <UserRound className={cls} aria-hidden="true" />;
  return <Bot className={cls} aria-hidden="true" />;
}

const STATUS_TEXT: Record<ChatMessage['status'], string> = {
  recebida: 'recebida',
  pendente: 'enviando…',
  enviada: 'enviada',
  falhou: 'não enviada',
};

export function ChatThread({
  messages,
  viewer,
  onButton,
  disabled,
  className,
}: {
  messages: ChatMessage[];
  viewer: 'equipe' | 'paciente';
  /** Só no simulador: a "paciente" toca nos botões. */
  onButton?: (buttonId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Botões ativos: os da última mensagem de saída com botões, se a paciente ainda não respondeu depois.
  let activeId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.direction === 'entrada') break;
    if (m.buttons.length > 0) {
      activeId = m._id;
      break;
    }
  }

  if (messages.length === 0) {
    return (
      <div className={cn('rounded-2xl bg-tri-creme p-6 text-center text-sm text-tri-tinta/80', className)}>
        Nenhuma mensagem ainda.
      </div>
    );
  }

  return (
    <div
      className={cn('space-y-3 overflow-y-auto rounded-2xl bg-tri-creme p-3 sm:p-4', className)}
      role="log"
      aria-live="polite"
      aria-label="Histórico de mensagens"
    >
      {messages.map((m) => {
        const mine = viewer === 'paciente' ? m.direction === 'entrada' : m.direction === 'saida';
        const showButtons = m.buttons.length > 0;
        const clickable = Boolean(onButton) && m._id === activeId && !disabled;
        return (
          <div key={m._id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div className="max-w-[85%] sm:max-w-[75%]">
              <div
                className={cn(
                  'rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm',
                  m.origin === 'crise'
                    ? 'border-2 border-tri-ferrugem bg-white'
                    : m.origin === 'psicologa'
                      ? 'bg-tri-lavanda'
                      : m.direction === 'entrada'
                        ? 'bg-tri-menta'
                        : 'bg-white',
                  mine ? 'rounded-br-md' : 'rounded-bl-md'
                )}
              >
                <p
                  className={cn(
                    'mb-1 flex items-center gap-1 text-xs font-semibold',
                    m.origin === 'crise' ? 'text-tri-ferrugem' : 'text-tri-azul'
                  )}
                >
                  <OriginIcon origin={m.origin} />
                  {originLabel(m, viewer)}
                </p>
                <p className="whitespace-pre-line">{m.text}</p>
                <p className="mt-1 text-right text-xs text-tri-tinta/70">
                  {formatDateTime(m.createdAt)} · {STATUS_TEXT[m.status]}
                  {m.status === 'falhou' && m.providerError ? ` — ${m.providerError}` : ''}
                </p>
              </div>
              {showButtons ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.buttons.map((b) =>
                    clickable ? (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onButton?.(b.id)}
                        className="rounded-full border-2 border-tri-azul bg-white px-4 py-2 text-sm font-semibold text-tri-azul hover:bg-tri-azul hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tri-celeste"
                      >
                        {b.label}
                      </button>
                    ) : (
                      <span
                        key={b.id}
                        className="rounded-full border border-tri-azul/30 bg-white/70 px-3 py-1 text-xs text-tri-tinta/70"
                      >
                        {b.label}
                      </span>
                    )
                  )}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
