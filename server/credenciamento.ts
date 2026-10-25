/**
 * Ficha de credenciamento do corretor no empreendimento: o corretor baixa/manda no WhatsApp quando o cliente
 * pergunta se ele é credenciado. Página 1 = empreendimento + corretor (foto, CRECI, validades, contatos) com QR de
 * verificação; depois, anexadas, as comprovações: Cartão CRECI, Certidão de Regularidade e CNH.
 *
 * Só sai com o cadastro completo: todos os dados (exceto CNAI, opcional), foto, cartão e certidão em dia e a CNH.
 * CPF mascarado na página 1 (LGPD) — o documento oficial vai anexado por decisão do próprio corretor.
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { acessosCorretor, empreendimentos, users, usuarioConjuge, usuarioDocumentoPaginas, usuarioDocumentos, usuarioFoto } from '../drizzle/schema';
import { PRAZOS_PADRAO, ROTULO_DOCUMENTO, statusValidade } from '../shared/cadastro';
import { perfilDe } from '../shared/equipe';
import { pendenciasCadastro } from './contratoIntermediador';
import { refDoUsuario, usuarioDaRef } from './cartaoVendas';

type Doc = { id?: number; tipo: string; titular?: string | null; validade?: string | null; numero?: string | null; exibirPerfil?: boolean | number | null };
const vazio = (v: unknown) => v == null || String(v).trim() === '';
const doTitular = (docs: Doc[], tipo: string) => docs.find(d => d.tipo === tipo && (d.titular ?? 'usuario') === 'usuario');

/** O que falta para emitir a ficha (puro, testável) */
export function pendenciasCredenciamento(u: Record<string, any>, conjuge: Record<string, any> | null, docs: Doc[], hoje = new Date()): string[] {
  const out = pendenciasCadastro(u, conjuge);
  if (vazio(u.creciUf)) out.push('UF do CRECI');
  if (vazio(u.sexo)) out.push('Sexo');
  if (vazio(u.email)) out.push('E-mail');
  if (String(u.telefone ?? '').replace(/\D/g, '').length < 10) out.push('Telefone/WhatsApp');
  if (vazio(u.enderecoCep) || vazio(u.enderecoNumero) || vazio(u.enderecoBairro)) out.push('Endereço completo (CEP, número e bairro)');
  if (vazio(u.fotoUrl)) out.push('Foto');
  const cartao = doTitular(docs, 'cartao_creci');
  if (!cartao) out.push('Cartão de Regularidade (CRECI)');
  else if (statusValidade(cartao.validade, PRAZOS_PADRAO.cartaoAlertaDias, hoje).status === 'vencida') out.push('Cartão CRECI vencido');
  const certidao = doTitular(docs, 'certidao_creci');
  if (!certidao) out.push('Certidão de Regularidade (CRECI)');
  else if (!certidao.validade) out.push('Validade da Certidão CRECI');
  else if (statusValidade(certidao.validade, 0, hoje).status === 'vencida') out.push('Certidão CRECI vencida');
  if (!doTitular(docs, 'cnh')) out.push('CNH (documento oficial com foto)');
  return Array.from(new Set(out));
}

