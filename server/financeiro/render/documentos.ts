/**
 * Documentos financeiros do Bom Jardims (Bloco Financeiro v1.0): boleto avulso A4, 2ª via atualizada, carnê v2
 * (capa → folha do plano → lâminas 3/página → contracapa), recibo de pagamento e declaração anual de quitação.
 */
import {
  A4, COR, LAMINA_ALTURA, MM, brl, campo, cartao, dataBR, desenharLamina, faixaModelo, linhaCorte, novoKit, paginaComMarca, qrPng,
  quebrar, retArredondado, texto, textoCentro, textoDir, tituloPagina, type DadosLamina, type Kit,
} from './comum';

const [W, H] = A4;
const salvar = async (k: Kit) => Buffer.from(await k.doc.save({ useObjectStreams: false }));

export interface DadosParcela extends DadosLamina {
  /** "A01 · Quadra A · 3.025,11 m²" */
  loteResumo: string;
  saldoApos: number | null;
  /** "118 do saldo" */
  parcelasRestantes: string;
}

export interface SegundaVia { valorOriginal: number; encargos: number; dias: number; valorAtualizado: number; novoVencimento: string }

export interface OpcoesDoc { modelo?: boolean; marca?: string; contato?: Contato }
export interface Contato { atendimento: string; vendas: string; corretor: string; email: string; gestora: string }
export const CONTATO_PADRAO: Contato = {
  atendimento: '(99) 9 9101-1970', vendas: '(99) 9 9181-1246', corretor: 'José Romário', email: 'romateccrm@gmail.com',
  gestora: 'Romatec Consultoria Total — CNPJ 17.261.987/0001-09',
};

export const INSTRUCOES_PAGAMENTO = (contato: Contato) => [
  'Pague pelo QR Code PIX (compensação imediata) ou pela linha digitável/código de barras em qualquer banco, lotérica ou app.',
  'Após o vencimento: correção pelo IPCA/IBGE, multa de 2% e juros de mora de 1% ao mês pro rata die (CPCV, Cláusula 7ª; CDC, art. 52, § 1º).',
  'Antecipação de parcelas com redução proporcional dos juros (CDC, art. 52, § 2º) — solicite o cálculo à administração.',
  'Pague somente por este boleto/PIX, em nome do beneficiário indicado na ficha. Nunca pague em dinheiro, a corretores ou a terceiros.',
  `Recibo automático por WhatsApp e e-mail após a compensação. 2ª via e carnê digital: ${contato.atendimento}.`,
];

/** Instruções da ficha de compensação */
export function instrucoesFicha(parcela: string, contato: Contato, segundaVia = false, comJuros = true): string[] {
  return [
    segundaVia ? 'Valor já atualizado com correção, multa e juros até o novo vencimento.' : 'Após o vencimento: multa de 2% e juros de 1% a.m. pro rata die.',
    comJuros ? `Parcela ${parcela} · juros de 6% a.a. já incluídos.` : `Parcela ${parcela} · sem juros.`,
    'Não receber após 59 dias do vencimento.',
    'Não pague a corretores ou a terceiros.',
    `2ª via: carnê digital ou WhatsApp ${contato.atendimento}.`,
  ];
}

