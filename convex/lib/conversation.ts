/**
 * Máquina de estados da conversa com a paciente.
 *
 * É PURA e INDEPENDENTE DO PROVEDOR: recebe o estado atual + o que a paciente
 * mandou e devolve o novo estado, as respostas a enviar e os "efeitos" que o
 * banco deve registrar. O simulador e o WhatsApp (quando existir) passam por
 * aqui do mesmo jeito — veja convex/lib/conversationRunner.ts.
 *
 * Nenhuma IA decide nada: só regras fixas.
 */

import { isRiskAnswer, type Questionnaire } from './questionnaire';
import { MSG } from './scripts';

export type Stage =
  | 'novo'
  | 'aguardando_consentimento'
  | 'aguardando_apelido'
  | 'ocioso'
  | 'em_checkin';

export type ConversationState = { stage: Stage; questionIndex?: number };

export type IncomingEvent = { kind: 'text'; text: string } | { kind: 'button'; buttonId: string };

export type ReplyButton = { id: string; label: string };

export type OutgoingReply = {
  origin: 'bot' | 'crise' | 'lembrete';
  text: string;
  buttons?: ReplyButton[];
};

export type Effect =
  | { type: 'consent_accepted' }
  | { type: 'consent_declined' }
  | { type: 'set_display_name'; name: string }
  | { type: 'checkin_started' }
  | { type: 'answer_recorded'; questionId: string; value: number; triggeredRisk: boolean }
  | { type: 'risk_signal'; questionId: string; value: number }
  | { type: 'checkin_completed' };

export type PatientFacts = { consentAccepted: boolean; displayName?: string };

export type Transition = {
  state: ConversationState;
  replies: OutgoingReply[];
  effects: Effect[];
};

export const BUTTON = {
  consentAccept: 'consent:aceito',
  consentDecline: 'consent:recusado',
  startCheckin: 'checkin:iniciar',
} as const;

export function answerButtonId(questionId: string, value: number) {
  return `resp:${questionId}:${value}`;
}

export function parseAnswerButtonId(id: string): { questionId: string; value: number } | null {
  const match = /^resp:([^:]+):(\d+)$/.exec(id);
  if (!match) return null;
  return { questionId: match[1], value: Number(match[2]) };
}

const START_CHECKIN_BUTTON: ReplyButton = { id: BUTTON.startCheckin, label: 'Começar check-in' };

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function wantsCheckin(text: string) {
  const t = normalize(text);
  return /check.?in|comecar/.test(t);
}

export function questionReply(questionnaire: Questionnaire, index: number): OutgoingReply {
  const question = questionnaire.questions[index];
  const total = questionnaire.questions.length;
  return {
    origin: 'bot',
    text: `Pergunta ${index + 1} de ${total}\n\n${question.text}`,
    buttons: question.options.map((o) => ({ id: answerButtonId(question.id, o.value), label: o.label })),
  };
}

function consentReplies(): OutgoingReply[] {
  return [
    { origin: 'bot', text: MSG.boasVindas },
    {
      origin: 'bot',
      text: MSG.termo,
      buttons: [
        { id: BUTTON.consentAccept, label: 'Aceito' },
        { id: BUTTON.consentDecline, label: 'Não aceito' },
      ],
    },
  ];
}

function startCheckin(questionnaire: Questionnaire, facts: PatientFacts): Transition {
  if (!facts.consentAccepted) {
    // Sem aceite, o check-in não começa.
    return {
      state: { stage: 'aguardando_consentimento' },
      replies: consentReplies(),
      effects: [],
    };
  }
  return {
    state: { stage: 'em_checkin', questionIndex: 0 },
    replies: [{ origin: 'bot', text: MSG.inicioCheckin }, questionReply(questionnaire, 0)],
    effects: [{ type: 'checkin_started' }],
  };
}

function idleMenu(facts: PatientFacts): OutgoingReply {
  return { origin: 'bot', text: MSG.menu(facts.displayName), buttons: [START_CHECKIN_BUTTON] };
}

