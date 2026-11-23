/**
 * Dados oficiais do escritório (imobiliária gestora): um lugar só para contratos, documentos, rodapés e publicidade.
 * CRECI jurídico obrigatório em toda publicidade (Lei 6.530/78 e Resolução COFECI 1.065/2007, art. 2º): nome
 * de fantasia + número do CRECI J da pessoa jurídica, além do CRECI do corretor.
 */
export const ESCRITORIO = {
  fantasia: 'Romatec Consultoria Total',
  razaoSocial: 'J R P Bezerra Ltda',
  cnpj: '17.261.987/0001-09',
  creciJ: 'CRECI J-1234',
  endereco: 'Rua São Raimundo, n.º 10, Centro, Açailândia/MA',
  responsavel: 'José Romário Pinto Bezerra',
  /** CRECI de pessoa física do responsável (F = pessoa física; J = jurídica) */
  creciResponsavel: 'CRECI/MA F-4.705',
} as const;

/** "Romatec Consultoria Total · CRECI J-1234" (linha obrigatória da publicidade) */
export const LINHA_PUBLICIDADE = `${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ}`;
/** "Romatec Consultoria Total, CRECI J-1234, CNPJ 17.261.987/0001-09" (rodapés e documentos) */
export const LINHA_OFICIAL = `${ESCRITORIO.fantasia}, ${ESCRITORIO.creciJ}, CNPJ ${ESCRITORIO.cnpj}`;

/** Identificação da gestora e do responsável técnico (tabelas de comissão, na tela e no PDF) */
export const GESTOR_EMPREENDIMENTO = {
  titulo: 'Gestão geral e vendas do empreendimento',
  gestora: `${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ} · CNPJ ${ESCRITORIO.cnpj}`,
  responsavel: `Responsável técnico pelas transações imobiliárias: ${ESCRITORIO.responsavel} · ${ESCRITORIO.creciResponsavel}`,
} as const;

/** Página pública do endereço (/escritorio): prévia própria no WhatsApp e botões para os apps de mapa */
export const ROTA_ESCRITORIO = '/escritorio';
export const TITULO_ESCRITORIO = 'Nosso escritório — Romatec Consultoria Total, Açailândia/MA';
/** Horário de atendimento no escritório */
/** Ponto de referência do escritório */
export const REFERENCIA_ESCRITORIO = 'Em frente ao Hotel Girafa';
export const HORARIO_ESCRITORIO = 'Segunda a sexta, das 9h às 12h e das 15h às 17h';
export const HORARIO_ESCRITORIO_EXTRA = 'Sábados, domingos e feriados: somente com agendamento';
export const DESCRICAO_ESCRITORIO = 'Rua São Raimundo, n.º 10, Centro, Açailândia/MA, em frente ao Hotel Girafa. Atendimento de segunda a sexta, das 9h às 12h e das 15h às 17h; sábados, domingos e feriados, somente com agendamento. Abra no Google Maps, Waze ou Apple Maps.';
const ENDERECO_BUSCA = 'Rua São Raimundo, 10, Centro, Açailândia - MA';
export const LINKS_MAPA_ESCRITORIO = {
  google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ENDERECO_BUSCA)}`,
  waze: `https://waze.com/ul?q=${encodeURIComponent(ENDERECO_BUSCA)}&navigate=yes`,
  apple: `https://maps.apple.com/?q=${encodeURIComponent(ENDERECO_BUSCA)}`,
} as const;

/** Contatos do escritório (o da Daniele aparece quando o número for preenchido: 55 + DDD + número) */
export const CONTATOS_ESCRITORIO = {
  jose: { nome: 'José Romário', papel: 'Corretor · CRECI/MA F-4.705', whatsapp: '5599991811246' },
  daniele: { nome: 'Daniele Cavalcante', papel: 'Secretária da Romatec', whatsapp: '5599992062871' },
  mensagem: 'Olá! Quero combinar uma visita ao escritório.',
} as const;

/** Atendimento de segunda a sexta, em minutos desde 00:00 (9h–12h e 15h–17h) */
export const JANELAS_ESCRITORIO: Array<[number, number]> = [[540, 720], [900, 1020]];

/** Feriados nacionais de data fixa (MM-DD); os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) ficam de fora */
export const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

export type SituacaoEscritorio =
  | { tipo: 'aberto'; ate: string }
  | { tipo: 'fechado'; abre: string }
  | { tipo: 'agendamento'; motivo: 'fim_de_semana' | 'feriado' };

const hhmm = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;

/** Data/hora em Açailândia (America/Fortaleza, UTC−3, sem horário de verão) */
export function horaLocalEscritorio(agora = Date.now()): { diaSemana: number; minutos: number; mmdd: string } {
  const d = new Date(agora - 3 * 3600_000);
  return { diaSemana: d.getUTCDay(), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), mmdd: d.toISOString().slice(5, 10) };
}

/** Situação do escritório agora: aberto (até quando), fechado (quando abre) ou só com agendamento */
export function situacaoEscritorio(agora = Date.now()): SituacaoEscritorio {
  const { diaSemana, minutos, mmdd } = horaLocalEscritorio(agora);
  if (diaSemana === 0 || diaSemana === 6) return { tipo: 'agendamento', motivo: 'fim_de_semana' };
  if (FERIADOS_FIXOS.includes(mmdd)) return { tipo: 'agendamento', motivo: 'feriado' };
  for (const [ini, fim] of JANELAS_ESCRITORIO) if (minutos >= ini && minutos < fim) return { tipo: 'aberto', ate: hhmm(fim) };
  const proxima = JANELAS_ESCRITORIO.find(([ini]) => minutos < ini);
  if (proxima) return { tipo: 'fechado', abre: `hoje às ${hhmm(proxima[0])}` };
  return { tipo: 'fechado', abre: diaSemana === 5 ? 'segunda às 9h' : 'amanhã às 9h' };
}

/** Texto do selo do topo */
export function textoSituacao(s: SituacaoEscritorio): string {
  if (s.tipo === 'aberto') return `Aberto agora · até ${s.ate}`;
  if (s.tipo === 'fechado') return `Fechado agora · abre ${s.abre}`;
  return s.motivo === 'feriado' ? 'Feriado · hoje só com agendamento' : 'Hoje só com agendamento';
}
