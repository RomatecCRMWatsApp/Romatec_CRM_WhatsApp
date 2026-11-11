/**
 * Condições específicas pré-redigidas do contrato (Quadro-Resumo › condições específicas): o administrador marca as
 * que valem e ainda pode escrever outras. Cada texto começa por um título fixo, que identifica o item no campo.
 */
export type IdCondicaoEspecifica = 'congelamento' | 'liberacao_uso';

export interface CondicaoEspecificaPadrao { id: IdCondicaoEspecifica; rotulo: string; titulo: string; soPlanoC?: boolean; soAdmin?: boolean }

export const CONDICOES_ESPECIFICAS: CondicaoEspecificaPadrao[] = [
  { id: 'congelamento', rotulo: 'Congelamento do complemento da entrada (Plano C)', titulo: 'Congelamento do complemento da entrada:', soPlanoC: true, soAdmin: true },
  { id: 'liberacao_uso', rotulo: 'Liberação de uso após a 3ª parcela do financiamento', titulo: 'Liberação de uso:' },
];

const ordinal = (n: number) => `${n}º`;

/** Texto completo de uma condição padrão */
export function textoCondicaoEspecifica(id: IdCondicaoEspecifica, o: { inicioComplemento?: number | null } = {}): string {
  if (id === 'congelamento') {
    const m = Number(o.inicioComplemento) || 15;
    return `Congelamento do complemento da entrada: fica concedido ao(à) PROMISSÁRIO(A) COMPRADOR(A), por liberalidade da gestão, o congelamento das parcelas do complemento da entrada do Plano C, sem incidência de juros nem de correção monetária durante o congelamento; o pagamento do complemento terá início no ${ordinal(m)} mês contado do pagamento do valor do ato da entrada, em carnê próprio, separado do carnê das parcelas do saldo, cujos vencimentos seguem normalmente a partir do mês seguinte ao do ato.`;
  }
  return 'Liberação de uso: a liberação de uso da unidade (posse para cercar, edificar, criar e plantar, nos termos das Diretrizes de Uso) fica condicionada ao pagamento integral do valor do ato da entrada e à quitação da 3ª (terceira) parcela do financiamento do saldo, formalizada por Termo de Liberação de Uso emitido pela gestora; até lá, é permitido o acesso à unidade para visita e limpeza.';
}

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
