/**
 * Monta o PDF completo do CPCV: gate → merge com a marca → LibreOffice → Anexos II, III e IV → faixa de minuta.
 * Não grava nada: quem chama registra a versão (contratoVersoes + contratoArquivos) e muda o status.
 */
import type { Ctx } from './contexto';
import { avaliarGate, type GateResult } from './gate';
import type { PlanoContrato } from './plano';
import { anexar, docxParaPdf, marcaDagua, mergeDocx, sha256, TEXTO_MINUTA } from './render';
import { anexoDiretrizes, anexoEstatuto, anexoTabelaPagamento, anexoTarifaAgua } from './anexos';
import { anexoDocumentosPartes, type DocumentoParte, anexoDocumentosOrigem, anexoLicenca, anexoMapa, anexoMemorial, type DadosUnidade, type DocumentoOrigem } from './anexosLote';
import { docIntermediacao, docTermoConcessao, docTermoCongelamento } from './docsComissao';

export class GateBloqueadoError extends Error {
  constructor(public gate: GateResult) {
    super(`Contrato definitivo bloqueado: ${[...gate.bloqueios, ...gate.faltantes.map(f => `falta ${f}`)].join('; ')}`);
  }
}

export interface OpcoesGeracao {
  alvo: 'minuta' | 'definitivo';
  modelo: string;
  marca: string;
  /** Só para prévia de layout (dados fictícios): gera o definitivo mesmo com o gate barrando e põe esta faixa */
  previaSemValor?: string;
  /** Geometria da unidade (DXF) para o memorial (Anexo I) e o mapa individual (Anexo V) */
  unidade: DadosUnidade;
  /** PDF da LO + certidão do registro (Anexo VI); sem ele, página "a anexar" */
  licenca?: Buffer | null;
  /** Documentos de origem do imóvel (matrícula, CCIR, ITR, SIGEF) — Anexo IX; sem eles, capa "a anexar" */
  documentosOrigem?: DocumentoOrigem[];
  /** Cópias dos documentos do comprador e do cônjuge enviados na ficha do contrato — Anexo X (sem eles, não entra) */
  documentosPartes?: DocumentoParte[];
}

export async function gerarContratoPdf(ctx: Ctx, plano: PlanoContrato, o: OpcoesGeracao): Promise<{ pdf: Buffer; sha256: string; gate: GateResult }> {
  const minuta = o.alvo === 'minuta';
  const gate = avaliarGate(ctx, o.alvo);
  if (!minuta && !gate.ok && !o.previaSemValor) throw new GateBloqueadoError(gate);
  if (minuta && gate.faltantes.length) throw new GateBloqueadoError(gate);

  const opcoes = { minuta, marca: o.marca };
  const [principal, memorial, tabela, estatuto, diretrizes, mapa, licenca, tarifaAgua, origem, intermediacao] = await Promise.all([
    mergeDocx(o.modelo, ctx, opcoes).then(docxParaPdf),
    anexoMemorial(o.unidade, ctx, o.marca),
    anexoTabelaPagamento(plano, ctx, o.marca),
    anexoEstatuto(ctx, opcoes),
    anexoDiretrizes(ctx, o.marca),
    anexoMapa(o.unidade, ctx, o.marca),
    anexoLicenca(ctx, o.marca, o.licenca),
    anexoTarifaAgua(o.marca),
    anexoDocumentosOrigem(ctx, o.marca, o.documentosOrigem ?? []),
    docIntermediacao(ctx, o.marca),
  ]);
  const partes = await anexoDocumentosPartes(ctx, o.marca, o.documentosPartes ?? []);
  // Ordem do contrato (Cláusula 23.4): I memorial, II tabela, III estatuto, IV diretrizes, V mapa, VI licença/registro,
  // VIII tarifa de água, IX documentos de origem do imóvel (o VII, manifesto de assinaturas, entra ao fim da assinatura); depois, o Contrato de Intermediação
  // (ciência dos 2% do corretor), assinado pelo cliente no mesmo fluxo
  // Concessão da proprietária: o Termo Aditivo de Concessão vem logo depois do CPCV (mesma assinatura) e não há
  // Contrato de Intermediação (não há corretor terceiro nem corretagem cobrada do beneficiário)
  const termo = plano.concessao ? await docTermoConcessao(ctx, plano, o.marca) : null;
  // Plano C com o complemento congelado: termo de anuência da proprietária, logo depois do CPCV (mesma rodada de assinaturas)
  const congelamento = !plano.concessao && plano.complemento_modo === 'congelado' ? await docTermoCongelamento(ctx, plano, o.marca) : null;
  let pdf = await anexar(principal, [...(termo ? [termo] : []), ...(congelamento ? [congelamento] : []), memorial, tabela, estatuto, diretrizes, mapa, licenca, ...(tarifaAgua ? [tarifaAgua] : []), origem, ...(partes ? [partes] : []), ...(termo ? [] : [intermediacao])]);
  if (minuta) pdf = await marcaDagua(pdf, TEXTO_MINUTA);
  else if (o.previaSemValor) pdf = await marcaDagua(pdf, o.previaSemValor);
  return { pdf, sha256: sha256(pdf), gate };
}