/** Boleto avulso A4 (1 página): resumo da parcela + PIX + instruções + lâmina a 12 mm do rodapé */
export async function renderBoletoA4(d: DadosParcela, o: OpcoesDoc & { segundaVia?: SegundaVia } = {}): Promise<Buffer> {
  const contato = o.contato ?? CONTATO_PADRAO;
  const k = await novoKit({ marca: o.marca, modelo: o.modelo, titulo: `Boleto ${d.contratoNumero} ${d.parcela}` });
  const { p, topo, base } = paginaComMarca(k);
  const sv = o.segundaVia;
  let y = tituloPagina(k, p, topo, sv ? 'BOLETO DE PAGAMENTO — 2ª VIA ATUALIZADA' : 'BOLETO DE PAGAMENTO',
    'Condomínio de Chácaras Bom Jardims · Açailândia/MA · pagamento por boleto ou PIX');

  // Resumo da parcela
  const hc = 164, wr = 326, xr = 42;
  const a = cartao(k, p, xr, y, wr, hc, 'RESUMO DA PARCELA');
  const c1 = a.x, c2 = a.x + 136;
  let ly = a.yTopo - 13;
  campo(k, p, c1, ly, 'Contrato', d.contratoNumero); campo(k, p, c2, ly, 'Chácara', d.loteResumo, { maxW: 180 });
  ly -= 34;
  campo(k, p, c1, ly, 'Parcela', d.parcela); campo(k, p, c2, ly, 'Vencimento', dataBR(d.vencimento));
  ly -= 34;
  if (sv) {
    campo(k, p, c1, ly, 'Valor original', brl(sv.valorOriginal));
    campo(k, p, c2, ly, `Encargos (${sv.dias} dias)`, brl(sv.encargos), { cor: COR.vermelho });
    ly -= 34;
    campo(k, p, c1, ly, 'Valor atualizado', brl(sv.valorAtualizado), { size: 12.5 });
    campo(k, p, c2, ly, 'Novo vencimento', dataBR(sv.novoVencimento));
  } else {
    campo(k, p, c1, ly, 'Valor da parcela', brl(d.valor), { size: 12.5 });
    campo(k, p, c2, ly, 'Saldo devedor após o pagamento', d.saldoApos != null ? brl(d.saldoApos) : '—');
    ly -= 34;
    campo(k, p, c1, ly, 'Parcelas restantes', d.parcelasRestantes);
    campo(k, p, c2, ly, 'Comprador(a)', d.pagadorNome, { maxW: 180 });
  }

  // PIX
  const xp = xr + wr + 11, wp = W - 42 - xp;
  cartao(k, p, xp, y, wp, hc, 'PAGUE COM PIX');
  if (d.pixPayload || d.pixQrBase64) {
    const qr = d.pixQrBase64 ? await k.doc.embedPng(Buffer.from(d.pixQrBase64, 'base64')) : await qrPng(k, d.pixPayload!);
    const q = 38 * MM;
    p.drawImage(qr, { x: xp + (wp - q) / 2, y: y - 25 - q, width: q, height: q });
    textoCentro(p, 'Abra o app do banco › PIX › ler QR Code', xp + wp / 2, y - hc + 18, 6.3, k.f);
    textoCentro(p, 'ou use o "copia e cola" abaixo', xp + wp / 2, y - hc + 9, 6.3, k.f);
  } else {
    textoCentro(p, 'PIX indisponível nesta cobrança', xp + wp / 2, y - hc / 2, 7, k.f, COR.cinza);
  }
  y -= hc + 9;

  // PIX copia e cola (exatamente o do Asaas)
  p.drawRectangle({ x: 42, y: y - 20, width: W - 84, height: 20, borderColor: COR.cinzaClaro, borderWidth: 0.8, color: COR.branco });
  texto(p, `PIX copia e cola: ${d.pixPayload ?? '—'}`, 48, y - 13, 6.6, k.mono, COR.preto, W - 96);
  y -= 34;

  texto(p, 'COMO PAGAR E INFORMAÇÕES IMPORTANTES', 42, y, 8.6, k.fb, COR.verde);
  y -= 13;
  for (const l of INSTRUCOES_PAGAMENTO(contato)) {
    quebrar(k.f, l, 7.2, W - 92).forEach((t, i) => { texto(p, `${i ? '  ' : '• '}${t}`, 42, y, 7.2, k.f); y -= 10.5; });
  }

  // Lâmina a 12 mm do rodapé
  const yLam = base + 12 * MM + LAMINA_ALTURA - 8;
  linhaCorte(p, yLam + 6, k, 'corte aqui — recibo do pagador e ficha de compensação');
  await desenharLamina(k, p, yLam, {
    ...d,
    ...(sv ? { valor: sv.valorAtualizado, vencimento: sv.novoVencimento, instrucoes: instrucoesFicha(d.parcela, contato, true, /^Saldo/.test(d.parcela)) } : {}),
  });
  faixaModelo(k, p);
  return salvar(k);
}

// ─── Carnê v2 ─────────────────────────────────────────────────────────────

