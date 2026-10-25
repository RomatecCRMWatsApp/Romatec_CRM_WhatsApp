/**
 * Carteirinhas do condomínio (spec §14): tabela carteiras (nº BJ-A05-03, qrToken, validade, status) para o titular,
 * o cônjuge e os dependentes da chácara (chacaraDependentes, até 6). PDF para a gráfica: CR80 (85,6 × 54 mm),
 * frente com foto e dados, verso com o QR de autenticidade (/p/c/:qrToken).
 *
 * Gate do dependente: só emite com nome, CPF, telefone e e-mail válidos + foto. Titular e cônjuge vêm do contrato
 * (já validados); a foto deles é opcional.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { carteiras, chacaraDependentes, contratos, empreendimentos, lotes, pessoaDocumentos } from '../../drizzle/schema';
import { pendenciasCarteirinhaDependente, rotuloParentesco } from '../../shared/contratos';
import { ContratoErro, contratoPorId, dependentesDo, juridicoDe, pessoasDe } from './servico';
import { lerArquivo, salvarArquivo } from './arquivos';

export const STATUS_COM_CARTEIRINHA = ['assinado', 'ativo', 'quitado'];
export type TipoTitular = 'comprador' | 'conjuge' | 'dependente';
const MM = 72 / 25.4;
const CR80: [number, number] = [85.6 * MM, 53.98 * MM];
const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
export const linkCarteirinha = (qrToken: string) => `${urlPublica()}/p/c/${qrToken}`;
const hojeIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somarMeses = (iso: string, meses: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + meses); return d.toISOString().slice(0, 10); };
const dataBR = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

export interface PessoaCarteirinha {
  tipo: TipoTitular; ref: number; nome: string; vinculo: string; foto: string | null;
  /** O que falta para emitir (só dependentes têm gate) */
  pendencias: string[];
}

/** Foto 3×4 mais recente do titular/cônjuge (pessoaDocumentos) */
async function fotoDaPessoa(d: any, pessoaId: number): Promise<string | null> {
  const [f] = await d.select({ arquivo: pessoaDocumentos.arquivo }).from(pessoaDocumentos)
    .where(and(eq(pessoaDocumentos.pessoaId, pessoaId), eq(pessoaDocumentos.tipo, 'foto_3x4'))).orderBy(desc(pessoaDocumentos.id)).limit(1);
  return f?.arquivo ?? null;
}

/** Quem tem carteirinha neste contrato: titular, cônjuge (automático) e dependentes ativos */
export async function pessoasDaCarteirinha(contratoId: number): Promise<PessoaCarteirinha[]> {
  const d: any = await getDb();
  const { comprador, conjuge } = await pessoasDe(contratoId);
  if (!comprador) throw new ContratoErro('SEM_COMPRADOR', 'Contrato sem comprador', 409);
  const out: PessoaCarteirinha[] = [{ tipo: 'comprador', ref: Number(comprador.id), nome: comprador.nome, vinculo: 'Titular', foto: await fotoDaPessoa(d, Number(comprador.id)), pendencias: [] }];
  if (conjuge) out.push({ tipo: 'conjuge', ref: Number(conjuge.id), nome: conjuge.nome, vinculo: 'Cônjuge', foto: await fotoDaPessoa(d, Number(conjuge.id)), pendencias: [] });
  for (const x of await dependentesDo(contratoId)) {
    out.push({ tipo: 'dependente', ref: x.id, nome: x.nome, vinculo: `Dependente · ${rotuloParentesco(x.parentesco)}`, foto: x.foto, pendencias: pendenciasCarteirinhaDependente(x) });
  }
  return out;
}

async function contexto(contratoId: number) {
  const c = await contratoPorId(contratoId);
  const d: any = await getDb();
  const [emp] = await d.select().from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const [lote] = await d.select().from(lotes).where(eq(lotes.id, c.loteId)).limit(1);
  return { d, c, emp, lote };
}

/** Situação para a tela: cada pessoa com a carteira vigente (se houver) e o que falta */
export async function situacaoCarteirinhas(contratoId: number) {
  const { d, c } = await contexto(contratoId);
  const todas: any[] = await d.select().from(carteiras).where(eq(carteiras.contratoId, contratoId));
  const pessoas = await pessoasDaCarteirinha(contratoId);
  return {
    liberado: STATUS_COM_CARTEIRINHA.includes(c.status),
    pessoas: pessoas.map(p => {
      const cart = todas.filter(x => x.titularTipo === p.tipo && Number(x.titularId) === p.ref && x.status === 'ativa').sort((a, b) => b.id - a.id)[0];
      return { ...p, foto: undefined, temFoto: !!p.foto, carteira: cart ? { numero: cart.numero, validade: String(cart.validade).slice(0, 10) } : null };
    }),
  };
}

