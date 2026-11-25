/**
 * Questionário do check-in.
 *
 * ⚠️ PROVISÓRIO — TUDO NESTE ARQUIVO É EXEMPLO.
 * As escalas psicométricas validadas, o texto exato das perguntas, as opções e
 * a regra de "sinal de risco" ainda vão ser definidas com as psicólogas do
 * A.C.Camargo. "Escala A" e "Escala B" são nomes genéricos de propósito:
 * NÃO são escalas reais e NÃO devem ser usadas com pacientes.
 *
 * TODO(equipe + psicólogas): trocar pelas escalas validadas escolhidas,
 * com licença de uso, texto oficial em pt-BR e pontuação oficial.
 */

export type QuestionOption = { value: number; label: string };

export type Question = {
  id: string;
  scaleId: string;
  text: string;
  options: QuestionOption[];
  /**
   * Se definido, uma resposta com valor >= `riskMinValue` é "sinal de risco":
   * a paciente recebe na hora o CVV (188) e o SAMU (192) e a equipe é avisada.
   */
  riskMinValue?: number;
};

export type Scale = { id: string; label: string };

export type Questionnaire = {
  version: string;
  scales: Scale[];
  questions: Question[];
};

// PROVISÓRIO: opções de frequência de exemplo.
// TODO(WhatsApp): botões de resposta rápida do WhatsApp aceitam no máximo 3
// opções; com 4 opções o envio real vai precisar de "lista" — decidir com o provedor.
const FREQUENCIA: QuestionOption[] = [
  { value: 0, label: 'Nenhuma vez' },
  { value: 1, label: 'Alguns dias' },
  { value: 2, label: 'Mais da metade dos dias' },
  { value: 3, label: 'Quase todos os dias' },
];

export const QUESTIONNAIRE: Questionnaire = {
  version: 'exemplo-v0 (PROVISÓRIO)',
  scales: [
    { id: 'escala_a', label: 'Escala A (exemplo)' },
    { id: 'escala_b', label: 'Escala B (exemplo)' },
  ],
  questions: [
    {
      id: 'a1',
      scaleId: 'escala_a',
      text: '[Exemplo] Nas últimas duas semanas, com que frequência você se sentiu para baixo?',
      options: FREQUENCIA,
    },
    {
      id: 'a2',
      scaleId: 'escala_a',
      text: '[Exemplo] Nas últimas duas semanas, com que frequência você perdeu o interesse pelas coisas de que gosta?',
      options: FREQUENCIA,
    },
    {
      id: 'b1',
      scaleId: 'escala_b',
      text: '[Exemplo] Nas últimas duas semanas, com que frequência você se sentiu nervosa ou preocupada?',
      options: FREQUENCIA,
    },
    {
      id: 'b2',
      scaleId: 'escala_b',
      text: '[Exemplo] Nas últimas duas semanas, com que frequência você teve dificuldade para dormir por preocupação?',
      options: FREQUENCIA,
    },
    {
      id: 'r1',
      scaleId: 'escala_a',
      text: '[Exemplo] Nas últimas duas semanas, você teve pensamentos de que seria melhor não estar aqui ou de se machucar?',
      options: FREQUENCIA,
      // PROVISÓRIO: qualquer resposta diferente de "Nenhuma vez" é sinal de risco.
      riskMinValue: 1,
    },
  ],
};

export function scaleMax(questionnaire: Questionnaire, scaleId: string): number {
  return questionnaire.questions
    .filter((q) => q.scaleId === scaleId)
    .reduce((sum, q) => sum + Math.max(...q.options.map((o) => o.value)), 0);
}

export function isRiskAnswer(question: Question, value: number): boolean {
  return question.riskMinValue !== undefined && value >= question.riskMinValue;
}