export interface DadosCarne {
  contratoNumero: string;
  modeloVersao: string;
  compradorNome: string;
  compradorDoc: string;
  /** "Chácara A01 · Quadra A · 3.025,11 m²" */
  unidade: string;
  loteCodigo: string;
  precoTabela: number;
  entradaResumo: string;
  saldoResumo: string;
  esteCarne: string;
  saldoFinanciado: number;
  taxaAA: number;
  taxaAM: number;
  entradaQtd: number;
  entradaValor: number;
  saldoQtd: number;
  saldoParcela: number;
  totalJuros: number;
  /** Linhas do bloco (folha do plano) e as lâminas, na mesma ordem */
  linhas: { parcela: string; vencimento: string; valor: number; juros: number; amortizacao: number; saldoApos: number | null }[];
  laminas: DadosLamina[];
  /** URL do carnê digital (/c/:codigo) */
  urlCarneDigital: string;
  /** Titular da conta Asaas (nunca constante) */
  beneficiario: string;
}

const pct = (v: number, d = 0) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

function moldura(p: import('pdf-lib').PDFPage, k: Kit) {
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COR.verde });
  p.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: COR.dourado, borderWidth: 2 });
  p.drawRectangle({ x: 33, y: 33, width: W - 66, height: H - 66, borderColor: COR.dourado, borderWidth: 0.5 });
  void k;
}

function capa(k: Kit, d: DadosCarne, contato: Contato) {
  const p = k.doc.addPage(A4);
  moldura(p, k);
  const lw = 170, lh = (lw * k.logo.height) / k.logo.width;
  p.drawImage(k.logo, { x: (W - lw) / 2, y: H - 100 - lh, width: lw, height: lh });
  textoCentro(p, 'CARNÊ DE PAGAMENTO', W / 2, H - 278, 27, k.times, COR.branco);
  textoCentro(p, 'Condomínio de Chácaras Bom Jardims · Açailândia/MA', W / 2, H - 300, 12, k.times, COR.dourado);
  const cx = 70, cw = W - 140, ch = 333, ct = H - 310;
  retArredondado(p, cx, ct - ch, cw, ch, 9, { cor: COR.creme });
  const itens: [string, string][] = [
    ['Contrato', `${d.contratoNumero} · ${d.modeloVersao}`], ['Promissário(a) comprador(a)', `${d.compradorNome} — ${d.compradorDoc}`],
    ['Unidade', d.unidade], ['Preço de tabela', brl(d.precoTabela)], ['Entrada (30%)', d.entradaResumo], ['Saldo', d.saldoResumo],
    ['Este carnê', d.esteCarne], ['Beneficiário', d.beneficiario], ['Emissão', 'Boletos e PIX emitidos pelo Asaas'],
  ];
  let y = ct - 26;
  for (const [r, v] of itens) { campo(k, p, cx + 20, y, r, v, { size: 9.6, maxW: cw - 40 }); y -= 31.5; }
  const rodape = [
    'Pague somente pelos boletos ou PIX deste carnê — nunca em dinheiro ou a corretores.',
    'Antecipação com redução proporcional dos juros (CDC, art. 52, § 2º): solicite o cálculo à administração.',
    `Administração: ${contato.atendimento} · Corretor: ${contato.corretor} — ${contato.vendas} · ${contato.email}`,
    `Intermediação: ${contato.gestora}`,
  ];
  rodape.forEach((l, i) => textoCentro(p, l, W / 2, 175 - i * 15.5, 7.3, k.f, COR.branco));
  faixaModelo(k, p, 'MODELO');
}

