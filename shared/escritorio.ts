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
