/**
 * Prospecção B2B do AvalieImob (Vendas › Prospecção B2B). Inspirado no fluxo "descobrir → ler o site → rascunho → aprovação":
 * - Descoberta: importação de CSV (scripts/prospeccao/overture_lugares.py gera a lista da região a partir do Overture Maps) ou cadastro manual.
 * - Enriquecimento: lê até 3 páginas do site da empresa (início, contato, sobre), sem IA, com proteção contra SSRF.
 * - Rascunho: IA (Claude; senão o LLM do sistema; senão a mensagem-modelo) escreve a primeira mensagem com um fato específico.
 * - Envio: só depois da aprovação de uma pessoa, pelo WhatsApp, com limite diário e respeitando quem pediu para sair.
 * - Respostas: o webhook do WhatsApp chama registrarRespostaWhatsApp; "SAIR" marca opt-out e confirma a remoção.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { prospectos } from '../../drizzle/schema';
import {
  CATEGORIAS_PROSPECTO, LIMITE_ENVIOS_DIA_PADRAO, RODAPE_OPTOUT, STATUS_PROSPECTO, categoriaDe, ehOptout, extrairContatos, mensagemModelo,
  normalizarTelefone, pareceCelular, validarMensagem, type CategoriaProspecto, type StatusProspecto,
} from '../../shared/prospeccao';

export class ProspeccaoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'ProspeccaoErro'; } }

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new ProspeccaoErro('Banco indisponível', 503);
  return d;
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const corta = (s: unknown, n: number) => { const t = String(s ?? '').trim(); return t ? t.slice(0, n) : null; };
const iso = (v: unknown) => { if (v == null) return null; const d = v instanceof Date ? v : new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : (v as any)); return isNaN(d.getTime()) ? null : d.toISOString(); };
export const limiteDiario = () => Math.max(1, Math.min(200, Number(process.env.PROSPECCAO_LIMITE_DIA) || LIMITE_ENVIOS_DIA_PADRAO));

/** Transporte (injetável nos testes) */
export const transporte = {
  async enviarWhatsApp(fone: string, texto: string): Promise<void> { const { enviarTexto } = await import('../leads/zapiClient'); await enviarTexto(fone, texto); },
  async baixar(url: string): Promise<string | null> { return baixarSeguro(url); },
  async ia(pedido: string): Promise<string | null> { return escreverComIa(pedido); },
};

export interface LinhaImportacao {
  nome: string; categoria?: string; cidade?: string; uf?: string; endereco?: string; telefone?: string; email?: string;
  site?: string; instagram?: string; fonte?: string; fonteId?: string;
}

function urlOuNulo(v: unknown): string | null {
  const t = String(v ?? '').trim();
  if (!t) return null;
  try { const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 300) : null; } catch { return null; }
}

/** Importa uma lista (CSV do script ou planilha própria). Repetidos (mesma origem, mesmo telefone ou mesmo nome na cidade) ficam de fora. */
export async function importar(linhas: LinhaImportacao[], autorId: number) {
  const d = await banco();
  const atuais: any[] = await d.select({ nome: prospectos.nome, cidade: prospectos.cidade, telefone: prospectos.telefone, fonte: prospectos.fonte, fonteId: prospectos.fonteId }).from(prospectos);
  const chaves = new Set<string>();
  for (const p of atuais) {
    if (p.fonteId) chaves.add(`f:${p.fonte}:${p.fonteId}`);
    if (p.telefone) chaves.add(`t:${p.telefone}`);
    chaves.add(`n:${norm(p.nome)}|${norm(p.cidade)}`);
  }
  let inseridos = 0, repetidos = 0, invalidos = 0;
  for (const l of linhas.slice(0, 5000)) {
    const nome = corta(l.nome, 200);
    if (!nome || nome.length < 2) { invalidos++; continue; }
    const fonte = corta(l.fonte, 20) ?? 'importacao';
    const fonteId = corta(l.fonteId, 80);
    const telefone = normalizarTelefone(l.telefone);
    const k = [fonteId ? `f:${fonte}:${fonteId}` : null, telefone ? `t:${telefone}` : null, `n:${norm(nome)}|${norm(l.cidade)}`].filter(Boolean) as string[];
    if (k.some(x => chaves.has(x))) { repetidos++; continue; }
    k.forEach(x => chaves.add(x));
    await d.insert(prospectos).values({
      nome, categoria: categoriaDe(l.categoria), cidade: corta(l.cidade, 80), uf: corta(l.uf, 2)?.toUpperCase() ?? null, endereco: corta(l.endereco, 255),
      telefone, email: corta(l.email, 160)?.toLowerCase() ?? null, site: urlOuNulo(l.site), instagram: urlOuNulo(l.instagram), fonte, fonteId,
      status: 'novo', criadoPor: autorId, criadoEm: new Date(),
    } as any);
    inseridos++;
  }
  return { inseridos, repetidos, invalidos };
}