function folhaPlano(k: Kit, d: DadosCarne) {
  const { p, topo } = paginaComMarca(k);
  let y = tituloPagina(k, p, topo, 'PLANO DE PAGAMENTO DESTE CARNÊ',
    `Contrato ${d.contratoNumero} · Chácara ${d.loteCodigo} · Saldo financiado ${brl(d.saldoFinanciado)} · Tabela Price · ${pct(d.taxaAA)} a.a. efetivos (${pct(d.taxaAM, 4)} a.m.)`);
  const X0 = 42, X1 = W - 42 - 16;
  const cols = [{ t: 'Nº', w: 38 }, { t: 'Parcela', w: 86 }, { t: 'Vencimento', w: 68 }, { t: 'Valor', w: 74 }, { t: 'Juros', w: 68 }, { t: 'Amortização', w: 74 }, { t: 'Saldo devedor', w: X1 - X0 - 408 }];
  const AL = 16;
  p.drawRectangle({ x: X0, y: y - AL, width: X1 - X0, height: AL + 1, color: COR.verde });
  let x = X0;
  for (const c of cols) { texto(p, c.t, x + 4, y - 11, 7.4, k.fb, COR.branco); x += c.w; }
  y -= AL;
  d.linhas.forEach((l, i) => {
    if (i % 2 === 1) p.drawRectangle({ x: X0, y: y - AL, width: X1 - X0, height: AL, color: COR.creme, opacity: 0.9 });
    const vals = [String(i + 1), l.parcela, dataBR(l.vencimento), brl(l.valor), brl(l.juros), brl(l.amortizacao), l.saldoApos != null && !/^Entrada/.test(l.parcela) ? brl(l.saldoApos) : '—'];
    x = X0;
    vals.forEach((v, j) => { texto(p, v, x + 4, y - 11, 7.1, k.f); x += cols[j].w; });
    y -= AL;
  });
  const soma = (f: (l: DadosCarne['linhas'][number]) => number) => Math.round(d.linhas.reduce((s, l) => s + f(l), 0) * 100) / 100;
  p.drawRectangle({ x: X0, y: y - AL - 1, width: X1 - X0, height: AL + 1, color: COR.dourado });
  texto(p, 'TOTAL DESTE CARNÊ', X0 + 4, y - 11.5, 7.4, k.fb, COR.verde);
  texto(p, brl(soma(l => l.valor)), X0 + 196, y - 11.5, 7.4, k.fb, COR.verde);
  texto(p, brl(soma(l => l.juros)), X0 + 270, y - 11.5, 7.4, k.fb, COR.verde);
  texto(p, brl(soma(l => l.amortizacao)), X0 + 338, y - 11.5, 7.4, k.fb, COR.verde);
  y -= AL + 28;
  const hc = 126;
  const a = cartao(k, p, X0, y, W - 84, hc, 'RESUMO DO CONTRATO');
  const cw = (W - 84 - 24) / 3;
  let ly = a.yTopo - 13;
  campo(k, p, a.x, ly, 'Preço de tabela', brl(d.precoTabela)); campo(k, p, a.x + cw, ly, 'Entrada (30%)', `${d.entradaQtd} × ${brl(d.entradaValor)}`);
  campo(k, p, a.x + 2 * cw, ly, 'Saldo', `${d.saldoQtd} × ${brl(d.saldoParcela)}`);
  ly -= 32;
  campo(k, p, a.x, ly, 'Total de juros do saldo', brl(d.totalJuros)); campo(k, p, a.x + cw, ly, 'Parcelas fixas', 'sem correção se pagas em dia');
  campo(k, p, a.x + 2 * cw, ly, 'Próximo carnê', 'emitido com 2 parcelas a vencer', { maxW: cw - 4 });
  texto(p, 'Valores exatos de cada cobrança, linha digitável, código de barras e PIX são gerados pelo Asaas no momento da emissão.', a.x, y - hc + 12, 6.6, k.f);
  faixaModelo(k, p);
}

async function contracapa(k: Kit, d: DadosCarne, contato: Contato) {
  const p = k.doc.addPage(A4);
  moldura(p, k);
  const lw = 140, lh = (lw * k.logo.height) / k.logo.width;
  p.drawImage(k.logo, { x: (W - lw) / 2, y: H - 100 - lh, width: lw, height: lh });
  textoCentro(p, 'CARNÊ DIGITAL E 2ª VIA', W / 2, H - 258, 21, k.times, COR.branco);
  const bw = 152, bx = (W - bw) / 2, by = H - 285 - bw;
  retArredondado(p, bx, by, bw, bw, 8, { cor: COR.branco });
  const qr = await qrPng(k, d.urlCarneDigital);
  p.drawImage(qr, { x: bx + 22, y: by + 22, width: bw - 44, height: bw - 44 });
  [
    'Aponte a câmera para acessar o carnê digital, emitir 2ª via atualizada e baixar recibos.',
    `Administração: ${contato.atendimento} · Corretor: ${contato.corretor} — ${contato.vendas}`,
    `Gestão e administração de vendas: ${contato.gestora}`,
  ].forEach((l, i) => textoCentro(p, l, W / 2, by - 30 - i * 17, 7.8, k.f, COR.dourado));
}

