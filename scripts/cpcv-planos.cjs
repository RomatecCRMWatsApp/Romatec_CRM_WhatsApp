/**
 * CPCV v3 — modelos das condições de lançamento (Planos A, B e C, aprovados em 31/10/2026). Gera, a partir do
 * MODELO-CPCV-BOM-JARDIMS-v3.docx (entrada de 30%, que continua igual), um modelo por plano:
 *
 *   MODELO-CPCV-BOM-JARDIMS-v3-PLANO-A.docx  — entrada R$ 10 mil + parcelas + reforços anuais (Plano 13º)
 *   MODELO-CPCV-BOM-JARDIMS-v3-PLANO-B.docx  — entrada R$ 10 mil + saldo em até 180 parcelas (prazo longo)
 *   MODELO-CPCV-BOM-JARDIMS-v3-PLANO-C.docx  — entrada 30%: R$ 10 mil no ato + complemento em até 36× sem juros
 *
 * Reescreve só o Quadro-Resumo (itens 10 e 14) e as Cláusulas 3.2, 3.3 e 19.1, e insere as cláusulas próprias de cada
 * plano (3.2.1 no C; 3.3.1 no A), mantendo o estilo de cada parágrafo (texto inteiro no 1º trecho, para as marcas {{…}}
 * ficarem inteiras). Valores sempre por marca (plano_*), nunca fixos no modelo.
 *
 *   node scripts/cpcv-planos.cjs   (refaz os três a partir do v3 a cada execução)
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const DIR = path.join(__dirname, '..', 'templates');
const BASE = path.join(DIR, 'MODELO-CPCV-BOM-JARDIMS-v3.docx');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texto = p => (p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/** Mesmo parágrafo (estilo e formatação do 1º trecho) com outro texto */
const comTexto = (p, novo) => {
  let primeiro = true;
  return p.replace(/<w:t[^>]*>[^<]*<\/w:t>/g, () => {
    if (!primeiro) return '<w:t></w:t>';
    primeiro = false;
    return `<w:t xml:space="preserve">${esc(novo)}</w:t>`;
  });
};

const ITEM10 = {
  A: 'R$ {{plano_saldo_valor}}, pago em {{plano_saldo_qtd}} parcelas mensais, fixas e consecutivas de R$ {{plano_saldo_parcela}}, vencendo a primeira em {{plano_saldo_venc1}}, e em {{plano_reforco_qtd}} reforços anuais de R$ {{plano_reforco_valor}}, vencendo o primeiro em {{plano_reforco_venc1}} e os demais a cada 12 (doze) meses — Sistema de Amortização Francês (Tabela Price) · {{plano_condicao_titulo}}',
  B: 'R$ {{plano_saldo_valor}} em {{plano_saldo_qtd}} parcelas mensais, fixas e consecutivas de R$ {{plano_saldo_parcela}}, vencendo a primeira em {{plano_saldo_venc1}} — Sistema de Amortização Francês (Tabela Price) · {{plano_condicao_titulo}}',
  C: 'R$ {{plano_saldo_valor}} em {{plano_saldo_qtd}} parcelas mensais, fixas e consecutivas de R$ {{plano_saldo_parcela}}, vencendo a primeira em {{plano_saldo_venc1}}, pagas juntamente com as parcelas do complemento da entrada do item 9 — Sistema de Amortização Francês (Tabela Price) · {{plano_condicao_titulo}}',
};

const ITEM14 = 'R$ {{com_valor}} ({{com_percentual}} do preço de tabela), paga pela PROMITENTE VENDEDORA e já incluída no preço, à beneficiária {{com_beneficiario}}, retida integralmente no pagamento da entrada do ato (Cláusula 19ª); dela, {{intermed_comissao_pct}} (R$ {{intermed_comissao_valor}}) remuneram o(a) corretor(a) intermediador(a), pagos no ato do sinal e não restituíveis na desistência do(a) COMPRADOR(A) (Cláusula 19.1.2)';

