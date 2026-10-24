/**
 * Monta o PDF completo do CPCV: gate → merge com a marca → LibreOffice → Anexos II, III e IV → faixa de minuta.
 * Não grava nada: quem chama registra a versão (contratoVersoes + contratoArquivos) e muda o status.
 */
import type { Ctx } from './contexto';
import { avaliarGate, type GateResult } from './gate';
import type { PlanoContrato } from './plano';
import { anexar, docxParaPdf, marcaDagua, mergeDocx, sha256, TEXTO_MINUTA } from './render';
import { anexoDiretrizes, anexoEstatuto, anexoTabelaPagamento } from './anexos';

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
}

export async function gerarContratoPdf(ctx: Ctx, plano: PlanoContrato, o: OpcoesGeracao): Promise<{ pdf: Buffer; sha256: string; gate: GateResult }> {
  const minuta = o.alvo === 'minuta';
  const gate = avaliarGate(ctx, o.alvo);
  if (!minuta && !gate.ok && !o.previaSemValor) throw new GateBloqueadoError(gate);
  if (minuta && gate.faltantes.length) throw new GateBloqueadoError(gate);

  const opcoes = { minuta, marca: o.marca };
  const [principal, tabela, estatuto, diretrizes] = await Promise.all([
    mergeDocx(o.modelo, ctx, opcoes).then(docxParaPdf),
    anexoTabelaPagamento(plano, ctx, o.marca),
    anexoEstatuto(ctx, opcoes),
    anexoDiretrizes(),
  ]);
  let pdf = await anexar(principal, [tabela, estatuto, diretrizes]);
  if (minuta) pdf = await marcaDagua(pdf, TEXTO_MINUTA);
  else if (o.previaSemValor) pdf = await marcaDagua(pdf, o.previaSemValor);
  return { pdf, sha256: sha256(pdf), gate };
}
