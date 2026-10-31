/**
 * Contrato de exemplo (prévia para revisão do layout): Chácara A02 (ou LOTE=<código>) do Bom Jardims, comprador fictício casado,
 * entrada em 6× + saldo em 120×. Gera a minuta e uma prévia do definitivo com dados fictícios nos campos de registro.
 *
 *   PLANO=A|B|C: contrato da condição de lançamento (modelo …-v3-PLANO-X.docx, entrada R$ 10 mil)
 *   SOFFICE_BIN="C:\Program Files\LibreOffice\program\soffice.exe" npx tsx scripts/contrato-exemplo.ts <pasta de saída>
 *
 * Não usa o banco: o jurídico vem do seed (templates/defaults_empreendimento.json) e o lote, do mapa público.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mapa from '../client/public/bom-jardims/mapa.json';
import { simular } from '../shared/simulador';
import { geoParaUtm } from '../shared/utm';
import { memorialDoLote, ruaDoLado, type LoteMemorial, type RuaMemorial } from '../server/lotes/memorial';
import { SEED_EMP_JURIDICO } from '../server/_core/migrations/seedContratos';
import { montarContexto, type EntradaContexto } from '../server/contratos/contexto';
import { planoDoContrato } from '../server/contratos/plano';
import { gerarContratoPdf } from '../server/contratos/gerar';
import type { DadosUnidade } from '../server/contratos/anexosLote';
import { carregarCamadas } from '../server/contratos/mapaEmpreendimento';
import { importarLotesDxf } from '../server/lotes/dxf';
import { hojeIso } from '../server/contratos/formato';
import { docComissaoRomatec, docIntermediacao } from '../server/contratos/docsComissao';

const saida = path.resolve(process.argv[2] ?? 'contrato-exemplo');
const FUSO = 23;
// MODELO=1: contrato modelo (minuta com o cliente fictício padrão, para apresentar e revisar com o jurídico)
const MODELO = process.env.MODELO === '1';
const CODIGO = process.env.LOTE ?? (MODELO ? 'A01' : 'A02');
const dxf = process.env.DXF ? importarLotesDxf(await readFile(process.env.DXF, 'latin1'), { fuso: FUSO }) : null;

// Condições vigentes do Bom Jardims (seed de condicoesPagamento — addSimulador.ts)
const condicoes = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};

// Geometria do mapa público em UTM (no banco os vértices já vêm do DXF em UTM)
const utm = (poly: number[][]) => poly.slice(0, -1).map(([lon, lat]) => geoParaUtm(lon, lat, FUSO));
const todos: LoteMemorial[] = dxf
  ? dxf.lotes.map(l => ({ codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: l.areaM2, perimetroM: l.perimetroM, verticesUtm: l.verticesUtm }))
  : (mapa as any).lotes.map((l: any) => ({
  codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: l.areaM2, perimetroM: 0, verticesUtm: utm(l.poly),
}));
if (!dxf) for (const l of todos) l.perimetroM = l.verticesUtm.reduce((s, a, i, v) => s + Math.hypot(v[(i + 1) % v.length][0] - a[0], v[(i + 1) % v.length][1] - a[1]), 0);
const ruas: RuaMemorial[] = dxf ? dxf.ruas.map(r => ({ nome: r.nome, e: r.e, n: r.n, angulo: r.angulo })) : (mapa as any).ruas.filter((r: any) => r.line.every((p: any[]) => p[0] != null)).flatMap((r: any) => r.line.slice(1).map((b: number[], i: number) => {
  const p = geoParaUtm(r.line[i][0], r.line[i][1], FUSO), q = geoParaUtm(b[0], b[1], FUSO);
  return { nome: r.nome, e: (p[0] + q[0]) / 2, n: (p[1] + q[1]) / 2, angulo: (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI };
}));
const perimetroUtm = dxf?.perimetro?.verticesUtm ?? utm((mapa as any).perimetro);

const lote = todos.find(l => l.codigo === CODIGO)!;
const memorial = memorialDoLote(lote, todos, { nome: 'Condomínio de Chácaras Bom Jardims', municipio: 'Açailândia', uf: 'MA', fuso: FUSO, ruas, perimetroUtm });
const v = memorial.vertices.map(x => [x.e, x.n] as [number, number]);
// O mapa público não traz o traçado de todas as ruas; no sistema a frente vem de lotes.viaFrente
const viaFrente = v.map((a, i) => ruaDoLado(a, v[(i + 1) % v.length], ruas)).find(Boolean) ?? '';

// Geometria da unidade para o memorial (Anexo I) e o mapa individual (Anexo V)
const unidade: DadosUnidade = {
  codigo: lote.codigo, quadra: lote.quadra, numero: lote.numero, areaM2: lote.areaM2, perimetroM: Math.round(lote.perimetroM * 100) / 100,
  verticesUtm: lote.verticesUtm, memorial, outros: todos.filter(l => l.codigo !== lote.codigo), perimetroUtm, ruas, fuso: FUSO, camadas: await carregarCamadas('bom-jardims', FUSO),
  responsavelTecnico: 'José Romário Pinto Bezerra — Técnico em Agrimensura CFT/MA 01209185369 · INCRA FQNS',
};

const PLANO = process.env.PLANO === 'A' || process.env.PLANO === 'B' || process.env.PLANO === 'C' ? process.env.PLANO : null;
const MODELO_DOCX = PLANO ? `MODELO-CPCV-BOM-JARDIMS-v3-PLANO-${PLANO}.docx` : 'MODELO-CPCV-BOM-JARDIMS-v2.docx';
const SUF = PLANO ? `-PLANO-${PLANO}` : '';
const sim = simular(lote.areaM2, PLANO ? 1 : 6, condicoes);
const plano = planoDoContrato(sim, { modalidade: 'financiado', prazo: PLANO === 'B' ? 180 : 120, dataPrimeiroPagamento: '2026-11-10', condicao: PLANO ?? 'padrao' }, condicoes, false);

const base0: EntradaContexto = {
  contrato: { numero: 'BJ-2026-0001', codigoVerificacao: 'EX7K2M9P4Q1R', modoAssinatura: 'eletronica', dataGeracao: hojeIso() },
  juridico: { defaults: SEED_EMP_JURIDICO.defaults, vendedoraTipo: 'PF', vendedora: SEED_EMP_JURIDICO.vendedora, modeloVersao: 'CPCV-BJ v2.0' },
  lote: { codigo: lote.codigo, quadra: lote.quadra, numero: lote.numero, areaM2: lote.areaM2, perimetroM: Math.round(lote.perimetroM * 100) / 100,
    descricao: memorial.descricao, viaFrente, matricula: '' },
  plano,
  // Comprador e cônjuge FICTÍCIOS (CPFs de teste)
  comprador: {
    nome: 'Carlos Eduardo Mendes da Silva', cpfCnpj: '52998224725', nacionalidade: 'brasileira', estadoCivil: 'casado', regimeBens: 'comunhao_parcial',
    profissao: 'comerciante', nascimento: '1982-05-14', sexo: 'M', rg: '0123456789', rgOrgao: 'SSP', rgUf: 'MA', email: 'carlos.exemplo@exemplo.com',
    telefone1: '99991234567', cep: '65930000', logradouro: 'Rua Exemplo', numero: '100', bairro: 'Centro', cidade: 'Açailândia', uf: 'MA',
  },
  conjuge: {
    nome: 'Ana Paula Ribeiro Mendes', cpfCnpj: '11144477735', nacionalidade: 'brasileira', estadoCivil: 'casado', profissao: 'professora',
    sexo: 'F', rg: '9876543210', rgOrgao: 'SSP', rgUf: 'MA',
  },
  // Credenciais do responsável técnico: no sistema vêm do cadastro (usuarioDocumentos); aqui, de exemplo
  corretor: { nome: 'José Romário Pinto Bezerra', cpf: '', creci: '4.705', creciUf: 'MA', creciValidade: '2027-03-31',
    certidaoCodigo: '0000/2026 (exemplo)', certidaoEmissao: '2026-10-20', certidaoValidade: '2026-11-19' },
  // Corretor parceiro FICTÍCIO (mostra a parte de 2% do corretor intermediador)
  parceiro: { nome: 'Corretor Exemplo da Silva', cpf: '00000000000', creci: '0.000', creciUf: 'MA', creciValidade: '2027-12-31',
    certidaoCodigo: '0000/2026 (exemplo)', certidaoEmissao: '2026-10-20', certidaoValidade: '2026-11-19' },
  // Recebedor dos pagamentos: no sistema vem da conta Asaas do empreendimento; aqui, o titular atual
  recebedor: { nome: 'J R P BEZERRA LTDA', cpfCnpj: '17261987000109' },
};

const base: EntradaContexto = !MODELO ? base0 : {
  ...base0,
  parceiro: null,
  contrato: { ...base0.contrato, numero: 'BJ-MODELO', codigoVerificacao: 'MODELO000000' },
  comprador: {
    nome: 'Cliente Exemplo', cpfCnpj: '00000000000', nacionalidade: 'brasileira', estadoCivil: 'casado', regimeBens: 'comunhao_parcial',
    profissao: 'profissão do cliente', nascimento: '1980-01-01', sexo: 'M', rg: '00.000.000', rgOrgao: 'SSP', rgUf: 'MA', email: 'cliente@exemplo.com',
    telefone1: '99900000000', cep: '65930000', logradouro: 'Rua Exemplo', numero: '00', bairro: 'Centro', cidade: 'Açailândia', uf: 'MA',
  },
  conjuge: {
    nome: 'Cônjuge Exemplo', cpfCnpj: '00000000000', nacionalidade: 'brasileira', estadoCivil: 'casado', profissao: 'profissão do cônjuge',
    sexo: 'F', rg: '00.000.000', rgOrgao: 'SSP', rgUf: 'MA',
  },
};

// Prévia do definitivo: campos que hoje estão em branco no jurídico, com valores visivelmente fictícios
const ficticios = {
  emp_matricula_empreendimento: '00.000 (exemplo)', emp_registro_parcelamento: 'R-0/00.000 (exemplo)', emp_registro_data: '00/00/0000',
  emp_aprovacao_numero: '000/0000 (exemplo)', emp_aprovacao_data: '00/00/0000', emp_lei_municipal: 'Lei n.º 0.000/0000 (exemplo)',
  emp_li_numero: '000/0000 (exemplo)', emp_li_data: '00/00/0000', emp_salario_minimo: '1.518,00', emp_obras_data_base: '00/00/0000',
  emp_obras_termo_final: '00/00/0000', emp_obras_protocolo_vistoria: '(exemplo)', emp_inventario_situacao: '(exemplo)',
  emp_contribuicao_mensal: '0,00 (exemplo)', emp_associacao_cnpj: '00.000.000/0001-00 (exemplo)', emp_associacao_registro: '(exemplo)',
  emp_trt_rt: 'TRT 0000000 (exemplo)', rom_creci_pj: '0000-J (exemplo)', emp_parcelamento_registrado: true,
};

await mkdir(saida, { recursive: true });
const ctxMinuta = montarContexto(base);
const minuta = await gerarContratoPdf(ctxMinuta, plano, { alvo: 'minuta', modelo: MODELO_DOCX, marca: 'bomjardims', unidade });
await writeFile(path.join(saida, MODELO ? `CONTRATO-MODELO-CPCV-BOM-JARDIMS${SUF}-${lote.codigo}.pdf` : `CPCV-BJ-2026-0001-${lote.codigo}${SUF}-MINUTA.pdf`), minuta.pdf);
if (!MODELO) {
  await writeFile(path.join(saida, `CONTRATO-INTERMEDIACAO-EXEMPLO-${lote.codigo}.pdf`), await docIntermediacao(ctxMinuta, 'bomjardims'));
  await writeFile(path.join(saida, `CONTRATO-COMISSAO-ROMATEC-EXEMPLO-${lote.codigo}.pdf`), await docComissaoRomatec(ctxMinuta, plano, 'bomjardims',
    { corretorDaVenda: base.parceiro!.nome, creciDaVenda: 'MA 0.000', comprador: base.comprador.nome }));
}
if (MODELO) { console.log(path.join(saida, `CONTRATO-MODELO-CPCV-BOM-JARDIMS-${lote.codigo}.pdf`), minuta.pdf.length); process.exit(0); }

const ctxDef = montarContexto({ ...base, lote: { ...base.lote, matricula: '00.001 (exemplo)', viaFrente: base.lote.viaFrente || 'via interna do condomínio (exemplo)' }, overrides: ficticios });
const definitivo = await gerarContratoPdf(ctxDef, plano, {
  alvo: 'definitivo', modelo: MODELO_DOCX, marca: 'bomjardims', unidade, previaSemValor: 'EXEMPLO — DADOS FICTÍCIOS',
});
await writeFile(path.join(saida, `CPCV-BJ-2026-0001-${lote.codigo}${SUF}-DEFINITIVO-EXEMPLO.pdf`), definitivo.pdf);

console.log(JSON.stringify({
  saida,
  plano: { preco: plano.preco_tabela, entrada: plano.entrada_valor, parcelaEntrada: plano.entrada_parcela, saldo: plano.saldo_valor,
    parcela: plano.saldo_parcela, total: plano.total_pagar, juros: plano.total_juros, viaFrente },
  minuta: { bytes: minuta.pdf.length, sha256: minuta.sha256, faltantesDoDefinitivo: montarGateResumo(ctxMinuta) },
  definitivo: { bytes: definitivo.pdf.length, sha256: definitivo.sha256, gate: definitivo.gate },
}, null, 2));

function montarGateResumo(ctx: Record<string, unknown>) {
  return Object.entries(ctx).filter(([k, val]) => /^(emp|rom)_/.test(k) && val === '').map(([k]) => k);
}
