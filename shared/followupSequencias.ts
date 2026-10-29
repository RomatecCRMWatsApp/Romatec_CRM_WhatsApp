/**
 * Sequências de follow-up por etapa do funil (Leads › Sequências de follow-up): quando o lead para de responder, o CRM
 * manda a sequência da etapa em que ele está — novo, qualificando, qualificado, visitou, proposta… Mudou de etapa,
 * a sequência recomeça pela da nova etapa. Etapa sem sequência ativa usa o follow-up padrão (1, 3, 7, 14 e 30 dias).
 * Regras: sem preço, sem escassez inventada e toda mensagem com a saída (SAIR).
 */

export interface PassoSequencia { dias: number; texto: string }
export interface Sequencia { etapa: string; ativo: boolean; passos: PassoSequencia[] }

export const ETAPAS_COM_SEQUENCIA = ['novo', 'qualificando', 'qualificado', 'visita_agendada', 'visitou', 'proposta'] as const;
export type EtapaSequencia = typeof ETAPAS_COM_SEQUENCIA[number];
export const MAX_PASSOS = 8;
export const SAIR = 'Se preferir não receber mais mensagens, é só responder SAIR.';

/** Variáveis do texto: {oi} {nome} {empreendimento} {link} {corretor} */
export const VARIAVEIS = [
  ['{oi}', '"Oi, Maria!" (ou "Oi!" sem nome)'], ['{nome}', 'primeiro nome'], ['{empreendimento}', 'nome do empreendimento'],
  ['{link}', 'página do empreendimento'], ['{corretor}', 'corretor responsável (nome e CRECI)'],
] as const;

export const SEQUENCIAS_PADRAO: Record<EtapaSequencia, Sequencia> = {
  novo: { etapa: 'novo', ativo: true, passos: [
    { dias: 1, texto: '{oi} Vi que você se interessou pelo {empreendimento}. Quer que eu te mande fotos, vídeo e a localização?' },
    { dias: 3, texto: '{oi} Deixo aqui as informações do {empreendimento}: {link}\nFicou alguma dúvida? Estou à disposição.' },
    { dias: 7, texto: '{oi} Ainda tem interesse? Me conta o que procura (tamanho, forma de pagamento, para quando) que eu te ajudo a escolher.' },
  ] },
  qualificando: { etapa: 'qualificando', ativo: true, passos: [
    { dias: 1, texto: '{oi} Para eu te indicar as melhores opções, me diga só: pretende pagar à vista ou parcelado?' },
    { dias: 3, texto: '{oi} Faltam poucas informações para eu montar a simulação para você. Posso continuar?' },
    { dias: 7, texto: '{oi} Quer conhecer o {empreendimento} pessoalmente? A visita é sem compromisso — me diga o melhor dia.' },
    { dias: 14, texto: '{oi} Passando para lembrar que {corretor} está à disposição para tirar suas dúvidas.' },
  ] },
  qualificado: { etapa: 'qualificado', ativo: true, passos: [
    { dias: 1, texto: '{oi} Com o que você me contou, já dá para montar a sua simulação. Quer que eu envie?' },
    { dias: 3, texto: '{oi} Que tal conhecer o {empreendimento} de perto? Agendo a visita no dia e horário que for melhor para você.' },
    { dias: 7, texto: '{oi} As informações do {empreendimento} estão aqui: {link}\nQuando quiser, marcamos a visita.' },
    { dias: 14, texto: '{oi} Ainda está procurando chácara? Se mudou alguma coisa nos seus planos, me avise que ajusto a proposta.' },
    { dias: 30, texto: '{oi} Esta é minha última mensagem por aqui 🙂 Quando quiser retomar, é só chamar neste número.' },
  ] },
  visita_agendada: { etapa: 'visita_agendada', ativo: false, passos: [
    { dias: 1, texto: '{oi} Tudo certo para a sua visita ao {empreendimento}? Se precisar mudar o horário, é só me avisar.' },
  ] },
  visitou: { etapa: 'visitou', ativo: true, passos: [
    { dias: 1, texto: '{oi} Obrigado pela visita ao {empreendimento}! O que achou? Ficou alguma dúvida?' },
    { dias: 3, texto: '{oi} Quer que eu te mande a simulação da chácara que você gostou, com a entrada e as parcelas?' },
    { dias: 7, texto: '{oi} Se quiser rever as chácaras disponíveis no mapa: {link}\nPosso separar alguma para você?' },
    { dias: 14, texto: '{oi} Passando para saber se você ainda pensa no {empreendimento}. {corretor} está à disposição.' },
  ] },
  proposta: { etapa: 'proposta', ativo: true, passos: [
    { dias: 1, texto: '{oi} Conseguiu olhar a proposta? Se quiser, explico qualquer ponto por aqui ou por ligação.' },
    { dias: 3, texto: '{oi} Para seguir com a reserva, preciso só dos seus documentos (RG/CNH, CPF e comprovante de endereço). Posso te passar a lista completa?' },
    { dias: 7, texto: '{oi} Ficou alguma dúvida sobre a forma de pagamento ou o contrato? Estou aqui para ajudar.' },
  ] },
};

export const ROTULO_ETAPA_SEQ: Record<EtapaSequencia, string> = {
  novo: 'Novo', qualificando: 'Qualificando', qualificado: 'Qualificado', visita_agendada: 'Visita agendada', visitou: 'Visitou', proposta: 'Proposta',
};

const primeiroNome = (nome?: string | null) => {
  const n = String(nome || '').trim().split(/\s+/)[0] || '';
  return !n || /^cliente$/i.test(n) ? '' : n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
};

/** Texto final do passo, com as variáveis trocadas e a saída (SAIR) garantida */
export function renderizarPasso(texto: string, v: { nome?: string | null; empreendimento?: string | null; link: string; corretor?: string | null }): string {
  const fn = primeiroNome(v.nome);
  const t = texto
    .split('{oi}').join(fn ? `Oi, ${fn}!` : 'Oi!')
    .split('{nome}').join(fn)
    .split('{empreendimento}').join(v.empreendimento || 'empreendimento')
    .split('{link}').join(v.link)
    .split('{corretor}').join(v.corretor || 'nosso corretor')
    .replace(/[ \t]{2,}/g, ' ').trim();
  return /\bSAIR\b/.test(t) ? t : `${t}\n\n${SAIR}`;
}

/** Valida a sequência editada: 1 a 8 passos, dias crescentes de 1 a 90, texto de 10 a 700 caracteres */
export function problemaSequencia(passos: PassoSequencia[]): string | null {
  if (!passos.length || passos.length > MAX_PASSOS) return `Use de 1 a ${MAX_PASSOS} mensagens`;
  let ant = 0;
  for (let i = 0; i < passos.length; i++) {
    const p = passos[i];
    if (!Number.isInteger(p.dias) || p.dias < 1 || p.dias > 90) return `Mensagem ${i + 1}: dias entre 1 e 90`;
    if (p.dias <= ant) return `Mensagem ${i + 1}: os dias precisam aumentar (${ant} → ${p.dias})`;
    if (p.texto.trim().length < 10 || p.texto.length > 700) return `Mensagem ${i + 1}: texto de 10 a 700 caracteres`;
    if (/R\$\s*\d/.test(p.texto)) return `Mensagem ${i + 1}: não coloque valores no follow-up automático`;
    ant = p.dias;
  }
  return null;
}
