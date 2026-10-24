/**
 * Documentos financeiros de exemplo (faixa "MODELO — SEM VALOR"): boleto avulso A4, 2ª via atualizada, carnê v2 (bloco 1),
 * recibo e declaração anual — Chácara A01, entrada 6× + saldo 120×. Dados de pagamento FICTÍCIOS no formato do Asaas.
 *
 *   npx tsx scripts/financeiro-exemplo.ts <pasta de saída>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simular } from '../shared/simulador';
import { planoDoContrato } from '../server/contratos/plano';
import { calcularEncargos, somarDiasUteis } from '../server/financeiro/encargos';
import { blocoDoCarne, dadosCarne, dadosLamina, dadosParcela, type ContextoDocs } from '../server/financeiro/dados';
import { renderBoletoA4, renderCarneV2, renderDeclaracaoAnual, renderRecibo } from '../server/financeiro/render/documentos';

const saida = path.resolve(process.argv[2] ?? 'financeiro-exemplo');
const C = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const plano = planoDoContrato(simular(3025.11, 6, C), { modalidade: 'financiado', prazo: 120, dataPrimeiroPagamento: '2026-12-10' }, C, false);

/** Linha digitável fictícia com DV válido, no formato que o Asaas devolve (só para o exemplo) */
function asaasFicticio(n: number, valor: number, venc: string) {
  const fator = String(Math.round((Date.UTC(+venc.slice(0, 4), +venc.slice(5, 7) - 1, +venc.slice(8, 10)) - Date.UTC(2022, 4, 29)) / 86400000) + 1000).padStart(4, '0');
  const campoLivre = `0000${String(9000000 + n).padStart(8, "0")}0012345678`.padEnd(25, "0").slice(0, 25);
  const semDv = `4619${fator}${String(Math.round(valor * 100)).padStart(10, '0')}${campoLivre}`;
  let s = 0, peso = 2;
  for (let i = semDv.length - 1; i >= 0; i--) { s += +semDv[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = 11 - (s % 11);
  const cod = `${semDv.slice(0, 4)}${r === 0 || r > 9 ? 1 : r}${semDv.slice(4)}`;
  const m10 = (x: string) => { let t = 0; for (let i = 0; i < x.length; i++) { let v = +x[x.length - 1 - i] * (i % 2 === 0 ? 2 : 1); if (v > 9) v -= 9; t += v; } return (10 - (t % 10)) % 10; };
  const c1 = cod.slice(0, 4) + cod.slice(19, 24), c2 = cod.slice(24, 34), c3 = cod.slice(34, 44);
  const linha = `${c1}${m10(c1)}${c2}${m10(c2)}${c3}${m10(c3)}${cod[4]}${cod.slice(5, 19)}`;
  return { identificationField: linha, barCode: cod, nossoNumero: String(9000000 + n).padStart(11, '0'),
    pixPayload: `00020126MODELO-SEM-VALOR-PIX-COPIA-E-COLA-BOMJARDIMS${String(n).padStart(3, '0')}5204000053039865802BR`, pixQrBase64: null };
}

const ctx: ContextoDocs = {
  contrato: { id: 1, numero: 'BJ-2026-0001', modeloVersao: 'CPCV-BJ v2.0', codigoVerificacao: 'EX7K2M9P4Q1R' },
  lote: { codigo: 'A01', quadra: 'A', areaM2: 3025.11 },
  comprador: { nome: 'NOME DO COMPRADOR EXEMPLO', cpfCnpj: '00000000000', endereco: 'Endereço do comprador · Açailândia/MA · CEP 65.930-000' },
  beneficiario: 'VALMA MARILDA BONJARDIM FIGUEREDO — CPF 364.274.623-34',
  agenciaCodigo: '0001 / 0000000-0',
  urlPublica: 'https://romateccrm.com',
  plano,
};
const hoje = '2026-10-24';
const cobrancas = plano.parcelas.map((l, i) => ({ id: i + 1, ...l, asaas: asaasFicticio(i, l.valor, l.vencimento), dataDocumento: hoje }));

await mkdir(saida, { recursive: true });
const arq = (n: string, b: Buffer) => writeFile(path.join(saida, n), b);

// Boleto avulso: Saldo 2/120
const c8 = cobrancas[7];
await arq('BOLETO-AVULSO-A01-Saldo-2.pdf', await renderBoletoA4(dadosParcela(ctx, c8, cobrancas), { modelo: true }));

// 2ª via: mesma parcela, 18 dias de atraso, sem IPCA cadastrado
const pagamento = '2027-07-28';
const enc = calcularEncargos(c8.valor, c8.vencimento, pagamento, new Map([['2027-07', 0.38]]));
const novo = somarDiasUteis(pagamento, 2);
await arq('BOLETO-2VIA-A01-Saldo-2.pdf', await renderBoletoA4(
  { ...dadosParcela(ctx, c8, cobrancas), ...dadosLamina(ctx, { ...c8, asaas: asaasFicticio(7, enc.total, novo) }) },
  { modelo: true, segundaVia: { valorOriginal: c8.valor, encargos: enc.encargos, dias: enc.dias, valorAtualizado: enc.total, novoVencimento: novo } },
));

// Carnê anual (12 parcelas: Entrada 1–6 + Saldo 1–6 → 7 páginas) e carnê completo (126 parcelas, para controle)
const bloco = blocoDoCarne(cobrancas, 1);
await arq('CARNE-V2-A01-anual-1.pdf', await renderCarneV2(dadosCarne(ctx, bloco, 1), { modelo: true }));
await arq('CARNE-V2-A01-completo.pdf', await renderCarneV2(dadosCarne(ctx, blocoDoCarne(cobrancas, 'completo'), 'completo'), { modelo: true }));

// Recibo da Saldo 1/120
const c7 = cobrancas[6];
await arq('RECIBO-A01-Saldo-1.pdf', await renderRecibo({
  numero: 'REC-BJ-2027-000123', codigoVerif: '7F3A-9C21-BB04', urlVerificacao: 'https://romateccrm.com/r/REC-BJ-2027-000123',
  pagadorNome: ctx.comprador.nome, pagadorDoc: 'CPF 000.000.000-00', contratoNumero: ctx.contrato.numero, referente: 'Saldo 1/120 · Chácara A01',
  vencimento: c7.vencimento, valorPago: c7.valor, pagoEm: c7.vencimento, forma: 'PIX', saldoRemanescente: c7.saldoDevedor, parcelasAVencer: '119 do saldo',
  beneficiario: ctx.beneficiario, asaasId: 'pay_000000000000',
}, { modelo: true }));

// Declaração anual 2027 (entrada 1..5 já em 2027 + saldo pago no ano)
const doAno = cobrancas.filter(c => c.vencimento.startsWith('2027'));
await arq('DECLARACAO-QUITACAO-2027-A01.pdf', await renderDeclaracaoAnual({
  ano: 2027, contratoNumero: ctx.contrato.numero, compradorNome: ctx.comprador.nome, compradorDoc: 'CPF 000.000.000-00',
  unidade: 'Chácara A01 (Quadra A, 3.025,11 m²)', vendedora: 'VALMA MARILDA BONJARDIM FIGUEREDO',
  pagamentos: doAno.map(c => ({ parcela: `${c.tipo === 'entrada' ? 'Entrada' : 'Saldo'} ${c.numero}/${c.total}`, vencimento: c.vencimento, pagoEm: c.vencimento, valor: c.valor })),
  codigoVerif: 'D2A7-41C9-0E55', urlVerificacao: 'https://romateccrm.com/c/EX7K2M9P4Q1R', emitidaEm: '2028-05-03',
}, { modelo: true }));

console.log(JSON.stringify({ saida, encargos18dias: enc, novoVencimento: novo, cobrancasNoBloco1: bloco.length }, null, 2));
