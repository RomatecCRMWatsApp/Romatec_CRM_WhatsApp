/**
 * Link de materiais para parceiros de marketing (sem login): o administrador gera um link assinado, com validade,
 * para todos os materiais liberados (ou só os de um empreendimento). Abre uma página com cada peça para baixar e
 * um "Baixar tudo (ZIP)". Revogar = trocar a versão: os links já enviados deixam de abrir na hora.
 * Peças marcadas "não divulgar" (liberado = false) nunca entram.
 */
import type { Express, Request, Response } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { Zip, ZipPassThrough } from 'fflate';
import { getDb } from './db';
import { empreendimentos, materiais, properties } from '../drizzle/schema';
import { agruparMateriais } from '../shared/materiais';
import { assinarLink, linkValido } from './financeiro/links';
import { gravarConfig, lerConfig } from './configSistema';
import { urlPublica } from './_core/urlPublica';

export const CAMINHO_PARCEIROS = '/m/parceiros';
export const VALIDADES_DIAS = [7, 30, 90] as const;
const CHAVE_VERSAO = 'materiais_parceiros_versao';
/** Teto de segurança do ZIP (a página continua com o download peça por peça) */
const MAX_ZIP_BYTES = 1_500_000_000;

export interface MaterialParceiro { id: number; titulo: string; tipo: string; url: string; mime: string | null; tamanhoBytes: number | null; grupo: string }

const slugValido = (s: unknown): string | null => (typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s) ? s : null);

export async function versaoAtual(): Promise<number> {
  const v = Number(await lerConfig(CHAVE_VERSAO));
  return Number.isInteger(v) && v > 0 ? v : 1;
}

/** Caminho que a assinatura cobre (sem exp/sig): empreendimento (ou todos) + versão */
export function caminhoAssinado(slug: string | null, versao: number): string {
  return `${CAMINHO_PARCEIROS}?emp=${slug ?? 'todos'}&v=${versao}`;
}

export async function gerarLinkParceiros(slug: string | null, dias: number, agora = Date.now()): Promise<{ url: string; expiraEm: string }> {
  if (!(VALIDADES_DIAS as readonly number[]).includes(dias)) throw new Error('Validade inválida');
  const caminho = assinarLink(caminhoAssinado(slugValido(slug), await versaoAtual()), agora, dias);
  return { url: `${urlPublica()}${caminho}`, expiraEm: new Date(agora + dias * 86_400_000).toISOString() };
}

/** Invalida todos os links já enviados (os próximos saem com a versão nova) */
export async function revogarLinksParceiros(usuarioId: number): Promise<void> {
  await gravarConfig(CHAVE_VERSAO, String((await versaoAtual()) + 1), usuarioId);
}

/** Confere a assinatura e a versão; devolve o empreendimento (null = todos) ou false */
export async function acessoDoLink(q: Record<string, unknown>, agora = Date.now()): Promise<{ slug: string | null } | false> {
  const emp = q.emp === 'todos' ? null : slugValido(q.emp);
  if (q.emp !== 'todos' && !emp) return false;
  const v = Number(q.v);
  if (!Number.isInteger(v) || v !== (await versaoAtual())) return false;
  return linkValido(caminhoAssinado(emp, v), q.exp, q.sig, agora) ? { slug: emp } : false;
}