const cpfMascarado = (cpf: string) => { const d = String(cpf ?? '').replace(/\D/g, ''); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '—'; };
const dataBR = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const fone = (t: string) => { const d = String(t ?? '').replace(/\D/g, '').slice(-11); return d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}` : t; };
const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
export const linkVerificacao = (slug: string, usuarioId: number) => `${urlPublica()}/api/public/credenciamento/${slug}/${refDoUsuario(usuarioId)}`;

export class CredenciamentoErro extends Error {
  constructor(msg: string, public status = 400, public pendencias: string[] = []) { super(msg); this.name = 'CredenciamentoErro'; }
}

async function carregar(usuarioId: number, slug: string) {
  const db: any = await getDb();
  if (!db) throw new CredenciamentoErro('Banco indisponível', 503);
  const [u] = await db.select().from(users).where(eq(users.id, usuarioId)).limit(1);
  if (!u) throw new CredenciamentoErro('Usuário não encontrado', 404);
  const [emp] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new CredenciamentoErro('Empreendimento não encontrado', 404);
  const [c] = await db.select().from(usuarioConjuge).where(eq(usuarioConjuge.usuarioId, usuarioId)).limit(1);
  const docs: Doc[] = await db.select({
    id: usuarioDocumentos.id, tipo: usuarioDocumentos.tipo, titular: usuarioDocumentos.titular, validade: usuarioDocumentos.validade,
    numero: usuarioDocumentos.numero, exibirPerfil: usuarioDocumentos.exibirPerfil,
  }).from(usuarioDocumentos).where(eq(usuarioDocumentos.usuarioId, usuarioId));
  const perfil = perfilDe(u);
  // Habilitado no empreendimento: admin e secretária sempre; corretor só com o acesso liberado
  const acessos: any[] = perfil === 'corretor'
    ? await db.select().from(acessosCorretor).where(and(eq(acessosCorretor.usuarioId, usuarioId), eq(acessosCorretor.tipo, 'empreendimento'), eq(acessosCorretor.refId, emp.id)))
    : [];
  const habilitado = perfil === 'admin' || perfil === 'secretario' || acessos.length > 0;
  const ativo = !(u.ativo === false || u.ativo === 0);
  return { db, u, emp, conjuge: c ?? null, docs, habilitado, ativo };
}

/** Situação para a tela (checklist) */
export async function situacaoCredenciamento(usuarioId: number, slug: string) {
  const { u, conjuge, docs, habilitado } = await carregar(usuarioId, slug);
  const pendencias = pendenciasCredenciamento(u, conjuge, docs);
  if (!habilitado) pendencias.unshift('Acesso ao empreendimento liberado pelo administrador');
  return { pendencias, apto: pendencias.length === 0, link: linkVerificacao(slug, usuarioId) };
}

/** Foto do cadastro (tabela usuarioFoto) em PNG quadrado para o PDF */
async function fotoPng(db: any, usuarioId: number): Promise<Buffer | null> {
  try {
    const [f] = await db.select().from(usuarioFoto).where(eq(usuarioFoto.usuarioId, usuarioId)).limit(1);
    if (!f) return null;
    const sharp = (await import('sharp')).default;
    return await sharp(Buffer.from(f.conteudoBase64, 'base64')).rotate().resize(360, 360, { fit: 'cover' }).png().toBuffer();
  } catch { return null; }
}

/** PDF da ficha (recusa com a lista do que falta) */
export async function fichaCredenciamentoPdf(usuarioId: number, slug: string, hoje = new Date()): Promise<{ pdf: Buffer; nome: string }> {
  const { db, u, emp, conjuge, docs, habilitado, ativo } = await carregar(usuarioId, slug);
  const pendencias = pendenciasCredenciamento(u, conjuge, docs, hoje);
  if (!habilitado) pendencias.unshift('Acesso ao empreendimento liberado pelo administrador');
  if (!ativo) throw new CredenciamentoErro('Usuário inativo', 403);
  if (pendencias.length) throw new CredenciamentoErro('Complete o cadastro para gerar a ficha', 409, pendencias);

  const { novoKit, paginaComMarca, tituloPagina, cartao, campo, qrPng, texto, quebrar, COR, MM, A4 } = await import('./financeiro/render/comum');
  const k = await novoKit({ titulo: `Ficha de credenciamento — ${u.name}` });
  const { p, topo } = paginaComMarca(k);
  const [W] = A4;
  const m = 18 * MM;
  let y = tituloPagina(k, p, topo - 6, 'FICHA DE CREDENCIAMENTO DE CORRETOR', `${emp.nome} · ${[emp.municipio, emp.uf].filter(Boolean).join('/')}`);

  // Empreendimento
  const hEmp = 124;
  cartao(k, p, m, y, W - 2 * m, hEmp, 'EMPREENDIMENTO');
  const colE = (W - 2 * m - 28) / 2;
  campo(k, p, m + 14, y - 36, 'Nome', emp.nome, { maxW: colE });
  campo(k, p, m + 14 + colE + 14, y - 36, 'Localização', [emp.endereco, emp.municipio && `${emp.municipio}/${emp.uf ?? ''}`].filter(Boolean).join(' · ') || '—', { maxW: colE });
  campo(k, p, m + 14, y - 70, 'Área', emp.areaHa ? `${String(emp.areaHa).replace('.', ',')} ha` : '—', { maxW: colE });
  campo(k, p, m + 14 + colE + 14, y - 70, 'Situação do(a) corretor(a)', 'Credenciado(a) neste empreendimento', { maxW: colE });
  campo(k, p, m + 14, y - 104, 'Gestão e intermediação de vendas', 'Romatec Consultoria Total — CNPJ 17.261.987/0001-09', { maxW: W - 2 * m - 28 });
  y -= hEmp + 14;

  // Corretor (foto + dados)
  const cartaoDoc = doTitular(docs, 'cartao_creci')!;
  const certidao = doTitular(docs, 'certidao_creci')!;
  const cnai = docs.find(d => d.tipo === 'certificado_cnai' && (d.titular ?? 'usuario') === 'usuario' && d.numero && (d.exibirPerfil === true || d.exibirPerfil === 1));
  const hCor = 206;
  cartao(k, p, m, y, W - 2 * m, hCor, 'CORRETOR(A) CREDENCIADO(A)');
  const foto = await fotoPng(db, usuarioId);
  const ladoFoto = 108;
  if (foto) {
    const img = await k.doc.embedPng(foto);
    p.drawImage(img, { x: m + 14, y: y - 30 - ladoFoto, width: ladoFoto, height: ladoFoto });
  }
  const xD = m + 14 + ladoFoto + 16, larg = W - m - 14 - xD, col = (larg - 12) / 2;
  campo(k, p, xD, y - 40, 'Nome', String(u.name).toUpperCase(), { size: 11, maxW: larg });
  campo(k, p, xD, y - 76, 'CRECI', `${u.creciUf ?? ''} ${u.creci ?? ''}`.trim(), { maxW: col });
  campo(k, p, xD + col + 12, y - 76, 'CPF', cpfMascarado(u.cpf), { maxW: col });
  campo(k, p, xD, y - 112, 'Cartão CRECI válido até', dataBR(cartaoDoc.validade), { maxW: col });
  campo(k, p, xD + col + 12, y - 112, 'Certidão de Regularidade válida até', dataBR(certidao.validade), { maxW: col });
  campo(k, p, xD, y - 148, 'WhatsApp', fone(u.telefone), { maxW: col });
  campo(k, p, xD + col + 12, y - 148, 'E-mail', String(u.email ?? ''), { maxW: col });
  if (cnai) campo(k, p, xD, y - 184, 'Avaliador Imobiliário (CNAI)', String(cnai.numero), { maxW: col });
  y -= hCor + 14;

  // Verificação
  const hV = 120;
  cartao(k, p, m, y, W - 2 * m, hV, 'CONFIRA A AUTENTICIDADE');
  const link = linkVerificacao(slug, usuarioId);
  const qr = await qrPng(k, link);
  p.drawImage(qr, { x: m + 14, y: y - 30 - 78, width: 78, height: 78 });
  const linhas = quebrar(k.f, `Aponte a câmera para o QR Code ou abra ${link} para ver, na hora, se este(a) corretor(a) continua credenciado(a) e com o CRECI em dia. Emitida em ${hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}.`, 9, W - 2 * m - 120);
  linhas.forEach((l, i) => texto(p, l, m + 106, y - 44 - i * 13, 9, k.f));
  y -= hV + 10;
  texto(p, 'Anexos: Cartão de Regularidade CRECI, Certidão de Regularidade CRECI e CNH.', m, y - 6, 8.5, k.fi, COR.cinza);

  // Comprovações anexadas (páginas guardadas de cada documento)
  const anexos = [cartaoDoc, certidao, doTitular(docs, 'cnh')!];
  for (const d of anexos) {
    const paginas: any[] = await db.select().from(usuarioDocumentoPaginas).where(eq(usuarioDocumentoPaginas.documentoId, d.id!)).orderBy(asc(usuarioDocumentoPaginas.n));
    for (const pg of paginas) {
      const pag = k.doc.addPage(A4);
      const rot = ROTULO_DOCUMENTO[d.tipo as keyof typeof ROTULO_DOCUMENTO] ?? d.tipo;
      texto(pag, `${rot} — ${u.name}`, 40, A4[1] - 30, 9, k.fb);
      try {
        const img = await k.doc.embedPng(Buffer.from(pg.pngBase64, 'base64'));
        const mg = 40, maxW = A4[0] - 2 * mg, maxH = A4[1] - 2 * mg - 10;
        const s = Math.min(maxW / img.width, maxH / img.height);
        pag.drawImage(img, { x: (A4[0] - img.width * s) / 2, y: A4[1] - mg - 10 - img.height * s, width: img.width * s, height: img.height * s });
      } catch { texto(pag, 'Não foi possível incluir esta página.', 40, A4[1] - 60, 10, k.f); }
    }
  }
  const nome = `FICHA-CREDENCIAMENTO-${String(u.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}-${slug.toUpperCase()}.pdf`;
  return { pdf: Buffer.from(await k.doc.save()), nome };
}

/** Página pública do QR: situação atual (sem CPF, sem documentos) */
export async function verificacaoPublica(slug: string, ref: string): Promise<{ status: number; html: string }> {
  const id = usuarioDaRef(ref);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pagina = (ok: boolean, titulo: string, linhas: string[]) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0c3320;color:#f3eedf;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{max-width:460px;width:100%;background:#fffdf6;color:#1d2a22;border-radius:18px;padding:24px;box-shadow:0 10px 30px #0006}h1{margin:0 0 6px;font-size:22px;color:${ok ? '#0c6b3c' : '#9b1c1c'}}p{margin:6px 0;line-height:1.5}small{color:#5c6b61}</style></head>
<body><main><h1>${ok ? '✓' : '✕'} ${esc(titulo)}</h1>${linhas.map(l => `<p>${l}</p>`).join('')}<p><small>Romatec Consultoria Total · verificação em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</small></p></main></body></html>`;
  if (!id) return { status: 404, html: pagina(false, 'Credenciamento não encontrado', ['O link está incompleto ou foi alterado.']) };
  try {
    const { u, emp, conjuge, docs, habilitado, ativo } = await carregar(id, slug);
    const cartaoDoc = doTitular(docs, 'cartao_creci');
    const certidao = doTitular(docs, 'certidao_creci');
    const credenciais = pendenciasCredenciamento(u, conjuge, docs).filter(x => /CRECI/i.test(x));
    const ok = ativo && habilitado && credenciais.length === 0;
    return {
      status: 200,
      html: pagina(ok, ok ? 'Corretor(a) credenciado(a)' : 'Credenciamento não está em dia', [
        `<b>${esc(String(u.name))}</b> · CRECI ${esc(`${u.creciUf ?? ''} ${u.creci ?? ''}`.trim())}`,
        `Empreendimento: <b>${esc(emp.nome)}</b>${emp.municipio ? ` — ${esc(emp.municipio)}/${esc(emp.uf ?? '')}` : ''}`,
        `Cartão CRECI válido até ${dataBR(cartaoDoc?.validade)} · Certidão de Regularidade válida até ${dataBR(certidao?.validade)}`,
        ok ? 'Pode tratar com este(a) corretor(a) sobre as chácaras do empreendimento.' : 'Confirme com a Romatec antes de negociar: (99) 9 9181-1246.',
      ]),
    };
  } catch { return { status: 404, html: pagina(false, 'Credenciamento não encontrado', ['Confirme com a Romatec: (99) 9 9181-1246.']) }; }
}
