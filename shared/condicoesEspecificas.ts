/**
 * Condições específicas pré-redigidas do contrato (Quadro-Resumo › condições específicas): o administrador marca as
 * que valem e ainda pode escrever outras. Cada texto começa por um título fixo, que identifica o item no campo.
 */
export type IdCondicaoEspecifica = 'congelamento' | 'liberacao_uso' | 'posse_concessao';

export interface CondicaoEspecificaPadrao {
  id: IdCondicaoEspecifica; rotulo: string; titulo: string; soPlanoC?: boolean; soAdmin?: boolean;
  /** Só na concessão da proprietária (vem marcada por padrão) */ soConcessao?: boolean;
  /** Não vale na concessão (não há parcelas) */ semConcessao?: boolean;
}

export const CONDICOES_ESPECIFICAS: CondicaoEspecificaPadrao[] = [
  { id: 'congelamento', rotulo: 'Congelamento do complemento da entrada (Plano C)', titulo: 'Congelamento do complemento da entrada:', soPlanoC: true, soAdmin: true },
  { id: 'liberacao_uso', rotulo: 'Liberação de uso após a 3ª parcela do financiamento', titulo: 'Liberação de uso:', semConcessao: true },
  { id: 'posse_concessao', rotulo: 'Posse e uso na concessão (padrão da concessão)', titulo: 'Posse e uso na concessão:', soConcessao: true, soAdmin: true },
];

/** Prazo para a gestora entregar a unidade (vistoria, Termo de Entrega e Termo de Liberação de Uso) na concessão */
export const DIAS_ENTREGA_CONCESSAO = 15;

const ordinal = (n: number) => `${n}º`;

/** Texto completo de uma condição padrão */
export function textoCondicaoEspecifica(id: IdCondicaoEspecifica, o: { inicioComplemento?: number | null } = {}): string {
  if (id === 'congelamento') {
    const m = Number(o.inicioComplemento) || 15;
    return `Congelamento do complemento da entrada: fica concedido ao(à) PROMISSÁRIO(A) COMPRADOR(A), por liberalidade da gestão, o congelamento das parcelas do complemento da entrada do Plano C, sem incidência de juros nem de correção monetária durante o congelamento; o pagamento do complemento terá início no ${ordinal(m)} mês contado do pagamento do valor do ato da entrada, em carnê próprio, separado do carnê das parcelas do saldo, cujos vencimentos seguem normalmente a partir do mês seguinte ao do ato.`;
  }
  if (id === 'posse_concessao') return TEXTO_POSSE_CONCESSAO;
  return 'Liberação de uso: a liberação de uso da unidade (posse para cercar, edificar, criar e plantar, nos termos das Diretrizes de Uso) fica condicionada ao pagamento integral do valor do ato da entrada e à quitação da 3ª (terceira) parcela do financiamento do saldo, formalizada por Termo de Liberação de Uso emitido pela gestora; até lá, é permitido o acesso à unidade para visita e limpeza.';
}

/**
 * Concessão: o preço fica quitado pela proprietária na assinatura (Termo Aditivo de Concessão, cl. 2.1), o que equivale ao
 * pagamento à vista do CPCV (Cláusula 6ª): imissão na posse e liberação de uso logo após as vistorias. A propriedade só
 * passa com a escritura e o registro, depois do registro do parcelamento (CC arts. 108, 541 e 1.245).
 */
export const TEXTO_POSSE_CONCESSAO =
  `Posse e uso na concessão: concedida a unidade sem contraprestação e considerado quitado o preço pela VENDEDORA (Termo Aditivo de Concessão, cláusula 2.1), aplica-se ao(à) BENEFICIÁRIO(A) a regra do pagamento integral à vista da Cláusula 6ª: (a) a imissão na posse ocorre após a assinatura do CPCV e do Termo Aditivo de Concessão por todas as partes, mediante Termo de Entrega com vistoria dos marcos (item 6.1); (b) a liberação de uso (cercar, edificar, criar e plantar, nos termos das Diretrizes de Uso) se dá pelo Termo de Liberação de Uso, emitido após a vistoria de medição e locação (itens 6.1.1 e 6.1.2), ambos em até ${DIAS_ENTREGA_CONCESSAO} (quinze) dias da última assinatura; (c) fica dispensado o mínimo de parcelas pagas do item 6.2, alínea "b", permanecendo exigidos a aprovação do projeto, o alvará municipal e o sistema individual de esgotamento sanitário (item 6.2, alíneas "c" a "e"); (d) a partir da imissão na posse, correm por conta do(a) BENEFICIÁRIO(A) o IPTU, as taxas, o consumo de água, a energia e a contribuição associativa (Cláusulas 13ª e 14ª). A posse ora transmitida não se confunde com o direito real de usufruto, e a propriedade somente se transfere pela escritura pública e pelo seu registro no Registro de Imóveis, após o registro do parcelamento e a abertura da matrícula individual da unidade (Código Civil, arts. 108, 541 e 1.245; Lei n.º 6.766/1979, arts. 18 e 37).`;

/** Separa o campo em: condições padrão marcadas e texto livre */
export function separarCondicoes(texto: string): { marcadas: IdCondicaoEspecifica[]; livre: string } {
  const paras = String(texto ?? '').split(/\n+/).map(p => p.trim()).filter(p => p && p !== 'Não há.');
  const marcadas: IdCondicaoEspecifica[] = [];
  const livres: string[] = [];
  for (const p of paras) {
    const c = CONDICOES_ESPECIFICAS.find(x => p.startsWith(x.titulo));
    if (c) { if (!marcadas.includes(c.id)) marcadas.push(c.id); } else livres.push(p);
  }
  return { marcadas, livre: livres.join('\n') };
}

/** Junta as condições marcadas (na ordem da lista) e o texto livre num campo só */
export function montarCondicoes(marcadas: IdCondicaoEspecifica[], livre: string, o: { inicioComplemento?: number | null } = {}): string {
  const padrao = CONDICOES_ESPECIFICAS.filter(c => marcadas.includes(c.id)).map(c => textoCondicaoEspecifica(c.id, o));
  return [...padrao, ...(livre.trim() ? [livre] : [])].join('\n');
}