/** Materiais liberados, agrupados por empreendimento/imóvel (a mesma ordem da tela Materiais) */
export async function materiaisParaParceiros(slug: string | null): Promise<{ grupo: string; itens: MaterialParceiro[] }[]> {
  const d: any = await getDb();
  if (!d) throw new Error('Banco indisponível');
  const linhas: any[] = await d.select().from(materiais)
    .where(slug ? and(eq(materiais.liberado, true), eq(materiais.empreendimentoSlug, slug)) : eq(materiais.liberado, true));
  const slugs = Array.from(new Set(linhas.map(l => l.empreendimentoSlug).filter(Boolean))) as string[];
  const ids = Array.from(new Set(linhas.map(l => l.propertyId).filter(Boolean))) as number[];
  const emps: any[] = slugs.length ? await d.select({ slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).where(inArray(empreendimentos.slug, slugs)) : [];
  const imvs: any[] = ids.length ? await d.select({ id: properties.id, titulo: properties.denomination, codigo: properties.codigo }).from(properties).where(inArray(properties.id, ids)) : [];
  const nomes = {
    empreendimentos: new Map(emps.map(e => [String(e.slug), String(e.nome)])),
    imoveis: new Map(imvs.map(i => [Number(i.id), [i.codigo, i.titulo].filter(Boolean).join(' · ') || `Imóvel ${i.id}`])),
  };
  return agruparMateriais(linhas.map(l => ({ ...l, ordem: Number(l.ordem ?? 0) })), nomes).map(g => ({
    grupo: g.nome,
    itens: g.itens.map((m: any) => ({ id: Number(m.id), titulo: String(m.titulo), tipo: String(m.tipo), url: String(m.url), mime: m.mime ?? null, tamanhoBytes: m.tamanhoBytes ?? null, grupo: g.nome })),
  }));
}

// ─── Nomes de arquivo ───────────────────────────────────────────────
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpo = (s: string) => semAcento(s).replace(/[^A-Za-z0-9 ._-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'arquivo';

export function extensaoDe(m: Pick<MaterialParceiro, 'url' | 'mime'>): string {
  const daUrl = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(new URL(m.url).pathname)?.[1]?.toLowerCase();
  if (daUrl) return daUrl;
  const mime = (m.mime ?? '').toLowerCase();
  return mime === 'image/jpeg' ? 'jpg' : mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]?.split(';')[0] || 'bin';
}

/** Nomes únicos dentro do ZIP: "Grupo/Titulo.ext" (repetidos ganham " (2)") */
export function nomesNoZip(itens: MaterialParceiro[]): Map<number, string> {
  const usados = new Set<string>();
  const r = new Map<number, string>();
  for (const m of itens) {
    const base = `${limpo(m.grupo)}/${limpo(m.titulo)}`;
    const ext = extensaoDe(m);
    let nome = `${base}.${ext}`;
    for (let n = 2; usados.has(nome.toLowerCase()); n++) nome = `${base} (${n}).${ext}`;
    usados.add(nome.toLowerCase());
    r.set(m.id, nome);
  }
  return r;
}

// ─── Página ──────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const tamanho = (b: number | null) => (b == null ? '' : b >= 1_048_576 ? `${(b / 1_048_576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ehImagem = (m: MaterialParceiro) => (m.mime ?? '').startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(m.url);

export function paginaParceiros(grupos: { grupo: string; itens: MaterialParceiro[] }[], query: string, expiraEm: string | null): string {
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);
  const secoes = grupos.map(g => `
    <section><h2>${esc(g.grupo)}</h2><ul>${g.itens.map(m => `
      <li>
        <div class="capa">${ehImagem(m) ? `<img src="${esc(m.url)}" alt="" loading="lazy">` : `<span>${esc(extensaoDe(m).toUpperCase())}</span>`}</div>
        <div class="info"><p class="t">${esc(m.titulo)}</p><p class="s">${esc(m.tipo)}${m.tamanhoBytes ? ` · ${tamanho(m.tamanhoBytes)}` : ''}</p></div>
        <a class="bt" href="${CAMINHO_PARCEIROS}/arquivo/${m.id}?${esc(query)}">Baixar</a>
      </li>`).join('')}</ul></section>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Materiais de divulgação · Romatec</title>
<style>
:root{--fundo:#061A11;--sup:#0C3320;--borda:#C9A84C;--ouro:#E2C877;--texto:#E8F0EB;--apagado:#9DB5A8}
*{box-sizing:border-box}html,body{margin:0;overflow-x:clip}body{background:var(--fundo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
header{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--borda);padding-bottom:16px}
h1{font-size:1.6rem;color:var(--ouro);margin:0}header p{margin:4px 0 0;color:var(--apagado);font-size:.9rem}
h2{color:var(--ouro);font-size:1.1rem;margin:28px 0 10px}
ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:12px}
li{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:center;background:var(--sup);border:1px solid rgba(201,168,76,.4);border-radius:12px;padding:10px}
.capa{width:64px;height:64px;border-radius:8px;overflow:hidden;background:var(--fundo);display:grid;place-items:center;color:var(--ouro);font-size:.75rem;font-weight:700}
.capa img{width:100%;height:100%;object-fit:cover}
.t{margin:0;font-weight:600;overflow-wrap:break-word;min-width:0}.s{margin:2px 0 0;color:var(--apagado);font-size:.8rem}
a.bt,a.zip{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:10px;font-weight:700;text-decoration:none}
a.bt{border:1px solid var(--borda);color:var(--ouro)}a.zip{background:var(--borda);color:var(--sup)}
a.bt:hover{background:rgba(201,168,76,.12)}a.zip:hover{background:var(--ouro)}
a:focus-visible{outline:2px solid var(--ouro);outline-offset:2px}
footer{margin-top:36px;color:var(--apagado);font-size:.8rem}
</style></head><body><main>
<header><div><h1>Materiais de divulgação</h1><p>${total} ${total === 1 ? 'peça' : 'peças'}${expiraEm ? ` · link válido até ${esc(expiraEm)}` : ''}</p></div>
${total ? `<a class="zip" href="${CAMINHO_PARCEIROS}/pacote.zip?${esc(query)}">Baixar tudo (ZIP)</a>` : ''}</header>
${total ? secoes : '<p>Nenhum material liberado por enquanto.</p>'}
<footer>Romatec Consultoria Total · Romatec CRM. Uso restrito à divulgação dos empreendimentos; não altere preços nem condições.</footer>
</main></body></html>`;
}

// ─── Rotas públicas ─────────────────────────────────────────────────
const queryDe = (req: Request) => {
  const q = req.query as Record<string, string>;
  return new URLSearchParams({ emp: String(q.emp ?? ''), v: String(q.v ?? ''), exp: String(q.exp ?? ''), sig: String(q.sig ?? '') }).toString();
};
const dataBR = (exp: unknown) => { const e = Number(exp); return Number.isFinite(e) ? new Date(e * 1000).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' }) : null; };

function negado(res: Response) {
  res.status(410).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expirado</title><body style="background:#061A11;color:#E8F0EB;font:16px system-ui;padding:32px"><h1 style="color:#E2C877">Link expirado ou revogado</h1><p>Peça um link novo à Romatec.</p></body>');
}

async function buscar(url: string): Promise<globalThis.Response> {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
  return r;
}

export function registrarRotasMateriaisParceiros(app: Express) {
  app.get(CAMINHO_PARCEIROS, async (req, res) => {
    try {
      const a = await acessoDoLink(req.query as any);
      if (!a) return negado(res);
      const grupos = await materiaisParaParceiros(a.slug);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.type('html').send(paginaParceiros(grupos, queryDe(req), dataBR(req.query.exp)));
    } catch (e: any) {
      console.warn('[Parceiros] página:', e?.message);
      res.status(500).send('Não foi possível abrir os materiais agora.');
    }
  });

  app.get(`${CAMINHO_PARCEIROS}/arquivo/:id`, async (req, res) => {
    try {
      const a = await acessoDoLink(req.query as any);
      if (!a) return negado(res);
      const id = Number(req.params.id);
      const m = (await materiaisParaParceiros(a.slug)).flatMap(g => g.itens).find(x => x.id === id);
      if (!m) return res.status(404).send('Material não encontrado');
      const r = await buscar(m.url);
      const nome = nomesNoZip([m]).get(m.id)!.split('/').pop()!;
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
      res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/octet-stream');
      const len = r.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);
      for await (const pedaco of r.body as any) res.write(pedaco);
      res.end();
    } catch (e: any) {
      console.warn('[Parceiros] arquivo:', e?.message);
      if (!res.headersSent) res.status(502).send('Não foi possível baixar este arquivo agora.');
      else res.end();
    }
  });

  // ZIP em streaming (sem compressão: artes e vídeos já vêm comprimidos), um arquivo por vez
  app.get(`${CAMINHO_PARCEIROS}/pacote.zip`, async (req, res) => {
    const a = await acessoDoLink(req.query as any).catch(() => false as const);
    if (!a) return negado(res);
    let itens: MaterialParceiro[];
    try { itens = (await materiaisParaParceiros(a.slug)).flatMap(g => g.itens); }
    catch (e: any) { console.warn('[Parceiros] zip:', e?.message); return res.status(500).send('Não foi possível montar o pacote agora.'); }
    const nomes = nomesNoZip(itens);
    const nomeZip = `Materiais-Romatec${a.slug ? `-${a.slug}` : ''}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeZip}"`);
    res.setHeader('Cache-Control', 'no-store');
    let fechado = false;
    req.on('close', () => { fechado = true; });
    const zip = new Zip((err, dados, fim) => {
      if (err) { console.warn('[Parceiros] zip:', err.message); res.end(); return; }
      res.write(Buffer.from(dados));
      if (fim) res.end();
    });
    const faltaram: string[] = [];
    let total = 0;
    for (const m of itens) {
      if (fechado) break;
      if (total > MAX_ZIP_BYTES) { faltaram.push(`${nomes.get(m.id)} (pacote grande demais: baixe pela página)`); continue; }
      try {
        const r = await buscar(m.url);
        const arq = new ZipPassThrough(nomes.get(m.id)!);
        zip.add(arq);
        for await (const pedaco of r.body as any) {
          const u8 = pedaco instanceof Uint8Array ? pedaco : new Uint8Array(pedaco);
          total += u8.length;
          arq.push(u8);
          if (fechado) break;
          // Conexão lenta do parceiro: espera esvaziar antes de puxar mais (não acumula o vídeo inteiro na memória)
          if (res.writableNeedDrain) await new Promise<void>(ok => { res.once('drain', ok); res.once('close', ok); });
        }
        arq.push(new Uint8Array(0), true);
      } catch (e: any) {
        faltaram.push(`${nomes.get(m.id)} (${e?.message ?? 'falha'})`);
      }
    }
    if (faltaram.length) {
      const leia = new ZipPassThrough('LEIA-ME - arquivos que nao entraram.txt');
      zip.add(leia);
      leia.push(new TextEncoder().encode(`Estes arquivos não entraram no pacote; baixe-os pela página do link:\r\n\r\n${faltaram.join('\r\n')}\r\n`), true);
    }
    zip.end();
  });
}
