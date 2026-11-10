/**
 * Documentos de comissão (v1.14), com a marca do empreendimento:
 * - Contrato de Intermediação Imobiliária (CLIENTE assina, junto com o CPCV): ciência de que os 2% do corretor
 *   intermediador são pagos no ato do sinal e não são restituídos na desistência. Mostra SÓ a parte do corretor —
 *   nunca o percentual nem o valor da administradora.
 * - Contrato de Comissão Empreendedora × Romatec (5%): documento INTERNO, só o administrador gera e vê.
 *
 * Textos em padrão jurídico brasileiro para revisão do José/jurídico antes do uso.
 */
import { divisaoComissaoLancamento } from '../../shared/condicoesLancamento';
import { tituloCondicao } from './plano';
import { PDFDocument, StandardFonts, popGraphicsState, pushGraphicsState, rgb, setWordSpacing, type PDFPage } from 'pdf-lib';
import type { Ctx } from './contexto';
import type { PlanoContrato } from './plano';
import { desenharMarca, embutirMarca } from './anexos';
import { brl, pct, reaisExtenso } from './formato';
import { comissao } from '../../shared/simulador';
import { ESCRITORIO } from '../../shared/escritorio';

const VERDE = rgb(0.047, 0.2, 0.125);
const DOURADO = rgb(0.788, 0.651, 0.275);
const CINZA = rgb(0.38, 0.38, 0.38);
const A4: [number, number] = [595.28, 841.89];
const X0 = 62, X1 = A4[0] - 62, LARG = X1 - X0;

type Trecho = { t: string; b?: boolean };
const s = (v: unknown) => String(v ?? '').trim();