/** Emite (ou reaproveita a vigente) a carteira de cada pessoa apta; dependente com pendência fica de fora */
export async function emitirCarteiras(contratoId: number) {
  const { d, c, emp } = await contexto(contratoId);
  if (!STATUS_COM_CARTEIRINHA.includes(c.status)) throw new ContratoErro('STATUS', 'As carteirinhas saem depois do contrato assinado', 409);
  const j = await juridicoDe(c.empreendimentoId);
  const meses = Number((j.defaults as any)?.validade_carteira_meses) || 24;
  const hoje = hojeIso();
  const sigla = String(c.numero).split('-')[0] || String(emp?.slug ?? 'XX').slice(0, 2).toUpperCase();
  const pessoas = await pessoasDaCarteirinha(contratoId);
  const emitidas: (PessoaCarteirinha & { numero: string; qrToken: string; validade: string })[] = [];
  const bloqueadas: PessoaCarteirinha[] = [];
  for (const p of pessoas) {
    if (p.pendencias.length) { bloqueadas.push(p); continue; }
    const todas: any[] = await d.select().from(carteiras).where(eq(carteiras.contratoId, contratoId));
    let cart = todas.find(x => x.titularTipo === p.tipo && Number(x.titularId) === p.ref && x.status === 'ativa' && String(x.validade).slice(0, 10) >= hoje);
    if (!cart) {
      // Vencida: a anterior sai de cena; a nova ganha o próximo número do contrato
      for (const x of todas.filter(x => x.titularTipo === p.tipo && Number(x.titularId) === p.ref && x.status === 'ativa')) {
        await d.update(carteiras).set({ status: 'cancelada' }).where(eq(carteiras.id, x.id));
      }
      const seq = todas.length + 1;
      const novo = { contratoId, titularTipo: p.tipo, titularId: p.ref, numero: `${sigla}-${c.loteCodigo}-${String(seq).padStart(2, '0')}`,
        qrToken: randomBytes(16).toString('hex'), validade: somarMeses(hoje, meses), status: 'ativa', emitidaEm: new Date() };
      await d.insert(carteiras).values(novo as any);
      cart = novo;
    }
    emitidas.push({ ...p, numero: cart.numero, qrToken: cart.qrToken, validade: String(cart.validade).slice(0, 10) });
  }
  return { emitidas, bloqueadas };
}

/**
 * Emissão automática (sem PDF): registra/renova as carteiras de quem já está apto assim que o contrato é assinado,
 * um dependente é cadastrado/corrigido ou chega a foto. Contrato ainda não assinado ou erro: não faz nada.
 */
export async function emitirCarteirasAuto(contratoId: number): Promise<number> {
  try {
    const c = await contratoPorId(contratoId);
    if (!STATUS_COM_CARTEIRINHA.includes(c.status)) return 0;
    const { emitidas } = await emitirCarteiras(contratoId);
    return emitidas.length;
  } catch (e: any) {
    console.warn('[Carteirinhas] emissão automática:', e?.message);
    return 0;
  }
}

async function fotoPng(chave: string | null): Promise<Buffer | null> {
  if (!chave) return null;
  try {
    const a = await lerArquivo(chave);
    if (!a) return null;
    const sharp = (await import('sharp')).default;
    return await sharp(a.buf).resize(300, 400, { fit: 'cover' }).png().toBuffer();
  } catch { return null; }
}

