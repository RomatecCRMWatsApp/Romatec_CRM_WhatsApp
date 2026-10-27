/**
 * Modelos em PDF para baixar na aba Contratos (sem criar nada no banco): Contrato de Intermediação, carnê, boleto, recibo,
 * os anexos do CPCV (II tabela de pagamento, III Estatuto, IV Diretrizes de Uso),
 * preenchidos com o mesmo contrato fictício do contrato modelo (cliente exemplo, chácara A01, entrada 6× + maior prazo).
 *
 * Carnê e recibo: linha digitável, código de barras, nosso número e PIX ZERADOS — no sistema eles vêm sempre do Asaas;
 * aqui nada é pagável. Beneficiário: o da conta Asaas do empreendimento (nunca fixo no código).
 */
import { montarContexto } from './contexto';
import { docIntermediacao } from './docsComissao';
import { marcaDagua } from './render';
import { prepararModelo, CLIENTE_EXEMPLO } from './modelo';
import { anexoDiretrizes, anexoEstatuto, anexoTabelaPagamento } from './anexos';
import { blocoDoCarne, dadosCarne, dadosParcela, rotuloParcela, type CobrancaDoc, type ContextoDocs } from '../financeiro/dados';
import { renderBoletoA4, renderCarneV2, renderRecibo } from '../financeiro/render/documentos';
import { beneficiarioDoEmpreendimento, urlPublica } from '../financeiro/servico';

export const TIPOS_MODELO = ['intermediacao', 'carne', 'boleto', 'recibo', 'tabela', 'estatuto', 'diretrizes'] as const;
export type TipoModelo = typeof TIPOS_MODELO[number];

const SEM_VALOR = 'MODELO — SEM VALOR';

/** Dados de pagamento zerados: o modelo mostra o layout, mas não é pagável em lugar nenhum */
const pagamentoZerado = () => ({
  identificationField: '0'.repeat(47), barCode: '0'.repeat(44), nossoNumero: '0'.repeat(11),
  pixPayload: 'MODELO-SEM-VALOR', pixQrBase64: null,
});

async function contextoModelo(slug: string, usuarioId?: number | null) {
  const m = await prepararModelo(slug, 'A01', usuarioId);
  const benef = await beneficiarioDoEmpreendimento(m.emp.id, m.emp.slug);
  const ctx: ContextoDocs = {
    contrato: { id: 0, numero: m.entrada.contrato.numero, modeloVersao: m.j.modeloVersao ?? 'CPCV', codigoVerificacao: 'MODELO000000' },
    lote: { codigo: m.lote.codigo, quadra: m.lote.quadra ?? null, areaM2: Number(m.lote.areaM2) },
    comprador: { nome: CLIENTE_EXEMPLO.comprador.nome.toUpperCase(), cpfCnpj: CLIENTE_EXEMPLO.comprador.cpfCnpj, endereco: 'Endereço do comprador · Açailândia/MA' },
    // Sem Asaas o texto já vem com o rótulo ("Beneficiário: conta … não configurada"); o documento põe o rótulo de novo
    beneficiario: benef.texto.replace(/^Benefici[áa]rio:\s*/i, ''), agenciaCodigo: benef.agenciaConta || '—', urlPublica: urlPublica(), plano: m.plano as any,
  };
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const cobrancas: CobrancaDoc[] = (m.plano as any).parcelas.map((p: any, i: number) => ({ id: i + 1, ...p, asaas: pagamentoZerado(), dataDocumento: hoje }));
  return { m, ctx, cobrancas };
}

export async function modeloDocumento(tipo: TipoModelo, slug: string, usuarioId?: number | null): Promise<{ pdf: Buffer; nome: string }> {
  const S = slug.toUpperCase();
  if (tipo === 'intermediacao') {
    const m = await prepararModelo(slug, 'A01', usuarioId);
    const pdf = await marcaDagua(await docIntermediacao(montarContexto(m.entrada), m.j.marcaSlug), SEM_VALOR);
    return { pdf, nome: `MODELO-CONTRATO-INTERMEDIACAO-${S}.pdf` };
  }
  // Anexos do CPCV: os mesmos arquivos que entram em cada contrato (Estatuto e Diretrizes valem como estão, sem faixa)
  if (tipo === 'diretrizes') return { pdf: await anexoDiretrizes(), nome: `DIRETRIZES-DE-USO-${S}.pdf` };
  if (tipo === 'estatuto' || tipo === 'tabela') {
    const m = await prepararModelo(slug, 'A01', usuarioId);
    const ctx = montarContexto(m.entrada);
    if (tipo === 'estatuto') return { pdf: await anexoEstatuto(ctx, { minuta: false, marca: m.j.marcaSlug }), nome: `ESTATUTO-${S}.pdf` };
    return { pdf: await marcaDagua(await anexoTabelaPagamento(m.plano as any, ctx, m.j.marcaSlug), SEM_VALOR), nome: `MODELO-TABELA-PAGAMENTO-ANEXO-II-${S}.pdf` };
  }
  const { ctx, cobrancas } = await contextoModelo(slug, usuarioId);
  if (tipo === 'carne') {
    // Carnê anual 1 (12 parcelas: entrada + início do saldo)
    const bloco = blocoDoCarne(cobrancas, 1);
    return { pdf: await renderCarneV2(dadosCarne(ctx, bloco, 1), { modelo: true }), nome: `MODELO-CARNE-${S}.pdf` };
  }
  const c = cobrancas.find(x => x.tipo === 'saldo') ?? cobrancas[0];
  if (tipo === 'boleto') return { pdf: await renderBoletoA4(dadosParcela(ctx, c, cobrancas), { modelo: true }), nome: `MODELO-BOLETO-${S}.pdf` };
  const pdf = await renderRecibo({
    numero: 'REC-MODELO-000000', codigoVerif: '0000-0000-0000', urlVerificacao: `${ctx.urlPublica}/r/REC-MODELO-000000`,
    pagadorNome: ctx.comprador.nome, pagadorDoc: 'CPF 000.000.000-00', contratoNumero: ctx.contrato.numero,
    referente: `${rotuloParcela(c)} · Chácara ${ctx.lote.codigo}`, vencimento: c.vencimento, valorPago: c.valor, pagoEm: c.vencimento,
    forma: 'PIX', saldoRemanescente: c.saldoDevedor, parcelasAVencer: `${c.total - c.numero} do saldo`,
    beneficiario: ctx.beneficiario, asaasId: '—',
  }, { modelo: true });
  return { pdf, nome: `MODELO-RECIBO-${S}.pdf` };
}
