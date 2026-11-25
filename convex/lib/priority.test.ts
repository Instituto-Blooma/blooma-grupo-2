import { describe, expect, it } from 'vitest';
import {
  computePriority,
  levelForScore,
  overallScore,
  PRIORITY_CONFIG,
  scoreAnswers,
  triage,
  type PriorityConfig,
  type ScaleScore,
} from './priority';
import { QUESTIONNAIRE, type Questionnaire } from './questionnaire';

const config: PriorityConfig = {
  version: 'teste',
  provisional: true,
  weights: { a: 1, b: 1 },
  cutoffs: { alta: 60, media: 30 },
  riskForcesHigh: true,
};

const q: Questionnaire = {
  version: 'teste',
  scales: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  questions: [
    { id: 'a1', scaleId: 'a', text: '', options: [0, 1, 2, 3].map((v) => ({ value: v, label: `${v}` })) },
    { id: 'a2', scaleId: 'a', text: '', options: [0, 1, 2, 3].map((v) => ({ value: v, label: `${v}` })) },
    { id: 'b1', scaleId: 'b', text: '', options: [0, 1, 2, 3].map((v) => ({ value: v, label: `${v}` })) },
    {
      id: 'r1',
      scaleId: 'b',
      text: '',
      options: [0, 1, 2, 3].map((v) => ({ value: v, label: `${v}` })),
      riskMinValue: 1,
    },
  ],
};

function scores(a: number, b: number): ScaleScore[] {
  return [
    { scaleId: 'a', label: 'A', score: a, max: 6 },
    { scaleId: 'b', label: 'B', score: b, max: 6 },
  ];
}

describe('scoreAnswers', () => {
  it('soma as respostas por escala e calcula o máximo de cada escala', () => {
    const result = scoreAnswers(
      [
        { questionId: 'a1', value: 2 },
        { questionId: 'a2', value: 3 },
        { questionId: 'b1', value: 1 },
        { questionId: 'r1', value: 0 },
      ],
      q
    );
    expect(result.scaleScores).toEqual([
      { scaleId: 'a', label: 'A', score: 5, max: 6 },
      { scaleId: 'b', label: 'B', score: 1, max: 6 },
    ]);
    expect(result.riskQuestionIds).toEqual([]);
  });

  it('marca a pergunta que disparou o sinal de risco', () => {
    const result = scoreAnswers([{ questionId: 'r1', value: 1 }], q);
    expect(result.riskQuestionIds).toEqual(['r1']);
  });

  it('escala sem resposta conta como zero', () => {
    const result = scoreAnswers([{ questionId: 'a1', value: 3 }], q);
    expect(result.scaleScores[1].score).toBe(0);
  });

  it('recusa pergunta desconhecida ou valor fora das opções', () => {
    expect(() => scoreAnswers([{ questionId: 'zz', value: 0 }], q)).toThrow();
    expect(() => scoreAnswers([{ questionId: 'a1', value: 9 }], q)).toThrow();
  });
});

describe('overallScore', () => {
  it('vai de 0 a 100', () => {
    expect(overallScore(scores(0, 0), config)).toBe(0);
    expect(overallScore(scores(6, 6), config)).toBe(100);
    expect(overallScore(scores(3, 3), config)).toBe(50);
  });

  it('respeita os pesos', () => {
    const weighted = { ...config, weights: { a: 3, b: 1 } };
    // (3 * 1 + 1 * 0) / 4 = 75
    expect(overallScore(scores(6, 0), weighted)).toBe(75);
  });

  it('ignora escalas sem peso e devolve 0 se nenhuma tiver peso', () => {
    expect(overallScore(scores(6, 0), { ...config, weights: { a: 1 } })).toBe(100);
    expect(overallScore(scores(6, 6), { ...config, weights: {} })).toBe(0);
  });
});

describe('levelForScore (pontos de corte)', () => {
  it('aplica os pontos de corte nas bordas', () => {
    expect(levelForScore(29, config)).toBe('baixa');
    expect(levelForScore(30, config)).toBe('media');
    expect(levelForScore(59, config)).toBe('media');
    expect(levelForScore(60, config)).toBe('alta');
  });
});

describe('computePriority', () => {
  it('sinal de risco coloca em prioridade alta mesmo com pontuação baixa', () => {
    const result = computePriority(scores(0, 1), true, config);
    expect(result.level).toBe('alta');
    expect(result.reason).toBe('sinal_de_risco');
  });

  it('sem riskForcesHigh, o sinal de risco não muda o nível', () => {
    const result = computePriority(scores(0, 1), true, { ...config, riskForcesHigh: false });
    expect(result.level).toBe('baixa');
  });

  it('sem sinal de risco, usa a pontuação', () => {
    expect(computePriority(scores(4, 4), false, config).level).toBe('alta');
    expect(computePriority(scores(2, 2), false, config).level).toBe('media');
    expect(computePriority(scores(1, 0), false, config).level).toBe('baixa');
  });
});

describe('configuração real (PROVISÓRIA)', () => {
  it('está marcada como provisória', () => {
    expect(PRIORITY_CONFIG.provisional).toBe(true);
  });

  it('funciona de ponta a ponta com o questionário de exemplo', () => {
    const allZero = QUESTIONNAIRE.questions.map((question) => ({ questionId: question.id, value: 0 }));
    expect(triage(allZero, QUESTIONNAIRE).level).toBe('baixa');

    const allMax = QUESTIONNAIRE.questions.map((question) => ({ questionId: question.id, value: 3 }));
    const worst = triage(allMax, QUESTIONNAIRE);
    expect(worst.level).toBe('alta');
    expect(worst.score).toBe(100);
    expect(worst.hasRiskSignal).toBe(true);
  });
});
