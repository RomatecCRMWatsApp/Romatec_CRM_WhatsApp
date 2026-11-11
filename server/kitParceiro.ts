/**
 * Kit do Parceiro (PDF personalizado) — Bom Jardims.
 *
 * Três destinatários, mesmo material:
 * - parceira: imobiliária cadastrada (comissão dela, link e QR do portal /parceiro/:token);
 * - prospecto: empresa da Prospecção B2B ainda não parceira (comissão padrão, link da página do empreendimento);
 * - corretor: corretor ativo da equipe (apresentação com o cartão dele e o link ?c=, que atribui os leads a ele).
 *
 * Conteúdo só com fatos do sistema (lotes, configuração jurídica, condições vigentes): sem "escritura", "100% documentado"
 * nem promessa de valorização. Preços só quando pedidos (tabela de referência, com a ressalva das condições vigentes).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { getDb } from './db';
import { condicoesPagamento, empJuridico, empreendimentos, imobiliariasParceiras, lotes, prospectos, users } from '../drizzle/schema';
import { ESCRITORIO } from '../shared/escritorio';
import { CARTAO_PADRAO, cartaoDe, type CartaoVendas } from '../shared/cartaoVendas';
import { condicoesDaLinha, simular, type CondicoesPagamento } from '../shared/simulador';

export const TIPOS_KIT = ['parceira', 'prospecto', 'corretor'] as const;
export type TipoKit = (typeof TIPOS_KIT)[number];
export const COMISSAO_PADRAO = 0.02;
const SLUG = 'bom-jardims';

export class KitErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'KitErro'; } }

const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
const VERDE = rgb(0.047, 0.2, 0.125), DOURADO = rgb(0.788, 0.659, 0.298), CREME = rgb(0.953, 0.933, 0.875), CINZA = rgb(0.36, 0.42, 0.37), BRANCO = rgb(1, 1, 1);
const A4: [number, number] = [595.28, 841.89];
const X0 = 54, X1 = A4[0] - 54;

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const m2 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const pctTxt = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const hojeBR = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });

/** Pasta pública (build ou fonte) */
function arquivoPublico(rel: string): string | null {
  for (const raiz of [path.resolve('dist/public'), path.resolve('client/public')]) {
    const p = path.join(raiz, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Imagem pública (webp/png/jpg) → embutida como JPEG/PNG, redimensionada para o PDF */
async function imagem(doc: PDFDocument, rel: string, largura: number, png = false): Promise<PDFImage | null> {
  const p = arquivoPublico(rel);
  if (!p) return null;
  try {
    const sharp = (await import('sharp')).default;
    const base = sharp(await readFile(p)).resize({ width: largura, withoutEnlargement: true });
    return png ? doc.embedPng(await base.png().toBuffer()) : doc.embedJpg(await base.jpeg({ quality: 82 }).toBuffer());
  } catch (e: any) {
    console.warn(`[Kit] imagem ${rel}:`, e?.message);
    return null;
  }
}

function quebrar(font: PDFFont, s: string, size: number, largura: number): string[] {
  const out: string[] = [];
  for (const par of String(s).split('\n')) {
    let l = '';
    for (const w of par.split(/\s+/)) {
      const n = l ? `${l} ${w}` : w;
      if (font.widthOfTextAtSize(n, size) > largura && l) { out.push(l); l = w; } else l = n;
    }
    out.push(l);
  }
  return out;
}

// ───────────────────────────── Dados ─────────────────────────────

export interface Destinatario {
  tipo: TipoKit;
  nome: string;
  /** Link exclusivo (portal da parceira, página com o código do corretor ou do empreendimento) */
  link: string;
  /** Comissão da parceria (parceira/prospecto); null no kit do corretor */
  comissaoPct: number | null;
  /** Quem atende: o corretor do kit, ou o corretor da casa definido para a parceira, ou o padrão (José Romário) */
  contato: CartaoVendas;
  /** Usuário do contato (foto e carimbo no cartão); sem ele, o cartão sai com as iniciais */
  contatoId?: number | null;
}

export interface DadosEmpreendimento {
  nome: string;
  municipio: string;
  uf: string;
  endereco: string;
  aVenda: number;
  disponiveis: number;
  areaMin: number;
  areaMax: number;
  licenca: string | null;
  sigef: boolean;
  parcelamentoRegistrado: boolean;
  /** Tabela de referência (só quando pedida) */
  tabela: { codigo: string; quadra: string; area: number; preco: number }[] | null;
  condicoes: { entradaPct: number; prazoMax: number } | null;
}

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new KitErro('Banco indisponível', 503);
  return d;
}

async function contatoDe(d: any, userId: number | null | undefined): Promise<CartaoVendas> {
  if (!userId) return CARTAO_PADRAO;
  const [u]: any[] = await d.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.ativo === false || u.ativo === 0) return CARTAO_PADRAO;
  const { perfilDe } = await import('../shared/equipe');
  return cartaoDe(u, perfilDe(u));
}

export async function destinatarioDe(tipo: TipoKit, id: number): Promise<Destinatario> {
  const d = await banco();
  if (tipo === 'parceira') {
    const [p]: any[] = await d.select().from(imobiliariasParceiras).where(eq(imobiliariasParceiras.id, id)).limit(1);
    if (!p) throw new KitErro('Parceira não encontrada', 404);
    const contato = await contatoDe(d, p.corretorInternoId);
    // Corretor da casa inativo/ausente: contato padrão (contatoId nulo → foto do contato padrão)
    return { tipo, nome: p.nome, link: `${urlPublica()}/parceiro/${p.token}`, comissaoPct: Number(p.comissaoPct ?? COMISSAO_PADRAO), contato, contatoId: contato === CARTAO_PADRAO ? null : p.corretorInternoId ?? null };
  }
  if (tipo === 'prospecto') {
    const [p]: any[] = await d.select().from(prospectos).where(eq(prospectos.id, id)).limit(1);
    if (!p) throw new KitErro('Prospecto não encontrado', 404);
    if (p.status === 'optout') throw new KitErro('Esta empresa pediu para não receber mensagens.', 409);
    return { tipo, nome: p.nome, link: `${urlPublica()}/${SLUG}?utm_source=parceria&utm_campaign=PROSP-${p.id}`, comissaoPct: COMISSAO_PADRAO, contato: CARTAO_PADRAO };
  }
  const [u]: any[] = await d.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.ativo === false || u.ativo === 0) throw new KitErro('Corretor não encontrado ou inativo', 404);
  const { perfilDe } = await import('../shared/equipe');
  const { refDoUsuario } = await import('./cartaoVendas');
  const cartao = cartaoDe(u, perfilDe(u));
  return { tipo, nome: cartao.nome, link: `${urlPublica()}/${SLUG}?c=${refDoUsuario(Number(u.id))}`, comissaoPct: null, contato: cartao, contatoId: Number(u.id) };
}