export function handleIncoming(
  state: ConversationState,
  event: IncomingEvent,
  facts: PatientFacts,
  questionnaire: Questionnaire
): Transition {
  switch (state.stage) {
    case 'novo':
      return { state: { stage: 'aguardando_consentimento' }, replies: consentReplies(), effects: [] };

    case 'aguardando_consentimento': {
      if (event.kind === 'button' && event.buttonId === BUTTON.consentAccept) {
        if (facts.displayName) {
          return {
            state: { stage: 'ocioso' },
            replies: [{ origin: 'bot', text: MSG.aceiteObrigada }, idleMenu(facts)],
            effects: [{ type: 'consent_accepted' }],
          };
        }
        return {
          state: { stage: 'aguardando_apelido' },
          replies: [{ origin: 'bot', text: MSG.aceiteObrigada }, { origin: 'bot', text: MSG.pedirApelido }],
          effects: [{ type: 'consent_accepted' }],
        };
      }
      if (event.kind === 'button' && event.buttonId === BUTTON.consentDecline) {
        return {
          state: { stage: 'novo' },
          replies: [{ origin: 'bot', text: MSG.recusa }],
          effects: [{ type: 'consent_declined' }],
        };
      }
      return {
        state,
        replies: [{ origin: 'bot', text: MSG.tocarBotao }, consentReplies()[1]],
        effects: [],
      };
    }

    case 'aguardando_apelido': {
      const name = event.kind === 'text' ? event.text.trim().slice(0, 40) : '';
      if (!name) {
        return { state, replies: [{ origin: 'bot', text: MSG.pedirApelido }], effects: [] };
      }
      return {
        state: { stage: 'ocioso' },
        replies: [idleMenu({ ...facts, displayName: name })],
        effects: [{ type: 'set_display_name', name }],
      };
    }

    case 'ocioso': {
      const start =
        (event.kind === 'button' && event.buttonId === BUTTON.startCheckin) ||
        (event.kind === 'text' && wantsCheckin(event.text));
      if (start) return startCheckin(questionnaire, facts);
      // Mensagem livre: fica no histórico para a equipe ler e responder.
      return { state, replies: [idleMenu(facts)], effects: [] };
    }

    case 'em_checkin': {
      const index = state.questionIndex ?? 0;
      const question = questionnaire.questions[index];
      if (!question) {
        // Estado inconsistente (questionário mudou?) — encerra com segurança.
        return {
          state: { stage: 'ocioso' },
          replies: [idleMenu(facts)],
          effects: [{ type: 'checkin_completed' }],
        };
      }
      const parsed = event.kind === 'button' ? parseAnswerButtonId(event.buttonId) : null;
      if (!parsed || parsed.questionId !== question.id) {
        return {
          state,
          replies: [{ origin: 'bot', text: MSG.tocarBotao }, questionReply(questionnaire, index)],
          effects: [],
        };
      }
      if (!question.options.some((o) => o.value === parsed.value)) {
        return { state, replies: [questionReply(questionnaire, index)], effects: [] };
      }

      const triggeredRisk = isRiskAnswer(question, parsed.value);
      const effects: Effect[] = [
        { type: 'answer_recorded', questionId: question.id, value: parsed.value, triggeredRisk },
      ];
      const replies: OutgoingReply[] = [];
      if (triggeredRisk) {
        // Na hora: CVV e SAMU para a paciente; a equipe é avisada pelo efeito.
        effects.push({ type: 'risk_signal', questionId: question.id, value: parsed.value });
        replies.push({ origin: 'crise', text: MSG.crise });
      }

      // TODO(psicólogas): depois de um sinal de risco, o check-in deve continuar
      // ou parar? Por enquanto continua, para a pontuação ficar completa.
      const nextIndex = index + 1;
      if (nextIndex < questionnaire.questions.length) {
        replies.push(questionReply(questionnaire, nextIndex));
        return { state: { stage: 'em_checkin', questionIndex: nextIndex }, replies, effects };
      }
      effects.push({ type: 'checkin_completed' });
      replies.push({ origin: 'bot', text: MSG.fimCheckin(facts.displayName) });
      return { state: { stage: 'ocioso' }, replies, effects };
    }
  }
}

/** Mensagem do lembrete semanal (mesma para simulador e WhatsApp). */
export function reminderReply(facts: PatientFacts): OutgoingReply {
  return { origin: 'lembrete', text: MSG.lembrete(facts.displayName), buttons: [START_CHECKIN_BUTTON] };
}