/** Carnê v2: capa → folha do plano → lâminas (3 por página) → contracapa. Páginas = 1 + 1 + ceil(n/3) + 1 */
export async function renderCarneV2(d: DadosCarne, o: OpcoesDoc = {}): Promise<Buffer> {
  const contato = o.contato ?? CONTATO_PADRAO;
  const k = await novoKit({ marca: o.marca, modelo: o.modelo, titulo: `Carnê ${d.contratoNumero}` });
  capa(k, d, contato);
  folhaPlano(k, d);
  for (let i = 0; i < d.laminas.length; i += 3) {
    const p = k.doc.addPage(A4);
    const grupo = d.laminas.slice(i, i + 3);
    for (let j = 0; j < grupo.length; j++) {
      const l = grupo[j];
      const yTopo = H - 14 - j * (LAMINA_ALTURA + 10);
      await desenharLamina(k, p, yTopo, l);
      if (j < grupo.length - 1) linhaCorte(p, yTopo - LAMINA_ALTURA - 5);
    }
    faixaModelo(k, p);
  }
  await contracapa(k, d, contato);
  return salvar(k);
}

// ─── Recibo ───────────────────────────────────────────────────────────────

export interface DadosRecibo {
  numero: string;
  codigoVerif: string;
  urlVerificacao: string;
  pagadorNome: string;
  /** Vazio na versão pública (sem CPF) */
  pagadorDoc: string;
  contratoNumero: string;
  referente: string;
  vencimento: string;
  valorPago: number;
  pagoEm: string;
  forma: string;
  saldoRemanescente: number | null;
  parcelasAVencer: string;
  beneficiario: string;
  asaasId: string;
}

export async function renderRecibo(d: DadosRecibo, o: OpcoesDoc = {}): Promise<Buffer> {
  const k = await novoKit({ marca: o.marca, modelo: o.modelo, titulo: `Recibo ${d.numero}` });
  const { p, topo } = paginaComMarca(k);
  let y = tituloPagina(k, p, topo, 'RECIBO DE PAGAMENTO DE PARCELA', `Emitido automaticamente após a confirmação do pagamento · Nº ${d.numero}`);
  const hc = 196;
  const a = cartao(k, p, 42, y, W - 84, hc, 'DADOS DO PAGAMENTO');
  const c2 = a.x + 330;
  let ly = a.yTopo - 14;
  campo(k, p, a.x, ly, 'Recebemos de', d.pagadorDoc ? `${d.pagadorNome} — ${d.pagadorDoc}` : d.pagadorNome, { maxW: 322 });
  campo(k, p, c2, ly, 'Contrato', d.contratoNumero);
  ly -= 40;
  campo(k, p, a.x, ly, 'Referente a', d.referente); campo(k, p, c2, ly, 'Vencimento', dataBR(d.vencimento));
  ly -= 40;
  campo(k, p, a.x, ly, 'Valor pago', brl(d.valorPago)); campo(k, p, c2, ly, 'Data do pagamento', `${dataBR(d.pagoEm)} · ${d.forma}`);
  ly -= 40;
  campo(k, p, a.x, ly, 'Saldo devedor remanescente', d.saldoRemanescente != null ? brl(d.saldoRemanescente) : '—');
  campo(k, p, c2, ly, 'Parcelas a vencer', d.parcelasAVencer);
  y -= hc + 22;
  texto(p, 'A quitação refere-se exclusivamente à parcela acima, sem prejuízo das demais obrigações do contrato.', 42, y, 7.6, k.f);
  texto(p, `Beneficiário: ${d.beneficiario} · Identificador Asaas: ${d.asaasId}`, 42, y - 13, 7.6, k.f, COR.preto, W - 84);
  y -= 40;
  const qr = await qrPng(k, d.urlVerificacao);
  p.drawImage(qr, { x: 50, y: y - 72, width: 72, height: 72 });
  texto(p, `Verifique a autenticidade deste recibo pelo QR Code ou em ${d.urlVerificacao}`, 140, y - 30, 7.2, k.f, COR.preto, W - 182);
  texto(p, `Código de verificação: ${d.codigoVerif}`, 140, y - 45, 7.2, k.f);
  faixaModelo(k, p);
  return salvar(k);
}

// ─── Declaração anual de quitação (Lei 12.007/2009) ───────────────────────