/** Escritor de documento: parágrafos justificados com negrito por trecho, quebra de página com a marca */
export async function escritor(titulo: string, marca: string, rodapeDoc: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  const m = await embutirMarca(doc, marca);
  const f = await doc.embedFont(StandardFonts.TimesRoman);
  const fb = await doc.embedFont(StandardFonts.TimesRomanBold);
  const fh = await doc.embedFont(StandardFonts.HelveticaBold);
  let p!: PDFPage, y = 0, base = 0, rodapeY = 18;
  const paginas: PDFPage[] = [];
  const nova = () => {
    p = doc.addPage(A4);
    paginas.push(p);
    const r = desenharMarca(p, m);
    y = r.topo - 8; base = r.base + 26; rodapeY = r.base + 7;
  };
  nova();
  const garantir = (h: number) => { if (y - h < base) nova(); };

  /**
   * Palavras com os pedaços em negrito/normal; trecho que começa colado (", inscrito…") gruda na palavra
   * anterior, sem espaço antes da pontuação.
   */
  type Palavra = { seg: { t: string; b: boolean }[] };
  const larguraPalavra = (w: Palavra, size: number) => w.seg.reduce((a, x) => a + (x.b ? fb : f).widthOfTextAtSize(x.t, size), 0);
  const palavrasDe = (trechos: Trecho[]): Palavra[] => {
    const out: Palavra[] = [];
    let colar = false;
    for (const tr of trechos) {
      const pedacos = tr.t.split(/(\s+)/);
      pedacos.forEach((pc, k) => {
        if (!pc) return;
        if (/^\s+$/.test(pc)) { colar = false; return; }
        if ((k === 0 && colar && out.length)) out[out.length - 1].seg.push({ t: pc, b: !!tr.b });
        else out.push({ seg: [{ t: pc, b: !!tr.b }] });
        colar = true;
      });
    }
    return out;
  };
  const linhas = (trechos: Trecho[], size: number, largura: number) => {
    const out: Palavra[][] = [];
    let atual: Palavra[] = [], larg = 0;
    const esp = f.widthOfTextAtSize(' ', size);
    for (const w of palavrasDe(trechos)) {
      const wl = larguraPalavra(w, size);
      if (atual.length && larg + esp + wl > largura) { out.push(atual); atual = []; larg = 0; }
      larg += (atual.length ? esp : 0) + wl;
      atual.push(w);
    }
    if (atual.length) out.push(atual);
    return out;
  };

  /**
   * Justificado com espaçamento de palavra (Tw) em cada sequência da mesma fonte: o leitor de PDF usa as
   * próprias métricas dentro da sequência, sem palavras encostando quando a fonte substituta é mais larga.
   */
  const paragrafo = (trechos: Trecho[] | string, o: { size?: number; recuo?: number; centro?: boolean; antes?: number; depois?: number; cor?: ReturnType<typeof rgb> } = {}) => {
    const size = o.size ?? 10.4, lh = size * 1.38, recuo = o.recuo ?? 0;
    const tr = typeof trechos === 'string' ? [{ t: trechos }] : trechos;
    const ls = linhas(tr, size, LARG - recuo);
    const espNormal = f.widthOfTextAtSize(' ', size);
    const cor = o.cor ?? rgb(0.08, 0.08, 0.08);
    y -= o.antes ?? 0;
    ls.forEach((l, i) => {
      garantir(lh);
      const ultima = i === ls.length - 1;
      const total = l.reduce((a, w) => a + larguraPalavra(w, size), 0);
      const esp = !ultima && !o.centro && l.length > 1 ? (LARG - recuo - total) / (l.length - 1) : espNormal;
      let x = o.centro ? X0 + (LARG - (total + esp * (l.length - 1))) / 2 : X0 + recuo;
      // Sequências da mesma fonte: "palavra palavra palavra" num só texto, com Tw = espaço extra
      const runs: { t: string; b: boolean }[] = [];
      l.forEach((w, k) => w.seg.forEach((sg, j) => {
        const ultimo = runs[runs.length - 1];
        const sep = j === 0 && k > 0 ? ' ' : '';
        if (ultimo && ultimo.b === sg.b) ultimo.t += sep + sg.t;
        else { if (sep && ultimo) ultimo.t += ' '; runs.push({ t: sg.t, b: sg.b }); }
      }));
      const tw = esp - espNormal;
      for (const r of runs) {
        const fonte = r.b ? fb : f;
        p.pushOperators(pushGraphicsState(), setWordSpacing(tw));
        p.drawText(r.t, { x, y: y - size, size, font: fonte, color: cor });
        p.pushOperators(popGraphicsState());
        const espacos = (r.t.match(/ /g) ?? []).length;
        // Folga mínima depois do negrito (a fonte substituta do leitor costuma ser um pouco mais larga)
        x += fonte.widthOfTextAtSize(r.t, size) + espacos * tw + (r.b ? size * 0.06 : 0);
      }
      y -= lh;
    });
    y -= o.depois ?? 5;
  };

  const clausula = (t: string) => { garantir(40); paragrafo([{ t, b: true }], { size: 10.6, antes: 6, depois: 3, cor: VERDE }); };

  const cabecalho = (t1: string, t2: string) => {
    paragrafo([{ t: t1, b: true }], { size: 13, centro: true, cor: VERDE, depois: 2 });
    paragrafo(t2, { size: 9.4, centro: true, cor: CINZA, depois: 10 });
    p.drawLine({ start: { x: X0, y: y + 4 }, end: { x: X1, y: y + 4 }, thickness: 0.8, color: DOURADO });
    y -= 8;
  };

  const assinaturas = (blocos: { papel: string; nome: string; doc?: string }[]) => {
    y -= 10;
    const col = (LARG - 30) / 2;
    for (let i = 0; i < blocos.length; i += 2) {
      garantir(70);
      const yy = y - 42;
      blocos.slice(i, i + 2).forEach((b, k) => {
        const x = X0 + k * (col + 30);
        p.drawLine({ start: { x, y: yy }, end: { x: x + col, y: yy }, thickness: 0.6, color: rgb(0.2, 0.2, 0.2) });
        p.drawText(b.nome.slice(0, 60), { x, y: yy - 11, size: 8.6, font: fb });
        p.drawText(b.papel, { x, y: yy - 21, size: 8, font: f, color: CINZA });
        if (b.doc) p.drawText(b.doc, { x, y: yy - 31, size: 8, font: f, color: CINZA });
      });
      y = yy - 44;
    }
  };

  const faixa = (texto: string) => {
    p.drawRectangle({ x: X0, y: y - 18, width: LARG, height: 18, color: rgb(0.55, 0.1, 0.1) });
    const tam = Math.min(8.6, (LARG - 16) / fh.widthOfTextAtSize(texto, 1));
    p.drawText(texto, { x: X0 + 8, y: y - 12.5, size: tam, font: fh, color: rgb(1, 1, 1) });
    y -= 26;
  };

  /** Nova página (anexos) */
  const quebra = () => nova();

  /** Tabela simples: cabeçalho verde, linhas alternadas, larguras proporcionais; repete o cabeçalho na quebra de página */
  const tabela = (cab: string[], linhasT: string[][], o: { pesos?: number[]; direita?: number[]; size?: number } = {}) => {
    const size = o.size ?? 8.6, lh = size * 1.75;
    const pesos = o.pesos ?? cab.map(() => 1);
    const soma = pesos.reduce((a, b) => a + b, 0);
    const larg = pesos.map(w => (w / soma) * LARG);
    const celula = (t: string, i: number, x: number, fonte: typeof f, cor = rgb(0.08, 0.08, 0.08)) => {
      let tx = t;
      while (tx.length > 1 && fonte.widthOfTextAtSize(tx, size) > larg[i] - 8) tx = tx.slice(0, -2) + '…';
      const w = fonte.widthOfTextAtSize(tx, size);
      p.drawText(tx, { x: o.direita?.includes(i) ? x + larg[i] - 4 - w : x + 4, y: y - size - 2, size, font: fonte, color: cor });
    };
    const cabecalhoT = () => {
      garantir(lh * 2);
      p.drawRectangle({ x: X0, y: y - lh, width: LARG, height: lh, color: VERDE });
      let x = X0; cab.forEach((t, i) => { celula(t, i, x, fb, rgb(1, 1, 1)); x += larg[i]; });
      y -= lh;
    };
    cabecalhoT();
    linhasT.forEach((l, k) => {
      if (y - lh < base) { nova(); cabecalhoT(); }
      if (k % 2 === 1) p.drawRectangle({ x: X0, y: y - lh, width: LARG, height: lh, color: rgb(0.95, 0.94, 0.9) });
      let x = X0; l.forEach((t, i) => { celula(t, i, x, /^TOTAL/.test(l[0]) ? fb : f); x += larg[i]; });
      y -= lh;
    });
    y -= 8;
  };

  const salvar = async () => {
    paginas.forEach((pg, i) => {
      const t = `${rodapeDoc} · Página ${i + 1} de ${paginas.length}`;
      pg.drawText(t, { x: X0 + (LARG - f.widthOfTextAtSize(t, 7.5)) / 2, y: rodapeY, size: 7.5, font: f, color: CINZA });
    });
    return Buffer.from(await doc.save({ useObjectStreams: false }));
  };
  return { paragrafo, clausula, cabecalho, assinaturas, faixa, salvar, quebra, tabela, espaco: (h: number) => { y -= h; } };
}

