/**
 * Proposta do simulador em PDF (servidor): o mesmo conteúdo da página de impressão — chácara, plano escolhido
 * (entrada de 30% ou Planos A, B e C), à vista, juros, aviso legal e o corretor que gerou. Com o PDF no servidor, a
 * proposta ganha as opções dos outros PDFs (baixar, WhatsApp, link, compartilhar).
 */
import { AVISO_LEGAL_SIMULACAO, brl, simular, textoEntrada, textoJuros, type CondicoesPagamento } from '../../shared/simulador';
import { ROTULO_CONDICAO, planoCondicao, type CondicaoPagamento } from '../../shared/condicoesLancamento';
import { ESCRITORIO } from '../../shared/escritorio';
import type { CorretorPdf } from '../pdf/cartaoCorretor';

const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface DadosProposta {
  lote: { codigo: string; quadra: string | null; areaM2: number; precoTabela: number | null };
  empreendimento: string;
  c: CondicoesPagamento;
  entrada: number; prazo: number; condicao: CondicaoPagamento;
  /** Carimbo do corretor (Materiais › Meu carimbo; sem ele, o cadastro); foto já redonda */
  corretor: CorretorPdf;
}

export { fotoRedonda } from '../pdf/cartaoCorretor';

export class PropostaErro extends Error { constructor(m: string, public status = 422) { super(m); } }

export async function pdfProposta(d: DadosProposta): Promise<Buffer> {
  const { escritor } = await import('../contratos/docsComissao');
  const sim = simular(d.lote.areaM2, d.condicao === 'padrao' ? d.entrada : 1, d.c, d.lote.precoTabela);
  const linhas: string[][] = [['Preço da chácara', brl(sim.preco)]];
  let nota = '';
  if (d.condicao !== 'padrao') {
    let pc;
    try { pc = planoCondicao(sim.preco, d.condicao, d.prazo, d.c); } catch (e: any) { throw new PropostaErro(e?.message || `Prazo de ${d.prazo} meses não está nas condições`); }
    linhas.push(['Forma de pagamento', ROTULO_CONDICAO[d.condicao].titulo], ['Entrada no ato', brl(pc.entradaAto)]);
    if (pc.complemento) linhas.push(['Resto da entrada (sem juros)', `${pc.complemento.qtd}× de ${brl(pc.complemento.parcela)} — ${pc.modoC === 'sequencial' ? 'antes do financiamento' : 'no mesmo boleto da parcela'}`]);
    linhas.push(['Saldo financiado', brl(pc.saldoFinanciado)], ['Parcelas do saldo (fixas)', `${pc.prazo}× de ${brl(pc.parcela)}`]);
    if (pc.reforco) linhas.push(['Reforços anuais', `${pc.reforco.qtd}× de ${brl(pc.reforco.valor)} (a cada ${pc.reforco.intervaloMeses} meses)`]);
    if (pc.complemento && pc.modoC !== 'sequencial') linhas.push(['Desembolso mensal nos primeiros meses', brl(pc.mensalInicial)]);
    linhas.push(['Juros no período', brl(pc.juros)], ['Total a pagar', brl(pc.totalPago)]);
    nota = '1ª parcela do saldo no mês seguinte ao pagamento da entrada.';
  } else {
    const plano = sim.planos.find(p => p.prazo === d.prazo);
    if (!plano) throw new PropostaErro(`Prazo de ${d.prazo} meses não está nas condições`);
    linhas.push([`Entrada (${Math.round(d.c.entradaPct * 100)}%)`, textoEntrada(sim)], [`Saldo financiado (${Math.round((1 - d.c.entradaPct) * 100)}%)`, brl(sim.saldo)],
      ['Parcelas do saldo (fixas)', `${plano.prazo}× de ${brl(plano.parcela)}`], ['Total das parcelas do saldo', brl(plano.totalSaldo)],
      ['Juros no período', brl(plano.juros)], ['Total a pagar (entrada + saldo)', brl(plano.totalPago)]);
    nota = `1ª parcela do saldo no mês seguinte à ${d.entrada === 1 ? 'entrada à vista' : 'última parcela da entrada'}.`;
  }
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
  const quem = `${d.corretor.nome}${d.corretor.creci ? ` · ${d.corretor.creci}` : ''}`;
  // Carimbo do corretor no rodapé de todas as páginas, como nos materiais de divulgação
  const w = await escritor(`Proposta — Chácara ${d.lote.codigo}`, 'bomjardims', `${quem}${d.corretor.telefone ? ` · WhatsApp ${d.corretor.telefone}` : ''} · Proposta Chácara ${d.lote.codigo} · ${hoje}`);
  w.cabecalho('PROPOSTA DE FINANCIAMENTO DIRETO', `${d.empreendimento} · Açailândia/MA · ${hoje}`);
  w.paragrafo([{ t: `Chácara ${d.lote.codigo}${d.lote.quadra ? ` · Quadra ${d.lote.quadra}` : ''} · ${m2(d.lote.areaM2)} m²`, b: true }], { size: 12, depois: 6 });
  w.tabela(['Condição', 'Valor'], linhas, { pesos: [1.3, 1.7], direita: [1] });
  w.paragrafo(`${textoJuros(d.c)}. ${nota}`, { antes: 6 });
  w.paragrafo([{ t: 'Ou pagamento integral à vista: ', b: true }, { t: `${brl(sim.avistaTotal.valor)} — preço cheio ${brl(sim.preco)} com desconto de ${brl(sim.avistaTotal.desconto)}, pago de uma só vez.` }], { antes: 8 });
  w.paragrafo(AVISO_LEGAL_SIMULACAO, { size: 8.4, antes: 10 });
  w.espaco(14);
  await w.cartaoCorretor(d.corretor);
  w.paragrafo(`${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ} · Valores sujeitos a alteração e disponibilidade.`, { size: 8.4 });
  return w.salvar();
}
