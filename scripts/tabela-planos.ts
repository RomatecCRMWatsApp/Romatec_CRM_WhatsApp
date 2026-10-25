// npx tsx scripts/tabela-planos.ts <dxf> <saida.md> — tabela de planos do Bom Jardims com o simulador do sistema
import { readFileSync, writeFileSync } from 'node:fs';
import mapa from '../client/public/bom-jardims/mapa.json';
import { simular, taxaMensal } from '../shared/simulador';
import { importarLotesDxf } from '../server/lotes/dxf';

const c = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const [dxfArq, saida] = process.argv.slice(2);
const dxf = importarLotesDxf(readFileSync(dxfArq, 'latin1'), { fuso: 23 });
const areaDxf = new Map(dxf.lotes.map(l => [l.codigo, l.areaM2]));
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const lotes = (mapa as any).lotes.filter((l: any) => l.comercializavel)
  .map((l: any) => ({ codigo: l.codigo as string, quadra: l.quadra as string, area: (areaDxf.get(l.codigo) ?? l.areaM2) as number }))
  .sort((a: any, b: any) => a.quadra.localeCompare(b.quadra) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
const linhas = lotes.map((l: any) => ({ ...l, s: simular(l.area, 1, c) }));
const precos = linhas.map((l: any) => l.s.preco);
const i = taxaMensal(c.jurosAaEfetivo);

const out: string[] = [];
out.push('# Condomínio de Chácaras Bom Jardims — Tabela Completa de Planos de Financiamento', '');
out.push(`Açailândia/MA · ${lotes.length} chácaras comercializáveis · gerada em ${new Date().toLocaleDateString('pt-BR')} com o simulador do sistema (Romatec CRM)`, '');
out.push('## Condições', '');
out.push(
  `- **Juros:** 6% ao ano, efetivos (taxa mensal equivalente de ${(i * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}% a.m.), já embutidos nas parcelas.`,
  '- **Sistema:** Tabela Price (Sistema de Amortização Francês): **parcelas fixas, sem correção monetária** enquanto pagas em dia.',
  '- **Financiamento direto com o empreendedor**: não bancário, sem análise de banco.',
  '- **Entrada:** 30% do preço de tabela — à vista com **6,25% de desconto** sobre a entrada, ou parcelada em **2 a 6× sem juros e sem desconto**.',
  '- **Saldo:** 70% do preço de tabela, em 12, 24, 36, 60 ou 120 parcelas mensais fixas (a 1ª vence no mês seguinte à última parcela da entrada).',
  '- **À vista total:** preço de tabela com **R$ 10.000,00 de desconto**.',
  '- **Preço de tabela:** R$ 160.000,00 para a chácara padrão (até 3.025,11 m²); chácaras maiores, proporcional à área.',
  '- **Informação ao consumidor (art. 52 do CDC):** preço à vista, taxa efetiva de juros (6% a.a.), número e periodicidade das prestações e soma total a pagar constam do contrato; o comprador pode antecipar parcelas com redução proporcional dos juros.',
  '- *Valores sujeitos a alteração e à disponibilidade das unidades. Esta tabela não é oferta vinculante; prevalecem o contrato e as condições vigentes na data da proposta.*',
  '',
);
out.push('## Faixas de preço', '');
const faixas = new Map<number, string[]>();
for (const l of linhas) faixas.set(l.s.preco, [...(faixas.get(l.s.preco) ?? []), l.codigo]);
out.push(`- **Menor preço:** ${brl(Math.min(...precos))} · **maior preço:** ${brl(Math.max(...precos))}`);
out.push(`- **Chácara padrão (${brl(160000)}):** ${faixas.get(160000)?.length ?? 0} unidades`);
out.push(`- **Chácaras com área maior (preço proporcional):** ${lotes.length - (faixas.get(160000)?.length ?? 0)} unidades`, '');

out.push('## Tabela por chácara', '');
out.push('| Chácara · Quadra | Área (m²) | Preço de tabela | À vista total (−R$ 10 mil) | Entrada 30% à vista (−6,25%) | Saldo 70% | 12× | 24× | 36× | 60× | 120× |');
out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const l of linhas) {
  const p = (n: number) => brl(l.s.planos.find((x: any) => x.prazo === n)!.parcela);
  out.push(`| ${l.codigo} · ${l.quadra} | ${m2(l.area)} | ${brl(l.s.preco)} | ${brl(l.s.avistaTotal.valor)} | ${brl(l.s.entradaAvista)} | ${brl(l.s.saldo)} | ${p(12)} | ${p(24)} | ${p(36)} | ${p(60)} | ${p(120)} |`);
}
out.push('');
out.push('## Entrada parcelada (2 a 6×, sem juros) — por faixa de preço', '');
out.push('| Preço de tabela | Entrada 30% | 2× | 3× | 4× | 5× | 6× | Chácaras |');
out.push('|---:|---:|---:|---:|---:|---:|---:|---|');
for (const [preco, cods] of [...faixas.entries()].sort((a, b) => a[0] - b[0])) {
  const area = linhas.find((l: any) => l.s.preco === preco)!.area;
  const parc = [2, 3, 4, 5, 6].map(n => { const s = simular(area, n, c); const v = s.parcelasEntrada; return v.every((x: number) => x === v[0]) ? brl(v[0]) : `${brl(v[0])}*`; });
  out.push(`| ${brl(preco)} | ${brl(preco * 0.3)} | ${parc.join(' | ')} | ${cods.length > 12 ? `${cods.length} unidades` : cods.join(', ')} |`);
}
out.push('', '\\* centavos de arredondamento ajustados na última parcela da entrada.', '');
out.push('---', 'Romatec Consultoria Total — gestão e administração de vendas · Atendimento (99) 9 9101-1970 · Vendas (99) 9 9181-1246');
writeFileSync(saida, out.join('\n'), 'utf8');
console.log(saida, lotes.length, Math.min(...precos), Math.max(...precos), faixas.size);