export async function listar(filtro: { status?: StatusProspecto; categoria?: CategoriaProspecto; cidade?: string } = {}) {
  const d = await banco();
  const conds = [
    filtro.status ? eq(prospectos.status, filtro.status) : null,
    filtro.categoria ? eq(prospectos.categoria, filtro.categoria) : null,
    filtro.cidade ? eq(prospectos.cidade, filtro.cidade) : null,
  ].filter(Boolean) as any[];
  const q = d.select().from(prospectos);
  const rows: any[] = await (conds.length ? q.where(and(...conds)) : q).orderBy(desc(prospectos.id)).limit(2000);
  return rows.map(r => ({
    id: Number(r.id), nome: r.nome, categoria: r.categoria as CategoriaProspecto, cidade: r.cidade, uf: r.uf, endereco: r.endereco, telefone: r.telefone,
    celular: pareceCelular(r.telefone), email: r.email, site: r.site, instagram: r.instagram, sobre: r.sobre, fato: r.fato, fonte: r.fonte,
    status: r.status as StatusProspecto, mensagem: r.mensagem, ultimaResposta: r.ultimaResposta, observacoes: r.observacoes,
    enriquecidoEm: iso(r.enriquecidoEm), enviadoEm: iso(r.enviadoEm), respondeuEm: iso(r.respondeuEm),
  }));
}

async function umProspecto(id: number) {
  const d = await banco();
  const [p]: any[] = await d.select().from(prospectos).where(eq(prospectos.id, id)).limit(1);
  if (!p) throw new ProspeccaoErro('Prospecto não encontrado.', 404);
  return p;
}

export async function resumo() {
  const d = await banco();
  const rows: any[] = await d.select({ status: prospectos.status, cidade: prospectos.cidade }).from(prospectos);
  const porStatus = Object.fromEntries(STATUS_PROSPECTO.map(s => [s, 0])) as Record<StatusProspecto, number>;
  rows.forEach(r => { if (r.status in porStatus) porStatus[r.status as StatusProspecto]++; });
  return { total: rows.length, porStatus, cidades: Array.from(new Set<string>(rows.map(r => r.cidade).filter(Boolean))).sort(), enviadosHoje: await enviadosHoje(), limiteDia: limiteDiario() };
}

async function enviadosHoje(agora = new Date()) {
  const d = await banco();
  const inicio = new Date(agora); inicio.setHours(0, 0, 0, 0);
  const rows: any[] = await d.select({ id: prospectos.id }).from(prospectos).where(gte(prospectos.enviadoEm, inicio));
  return rows.length;
}

export interface EdicaoProspecto { nome?: string; categoria?: CategoriaProspecto; cidade?: string | null; telefone?: string | null; email?: string | null; site?: string | null; fato?: string | null; mensagem?: string | null; observacoes?: string | null }

export async function atualizar(id: number, e: EdicaoProspecto) {
  const d = await banco();
  const p = await umProspecto(id);
  const set: Record<string, unknown> = {};
  if (e.nome !== undefined) set.nome = corta(e.nome, 200) ?? p.nome;
  if (e.categoria !== undefined && (CATEGORIAS_PROSPECTO as readonly string[]).includes(e.categoria)) set.categoria = e.categoria;
  if (e.cidade !== undefined) set.cidade = corta(e.cidade, 80);
  if (e.telefone !== undefined) set.telefone = normalizarTelefone(e.telefone);
  if (e.email !== undefined) set.email = corta(e.email, 160)?.toLowerCase() ?? null;
  if (e.site !== undefined) set.site = urlOuNulo(e.site);
  if (e.fato !== undefined) set.fato = corta(e.fato, 300);
  if (e.observacoes !== undefined) set.observacoes = corta(e.observacoes, 2000);
  if (e.mensagem !== undefined) {
    set.mensagem = corta(e.mensagem, 1500);
    if (set.mensagem && ['novo', 'aprovado'].includes(p.status)) set.status = 'rascunho';
  }
  if (Object.keys(set).length) await d.update(prospectos).set(set as any).where(eq(prospectos.id, id));
  return { ok: true as const };
}