const qualificacaoComprador = (c: Ctx) => [
  s(c.comp_nacionalidade), s(c.comp_estado_civil), s(c.comp_profissao),
  s(c.comp_rg) ? `portador(a) do RG n.º ${s(c.comp_rg)} ${s(c.comp_rg_orgao)}`.trim() : '',
  `inscrito(a) no CPF sob o n.º ${s(c.comp_cpf)}`, s(c.comp_endereco) ? `residente e domiciliado(a) na ${s(c.comp_endereco)}` : '',
].filter(Boolean).join(', ');

const unidade = (c: Ctx) => `Chácara ${s(c.lote_codigo)}${s(c.lote_quadra) ? ` (Quadra ${s(c.lote_quadra)}, Lote ${s(c.lote_numero)})` : ''}, com área de ${s(c.lote_area_m2)} m², do ${s(c.emp_nome)}`;

// ─── Contrato de Intermediação Imobiliária (o cliente assina) ─────────────────────────────

export async function docIntermediacao(c: Ctx, marca: string): Promise<Buffer> {
  const w = await escritor(`Contrato de Intermediação Imobiliária — ${s(c.ctr_numero)}`, marca, `Contrato de Intermediação Imobiliária · vinculado ao CPCV n.º ${s(c.ctr_numero)}`);
  w.cabecalho('CONTRATO DE INTERMEDIAÇÃO IMOBILIÁRIA E TERMO DE CIÊNCIA DA CORRETAGEM',
    `Vinculado ao Instrumento Particular de Compromisso de Compra e Venda n.º ${s(c.ctr_numero)} · ${s(c.emp_nome)} · Chácara ${s(c.lote_codigo)}`);

  w.paragrafo([{ t: 'Pelo presente instrumento particular, de um lado, ' }, { t: s(c.comp_nome), b: true }, { t: `, ${qualificacaoComprador(c)}` },
    ...(c.comp_casado && s(c.conj_nome) ? [{ t: ', e seu cônjuge/companheiro(a) ' }, { t: s(c.conj_nome), b: true }, { t: `, inscrito(a) no CPF sob o n.º ${s(c.conj_cpf)}, na qualidade de anuente` }] : []),
    { t: ', doravante denominado(a) ' }, { t: 'CONTRATANTE', b: true }, { t: '; e, de outro lado, ' },
    { t: s(c.intermed_nome), b: true }, { t: `, corretor(a) de imóveis inscrito(a) no CRECI/${s(c.intermed_creci)}` },
    ...(s(c.intermed_cpf) ? [{ t: ` e no CPF sob o n.º ${s(c.intermed_cpf)}` }] : []),
    { t: ', doravante denominado(a) ' }, { t: 'CORRETOR(A) INTERMEDIADOR(A)', b: true },
    { t: ', têm entre si justo e contratado o presente Contrato de Intermediação Imobiliária, que se regerá pelos arts. 722 a 729 do Código Civil, pela Lei n.º 6.530/1978 e pelas cláusulas seguintes.' }]);

  w.clausula('CLÁUSULA 1ª — DO OBJETO');
  w.paragrafo(`1.1. O presente contrato tem por objeto a intermediação, pelo(a) CORRETOR(A) INTERMEDIADOR(A), da aquisição pelo(a) CONTRATANTE da ${unidade(c)}, Açailândia/MA, objeto do Instrumento Particular de Compromisso de Compra e Venda n.º ${s(c.ctr_numero)} (o "CPCV"), pelo valor de venda de R$ ${s(c.intermed_base_valor)}.`);
  w.paragrafo('1.2. A intermediação compreendeu a apresentação do empreendimento e da unidade, o fornecimento das informações sobre o preço, as condições de pagamento, a situação documental e os riscos do negócio, a simulação do plano de pagamento e a aproximação das partes até a celebração do CPCV.');

  w.clausula('CLÁUSULA 2ª — DA REMUNERAÇÃO DO(A) CORRETOR(A) INTERMEDIADOR(A)');
  w.paragrafo([{ t: '2.1. Pela intermediação, o(a) CORRETOR(A) INTERMEDIADOR(A) faz jus a ' }, { t: `${s(c.intermed_comissao_pct)} do valor da venda, correspondentes a R$ ${s(c.intermed_comissao_valor)} (${s(c.intermed_comissao_extenso)})`, b: true },
    { t: ', valor que integra a corretagem prevista no item 14 do Quadro-Resumo do CPCV e já está incluído no preço, sem qualquer acréscimo ao valor contratado.' }]);
  w.paragrafo(c.intermed_lancamento
    // Condições de lançamento (Planos A, B, C): 50% no ato e o restante em 4 partes, com as 4 primeiras parcelas do saldo
    ? [{ t: '2.2. O valor da cláusula 2.1 é pago ' }, { t: `50% (cinquenta por cento) no ato do sinal, R$ ${s(c.intermed_ato_valor)}, e os 50% (cinquenta por cento) restantes em 4 (quatro) partes iguais de R$ ${s(c.intermed_parcela_valor)}`, b: true },
      { t: ', à medida da compensação da 1ª (primeira) à 4ª (quarta) parcela do saldo do CPCV, retidos pela plataforma de pagamentos do empreendimento e repassados pela gestora de vendas, vedado o pagamento em espécie ou diretamente ao(à) corretor(a).' }]
    : [{ t: '2.2. O valor da cláusula 2.1 é ' }, { t: 'pago e extraído no ato do sinal', b: true },
      { t: ' — primeiro pagamento da entrada ou, na compra à vista, o pagamento único —, retido pela plataforma de pagamentos do empreendimento no momento da compensação, vedado o pagamento em espécie ou diretamente ao(à) corretor(a).' }]);

  w.clausula('CLÁUSULA 3ª — DA NÃO RESTITUIÇÃO DO VALOR DA INTERMEDIAÇÃO');
  w.paragrafo([{ t: '3.1. A remuneração do(a) corretor(a) é devida pelo resultado útil da intermediação, alcançado com a celebração do CPCV (Código Civil, art. 725). Por isso, ' },
    { t: 'O(A) CONTRATANTE DECLARA ESTAR CIENTE DE QUE O VALOR DE R$ ' + s(c.intermed_comissao_valor) + ' NÃO SERÁ RESTITUÍDO NEM ESTORNADO EM CASO DE DESISTÊNCIA, DE DISTRATO A SEU PEDIDO OU DE RESOLUÇÃO DO CPCV POR SEU INADIMPLEMENTO, FICANDO RETIDO', b: true },
    { t: ', nos termos do art. 32-A, inciso V, da Lei n.º 6.766/1979 e da Cláusula 19.1.2 do CPCV.' }]);
  w.paragrafo('3.2. Ficam ressalvadas as hipóteses em que a lei assegura a devolução integral dos valores pagos, inclusive da corretagem: (a) o arrependimento no prazo de 7 (sete) dias da contratação fora do estabelecimento comercial (CDC, art. 49; Cláusula 10ª do CPCV); e (b) a resolução do CPCV por culpa da promitente vendedora (Cláusula 11.4 do CPCV).');

  w.clausula('CLÁUSULA 4ª — DA INFORMAÇÃO PRÉVIA E EM DESTAQUE');
  w.paragrafo('4.1. O(A) CONTRATANTE declara que, antes da assinatura do CPCV, foi informado(a) de forma clara, prévia e destacada sobre o valor da corretagem devida ao(à) corretor(a) intermediador(a), o momento do seu pagamento e a sua não restituição na desistência, nos termos dos arts. 6º, III, 46 e 54, § 4º, do Código de Defesa do Consumidor e da tese firmada pelo Superior Tribunal de Justiça no Tema 938 (REsp 1.599.511/SP).');

  w.clausula('CLÁUSULA 5ª — DAS OBRIGAÇÕES DO(A) CORRETOR(A) INTERMEDIADOR(A)');
  w.paragrafo('5.1. O(A) CORRETOR(A) INTERMEDIADOR(A) declara estar regularmente inscrito(a) e em dia no Conselho Regional de Corretores de Imóveis e obriga-se a executar a intermediação com diligência e prudência, prestando ao(à) CONTRATANTE, espontaneamente, todas as informações sobre o andamento do negócio, a segurança e os riscos, as alterações de valores e o que mais possa influir nos resultados da contratação (Código Civil, art. 723; Lei n.º 6.530/1978).');

  w.clausula('CLÁUSULA 6ª — DISPOSIÇÕES GERAIS');
  w.paragrafo('6.1. Este contrato é celebrado em conjunto e integra o CPCV, prevalecendo este em caso de divergência quanto ao imóvel, ao preço e às condições de pagamento. Os dados pessoais são tratados exclusivamente para a sua execução (Lei n.º 13.709/2018, art. 7º, V).');
  w.paragrafo('6.2. As partes reconhecem a validade da assinatura eletrônica deste instrumento (MP n.º 2.200-2/2001, art. 10, § 2º; Lei n.º 14.063/2020) e elegem o foro da Comarca de Açailândia/MA para dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja.');

  w.paragrafo(`Açailândia/MA, ${s(c.ctr_data_extenso)}.`, { antes: 8, depois: 4 });
  const blocos = [{ papel: 'CONTRATANTE (promissário(a) comprador(a))', nome: s(c.comp_nome), doc: `CPF ${s(c.comp_cpf)}` }];
  if (c.comp_casado && s(c.conj_nome)) blocos.push({ papel: 'Cônjuge/companheiro(a) anuente', nome: s(c.conj_nome), doc: `CPF ${s(c.conj_cpf)}` });
  blocos.push({ papel: 'CORRETOR(A) INTERMEDIADOR(A)', nome: s(c.intermed_nome), doc: `CRECI/${s(c.intermed_creci)}` });
  w.assinaturas(blocos);
  return w.salvar();
}

