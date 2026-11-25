/**
 * Regra fixa de prioridade da triagem.
 *
 * Função pura e determinística: soma a pontuação, aplica pesos e pontos de
 * corte de uma configuração e devolve a prioridade. Nenhuma IA decide nada.
 *
 * ⚠️ PROVISÓRIO — pesos e pontos de corte abaixo são VALORES DE EXEMPLO.
 * TODO(equipe + psicólogas do A.C.Camargo): definir pesos e pontos de corte
 * oficiais para as escalas escolhidas. Ao mudar, troque também `version`.
 */

import { isRiskAnswer, scaleMax, type Questionnaire } from './questionnaire';

export type PriorityLevel = 'alta' | 'media' | 'baixa';

export type PriorityConfig = {
  version: string;
  provisional: boolean;
  /** Peso de cada escala na pontuação geral (só a proporção entre eles importa). */
  weights: Record<string, number>;
  /** Pontuação geral (0–100) a partir da qual a prioridade sobe. */
  cutoffs: { alta: number; media: number };
  /** Se true, qualquer sinal de risco coloca a paciente em prioridade alta. */
  riskForcesHigh: boolean;
};

export const PRIORITY_CONFIG: PriorityConfig = {
  version: 'exemplo-v0',
  provisional: true, // PROVISÓRIO
  weights: { escala_a: 1, escala_b: 1 }, // PROVISÓRIO
  cutoffs: { alta: 60, media: 30 }, // PROVISÓRIO
  riskForcesHigh: true, // PROVISÓRIO (mas recomendamos manter)
};

export const PRIORITY_RANK: Record<PriorityLevel, number> = { alta: 0, media: 1, baixa: 2 };
export const NO_CHECKIN_RANK = 3;

export type AnswerInput = { questionId: string; value: number };

export type ScaleScore = { scaleId: string; label: string; score: number; max: number };

/** Soma as respostas por escala e lista as perguntas que dispararam sinal de risco. */
export function scoreAnswers(
  answers: AnswerInput[],
  questionnaire: Questionnaire
): { scaleScores: ScaleScore[]; riskQuestionIds: string[] } {
  const byScale = new Map<string, number>();
  const riskQuestionIds: string[] = [];
  for (const answer of answers) {
    const question = questionnaire.questions.find((q) => q.id === answer.questionId);
    if (!question) {
      throw new Error(`Pergunta desconhecida: ${answer.questionId}`);
    }
    if (!question.options.some((o) => o.value === answer.value)) {
      throw new Error(`Resposta inválida para ${answer.questionId}: ${answer.value}`);
    }
    byScale.set(question.scaleId, (byScale.get(question.scaleId) ?? 0) + answer.value);
    if (isRiskAnswer(question, answer.value)) {
      riskQuestionIds.push(question.id);
    }
  }
  const scaleScores = questionnaire.scales.map((scale) => ({
    scaleId: scale.id,
    label: scale.label,
    score: byScale.get(scale.id) ?? 0,
    max: scaleMax(questionnaire, scale.id),
  }));
  return { scaleScores, riskQuestionIds };
}

/** Pontuação geral de 0 a 100: média ponderada das escalas normalizadas. */
export function overallScore(scaleScores: ScaleScore[], config: PriorityConfig): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const s of scaleScores) {
    const weight = config.weights[s.scaleId] ?? 0;
    if (weight <= 0 || s.max <= 0) continue;
    weighted += weight * (s.score / s.max);
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weighted / totalWeight) * 100);
}

export function levelForScore(score: number, config: PriorityConfig): PriorityLevel {
  if (score >= config.cutoffs.alta) return 'alta';
  if (score >= config.cutoffs.media) return 'media';
  return 'baixa';
}

export function computePriority(
  scaleScores: ScaleScore[],
  hasRiskSignal: boolean,
  config: PriorityConfig = PRIORITY_CONFIG
): { level: PriorityLevel; score: number; reason: 'sinal_de_risco' | 'pontuacao' } {
  const score = overallScore(scaleScores, config);
  if (hasRiskSignal && config.riskForcesHigh) {
    return { level: 'alta', score, reason: 'sinal_de_risco' };
  }
  return { level: levelForScore(score, config), score, reason: 'pontuacao' };
}

/** Atalho: das respostas direto para a prioridade. */
export function triage(
  answers: AnswerInput[],
  questionnaire: Questionnaire,
  config: PriorityConfig = PRIORITY_CONFIG
) {
  const { scaleScores, riskQuestionIds } = scoreAnswers(answers, questionnaire);
  const hasRiskSignal = riskQuestionIds.length > 0;
  return { scaleScores, riskQuestionIds, hasRiskSignal, ...computePriority(scaleScores, hasRiskSignal, config) };
}