export async function dadosEmpreendimento(comPrecos: boolean): Promise<DadosEmpreendimento> {
  const d = await banco();
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, SLUG)).limit(1);
  if (!emp) throw new KitErro('Empreendimento não cadastrado', 404);
  const ls: any[] = await d.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const vendaveis = ls.filter(l => (l.comercializavel === true || Number(l.comercializavel) === 1) && Number(l.areaM2) > 0);
  const livres = vendaveis.filter(l => (l.situacao || 'disponivel') === 'disponivel');
  const areas = vendaveis.map(l => Number(l.areaM2));
  const [j]: any[] = await d.select().from(empJuridico).where(eq(empJuridico.empreendimentoId, emp.id)).limit(1);
  const def = j ? (typeof j.defaultsJson === 'string' ? JSON.parse(j.defaultsJson) : j.defaultsJson ?? {}) : {};
  const v = (k: string) => String(def[k] ?? '').trim();
  const licenca = v('emp_licenca_ambiental') ? [v('emp_licenca_ambiental'), v('emp_licenca_orgao') && `— ${v('emp_licenca_orgao')}`].filter(Boolean).join(' ') : null;
  // Condição vigente (filtro do "ativo" em JS: o SQLite dos testes não aceita booleano no WHERE)
  const conds: any[] = await d.select().from(condicoesPagamento).where(eq(condicoesPagamento.empreendimentoId, emp.id));
  const cond = conds.filter(x => x.ativo === true || Number(x.ativo) === 1).sort((x, y) => String(y.vigenteDesde).localeCompare(String(x.vigenteDesde)) || y.id - x.id)[0];
  const c = cond ? (condicoesDaLinha(cond) as CondicoesPagamento) : null;
  let tabela: DadosEmpreendimento['tabela'] = null;
  if (comPrecos && c) {
    tabela = livres.map(l => ({
      codigo: String(l.codigo), quadra: String(l.quadra ?? ''), area: Number(l.areaM2),
      preco: simular(Number(l.areaM2), c.entradaMaxParcelas, c, l.precoTabela != null ? Number(l.precoTabela) : null).preco,
    })).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  }
  return {
    nome: emp.nome, municipio: emp.municipio ?? 'Açailândia', uf: emp.uf ?? 'MA',
    endereco: v('emp_endereco') || 'Estrada do Piquiá dos Baianos, altura do km 15 da BR-222',
    aVenda: vendaveis.length, disponiveis: livres.length,
    areaMin: areas.length ? Math.min(...areas) : 0, areaMax: areas.length ? Math.max(...areas) : 0,
    licenca, sigef: !!v('emp_sigef'), parcelamentoRegistrado: !!v('emp_registro_parcelamento'),
    tabela, condicoes: c ? { entradaPct: c.entradaPct, prazoMax: Math.max(...c.prazos) } : null,
  };
}