export async function marcar(id: number, status: Extract<StatusProspecto, 'respondeu' | 'interessado' | 'sem_interesse' | 'optout' | 'novo'>) {
  const d = await banco();
  await umProspecto(id);
  await d.update(prospectos).set({ status, ...(status === 'respondeu' || status === 'interessado' ? { respondeuEm: new Date() } : {}) } as any).where(eq(prospectos.id, id));
  return { ok: true as const };
}

/** LGPD: apaga o registro de vez */
export async function excluir(id: number) {
  const d = await banco();
  await d.delete(prospectos).where(eq(prospectos.id, id));
  return { ok: true as const };
}

// ───────────────────────────── Enriquecimento (site) ─────────────────────────────

const MAX_BYTES = 1_500_000;

/** IPv4/IPv6 privado, loopback, link-local, CGNAT, multicast ou reservado */
export function ipBloqueado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s.startsWith('::ffff:')) return ipBloqueado(s.slice(7));
    return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') || s.startsWith('ff');
  }
  return true;
}

async function hostPermitido(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, '');
  if (!h || /^localhost$|\.local$|\.internal$/i.test(h)) return false;
  if (isIP(h)) return !ipBloqueado(h);
  try { const ips = await lookup(h, { all: true }); return ips.length > 0 && ips.every(i => !ipBloqueado(i.address)); } catch { return false; }
}

/** GET de uma página pública (http/https, porta padrão, sem rede interna, até 3 redirecionamentos, 8 s, 1,5 MB) */
export async function baixarSeguro(endereco: string): Promise<string | null> {
  let url = endereco;
  for (let salto = 0; salto < 4; salto++) {
    let u: URL;
    try { u = new URL(url); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || (u.port && !['80', '443'].includes(u.port)) || u.username || u.password) return null;
    if (!(await hostPermitido(u.hostname))) return null;
    let r: Response;
    try {
      r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': 'RomatecCRM/1.0 (+https://romateccrm.com)', Accept: 'text/html' } });
    } catch { return null; }
    if (r.status >= 300 && r.status < 400) {
      const prox = r.headers.get('location');
      if (!prox) return null;
      url = new URL(prox, u).toString();
      continue;
    }
    if (!r.ok || !/text\/html|application\/xhtml/i.test(r.headers.get('content-type') ?? '')) return null;
    const leitor = r.body?.getReader();
    if (!leitor) return null;
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await leitor.cancel().catch(() => {}); break; }
      partes.push(value);
    }
    return Buffer.concat(partes.map(p => Buffer.from(p))).toString('utf8');
  }
  return null;
}