// ─── Contrato de Comissão Empreendedora × Romatec (ADMIN-ONLY) ────────────────────────────

export async function docComissaoRomatec(c: Ctx, plano: PlanoContrato, marca: string, o: { corretorDaVenda: string | null; creciDaVenda?: string | null; comprador: string }): Promise<Buffer> {
  const baseVenda = plano.modalidade === 'avista' ? plano.total_pagar : plano.preco_tabela;
  const sinalAvista = plano.modalidade === 'avista' || plano.entrada_qtd === 1;
  const com = comissao(baseVenda, !!o.corretorDaVenda, sinalAvista, {
    comissaoTotalPct: plano.comissao_percentual, comissaoCorretorPct: plano.comissao_corretor_percentual ?? 0.02, comissao1aParcelaPct: 0.5,
  });
  const pctTotal = pct(plano.comissao_percentual, 0), pctCorr = pct(plano.comissao_corretor_percentual ?? 0.02, 0);
  const w = await escritor(`Contrato de Comissão — Empreendedora × Romatec — ${s(c.ctr_numero)}`, marca, `Contrato de Comissão (interno) · CPCV n.º ${s(c.ctr_numero)}`);
  w.faixa('DOCUMENTO INTERNO — ACESSO EXCLUSIVO DO ADMINISTRADOR. NÃO ENTREGAR AO COMPRADOR NEM AOS CORRETORES.');
  w.cabecalho('CONTRATO DE COMISSÃO DE CORRETAGEM E GESTÃO DE VENDAS',
    `Empreendedora × Romatec · venda da Chácara ${s(c.lote_codigo)} · CPCV n.º ${s(c.ctr_numero)} · ${s(c.emp_nome)}`);

  w.paragrafo([{ t: 'Pelo presente instrumento particular, de um lado, ' }, { t: s(c.vend_nome), b: true },
    { t: `${s(c.vend_cpf) ? `, inscrita no CPF sob o n.º ${s(c.vend_cpf)}` : ''}, titular dos direitos sobre o ${s(c.emp_nome)}, doravante denominada ` }, { t: 'EMPREENDEDORA', b: true },
    { t: '; e, de outro lado, ' }, { t: 'ROMATEC CONSULTORIA TOTAL (J R P Bezerra Ltda)', b: true },
    { t: `, inscrita no CNPJ sob o n.º 17.261.987/0001-09${s(c.rom_creci_pj) && !/PREENCHER/i.test(s(c.rom_creci_pj)) ? ` e no CRECI/MA sob o n.º ${s(c.rom_creci_pj)}` : ''}, com sede na Rua São Raimundo, n.º 10, Centro, Açailândia/MA, neste ato representada por seu responsável técnico José Romário Pinto Bezerra (CRECI/MA F-4.705), doravante denominada ` },
    { t: 'GESTORA', b: true }, { t: ', ajustam a comissão relativa à venda abaixo identificada, nos termos dos arts. 722 a 729 do Código Civil e da Lei n.º 6.530/1978.' }]);

  w.clausula('CLÁUSULA 1ª — DA VENDA');
  w.paragrafo(`1.1. Venda da ${unidade(c)}, ao(à) comprador(a) ${o.comprador}, pelo valor de R$ ${brl(baseVenda)} (${reaisExtenso(baseVenda)}), ${plano.modalidade === 'avista' ? 'com pagamento à vista' : `com entrada ${plano.entrada_qtd === 1 ? 'à vista' : `em ${plano.entrada_qtd} parcelas`} e saldo em ${plano.saldo_qtd} parcelas`}, conforme o CPCV n.º ${s(c.ctr_numero)}.`);
  w.paragrafo(`1.2. Corretor(a) intermediador(a): ${o.corretorDaVenda ? `${o.corretorDaVenda}${o.creciDaVenda ? `, CRECI/${o.creciDaVenda}` : ''}` : 'venda direta da GESTORA, sem corretor parceiro'}.`);

  w.clausula('CLÁUSULA 2ª — DA COMISSÃO TOTAL E DA SUA DIVISÃO');
  w.paragrafo([{ t: '2.1. Pela gestão de vendas e intermediação, a EMPREENDEDORA pagará à GESTORA a comissão de ' }, { t: `${pctTotal} do valor da venda, ou seja, R$ ${brl(com.total)} (${reaisExtenso(com.total)})`, b: true }, { t: ', já incluída no preço de venda.' }]);
  w.paragrafo(o.corretorDaVenda
    ? [{ t: '2.2. Da comissão total, a GESTORA repassará ao(à) corretor(a) intermediador(a) ' }, { t: `${pctCorr} do valor da venda (R$ ${brl(com.corretor)})`, b: true }, { t: `, ficando com a GESTORA o saldo de R$ ${brl(com.romatec)}. O repasse ao(à) corretor(a) é obrigação exclusiva da GESTORA, sem vínculo entre o(a) corretor(a) e a EMPREENDEDORA.` }]
    : [{ t: `2.2. Venda direta: a comissão total de R$ ${brl(com.total)} fica integralmente com a GESTORA.` }]);

  w.clausula('CLÁUSULA 3ª — DA FORMA E DO MOMENTO DO PAGAMENTO');
  const lanc = plano.modalidade === 'financiado' && !!plano.condicao && plano.condicao !== 'padrao'
    ? divisaoComissaoLancamento(com.total, com.corretor) : null;
  if (lanc) w.paragrafo([{ t: `3.1. Condição de lançamento (${tituloCondicao(plano)}): a comissão é paga ` },
    { t: `50% (cinquenta por cento) no pagamento da entrada do ato, R$ ${brl(lanc.ato.total)}, e os 50% (cinquenta por cento) restantes em 4 (quatro) partes iguais de R$ ${brl(lanc.parcelas[0].total)}`, b: true },
    { t: `, retidas da 1ª à 4ª parcela do saldo${o.corretorDaVenda ? `. O(A) corretor(a) recebe na mesma proporção: R$ ${brl(lanc.ato.corretor)} no ato e R$ ${brl(lanc.parcelas[0].corretor)} em cada uma das 4 (quatro) parcelas` : ''}.` }]);
  else w.paragrafo(sinalAvista
    ? [{ t: '3.1. Sinal ou venda à vista: ' }, { t: `a comissão é paga integralmente no ato, R$ ${brl(com.total)}`, b: true }, { t: o.corretorDaVenda ? ` (dos quais R$ ${brl(com.corretor)} ao corretor).` : '.' }]
    : [{ t: '3.1. Sinal parcelado: a comissão é paga em ' }, { t: '2 (duas) parcelas de 50% (cinquenta por cento)', b: true },
      { t: `: R$ ${brl(com.no1oPagamento.total)} no 1º pagamento da entrada${o.corretorDaVenda ? ` (R$ ${brl(com.no1oPagamento.corretor)} ao corretor)` : ''} e R$ ${brl(com.no2oPagamento.total)} no 2º pagamento da entrada${o.corretorDaVenda ? ` (R$ ${brl(com.no2oPagamento.corretor)} ao corretor)` : ''}.` }]);
  w.paragrafo('3.2. A comissão é retida na própria plataforma de pagamentos (split para a conta da GESTORA) no momento da compensação de cada pagamento indicado na cláusula 3.1, sem necessidade de cobrança à EMPREENDEDORA. A GESTORA repassará a parte do(a) corretor(a) em até 5 (cinco) dias úteis da compensação.');

  w.clausula('CLÁUSULA 4ª — DA DESISTÊNCIA E DA RESOLUÇÃO DA VENDA');
  w.paragrafo('4.1. A comissão é devida pelo resultado útil da intermediação (Código Civil, art. 725) e não será devolvida pela GESTORA em caso de desistência, distrato a pedido ou inadimplemento do comprador, hipóteses em que a corretagem integrada ao preço é retida do comprador (Lei n.º 6.766/1979, art. 32-A, V).');
  w.paragrafo('4.2. Na devolução integral ao comprador por imposição legal decorrente de arrependimento no prazo do art. 49 do CDC, a GESTORA restituirá à EMPREENDEDORA a comissão recebida, e o(a) corretor(a) à GESTORA a parte dele(a). Na resolução por culpa da EMPREENDEDORA, a comissão permanece devida à GESTORA.');

  w.clausula('CLÁUSULA 5ª — DO SIGILO E DO FORO');
  w.paragrafo('5.1. Este documento é interno, de uso exclusivo das partes e do administrador do sistema, e não integra o CPCV entregue ao comprador. As partes elegem o foro da Comarca de Açailândia/MA.');

  w.paragrafo(`Açailândia/MA, ${s(c.ctr_data_extenso)}.`, { antes: 8, depois: 4 });
  w.assinaturas([
    { papel: 'EMPREENDEDORA (promitente vendedora)', nome: s(c.vend_nome), doc: s(c.vend_cpf) ? `CPF ${s(c.vend_cpf)}` : undefined },
    { papel: 'GESTORA — Romatec Consultoria Total', nome: 'José Romário Pinto Bezerra', doc: `CNPJ ${ESCRITORIO.cnpj} · ${ESCRITORIO.creciJ}` },
  ]);
  return w.salvar();
}

