/**
 * CPCV v2 — pagamentos recebidos pela gestora (Romatec / J R P Bezerra Ltda) por conta e ordem da VENDEDORA (v1.28.0).
 * Reescreve só os parágrafos 4.1, 4.2, 4.4 e 19.3 do modelo, mantendo o estilo de cada parágrafo (o texto vai inteiro
 * no 1º trecho, para as marcas {{…}} ficarem inteiras). Nome e documento do recebedor vêm da conta Asaas do
 * empreendimento ({{pag_recebedor_nome}}, {{pag_recebedor_doc}}) — nunca fixos no modelo.
 *
 *   node scripts/cpcv-recebedora.cjs   (idempotente: parágrafo já atualizado é mantido)
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const arq = path.join(__dirname, '..', 'templates', 'MODELO-CPCV-BOM-JARDIMS-v2.docx');
const zip = new PizZip(fs.readFileSync(arq));
let xml = zip.file('word/document.xml').asText();

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texto = p => (p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const NOVOS = [
  {
    comeca: '4.1. ',
    texto: '4.1. Os pagamentos são feitos exclusivamente por boleto bancário ou PIX emitidos por {{pag_recebedor_nome}} ({{pag_recebedor_doc}}), gestora de vendas e administradora dos recebíveis do empreendimento, que os recebe por conta e ordem da VENDEDORA na plataforma de pagamentos {{emp_plataforma_pagamento}}, reunidos em carnê entregue ao(à) COMPRADOR(A) em meio físico ou digital (e-mail e WhatsApp informados no preâmbulo). O carnê pode ser emitido em lotes anuais de 12 (doze) parcelas, sem custo para o(a) COMPRADOR(A).',
  },
  {
    comeca: '4.2. ',
    texto: '4.2. É vedado o pagamento em espécie ou em conta de corretores ou de quaisquer terceiros que não a recebedora indicada no item 4.1. Pagamento feito de forma diversa não libera o(a) COMPRADOR(A), salvo se o valor for comprovadamente creditado na conta da recebedora indicada no item 4.1.',
  },
  {
    comeca: '4.4. ',
    texto: '4.4. A compensação do pagamento confirmada pela plataforma vale como recibo, sem prejuízo do recibo emitido pela gestora em nome da VENDEDORA. A quitação de uma parcela não presume a das anteriores, ficando afastada a presunção do art. 322 do Código Civil.',
  },
  {
    comeca: '19.3. ',
    texto: '19.3. A ROMATEC CONSULTORIA TOTAL recebe as parcelas do preço exclusivamente na qualidade de gestora de cobrança e administradora dos recebíveis, por conta e ordem da VENDEDORA (Código Civil, arts. 653 e seguintes), e as repassa à VENDEDORA nos termos do contrato de gestão firmado entre elas. Os recibos das parcelas são emitidos pela gestora em nome da VENDEDORA; a quitação final do preço é dada pela VENDEDORA (Cláusula 17ª), e a gestora não transige em nome das partes. Fora a cobrança, sua atuação limita-se à intermediação, ao assessoramento técnico e à tramitação documental.',
  },
];

let trocados = 0;
xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => {
  const t = texto(p);
  const alvo = NOVOS.find(n => t.startsWith(n.comeca));
  if (!alvo) return p;
  if (t === alvo.texto) return p;
  let primeiro = true;
  trocados++;
  return p.replace(/<w:t[^>]*>[^<]*<\/w:t>/g, () => {
    if (!primeiro) return '<w:t></w:t>';
    primeiro = false;
    return `<w:t xml:space="preserve">${esc(alvo.texto)}</w:t>`;
  });
});
const achados = NOVOS.filter(n => xml.split(/<\/w:p>/).some(p => texto(p).startsWith(n.comeca))).length;
if (achados !== NOVOS.length) throw new Error(`Esperava ${NOVOS.length} parágrafos, achei ${achados}`);
zip.file('word/document.xml', xml);
fs.writeFileSync(arq, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`CPCV atualizado: ${trocados} parágrafo(s) reescrito(s)`);