/** Lê o site (início + contato + sobre) e completa contatos vazios; guarda o que a empresa diz de si */
export async function enriquecer(id: number) {
  const d = await banco();
  const p = await umProspecto(id);
  if (!p.site) throw new ProspeccaoErro('Este prospecto não tem site cadastrado.');
  const base = new URL(p.site);
  const paginas = [base.toString(), new URL('/contato', base).toString(), new URL('/sobre', base).toString()];
  const htmls: string[] = [];
  for (const pg of paginas) { const h = await transporte.baixar(pg); if (h) htmls.push(h); }
  if (!htmls.length) throw new ProspeccaoErro('Não consegui abrir o site (fora do ar, bloqueado ou não é uma página pública).', 422);
  const c = htmls.map(extrairContatos);
  const primeiro = <T,>(f: (x: (typeof c)[number]) => T | null | undefined) => c.map(f).find(Boolean) ?? null;
  const fone = primeiro(x => x.whatsapp) ?? primeiro(x => x.telefones.find(t => pareceCelular(t))) ?? primeiro(x => x.telefones[0]);
  const sobre = [c[0].titulo, c[0].descricao, ...c.slice(1).map(x => x.descricao)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ').slice(0, 1500) || null;
  const set: Record<string, unknown> = { enriquecidoEm: new Date(), sobre };
  if (!p.email) set.email = primeiro(x => x.emails[0]);
  if (!p.instagram) set.instagram = primeiro(x => x.instagram);
  if (fone && (!p.telefone || (!pareceCelular(p.telefone) && pareceCelular(fone)))) set.telefone = fone;
  await d.update(prospectos).set(set as any).where(eq(prospectos.id, id));
  return { ok: true as const, achou: { email: set.email ?? null, telefone: set.telefone ?? null, instagram: set.instagram ?? null, sobre } };
}

// ───────────────────────────── Rascunho (IA) ─────────────────────────────

const SISTEMA = `Você escreve a PRIMEIRA mensagem de WhatsApp de José Romário (Romatec Consultoria Total, Açailândia/MA; avaliador CNAI 031161, corretor CRECI/MA 4.705) para uma empresa da região, apresentando o AvalieImob: sistema que monta o PTAM (Parecer Técnico de Avaliação Mercadológica) dentro da NBR 14653, com pesquisa de amostras, tratamento por fatores e laudo em PDF.
Regras:
- Português do Brasil, tom de colega da região, direto e educado. No máximo 600 caracteres antes da linha de saída.
- Comece cumprimentando a empresa pelo nome. Use UM fato específico sobre a empresa SOMENTE se ele vier em <fato> ou <sobre>; nunca invente fatos, números, clientes ou elogios.
- Ligue o AvalieImob a uma dor concreta do tipo de empresa (ex.: imobiliária → cliente pedindo laudo; advocacia → inventário/partilha; correspondente → avaliação para financiamento).
- Termine com UMA pergunta simples (ex.: se pode mandar um exemplo de laudo). Sem preço, sem promessa de resultado, sem links, sem emojis em excesso.
- A última linha deve ser exatamente: "${RODAPE_OPTOUT}"
Responda só com JSON: {"mensagem": "..."}.`;

const SCHEMA = { type: 'object', properties: { mensagem: { type: 'string' } }, required: ['mensagem'], additionalProperties: false };

async function escreverComIa(pedido: string): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ maxRetries: 1, timeout: 60_000 });
      const resp: any = await client.beta.messages.create({
        model: process.env.ANTHROPIC_MODEL_PROSPECCAO || 'claude-opus-5-5', max_tokens: 1024, system: SISTEMA,
        messages: [{ role: 'user', content: pedido }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      } as any);
      const bloco = resp.content?.find((b: any) => b.type === 'text');
      if (resp.stop_reason !== 'refusal' && bloco?.text) return String(JSON.parse(bloco.text).mensagem ?? '') || null;
    } catch (e: any) { console.warn('[Prospecção] Claude falhou:', e?.message); }
  }
  if (process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY) {
    try {
      const { invokeLLM } = await import('../_core/llm');
      const r = await invokeLLM({
        messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: pedido }] as any,
        response_format: { type: 'json_schema', json_schema: { name: 'mensagem_prospeccao', schema: SCHEMA as any, strict: true } },
      });
      const c = r.choices?.[0]?.message?.content;
      const txt = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x: any) => x.text || '').join('') : '';
      return String(JSON.parse(txt || '{}').mensagem ?? '') || null;
    } catch (e: any) { console.warn('[Prospecção] LLM falhou:', e?.message); }
  }
  return null;
}

const xml = (s: unknown) => String(s ?? '').replace(/[<>]/g, ' ').slice(0, 1500);

/** Gera (ou refaz) o rascunho. Sem IA configurada, usa a mensagem-modelo. A saída "SAIR" é garantida. */
export async function gerarMensagem(id: number, remetente: string) {
  const d = await banco();
  const p = await umProspecto(id);
  if (p.status === 'optout') throw new ProspeccaoErro('Esta empresa pediu para não receber mensagens.');
  const pedido = [
    `<empresa>${xml(p.nome)}</empresa>`, `<tipo>${xml(p.categoria)}</tipo>`, `<cidade>${xml(p.cidade ?? '')}</cidade>`,
    p.fato ? `<fato>${xml(p.fato)}</fato>` : null, p.sobre ? `<sobre>${xml(p.sobre)}</sobre>` : null,
    `Quem envia: ${xml(remetente)}. Escreva a mensagem.`,
  ].filter(Boolean).join('\n');
  let texto = (await transporte.ia(pedido))?.trim() || '';
  let origem: 'ia' | 'modelo' = 'ia';
  if (!texto || texto.length < 40) { texto = mensagemModelo({ nome: p.nome, categoria: p.categoria, cidade: p.cidade, fato: p.fato }, `${remetente}, da Romatec`); origem = 'modelo'; }
  if (!/\bSAIR\b/.test(texto)) texto = `${texto}\n\n${RODAPE_OPTOUT}`;
  texto = texto.slice(0, 1500);
  await d.update(prospectos).set({ mensagem: texto, status: ['novo', 'rascunho', 'aprovado'].includes(p.status) ? 'rascunho' : p.status } as any).where(eq(prospectos.id, id));
  return { ok: true as const, mensagem: texto, origem };
}