// ───────────────────────────── PDF ─────────────────────────────

export async function gerarKit(dest: Destinatario, emp: DadosEmpreendimento): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const parceria = dest.tipo !== 'corretor';
  doc.setTitle(parceria ? `Proposta de parceria — ${dest.nome} × Bom Jardims` : `Bom Jardims — ${dest.nome}`);
  doc.setAuthor(ESCRITORIO.fantasia);
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const [capa, logo, mapa, stand] = await Promise.all([
    imagem(doc, 'bom-jardims/portal-noite.webp', 1240), imagem(doc, 'bom-jardims/logo-520.webp', 520, true),
    imagem(doc, 'bom-jardims/divulgacao/mapa.png', 1400), imagem(doc, 'bom-jardims/stand-perspectiva.webp', 1000),
  ]);
  const qrUrl = await QRCode.toDataURL(dest.link, { margin: 1, width: 360, color: { dark: '#0C3320', light: '#FFFFFF' } });
  const qr = await doc.embedPng(Buffer.from(qrUrl.split(',')[1], 'base64'));
  const [W, H] = A4;
  const txt = (p: PDFPage, s: string, x: number, y: number, size = 10, font = f, color = rgb(0.13, 0.2, 0.16)) => p.drawText(s, { x, y, size, font, color });
  const centro = (p: PDFPage, s: string, y: number, size: number, font = f, color = rgb(0.13, 0.2, 0.16)) => txt(p, s, (W - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color);
  const paragrafo = (p: PDFPage, s: string, x: number, y: number, largura: number, size = 10.5, font = f, cor = rgb(0.13, 0.2, 0.16), entre = 4.5) => {
    for (const l of quebrar(font, s, size, largura)) { txt(p, l, x, y, size, font, cor); y -= size + entre; }
    return y;
  };
  const rodape = (p: PDFPage, n: number) => {
    p.drawLine({ start: { x: X0, y: 40 }, end: { x: X1, y: 40 }, thickness: 0.6, color: DOURADO });
    txt(p, `${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ} · CNPJ ${ESCRITORIO.cnpj} · ${ESCRITORIO.creciResponsavel}`, X0, 27, 7.5, f, CINZA);
    const pg = String(n);
    txt(p, pg, X1 - f.widthOfTextAtSize(pg, 7.5), 27, 7.5, f, CINZA);
  };
  const titulo = (p: PDFPage, s: string, y: number) => {
    txt(p, s, X0, y, 19, fb, VERDE);
    p.drawRectangle({ x: X0, y: y - 9, width: 56, height: 2.2, color: DOURADO });
    return y - 30;
  };
  let pagina = 0;

  // 1. Capa
  {
    const p = doc.addPage(A4); pagina++;
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: VERDE });
    if (capa) {
      const h = (W * capa.height) / capa.width;
      p.drawImage(capa, { x: 0, y: H - h, width: W, height: h });
      p.drawRectangle({ x: 0, y: H - h, width: W, height: 70, color: VERDE, opacity: 0.55 });
    }
    if (logo) { const lw = 170, lh = (lw * logo.height) / logo.width; p.drawImage(logo, { x: (W - lw) / 2, y: 330, width: lw, height: lh }); }
    centro(p, parceria ? 'PROPOSTA DE PARCERIA' : 'APRESENTAÇÃO DO EMPREENDIMENTO', 290, 12, fb, DOURADO);
    const nomeLinhas = quebrar(fb, dest.nome, 24, W - 120);
    let y = 255;
    for (const l of nomeLinhas.slice(0, 2)) { centro(p, l, y, 24, fb, BRANCO); y -= 30; }
    centro(p, parceria ? '× Condomínio de Chácaras Bom Jardims' : 'Condomínio de Chácaras Bom Jardims', y - 4, 13, f, CREME);
    centro(p, `${emp.municipio}/${emp.uf} · ${hojeBR()}`, y - 26, 10, f, CREME);
    p.drawLine({ start: { x: X0, y: 70 }, end: { x: X1, y: 70 }, thickness: 0.6, color: DOURADO });
    centro(p, `${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ} · CNPJ ${ESCRITORIO.cnpj}`, 52, 8.5, f, CREME);
  }

  // 2. O empreendimento
  {
    const p = doc.addPage(A4); pagina++;
    let y = titulo(p, 'O empreendimento', H - 70);
    y = paragrafo(p, `${emp.nome}, em ${emp.municipio}/${emp.uf} — ${emp.endereco}. Projeto com portal de entrada e guarita, área administrativa e stand de vendas na entrada e área de vivência; infraestrutura de vias, água (poço e reservatório) e energia em execução.`, X0, y, X1 - X0);
    y -= 12;
    const caixas: [string, string][] = [
      [String(emp.aVenda), 'chácaras no projeto'],
      [String(emp.disponiveis), 'disponíveis hoje'],
      [emp.areaMin ? `${Math.floor(emp.areaMin).toLocaleString('pt-BR')} a ${Math.ceil(emp.areaMax).toLocaleString('pt-BR')}` : '—', 'm² por chácara'],
    ];
    const cw = (X1 - X0 - 20) / 3;
    caixas.forEach(([n, r], i) => {
      const x = X0 + i * (cw + 10);
      p.drawRectangle({ x, y: y - 62, width: cw, height: 62, color: CREME, borderColor: DOURADO, borderWidth: 0.8 });
      txt(p, n, x + (cw - fb.widthOfTextAtSize(n, 20)) / 2, y - 30, 20, fb, VERDE);
      txt(p, r, x + (cw - f.widthOfTextAtSize(r, 9)) / 2, y - 48, 9, f, CINZA);
    });
    y -= 84;
    if (mapa) {
      const mw = X1 - X0, mh = Math.min((mw * mapa.height) / mapa.width, y - 150);
      const k = Math.min(mw / mapa.width, mh / mapa.height);
      p.drawImage(mapa, { x: X0 + (mw - mapa.width * k) / 2, y: y - mapa.height * k, width: mapa.width * k, height: mapa.height * k });
      y -= mapa.height * k + 16;
    }
    txt(p, 'Documentação', X0, y, 11, fb, VERDE); y -= 15;
    const docs = [
      emp.licenca ? `Licença ambiental: ${emp.licenca}.` : null,
      emp.sigef ? 'Área do empreendimento georreferenciada e certificada no SIGEF/INCRA (memorial descritivo de cada chácara).' : null,
      emp.parcelamentoRegistrado ? 'Parcelamento registrado no Cartório de Registro de Imóveis.' : 'Registro do parcelamento no Cartório de Registro de Imóveis: em andamento (situação atualizada no contrato).',
      'Contrato digital com assinatura eletrônica e carnê/boletos emitidos pelo sistema.',
    ].filter(Boolean) as string[];
    for (const l of docs) { y = paragrafo(p, `•  ${l}`, X0, y, X1 - X0, 9.5, f, rgb(0.13, 0.2, 0.16), 3.5); y -= 2; }
    rodape(p, pagina);
  }

  // 3. Parceria (imobiliária/prospecto) ou contato do corretor
  {
    const p = doc.addPage(A4); pagina++;
    let y: number;
    if (parceria) {
      y = titulo(p, 'Como funciona a parceria', H - 70);
      const passos: [string, string][] = [
        ['Indique', 'Envie o cliente pelo seu portal exclusivo ou pelo link/QR abaixo. A indicação fica registrada com o seu código.'],
        ['Atendimento', 'Um corretor da Romatec acompanha o cliente na visita, na escolha da chácara e na simulação de pagamento.'],
        ['Contrato', 'Contrato digital com assinatura eletrônica; você acompanha cada indicação e venda no portal.'],
        ['Comissão', dest.comissaoPct != null ? `${pctTxt(dest.comissaoPct)} sobre o valor de cada venda vinda da sua indicação, conforme o termo de parceria.` : 'Conforme o termo de parceria.'],
      ];
      passos.forEach(([t, s], i) => {
        p.drawCircle({ x: X0 + 13, y: y - 4, size: 13, color: VERDE });
        txt(p, String(i + 1), X0 + 13 - fb.widthOfTextAtSize(String(i + 1), 12) / 2, y - 8.5, 12, fb, BRANCO);
        txt(p, t, X0 + 36, y, 12, fb, VERDE);
        y = paragrafo(p, s, X0 + 36, y - 16, X1 - X0 - 36, 10, f) - 12;
      });
      if (dest.comissaoPct != null) {
        p.drawRectangle({ x: X0, y: y - 58, width: X1 - X0, height: 58, color: VERDE });
        txt(p, 'SUA COMISSÃO', X0 + 18, y - 22, 9, fb, DOURADO);
        txt(p, pctTxt(dest.comissaoPct), X0 + 18, y - 46, 22, fb, BRANCO);
        paragrafo(p, 'sobre o valor de cada venda indicada por você, paga conforme o termo de parceria.', X0 + 120, y - 30, X1 - X0 - 140, 10, f, CREME);
        y -= 80;
      }
    } else {
      y = titulo(p, 'Fale comigo', H - 70);
      y = paragrafo(p, 'Visita guiada, escolha da chácara e simulação de pagamento no seu tempo, com contrato digital. Aponte a câmera para o QR code e veja fotos, mapa e a localização exata das chácaras.', X0, y, X1 - X0) - 16;
      if (stand) {
        const sw = X1 - X0, sh = Math.min((sw * stand.height) / stand.width, 230);
        const k = Math.min(sw / stand.width, sh / stand.height);
        p.drawImage(stand, { x: X0, y: y - stand.height * k, width: stand.width * k, height: stand.height * k });
        y -= stand.height * k + 20;
      }
    }
    // Link exclusivo + QR + contato
    const qrw = 120;
    p.drawRectangle({ x: X0, y: y - qrw - 24, width: X1 - X0, height: qrw + 24, color: CREME, borderColor: DOURADO, borderWidth: 0.8 });
    p.drawImage(qr, { x: X0 + 12, y: y - qrw - 12, width: qrw, height: qrw });
    let yy = y - 26;
    const xi = X0 + qrw + 28, li = X1 - xi - 12;
    txt(p, dest.tipo === 'parceira' ? 'SEU PORTAL DE PARCEIRO' : dest.tipo === 'corretor' ? 'CONHEÇA AS CHÁCARAS' : 'CONHEÇA O EMPREENDIMENTO', xi, yy, 9, fb, DOURADO); yy -= 16;
    for (const l of quebrar(f, dest.link, 8.5, li)) { txt(p, l, xi, yy, 8.5, f, VERDE); yy -= 11; }
    yy -= 8;
    txt(p, 'Aponte a câmera para o QR code ou toque no link.', xi, yy, 9, f, CINZA);
    // Cartão "Seu corretor": foto redonda, carimbo e contatos de quem atende
    const { corretorParaPdf, corretorPadraoPdf, desenharCartaoCorretor } = await import('./pdf/cartaoCorretor');
    // Sem corretor definido, o contato padrão, com a foto dele
    const cartaoC = (dest.contatoId ? await corretorParaPdf(dest.contatoId) : null) ?? await corretorPadraoPdf();
    await desenharCartaoCorretor(doc, p, X0, y - qrw - 24 - 14, X1 - X0, cartaoC, { normal: f, negrito: fb });
    rodape(p, pagina);
  }

  // 4. Tabela de referência (opcional)
  if (emp.tabela?.length) {
    let p = doc.addPage(A4); pagina++;
    let y = titulo(p, 'Chácaras disponíveis — tabela de referência', H - 70);
    y = paragrafo(p, `Valores de tabela em ${hojeBR()}${emp.condicoes ? `; entrada de ${pctTxt(emp.condicoes.entradaPct)} e saldo em até ${emp.condicoes.prazoMax} meses no simulador` : ''}. Sujeitos à disponibilidade e às condições vigentes no momento da proposta.`, X0, y, X1 - X0, 9, f, CINZA, 3) - 8;
    const cols = [{ t: 'Chácara', w: 90 }, { t: 'Quadra', w: 80 }, { t: 'Área', w: 150 }, { t: 'Valor de tabela', w: X1 - X0 - 320 }];
    const cab = () => {
      p.drawRectangle({ x: X0, y: y - 15, width: X1 - X0, height: 17, color: VERDE });
      let x = X0; cols.forEach(c => { txt(p, c.t, x + 8, y - 10, 9, fb, BRANCO); x += c.w; }); y -= 30;
    };
    cab();
    emp.tabela.forEach((l, i) => {
      if (y < 70) { rodape(p, pagina); p = doc.addPage(A4); pagina++; y = H - 70; cab(); }
      if (i % 2 === 0) p.drawRectangle({ x: X0, y: y - 4, width: X1 - X0, height: 15, color: CREME });
      const valores = [l.codigo, l.quadra, m2(l.area), brl(l.preco)];
      let x = X0; cols.forEach((c, k) => { txt(p, valores[k], x + 8, y, 9, k === 0 ? fb : f); x += c.w; });
      y -= 15;
    });
    rodape(p, pagina);
  }
  return Buffer.from(await doc.save());
}

