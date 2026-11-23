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
