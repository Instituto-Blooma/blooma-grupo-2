/**
 * Textos que a paciente recebe.
 *
 * PROVISÓRIO: rascunho para o protótipo. O texto final (principalmente o termo
 * de consentimento e a mensagem de crise) precisa ser revisado pela equipe de
 * psicologia e pelo jurídico.
 *
 * Regra: nunca chamar o produto de terapia, atendimento ou diagnóstico.
 * É uma triagem; quem cuida é sempre a equipe.
 *
 * TODO(equipe): nome do produto. Enquanto não houver, usamos "canal de
 * acompanhamento da equipe de Psicologia".
 */

const EMERGENCIA = 'Em emergência: SAMU 192 · CVV 188 (24h, ligação gratuita).';

function saudacao(nome?: string) {
  return nome ? `, ${nome}` : '';
}

export const MSG = {
  boasVindas:
    'Olá! Aqui é o canal de acompanhamento da equipe de Psicologia. 💛\n\n' +
    'Uma vez por semana vamos te mandar algumas perguntas rápidas, com botões, para saber como você está. ' +
    'Suas respostas ajudam a equipe a saber quem precisa de contato primeiro.\n\n' +
    'Este canal não é atendimento de emergência e não substitui suas consultas. Quem cuida de você é sempre a equipe.',

  termo:
    'Termo de consentimento (texto provisório)\n\n' +
    '• Suas respostas são dados de saúde e só a equipe de psicologia tem acesso.\n' +
    '• Usamos as respostas apenas para organizar o acompanhamento.\n' +
    '• Você pode pedir para parar a qualquer momento escrevendo aqui.\n\n' +
    'Você aceita participar?',

  aceiteObrigada: 'Obrigada por aceitar. 💛',

  pedirApelido: 'Como você gostaria de ser chamada?',

  recusa:
    'Tudo bem, respeitamos sua decisão. Não vamos te enviar perguntas. ' +
    'Se mudar de ideia, é só mandar "oi".\n\n' +
    EMERGENCIA,

  tocarBotao: 'Para responder, toque em uma das opções abaixo. 🙂',

  menu: (nome?: string) =>
    `Oi${saudacao(nome)}! Quando quiser, toque em "Começar check-in".\n\n` +
    'Se quiser falar com a equipe de psicologia, pode escrever aqui. A equipe lê e responde.',

  inicioCheckin: 'Vamos lá! São perguntas rápidas. Não existe resposta certa ou errada.',

  fimCheckin: (nome?: string) =>
    `Obrigada${saudacao(nome)}! Check-in concluído. ✅\n\n` +
    'A equipe de psicologia vai ver suas respostas. Se quiser, pode escrever aqui.\n\n' +
    EMERGENCIA,

  // PROVISÓRIO: revisar com as psicólogas o texto e o protocolo de contato.
  crise:
    'Percebemos que você pode estar passando por um momento muito difícil. Você não está sozinha. 💛\n\n' +
    '📞 Se estiver em perigo agora, ligue 192 (SAMU).\n' +
    '📞 Para conversar com alguém agora, ligue 188 (CVV) — 24 horas, ligação gratuita.\n\n' +
    'A equipe de psicologia já foi avisada.',

  lembrete: (nome?: string) =>
    `Oi${saudacao(nome)}! Está na hora do seu check-in da semana. Leva só um minutinho.`,
};
