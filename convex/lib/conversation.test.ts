import { describe, expect, it } from 'vitest';
import {
  answerButtonId,
  BUTTON,
  handleIncoming,
  type ConversationState,
  type IncomingEvent,
  type PatientFacts,
} from './conversation';
import { QUESTIONNAIRE } from './questionnaire';

const semAceite: PatientFacts = { consentAccepted: false };
const comAceite: PatientFacts = { consentAccepted: true, displayName: 'Maria' };

function text(t: string): IncomingEvent {
  return { kind: 'text', text: t };
}
function button(id: string): IncomingEvent {
  return { kind: 'button', buttonId: id };
}

describe('máquina de conversa', () => {
  it('"oi" de paciente nova recebe boas-vindas e termo com botões', () => {
    const t = handleIncoming({ stage: 'novo' }, text('oi'), semAceite, QUESTIONNAIRE);
    expect(t.state.stage).toBe('aguardando_consentimento');
    expect(t.replies).toHaveLength(2);
    expect(t.replies[1].buttons?.map((b) => b.id)).toEqual([BUTTON.consentAccept, BUTTON.consentDecline]);
  });

  it('aceite registra consentimento e pede apelido', () => {
    const t = handleIncoming(
      { stage: 'aguardando_consentimento' },
      button(BUTTON.consentAccept),
      semAceite,
      QUESTIONNAIRE
    );
    expect(t.effects).toContainEqual({ type: 'consent_accepted' });
    expect(t.state.stage).toBe('aguardando_apelido');
  });

  it('recusa não começa check-in', () => {
    const t = handleIncoming(
      { stage: 'aguardando_consentimento' },
      button(BUTTON.consentDecline),
      semAceite,
      QUESTIONNAIRE
    );
    expect(t.effects).toContainEqual({ type: 'consent_declined' });
    expect(t.state.stage).toBe('novo');
  });

  it('sem aceite, pedir check-in devolve o termo em vez de começar', () => {
    const t = handleIncoming({ stage: 'ocioso' }, button(BUTTON.startCheckin), semAceite, QUESTIONNAIRE);
    expect(t.state.stage).toBe('aguardando_consentimento');
    expect(t.effects).not.toContainEqual({ type: 'checkin_started' });
  });

  it('com aceite, começa o check-in na primeira pergunta', () => {
    const t = handleIncoming({ stage: 'ocioso' }, button(BUTTON.startCheckin), comAceite, QUESTIONNAIRE);
    expect(t.state).toEqual({ stage: 'em_checkin', questionIndex: 0 });
    expect(t.effects).toContainEqual({ type: 'checkin_started' });
  });

  it('texto no meio do check-in pede para tocar no botão e repete a pergunta', () => {
    const state: ConversationState = { stage: 'em_checkin', questionIndex: 0 };
    const t = handleIncoming(state, text('mais ou menos'), comAceite, QUESTIONNAIRE);
    expect(t.state).toEqual(state);
    expect(t.effects).toEqual([]);
  });

  it('botão de uma pergunta antiga não conta como resposta', () => {
    const state: ConversationState = { stage: 'em_checkin', questionIndex: 1 };
    const old = answerButtonId(QUESTIONNAIRE.questions[0].id, 2);
    const t = handleIncoming(state, button(old), comAceite, QUESTIONNAIRE);
    expect(t.effects).toEqual([]);
  });

  it('resposta de risco manda CVV 188 e SAMU 192 na hora', () => {
    const riskIndex = QUESTIONNAIRE.questions.findIndex((q) => q.riskMinValue !== undefined);
    const q = QUESTIONNAIRE.questions[riskIndex];
    const t = handleIncoming(
      { stage: 'em_checkin', questionIndex: riskIndex },
      button(answerButtonId(q.id, 2)),
      comAceite,
      QUESTIONNAIRE
    );
    expect(t.effects).toContainEqual({ type: 'risk_signal', questionId: q.id, value: 2 });
    const crise = t.replies.find((r) => r.origin === 'crise');
    expect(crise?.text).toContain('188');
    expect(crise?.text).toContain('192');
  });

  it('percorre o check-in inteiro e conclui', () => {
    let state: ConversationState = { stage: 'ocioso' };
    let t = handleIncoming(state, text('check-in'), comAceite, QUESTIONNAIRE);
    state = t.state;
    const recorded: string[] = [];
    for (const q of QUESTIONNAIRE.questions) {
      t = handleIncoming(state, button(answerButtonId(q.id, 0)), comAceite, QUESTIONNAIRE);
      state = t.state;
      for (const e of t.effects) if (e.type === 'answer_recorded') recorded.push(e.questionId);
    }
    expect(recorded).toEqual(QUESTIONNAIRE.questions.map((q) => q.id));
    expect(t.effects).toContainEqual({ type: 'checkin_completed' });
    expect(t.state.stage).toBe('ocioso');
    expect(t.replies.some((r) => r.origin === 'crise')).toBe(false);
  });
});