// ─── Termo Aditivo de Concessão (unidade concedida pela proprietária a terceiro indicado por ela) ───────────

const vendedora = (c: Ctx) => (c.vend_pj ? s(c.vend_razao_social) : s(c.vend_nome)) || 'PROMITENTE VENDEDORA';
const docVendedora = (c: Ctx) => (c.vend_pj ? (s(c.vend_cnpj) ? `inscrita no CNPJ sob o n.º ${s(c.vend_cnpj)}` : '') : (s(c.vend_cpf) ? `inscrita no CPF sob o n.º ${s(c.vend_cpf)}` : ''));

/**
 * Concessão por liberalidade da proprietária: a unidade vai ao(à) beneficiário(a) indicado(a) por ela sem pagamento de
 * preço. Não é venda (não gera cobrança nem entra no faturamento de vendas), mas a comissão de gestão sobre o valor de
 * tabela é devida à gestora pela proprietária. Integra o CPCV (vem logo depois dele, no mesmo PDF e na mesma assinatura).
 */
export async function docTermoConcessao(c: Ctx, plano: PlanoContrato, marca: string): Promise<Buffer> {
  const k = plano.concessao!;
  // Valor de referência: o valor à vista do imóvel (base da transferência no cartório e do imposto de transmissão)
  const valorRef = plano.preco_avista;
  const w = await escritor(`Termo Aditivo de Concessão — ${s(c.ctr_numero)}`, marca, `Termo Aditivo de Concessão · integra o CPCV n.º ${s(c.ctr_numero)}`);
  w.cabecalho('TERMO ADITIVO DE CONCESSÃO DE UNIDADE POR LIBERALIDADE DA PROMITENTE VENDEDORA',
    `Integra o Instrumento Particular de Compromisso de Compra e Venda n.º ${s(c.ctr_numero)} · ${s(c.emp_nome)} · Chácara ${s(c.lote_codigo)}`);

  w.paragrafo([{ t: 'Pelo presente termo aditivo, de um lado, ' }, { t: vendedora(c), b: true },
    { t: `${docVendedora(c) ? `, ${docVendedora(c)}` : ''}, proprietária e instituidora do ${s(c.emp_nome)}, doravante denominada ` }, { t: 'PROMITENTE VENDEDORA', b: true },
    { t: '; de outro, ' }, { t: s(c.comp_nome), b: true }, { t: `, ${qualificacaoComprador(c)}` },
    ...(c.comp_casado && s(c.conj_nome) ? [{ t: ', e seu cônjuge/companheiro(a) ' }, { t: s(c.conj_nome), b: true }, { t: `, inscrito(a) no CPF sob o n.º ${s(c.conj_cpf)}` }] : []),
    { t: ', doravante denominado(a) ' }, { t: 'BENEFICIÁRIO(A)', b: true },
    { t: '; e, como interveniente, ' }, { t: `${ESCRITORIO.razaoSocial} (${ESCRITORIO.fantasia})`, b: true },
    { t: `, ${ESCRITORIO.creciJ}, inscrita no CNPJ sob o n.º ${ESCRITORIO.cnpj}, gestora de vendas do empreendimento, neste ato pelo responsável técnico ${ESCRITORIO.responsavel}, ${ESCRITORIO.creciResponsavel}, doravante denominada ` },
    { t: 'GESTORA', b: true }, { t: ', ajustam o seguinte:' }]);

  w.clausula('CLÁUSULA 1ª — DO OBJETO');
  w.paragrafo(`1.1. Este termo tem por objeto a ${unidade(c)}, Açailândia/MA, descrita no Instrumento Particular de Compromisso de Compra e Venda n.º ${s(c.ctr_numero)} (o "CPCV"), ao qual se integra.`);

  w.clausula('CLÁUSULA 2ª — DA CONCESSÃO POR LIBERALIDADE');
  w.paragrafo([{ t: '2.1. A PROMITENTE VENDEDORA, por sua livre e exclusiva liberalidade e por indicação própria, ' }, { t: 'concede a unidade ao(à) BENEFICIÁRIO(A), sem contraprestação', b: true },
    { t: `, que a aceita (Código Civil, arts. 538 e 539). Para todos os efeitos do CPCV, o preço da unidade, cujo valor de referência é o valor à vista do imóvel, de R$ ${brl(valorRef)} (${reaisExtenso(valorRef)}), ` },
    { t: 'fica integralmente quitado pela PROMITENTE VENDEDORA', b: true }, { t: ', nada sendo devido pelo(a) BENEFICIÁRIO(A) a título de preço, entrada ou parcelas.' }]);
  w.paragrafo('2.2. Em razão da cláusula 2.1, ficam sem efeito, neste contrato, o Quadro-Resumo e o Anexo II do CPCV na parte em que estabelecem valores, vencimentos e forma de pagamento do preço: não será emitido boleto, carnê ou qualquer cobrança do preço ao(à) BENEFICIÁRIO(A).');
  if (s(k.motivo)) w.paragrafo(`2.3. Registro da PROMITENTE VENDEDORA sobre a concessão: ${s(k.motivo)}.`);

  w.clausula('CLÁUSULA 3ª — DA NATUREZA DA OPERAÇÃO');
  w.paragrafo('3.1. A concessão não constitui venda onerosa e não integra o faturamento de vendas do empreendimento, as metas comerciais nem a base de cobrança da plataforma de pagamentos. Permanecem válidas todas as demais cláusulas do CPCV que não tratam do preço, em especial as relativas à posse, à liberação de uso, às construções, ao Estatuto, ao Regimento, às Diretrizes de Uso (Anexo IV), à contribuição associativa e às obrigações do(a) BENEFICIÁRIO(A) como promissário(a) comprador(a).');
  w.paragrafo([{ t: `3.2. A transferência definitiva observará a forma exigida em lei (Código Civil, art. 541), após o registro do parcelamento e a individualização das matrículas. As despesas e os tributos da transferência (escritura, registro e o imposto de transmissão incidente — ITBI ou ITCMD, conforme a forma do ato) ficam a cargo ` },
    { t: k.despesasPor === 'proprietaria' ? 'da PROMITENTE VENDEDORA' : 'do(a) BENEFICIÁRIO(A)', b: true },
    { t: `. Para a transferência e o recolhimento do imposto, as partes adotam como valor da unidade o valor de referência da cláusula 2.1, R$ ${brl(valorRef)}, sem prejuízo de avaliação diversa pelo órgão competente.` }]);

  w.clausula('CLÁUSULA 4ª — DA COMISSÃO DE GESTÃO E CORRETAGEM');
  w.paragrafo([{ t: '4.1. Ainda que não haja venda onerosa, a GESTORA realizou a gestão, a documentação, o cadastro, a medição e a formalização da unidade concedida, razão pela qual ' },
    { t: `a PROMITENTE VENDEDORA pagará à GESTORA a comissão de gestão e corretagem de R$ ${brl(k.comissaoValor)} (${reaisExtenso(k.comissaoValor)})`, b: true },
    { t: `, calculada sobre o valor de referência da cláusula 2.1, ` },
    { t: k.comissaoVencimento ? `até ${k.comissaoVencimento.split('-').reverse().join('/')}` : 'em até 30 (trinta) dias da assinatura deste termo', b: true },
    { t: `, ${s(k.comissaoPrazo) && !/^em até 30/.test(s(k.comissaoPrazo)) ? `${/^(por|em|via|mediante|no|na)\b/i.test(s(k.comissaoPrazo)) ? '' : 'mediante '}${s(k.comissaoPrazo).replace(/\.$/, '')}, ` : 'por Pix ou transferência, '}à conta da GESTORA (Código Civil, arts. 722 a 729; Lei n.º 6.530/1978).` }]);
  w.paragrafo('4.2. A comissão desta cláusula é obrigação exclusiva da PROMITENTE VENDEDORA e não é cobrada do(a) BENEFICIÁRIO(A). Não há corretor(a) intermediador(a) terceiro(a) a remunerar nesta operação.');

  w.clausula('CLÁUSULA 5ª — DISPOSIÇÕES GERAIS');
  w.paragrafo('5.1. Este termo integra o CPCV e prevalece sobre ele no que tratar do preço e da comissão. As partes reconhecem a validade da assinatura eletrônica (MP n.º 2.200-2/2001, art. 10, § 2º; Lei n.º 14.063/2020) e elegem o foro da Comarca de Açailândia/MA, com renúncia a qualquer outro, por mais privilegiado que seja.');

  w.paragrafo(`Açailândia/MA, ${s(c.ctr_data_extenso)}.`, { antes: 8, depois: 4 });
  const blocos = [
    { papel: 'PROMITENTE VENDEDORA (concedente)', nome: vendedora(c), doc: docVendedora(c).replace(/^inscrita no /, '').replace(' sob o n.º', '') },
    { papel: 'BENEFICIÁRIO(A)', nome: s(c.comp_nome), doc: `CPF ${s(c.comp_cpf)}` },
  ];
  if (c.comp_casado && s(c.conj_nome)) blocos.push({ papel: 'Cônjuge/companheiro(a) anuente', nome: s(c.conj_nome), doc: `CPF ${s(c.conj_cpf)}` });
  blocos.push({ papel: 'GESTORA (interveniente)', nome: `${ESCRITORIO.fantasia} — ${ESCRITORIO.responsavel}`, doc: `${ESCRITORIO.creciJ} · ${ESCRITORIO.creciResponsavel}` });
  w.assinaturas(blocos);
  return w.salvar();
}