/** PDF da gráfica (CR80, frente e verso) das carteiras emitidas; sem nenhuma apta, recusa com o que falta */
export async function carteirinhasPdf(contratoId: number): Promise<{ pdf: Buffer; nome: string; bloqueadas: PessoaCarteirinha[] }> {
  const { c, emp, lote } = await contexto(contratoId);
  const { emitidas, bloqueadas } = await emitirCarteiras(contratoId);
  if (!emitidas.length) throw new ContratoErro('PENDENCIAS', 'Nenhuma carteirinha pode ser emitida ainda', 409, Object.fromEntries(bloqueadas.map(b => [b.nome, `falta ${b.pendencias.join(', ')}`])));
  const { novoKit, qrPng, quebrar, texto, textoCentro, retArredondado, COR } = await import('../financeiro/render/comum');
  const { CONTATO_PADRAO } = await import('../financeiro/render/documentos');
  const k = await novoKit({ titulo: `Carteirinhas ${c.numero}` });
  const [W, H] = CR80;
  const unidade = `Chácara ${c.loteCodigo}${lote?.quadra ? ` · Quadra ${lote.quadra}` : ''}`;
  for (const p of emitidas) {
    // Frente: faixa da marca, foto 3×4 e dados
    const f = k.doc.addPage(CR80);
    f.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COR.verde });
    f.drawRectangle({ x: 0, y: H - 2.5, width: W, height: 2.5, color: COR.dourado });
    const lw = 18 * MM, lh = (lw * k.logo.height) / k.logo.width;
    f.drawImage(k.logo, { x: 3.5 * MM, y: H - 3 * MM - lh, width: lw, height: lh });
    texto(f, 'CARTEIRINHA DO CONDOMÍNIO', 3.5 * MM + lw + 2.5 * MM, H - 6.5 * MM, 5.4, k.fb, COR.dourado);
    texto(f, String(emp?.nome ?? '').toUpperCase(), 3.5 * MM + lw + 2.5 * MM, H - 9.3 * MM, 4.3, k.f, COR.creme, W - lw - 10 * MM);
    const fw = 19 * MM, fh = 25 * MM, fx = 3.5 * MM, fy = 3.5 * MM;
    const png = await fotoPng(p.foto);
    retArredondado(f, fx - 0.6, fy - 0.6, fw + 1.2, fh + 1.2, 2, { cor: COR.dourado });
    if (png) f.drawImage(await k.doc.embedPng(png), { x: fx, y: fy, width: fw, height: fh });
    else {
      f.drawRectangle({ x: fx, y: fy, width: fw, height: fh, color: COR.creme });
      const ini = p.nome.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
      textoCentro(f, ini, fx + fw / 2, fy + fh / 2 - 5, 14, k.fb, COR.verde);
    }
    const xT = fx + fw + 3.5 * MM, lT = W - xT - 3 * MM;
    let y = fy + fh - 6;
    for (const l of quebrar(k.fb, p.nome.toUpperCase(), 7.6, lT).slice(0, 2)) { texto(f, l, xT, y, 7.6, k.fb, COR.branco); y -= 9.5; }
    texto(f, p.vinculo, xT, y - 1, 6, k.fb, COR.dourado, lT); y -= 11;
    texto(f, unidade, xT, y, 5.4, k.f, COR.creme, lT); y -= 8;
    texto(f, `Nº ${p.numero}`, xT, y, 5.4, k.fb, COR.creme, lT); y -= 8;
    texto(f, `Válida até ${dataBR(p.validade)}`, xT, y, 5.4, k.f, COR.creme, lT);

    // Verso: QR de autenticidade, regras e contatos
    const v = k.doc.addPage(CR80);
    v.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COR.creme });
    v.drawRectangle({ x: 0, y: 0, width: W, height: 2.5, color: COR.dourado });
    const lado = 30 * MM;
    v.drawImage(await qrPng(k, linkCarteirinha(p.qrToken)), { x: 4 * MM, y: (H - lado) / 2, width: lado, height: lado });
    const xv = 4 * MM + lado + 4 * MM, lv = W - xv - 4 * MM;
    let yv = H - 7 * MM;
    for (const r of ['Uso pessoal e intransferível.', 'Apresente na portaria com um documento com foto.', 'Aponte a câmera para o QR para conferir a autenticidade.']) {
      for (const l of quebrar(k.f, r, 5.4, lv)) { texto(v, l, xv, yv, 5.4, k.f, COR.verde); yv -= 7.2; }
    }
    yv -= 3;
    texto(v, `Administração: ${CONTATO_PADRAO.atendimento}`, xv, yv, 5.2, k.fb, COR.verde, lv);
    texto(v, `Vendas: ${CONTATO_PADRAO.vendas}`, xv, yv - 7, 5.2, k.fb, COR.verde, lv);
    textoCentro(v, `${p.numero} · contrato ${c.numero}`, xv + lv / 2, 4.5 * MM, 4.6, k.f, COR.cinza);
  }
  return { pdf: Buffer.from(await k.doc.save()), nome: `CARTEIRINHAS-${c.numero}.pdf`, bloqueadas };
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

