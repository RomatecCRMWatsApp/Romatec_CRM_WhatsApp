/**
 * Planta baixa dos imóveis fora do banco: o PDF em base64 (data:) que vinha dentro de properties.plantaBaixaUrl
 * vai para o armazém; o campo passa a ser o link do próprio CRM (/api/imoveis/:id/planta), que serve o arquivo.
 */
import { apagarArquivos, armazemPronto, ehRef, guardarConferido } from './armazem';

export const rotaPlanta = (id: number) => `/api/imoveis/${id}/planta`;

/** Separa "data:<mime>;base64,<conteúdo>"; null se não for data URI */
export function dataUri(valor: string): { mime: string; buf: Buffer } | null {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(valor);
  return m ? { mime: m[1], buf: Buffer.from(m[2], 'base64') } : null;
}

/**
 * O que gravar no imóvel quando a tela manda plantaBaixaUrl.
 * - Igual ao link do CRM: nada muda (o arquivo continua o mesmo).
 * - data: com o armazém pronto: o PDF vai para o armazém e o campo vira o link.
 * - Qualquer outro valor (URL externa, vazio, data: sem armazém): grava como veio e solta a referência anterior.
 * Devolve também a referência antiga, para apagar depois de gravar.
 */
export async function plantaParaGravar(id: number, valor: string, refAtual: string | null | undefined):
  Promise<{ set: { plantaBaixaUrl?: string; plantaRef?: string | null }; apagar: string[] }> {
  if (valor === rotaPlanta(id)) return { set: {}, apagar: [] };
  const anterior = ehRef(refAtual) ? [refAtual] : [];
  const d = dataUri(valor);
  if (d && (await armazemPronto())) {
    try {
      const ref = await guardarConferido(d.buf, 'plantas');
      return { set: { plantaBaixaUrl: rotaPlanta(id), plantaRef: ref }, apagar: anterior };
    } catch (e: any) { console.warn('[Planta] armazém indisponível, grava no banco:', e?.message); }
  }
  return { set: { plantaBaixaUrl: valor, plantaRef: null }, apagar: anterior };
}

export function apagarPlantasDepois(refs: string[]) {
  if (refs.length) apagarArquivos(refs).catch(e => console.warn('[Planta] apagar no armazém:', e?.message));
}