export interface DadosDeclaracao {
  ano: number;
  contratoNumero: string;
  compradorNome: string;
  compradorDoc: string;
  unidade: string;
  vendedora: string;
  pagamentos: { parcela: string; vencimento: string; pagoEm: string; valor: number }[];
  codigoVerif: string;
  urlVerificacao: string;
  emitidaEm: string;
}

export async function renderDeclaracaoAnual(d: DadosDeclaracao, o: OpcoesDoc = {}): Promise<Buffer> {
  const contato = o.contato ?? CONTATO_PADRAO;
  const k = await novoKit({ marca: o.marca, modelo: o.modelo, titulo: `Declaração de quitação ${d.ano} — ${d.contratoNumero}` });
  let { p, topo, base } = paginaComMarca(k);
  let y = tituloPagina(k, p, topo, `DECLARAÇÃO ANUAL DE QUITAÇÃO DE DÉBITOS — ${d.ano}`, `Lei n.º 12.007/2009 · Contrato ${d.contratoNumero} · ${d.unidade}`);
  const total = Math.round(d.pagamentos.reduce((s, x) => s + x.valor, 0) * 100) / 100;
  y -= 10;
  const corpo = `Declaramos, para os fins da Lei n.º 12.007/2009, que ${d.compradorNome} (${d.compradorDoc}), promissário(a) comprador(a) da ${d.unidade} do Condomínio de Chácaras Bom Jardims, pelo contrato n.º ${d.contratoNumero}, quitou todas as parcelas com vencimento no ano de ${d.ano}, no total de ${brl(total)}, conforme a relação abaixo. Esta declaração substitui, para comprovação, os recibos das parcelas do ano e não quita parcelas de outros anos nem as demais obrigações do contrato.`;
  for (const l of quebrar(k.f, corpo, 9, W - 84)) { texto(p, l, 42, y, 9, k.f); y -= 13; }
  y -= 10;
  const cols = [{ t: 'Parcela', w: 150 }, { t: 'Vencimento', w: 110 }, { t: 'Pago em', w: 110 }, { t: 'Valor pago', w: W - 84 - 370 }];
  const cab = () => {
    p.drawRectangle({ x: 42, y: y - 15, width: W - 84, height: 16, color: COR.verde });
    let x = 42;
    for (const c of cols) { texto(p, c.t, x + 5, y - 10.5, 7.6, k.fb, COR.branco); x += c.w; }
    y -= 16;
  };
  cab();
  d.pagamentos.forEach((pg, i) => {
    if (y - 16 < base + 90) { faixaModelo(k, p); ({ p, topo, base } = paginaComMarca(k)); y = topo - 10; cab(); }
    if (i % 2 === 1) p.drawRectangle({ x: 42, y: y - 15, width: W - 84, height: 15, color: COR.creme });
    let x = 42;
    [pg.parcela, dataBR(pg.vencimento), dataBR(pg.pagoEm), brl(pg.valor)].forEach((v, j) => { texto(p, v, x + 5, y - 10.5, 7.6, k.f); x += cols[j].w; });
    y -= 15;
  });
  p.drawRectangle({ x: 42, y: y - 16, width: W - 84, height: 16, color: COR.dourado });
  texto(p, `TOTAL PAGO EM ${d.ano}`, 47, y - 11, 7.8, k.fb, COR.verde);
  textoDir(p, brl(total), W - 47, y - 11, 7.8, k.fb, COR.verde);
  y -= 46;
  texto(p, `Açailândia/MA, ${dataBR(d.emitidaEm)}.`, 42, y, 9, k.f);
  y -= 34;
  p.drawLine({ start: { x: 42, y }, end: { x: 290, y }, thickness: 0.6, color: COR.preto });
  texto(p, d.vendedora, 42, y - 11, 8, k.fb, COR.preto, 360);
  texto(p, `Promitente vendedora · gestão: ${contato.gestora}`, 42, y - 22, 7, k.f, COR.cinza, W - 84);
  const qr = await qrPng(k, d.urlVerificacao);
  p.drawImage(qr, { x: W - 42 - 62, y: y - 30, width: 62, height: 62 });
  textoDir(p, `Código de verificação: ${d.codigoVerif}`, W - 42, y - 40, 6.8, k.f);
  faixaModelo(k, p);
  return salvar(k);
}