/** Foto 3×4 de quem tem carteirinha: dependente → chacaraDependentes.foto; titular/cônjuge → pessoaDocumentos (foto_3x4) */
export async function salvarFoto(contratoId: number, tipo: TipoTitular, ref: number, bruto: Buffer, autorId: number): Promise<void> {
  const pessoas = await pessoasDaCarteirinha(contratoId);
  if (!pessoas.some(p => p.tipo === tipo && p.ref === ref)) throw new ContratoErro('NAO_ENCONTRADO', 'Pessoa não encontrada neste contrato', 404);
  const sharp = (await import('sharp')).default;
  let jpg: Buffer;
  try { jpg = await sharp(bruto).rotate().resize(600, 800, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer(); }
  catch { throw new ContratoErro('FOTO', 'Imagem inválida (use JPG, PNG ou WEBP)', 415); }
  const chave = `carteirinhas/${contratoId}/${tipo}-${ref}-${Date.now()}.jpg`;
  await salvarArquivo(chave, jpg, 'image/jpeg');
  const d: any = await getDb();
  if (tipo === 'dependente') await d.update(chacaraDependentes).set({ foto: chave }).where(eq(chacaraDependentes.id, ref));
  else await d.insert(pessoaDocumentos).values({ pessoaId: ref, tipo: 'foto_3x4', arquivo: chave, sha256: createHash('sha256').update(jpg).digest('hex'), mime: 'image/jpeg', validadoPor: autorId, enviadoEm: new Date() } as any);
  await emitirCarteirasAuto(contratoId);
}

export async function lerFoto(contratoId: number, tipo: TipoTitular, ref: number): Promise<Buffer | null> {
  const p = (await pessoasDaCarteirinha(contratoId)).find(x => x.tipo === tipo && x.ref === ref);
  if (!p?.foto) return null;
  return (await lerArquivo(p.foto))?.buf ?? null;
}

// ─── Conferência pública (QR) ────────────────────────────────────────────────

async function carteiraDoToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const d: any = await getDb();
  const [cart] = await d.select().from(carteiras).where(eq(carteiras.qrToken, token)).limit(1);
  if (!cart) return null;
  const [ctr] = await d.select({ id: contratos.id, status: contratos.status }).from(contratos).where(eq(contratos.id, cart.contratoId)).limit(1);
  if (!ctr) return null;
  let p: PessoaCarteirinha | undefined = (await pessoasDaCarteirinha(ctr.id)).find(x => x.tipo === cart.titularTipo && x.ref === Number(cart.titularId));
  if (!p && cart.titularTipo === 'dependente') {
    // Dependente que saiu da lista: a carteira dele aparece como cancelada (com o nome), não como inexistente
    const [x] = await d.select().from(chacaraDependentes).where(eq(chacaraDependentes.id, Number(cart.titularId))).limit(1);
    if (x) p = { tipo: 'dependente', ref: Number(x.id), nome: x.nome, vinculo: `Dependente · ${rotuloParentesco(x.parentesco)}`, foto: null, pendencias: [] };
  }
  return { cart, ctr, p };
}

/** Página do QR (/p/c/:token): foto, nome, vínculo, unidade e se está válida — sem CPF */
export async function conferirCarteirinha(token: string): Promise<{ status: number; html: string }> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pagina = (ok: boolean, titulo: string, linhas: string[], foto = false) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0c3320;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{max-width:420px;width:100%;background:#fffdf6;color:#1d2a22;border-radius:18px;padding:24px;text-align:center}h1{margin:0 0 8px;font-size:22px;color:${ok ? '#0c6b3c' : '#9b1c1c'}}p{margin:6px 0;line-height:1.5}img{width:120px;height:160px;object-fit:cover;border-radius:10px;border:3px solid #c9a24a;margin:4px auto 10px;display:block}small{color:#5c6b61}</style></head>
<body><main><h1>${ok ? '✓' : '✕'} ${esc(titulo)}</h1>${foto ? `<img src="/p/c/${esc(token)}/foto" alt="Foto do titular da carteirinha">` : ''}${linhas.map(l => `<p>${l}</p>`).join('')}<p><small>Conferido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</small></p></main></body></html>`;
  const naoAchou = { status: 404, html: pagina(false, 'Carteirinha não encontrada', ['Confirme com a administração do condomínio.']) };
  try {
    const r = await carteiraDoToken(token);
    if (!r || !r.p) return naoAchou;
    const { cart, ctr, p } = r;
    const { emp, lote } = await contexto(ctr.id);
    const vencida = String(cart.validade).slice(0, 10) < hojeIso();
    const ok = cart.status === 'ativa' && !vencida && STATUS_COM_CARTEIRINHA.includes(ctr.status);
    const motivo = cart.status !== 'ativa' ? 'Carteirinha cancelada ou substituída.' : vencida ? `Venceu em ${dataBR(cart.validade)}.` : 'Contrato sem efeito no momento.';
    return {
      status: 200,
      html: pagina(ok, ok ? 'Carteirinha válida' : 'Carteirinha não está válida', [
        `<b>${esc(p.nome)}</b><br>${esc(p.vinculo)}`,
        `${esc(String(emp?.nome ?? ''))}<br>Chácara ${esc(String(cart.numero).split('-')[1] ?? '')}${lote?.quadra ? ` · Quadra ${esc(lote.quadra)}` : ''}`,
        `Nº ${esc(cart.numero)} · válida até ${dataBR(cart.validade)}`,
        ok ? '<b>Acesso liberado.</b>' : `${esc(motivo)} Fale com a administração.`,
      ], !!p.foto),
    };
  } catch { return naoAchou; }
}

export async function fotoDaCarteirinha(token: string): Promise<Buffer | null> {
  const r = await carteiraDoToken(token).catch(() => null);
  if (!r?.p?.foto) return null;
  return (await lerArquivo(r.p.foto))?.buf ?? null;
}