const C32 = {
  A: '3.2. Entrada. A entrada de R$ {{plano_entrada_valor}}, equivalente a {{plano_entrada_percentual}} do preço de tabela, é a da condição de lançamento {{plano_condicao_titulo}}, constitui sinal e princípio de pagamento, com natureza de arras confirmatórias (Código Civil, arts. 417 a 419), e não confere direito de arrependimento. É paga {{plano_entrada_forma}}. A diferença entre essa entrada e a de 30% (trinta por cento) da condição padrão integra o saldo do item 10 do Quadro-Resumo e é paga pelas parcelas mensais e pelos reforços anuais da Cláusula 3.3.1.',
  B: '3.2. Entrada. A entrada de R$ {{plano_entrada_valor}}, equivalente a {{plano_entrada_percentual}} do preço de tabela, é a da condição de lançamento {{plano_condicao_titulo}}, constitui sinal e princípio de pagamento, com natureza de arras confirmatórias (Código Civil, arts. 417 a 419), e não confere direito de arrependimento. É paga {{plano_entrada_forma}}. A diferença entre essa entrada e a de 30% (trinta por cento) da condição padrão integra o saldo do item 10 do Quadro-Resumo, financiado no prazo ali indicado.',
  C: '3.2. Entrada. A entrada de R$ {{plano_entrada_valor}}, equivalente a {{plano_entrada_percentual}} do preço de tabela, constitui sinal e princípio de pagamento, com natureza de arras confirmatórias (Código Civil, arts. 417 a 419), e não confere direito de arrependimento. Na condição de lançamento {{plano_condicao_titulo}}, é paga assim: {{plano_entrada_forma}}. As parcelas do complemento da entrada não têm juros nem correção monetária enquanto adimplidas, vencem no mesmo dia das parcelas do saldo, a partir do mês seguinte ao do pagamento do ato, e são parcelas do preço para todos os efeitos deste contrato, inclusive mora (Cláusula 7ª) e resolução por inadimplemento (Cláusula 8ª).',
};
const C321 = '3.2.1. Posse e liberação de uso no Plano C. Para os fins das Cláusulas 6.1 e 6.1.1, considera-se quitada a entrada com o pagamento do valor do ato (R$ {{plano_complemento_ato}}), não sendo as parcelas do complemento da entrada condição para a imissão na posse nem para a liberação de uso, que continuam sujeitas às demais exigências daquelas cláusulas.';

const FIM_33_PADRAO = 'O primeiro vencimento do saldo ocorre no mês seguinte ao da última parcela da entrada.';
const FIM_33 = {
  A: 'O primeiro vencimento do saldo ocorre no mês seguinte ao do pagamento da entrada.',
  B: 'O primeiro vencimento do saldo ocorre no mês seguinte ao do pagamento da entrada.',
  C: 'O primeiro vencimento do saldo ocorre no mês seguinte ao do pagamento do valor do ato da entrada, juntamente com a 1ª parcela do complemento da entrada.',
};
const C331 = '3.3.1. Reforços anuais ({{plano_condicao_titulo}}). Além das parcelas mensais, o saldo é amortizado por {{plano_reforco_qtd}} reforços anuais de R$ {{plano_reforco_valor}} ({{plano_reforco_extenso}}), fixos e sem correção monetária enquanto adimplidos, vencendo o primeiro em {{plano_reforco_venc1}}, junto com a 12ª (décima segunda) parcela do saldo, e os demais a cada 12 (doze) meses, coincidindo com o período de pagamento do 13º salário. Cada reforço é parcela do preço para todos os efeitos deste contrato, inclusive mora (Cláusula 7ª), resolução por inadimplemento (Cláusula 8ª) e liquidação antecipada (Cláusula 5ª); seu valor foi calculado pela Tabela Price à taxa contratada e está discriminado, com juros, amortização e saldo devedor, no Anexo II.';

const C191_DE = 'na entrada à vista, integralmente no ato.';
const C191_PARA = 'na entrada à vista ou em parcela única das condições de lançamento, integralmente no ato.';

function gerar(plano) {
  const zip = new PizZip(fs.readFileSync(BASE));
  let xml = zip.file('word/document.xml').asText();
  const feitos = new Set();
  xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => {
    const t = texto(p);
    // Quadro-Resumo, item 10 (saldo): o parágrafo do valor, logo após o título "10. Saldo"
    if (t.startsWith('R$ {{plano_saldo_valor}} em {{plano_saldo_qtd}} parcelas mensais')) { feitos.add('item10'); return comTexto(p, ITEM10[plano]); }
    if (t.startsWith('R$ {{com_valor}} ({{com_percentual}} do preço de tabela)')) { feitos.add('item14'); return comTexto(p, ITEM14); }
    if (t.startsWith('3.2. Entrada.')) { feitos.add('3.2'); return comTexto(p, C32[plano]) + (plano === 'C' ? comTexto(p, C321) : ''); }
    if (t.startsWith('3.3. Saldo.')) {
      if (!t.endsWith(FIM_33_PADRAO)) throw new Error('3.3 mudou no v3: confira o fim do parágrafo');
      feitos.add('3.3');
      return comTexto(p, t.slice(0, -FIM_33_PADRAO.length) + FIM_33[plano]) + (plano === 'A' ? comTexto(p, C331) : '');
    }
    if (t.startsWith('19.1. ')) {
      if (!t.includes(C191_DE)) throw new Error('19.1 mudou no v3: confira a retenção da corretagem');
      feitos.add('19.1');
      return comTexto(p, t.replace(C191_DE, C191_PARA));
    }
    return p;
  });
  for (const k of ['item10', 'item14', '3.2', '3.3', '19.1']) if (!feitos.has(k)) throw new Error(`Plano ${plano}: não achei ${k} no v3`);
  zip.file('word/document.xml', xml);
  const destino = path.join(DIR, `MODELO-CPCV-BOM-JARDIMS-v3-PLANO-${plano}.docx`);
  fs.writeFileSync(destino, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log(`Plano ${plano}: ${path.basename(destino)}`);
}

for (const p of ['A', 'B', 'C']) gerar(p);