// ───────────────────────────── Aprovação e envio ─────────────────────────────

/** Uma pessoa aprova e o CRM envia pelo WhatsApp (só celular, com saída, dentro do limite do dia, uma vez por empresa) */
export async function aprovarEEnviar(id: number, autorId: number, agora = new Date()) {
  const d = await banco();
  const p = await umProspecto(id);
  if (p.status === 'optout') throw new ProspeccaoErro('Esta empresa pediu para não receber mensagens.');
  if (p.enviadoEm || ['enviado', 'respondeu', 'interessado', 'sem_interesse'].includes(p.status)) throw new ProspeccaoErro('A primeira mensagem já foi enviada para esta empresa.');
  if (!p.mensagem) throw new ProspeccaoErro('Gere ou escreva a mensagem antes de aprovar.');
  const erro = validarMensagem(p.mensagem);
  if (erro) throw new ProspeccaoErro(erro);
  if (!pareceCelular(p.telefone)) throw new ProspeccaoErro('Sem celular com WhatsApp. Use "Copiar" e envie por outro canal, ou corrija o telefone.');
  const hoje = await enviadosHoje(agora);
  if (hoje >= limiteDiario()) throw new ProspeccaoErro(`Limite de ${limiteDiario()} primeiras mensagens por dia atingido. Continue amanhã (protege o número contra bloqueio).`, 429);
  // Reserva antes de enviar: dois cliques seguidos não mandam duas vezes
  const r: any = await d.update(prospectos).set({ status: 'enviado', enviadoEm: agora, aprovadoPor: autorId } as any)
    .where(and(eq(prospectos.id, id), inArray(prospectos.status, ['novo', 'rascunho', 'aprovado'])));
  const afetadas = Array.isArray(r) ? r[0]?.affectedRows : r?.changes ?? r?.rowsAffected;
  if (afetadas === 0) throw new ProspeccaoErro('A primeira mensagem já foi enviada para esta empresa.');
  try {
    await transporte.enviarWhatsApp(p.telefone, p.mensagem);
  } catch (e: any) {
    await d.update(prospectos).set({ status: 'aprovado', enviadoEm: null } as any).where(eq(prospectos.id, id));
    throw new ProspeccaoErro(`O WhatsApp não enviou: ${e?.message ?? 'erro desconhecido'}`, 502);
  }
  return { ok: true as const, enviadosHoje: hoje + 1, limiteDia: limiteDiario() };
}

/** Variações do número (com e sem o 9º dígito) para casar com o que chega da Z-API */
export function variacoesTelefone(fone: string): string[] {
  const t = normalizarTelefone(fone);
  if (!t) return [];
  if (t.length === 13 && t[4] === '9') return [t, t.slice(0, 4) + t.slice(5)];
  if (t.length === 12 && /[6-9]/.test(t[4])) return [t, `${t.slice(0, 4)}9${t.slice(4)}`];
  return [t];
}

/**
 * Webhook do WhatsApp: se quem escreveu é um prospecto já contatado, guarda a resposta e devolve true (o robô de compradores
 * não responde). "SAIR" vira opt-out com confirmação.
 */
export async function registrarRespostaWhatsApp(fone: string, texto: string, agora = new Date()): Promise<boolean> {
  const d = await getDb();
  if (!d) return false;
  const vs = variacoesTelefone(fone);
  if (!vs.length) return false;
  const [p]: any[] = await (d as any).select().from(prospectos)
    .where(and(inArray(prospectos.telefone, vs), inArray(prospectos.status, ['enviado', 'respondeu', 'interessado', 'sem_interesse', 'optout']))).limit(1);
  if (!p) return false;
  if (p.status === 'optout') return true;
  const sair = ehOptout(texto);
  const anterior = p.ultimaResposta ? `${p.ultimaResposta}\n` : '';
  const linha = `[${agora.toISOString().slice(0, 16).replace('T', ' ')}] ${String(texto ?? '').slice(0, 1000)}`;
  await (d as any).update(prospectos).set({
    ultimaResposta: `${anterior}${linha}`.slice(-4000), respondeuEm: agora,
    status: sair ? 'optout' : p.status === 'enviado' ? 'respondeu' : p.status,
  } as any).where(eq(prospectos.id, p.id));
  if (sair) await transporte.enviarWhatsApp(p.telefone, 'Pronto, removemos o seu contato da nossa lista. Desculpe o incômodo e bom trabalho!').catch(() => {});
  return true;
}