export async function kitPdf(tipo: TipoKit, id: number, comPrecos: boolean): Promise<{ pdf: Buffer; nome: string }> {
  const [dest, emp] = await Promise.all([destinatarioDe(tipo, id), dadosEmpreendimento(comPrecos)]);
  const arq = dest.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'parceiro';
  return { pdf: await gerarKit(dest, emp), nome: `Kit-Bom-Jardims-${arq}.pdf` };
}

/** GET /api/kit-parceiro/:tipo/:id.pdf?precos=1 — escritório (admin/secretária) gera qualquer kit; o corretor, só o dele */
export function registrarRotaKit(app: Express) {
  app.get('/api/kit-parceiro/:tipo/:id.pdf', async (req, res) => {
    try {
      const { sdk } = await import('./_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).send('Faça login');
      const { perfilDe } = await import('../shared/equipe');
      const perfil = String(perfilDe(user) ?? '');
      const tipo = String(req.params.tipo) as TipoKit;
      const id = Number(req.params.id);
      if (!TIPOS_KIT.includes(tipo) || !Number.isInteger(id) || id <= 0) return res.status(404).send('Kit não encontrado');
      const escritorio = ['admin', 'secretario'].includes(perfil);
      const proprio = tipo === 'corretor' && id === Number(user.id) && perfil === 'corretor';
      if (!escritorio && !proprio) return res.status(403).send('Sem permissão');
      const { pdf, nome } = await kitPdf(tipo, id, req.query.precos === '1');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${req.query.baixar === '1' ? 'attachment' : 'inline'}; filename="${nome}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e instanceof KitErro) return res.status(e.status).send(e.message);
      console.error('[Kit] falhou:', e);
      res.status(500).send('Falha ao gerar o kit');
    }
  });
}

export const _interno = { arquivoPublico };
