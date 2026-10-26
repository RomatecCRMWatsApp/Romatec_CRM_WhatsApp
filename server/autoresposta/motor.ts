/**
 * Motor das respostas automáticas no WhatsApp (empreendimento com o robô LIGADO em Admin › Respostas automáticas).
 * Mensagem do lead → intenção (regras; se nada casar, o Claude escolhe da lista) → texto da intenção com os valores do
 * simulador + mídias + aviso legal → envio pela Z-API, conversa e evento gravados. Uma resposta por mensagem.
 * Não responde: robô desligado, lead descadastrado, atendimento humano, fora do horário (só o primeiro contato).
 * Passa para o corretor (atendimento humano + aviso): pedido de fechamento e mensagem que nem o Claude entende.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { autoRespostaConfig, autoRespostaMidias, autoRespostaTextos, condicoesPagamento, empreendimentos, leadEventos, leadQualifications, lotes, users } from '../../drizzle/schema';
import {
  avisoLegal, classificar, comAvisoLegal, dentroDoHorario, INTENCOES, MIDIAS, preencher, TEXTOS_PADRAO, variaveisDaOferta,
  type CodigoMidia, type Intencao,
} from '../../shared/autoresposta';
import { condicoesDaLinha, simular, precoLote, type CondicoesPagamento } from '../../shared/simulador';
import { CARTAO_PADRAO, formatarTelefone } from '../../shared/cartaoVendas';

/** Mídias de partida (client/public/<slug>/divulgacao); a tela de configuração substitui por arquivo enviado */
export const MIDIAS_PADRAO: Record<string, Partial<Record<CodigoMidia, { tipo: 'imagem' | 'pdf'; url: string; nomeArquivo: string }>>> = {
  'bom-jardims': {
    OFERTA: { tipo: 'imagem', url: '/bom-jardims/divulgacao/01-oferta.png', nomeArquivo: '01-OFERTA.png' },
    CONDICOES: { tipo: 'imagem', url: '/bom-jardims/divulgacao/02-condicoes.png', nomeArquivo: '02-CONDICOES.png' },
    STORY_ESCASSEZ: { tipo: 'imagem', url: '/bom-jardims/divulgacao/03-story-escassez.png', nomeArquivo: '03-STORY.png' },
    MAPA: { tipo: 'imagem', url: '/bom-jardims/divulgacao/mapa.png', nomeArquivo: 'MAPA-BOM-JARDIMS.png' },
    FOLDER_PDF: { tipo: 'pdf', url: '/bom-jardims/divulgacao/folder-digital-bom-jardims.pdf', nomeArquivo: 'FOLDER-DIGITAL-BOM-JARDIMS.pdf' },
  },
};

export type Envio = { tipo: 'texto'; texto: string } | { tipo: 'imagem' | 'pdf'; codigo: string; url: string; nomeArquivo: string; legenda?: string | null };

const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
const absoluta = (url: string) => (/^https?:\/\//.test(url) ? url : `${urlPublica()}${url}`);
const primeiroNome = (n: string | null | undefined) => String(n ?? '').trim().split(/\s+/)[0] || '';
const banco = async () => { const d = await getDb(); if (!d) throw new Error('Banco indisponível'); return d as any; };

/** Transporte (injetável nos testes): Z-API, mídia baixada e enviada em base64 */
export const transporte = {
  async texto(telefone: string, texto: string) { const { enviarTexto } = await import('../leads/zapiClient'); await enviarTexto(telefone, texto); },
  async midia(telefone: string, m: Extract<Envio, { codigo: string }>) {
    const r = await fetch(absoluta(m.url), { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`mídia ${m.codigo}: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const z = await import('../leads/zapiClient');
    if (m.tipo === 'pdf') await z.enviarDocumento(telefone, { base64: buf.toString('base64'), extensao: 'pdf', mime: 'application/pdf', nomeArquivo: m.nomeArquivo, legenda: m.legenda ?? undefined });
    else await z.enviarImagem(telefone, { base64: buf.toString('base64'), mime: r.headers.get('content-type') || 'image/png', legenda: m.legenda ?? undefined });
  },
};

/** Classificação de reserva pelo Claude (só quando as regras não casam); injetável nos testes */
export const classificador = {
  async claude(texto: string): Promise<string> { const { intencaoPeloClaude } = await import('./claude'); return intencaoPeloClaude(texto); },
};

export interface ContextoEmp {
  emp: { id: number; slug: string; nome: string };
  cfg: { ativo: boolean; condicaoValidaAte: string | null; avisoLegal: string | null; loteAncora: string | null; entradaParcelas: number };
  cond: CondicoesPagamento | null;
  lotes: { codigo: string; areaM2: number; situacao: string; precoTabela: number | null; lon: number | null; lat: number | null }[];
  textos: Partial<Record<Intencao, { texto: string; midias: CodigoMidia[]; ativo: boolean }>>;
  midias: Partial<Record<CodigoMidia, { tipo: 'imagem' | 'pdf'; url: string; nomeArquivo: string; legenda: string | null }>>;
}

const n = (v: unknown) => (v == null || v === '' ? null : Number(v));

export async function contextoDoEmpreendimento(slug: string): Promise<ContextoEmp | null> {
  const d = await banco();
  const [e]: any[] = await d.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!e) return null;
  const [c]: any[] = await d.select().from(autoRespostaConfig).where(eq(autoRespostaConfig.empreendimentoId, e.id)).limit(1);
  const conds: any[] = await d.select().from(condicoesPagamento).where(and(eq(condicoesPagamento.empreendimentoId, e.id), eq(condicoesPagamento.ativo, true as any)));
  const cond = conds.sort((a, b) => String(a.vigenteDesde).localeCompare(String(b.vigenteDesde))).at(-1);
  const ls: any[] = await d.select({ codigo: lotes.codigo, areaM2: lotes.areaM2, situacao: lotes.situacao, precoTabela: lotes.precoTabela, lon: lotes.lonCentro, lat: lotes.latCentro }).from(lotes).where(eq(lotes.empreendimentoId, e.id));
  const ts: any[] = await d.select().from(autoRespostaTextos).where(eq(autoRespostaTextos.empreendimentoId, e.id));
  const ms: any[] = await d.select().from(autoRespostaMidias).where(eq(autoRespostaMidias.empreendimentoId, e.id));
  const textos: ContextoEmp['textos'] = {};
  for (const i of INTENCOES) {
    const t = ts.find(x => x.intencao === i);
    textos[i] = t
      ? { texto: t.texto, midias: String(t.midias ?? '').split(',').map(s => s.trim()).filter(s => (MIDIAS as readonly string[]).includes(s)) as CodigoMidia[], ativo: t.ativo !== false && t.ativo !== 0 }
      : { ...TEXTOS_PADRAO[i], ativo: true };
  }
  const midias: ContextoEmp['midias'] = {};
  for (const k of MIDIAS) {
    const m = ms.find(x => x.codigo === k && x.ativo !== false && x.ativo !== 0);
    const p = MIDIAS_PADRAO[e.slug]?.[k];
    if (m) midias[k] = { tipo: m.tipo === 'pdf' ? 'pdf' : 'imagem', url: m.url, nomeArquivo: m.nomeArquivo || `${k}`, legenda: m.legenda ?? null };
    else if (p) midias[k] = { ...p, legenda: null };
  }
  return {
    emp: { id: Number(e.id), slug: e.slug, nome: e.nome },
    cfg: {
      ativo: !!c && (c.ativo === true || c.ativo === 1), condicaoValidaAte: c?.condicaoValidaAte ? String(c.condicaoValidaAte).slice(0, 10) : null,
      avisoLegal: c?.avisoLegal ?? null, loteAncora: c?.loteAncora ?? null, entradaParcelas: Number(c?.entradaParcelas) || 6,
    },
    cond: cond ? condicoesDaLinha(cond) : null,
    lotes: ls.map(l => ({ codigo: l.codigo, areaM2: Number(l.areaM2) || 0, situacao: String(l.situacao || 'disponivel'), precoTabela: n(l.precoTabela), lon: n(l.lon), lat: n(l.lat) })),
    textos, midias,
  };
}

/** Chácaras livres mais perto de uma (centróide), para quando a pedida já saiu */
export function maisProximas(ctx: ContextoEmp, codigo: string, qtd = 3): string[] {
  const alvo = ctx.lotes.find(l => l.codigo === codigo);
  const livres = ctx.lotes.filter(l => l.situacao === 'disponivel' && l.codigo !== codigo);
  if (!alvo || alvo.lon == null || alvo.lat == null) return livres.slice(0, qtd).map(l => l.codigo);
  const dist = (l: typeof livres[number]) => (l.lon == null || l.lat == null ? Infinity : (l.lon - alvo.lon!) ** 2 + (l.lat - alvo.lat!) ** 2);
  return livres.sort((a, b) => dist(a) - dist(b)).slice(0, qtd).map(l => l.codigo);
}

export interface Corretor { nome: string; creci: string | null; telefone: string | null }

/**
 * Mensagens de uma intenção (texto com valores do simulador + aviso legal, depois as mídias). Usada no envio de verdade
 * e na prévia da tela de configuração (que não envia nada).
 */
export function montarResposta(ctx: ContextoEmp, p: { intencao: Intencao; chacara?: string | null; nome?: string | null; corretor: Corretor; extra?: Record<string, string> }): Envio[] {
  const disponiveis = ctx.lotes.filter(l => l.situacao === 'disponivel').length;
  const base: Record<string, string> = {
    nome: primeiroNome(p.nome) || 'tudo bem', corretor: p.corretor.nome, creci: p.corretor.creci ?? '', telefone_corretor: p.corretor.telefone ?? '',
    disponiveis: String(disponiveis), lote: p.chacara || 'que você escolher', link_oferta: `${urlPublica()}/${ctx.emp.slug}`, ...p.extra,
  };
  let intencao = p.intencao;
  // Chácara citada: simulação dela; se já saiu, avisa e oferece as livres mais perto
  let lote = p.chacara ? ctx.lotes.find(l => l.codigo === p.chacara) : undefined;
  if (intencao === 'chacara_especifica' && lote && lote.situacao !== 'disponivel') {
    const perto = maisProximas(ctx, lote.codigo);
    return [{ tipo: 'texto', texto: `A chácara *${lote.codigo}* já foi reservada 😕${perto.length ? ` Estas estão livres e bem perto dela: *${perto.join(', ')}*. Quer que eu te mande os valores de alguma?` : ''}` }];
  }
  let vars = base;
  if (ctx.cond) {
    const ancora = ctx.cfg.loteAncora ? ctx.lotes.find(l => l.codigo === ctx.cfg.loteAncora) : undefined;
    const alvo = intencao === 'chacara_especifica' && lote ? lote : ancora;
    const area = alvo?.areaM2 || ctx.cond.areaBaseM2;
    const preco = alvo?.precoTabela ?? precoLote(area, ctx.cond);
    const ent = Math.min(ctx.cfg.entradaParcelas, ctx.cond.entradaMaxParcelas);
    const sim = simular(area, ent, ctx.cond, preco);
    vars = { ...variaveisDaOferta({ sim, c: ctx.cond, disponiveis, condicaoValidaAte: ctx.cfg.condicaoValidaAte, entradaParcelas: ent }), ...base };
  } else if (/\{\{\s*(preco|parcela_maior|entrada_parcela|avista|tabela_prazos)\s*\}\}/.test(ctx.textos[intencao]?.texto ?? '')) {
    // Sem condições cadastradas não se fala de valores: cai na resposta sem números
    intencao = 'followup';
  }
  const t = ctx.textos[intencao];
  if (!t || !t.ativo) return [];
  const aviso = avisoLegal(vars, ctx.cfg.avisoLegal);
  const out: Envio[] = [{ tipo: 'texto', texto: comAvisoLegal(preencher(t.texto, vars).trim(), aviso) }];
  for (const k of t.midias) { const m = ctx.midias[k]; if (m) out.push({ tipo: m.tipo, codigo: k, url: m.url, nomeArquivo: m.nomeArquivo, legenda: m.legenda }); }
  return out;
}

async function corretorDoLead(responsavelId: number | null): Promise<Corretor> {
  if (responsavelId) {
    const d = await banco();
    const [u]: any[] = await d.select().from(users).where(eq(users.id, responsavelId)).limit(1);
    if (u && u.ativo !== false && u.ativo !== 0) {
      return { nome: String(u.name).split(/\s+/).slice(0, 2).join(' '), creci: u.creci ? `CRECI${u.creciUf ? `/${u.creciUf}` : ''} ${u.creci}` : null, telefone: formatarTelefone(u.telefone) };
    }
  }
  return { nome: CARTAO_PADRAO.nome, creci: CARTAO_PADRAO.creci, telefone: CARTAO_PADRAO.telefones[0] ?? null };
}

async function evento(leadId: number, tipo: string, dados: Record<string, unknown>) {
  const d = await banco();
  await d.insert(leadEventos).values({ leadId, tipo, dados, createdAt: new Date() } as any).catch(() => {});
}

async function passarParaCorretor(lead: any, ctx: ContextoEmp, motivo: string) {
  const d = await banco();
  await d.update(leadQualifications).set({ humano: true, updatedAt: new Date() } as any).where(eq(leadQualifications.id, lead.id));
  await evento(lead.id, 'handoff', { motivo });
  const { notificarAtendimento } = await import('../notificacoes');
  await notificarAtendimento({ leadId: lead.id, responsavelId: lead.responsavelId ?? null, cliente: lead.nome || 'Cliente', empreendimentoId: ctx.emp.id, empreendimentoSlug: ctx.emp.slug, empreendimentoNome: ctx.emp.nome, motivo })
    .catch((e: any) => console.warn('[Auto-resposta] aviso ao corretor:', e?.message));
}

export interface Resultado { tratado: boolean; intencao?: Intencao | 'indefinida' | 'outra'; enviados?: number; motivo?: string }

/**
 * Processa a mensagem de um lead de empreendimento. tratado=false = robô desligado/sem empreendimento (segue o fluxo
 * antigo); tratado=true = o robô cuidou (respondendo ou, de propósito, ficando calado).
 */
export async function processarMensagem(p: { phone: string; texto: string; nome?: string | null; primeira?: boolean; agora?: number }): Promise<Resultado> {
  const agora = p.agora ?? Date.now();
  const phone = p.phone.replace(/\D/g, '');
  const d = await banco();
  const [lead]: any[] = await d.select().from(leadQualifications).where(eq(leadQualifications.phone, phone)).limit(1);
  if (!lead?.empreendimentoSlug) return { tratado: false };
  const ctx = await contextoDoEmpreendimento(lead.empreendimentoSlug);
  if (!ctx?.cfg.ativo) return { tratado: false };
  // Descadastrado ou com o corretor: não responde (só registra)
  if (lead.blockedUntil && new Date(lead.blockedUntil).getTime() > agora) return { tratado: true, motivo: 'optout' };
  if (lead.humano === true || lead.humano === 1) { await evento(lead.id, 'mensagem_humano', { texto: p.texto.slice(0, 300) }); return { tratado: true, motivo: 'humano' }; }

  let { intencao, chacara } = classificar(p.texto, !!p.primeira, new Set(ctx.lotes.map(l => l.codigo))) as { intencao: Intencao | 'indefinida' | 'outra'; chacara?: string };
  if (intencao === 'indefinida') {
    try {
      const r = await Promise.race([classificador.claude(p.texto), new Promise<string>((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 5000))]);
      intencao = (INTENCOES as readonly string[]).includes(r) && !['escassez', 'followup', 'chacara_especifica'].includes(r) ? (r as Intencao) : 'outra';
    } catch { intencao = 'outra'; }
    if (intencao === 'outra') {
      await passarParaCorretor(lead, ctx, `mensagem fora do roteiro: "${p.texto.slice(0, 160)}"`);
      return { tratado: true, intencao: 'outra', motivo: 'handoff' };
    }
  }
  const foraDoHorario = !dentroDoHorario(agora);
  if (foraDoHorario && intencao !== 'primeiro_contato' && intencao !== 'optout') {
    await evento(lead.id, 'fora_horario', { intencao, texto: p.texto.slice(0, 300) });
    return { tratado: true, intencao, motivo: 'fora_horario' };
  }

  const corretor = await corretorDoLead(lead.responsavelId ?? null);
  const envios = montarResposta(ctx, { intencao: intencao as Intencao, chacara: chacara ?? lead.loteCodigo ?? null, nome: lead.nome || p.nome, corretor });
  if (foraDoHorario && envios[0]?.tipo === 'texto') envios[0] = { tipo: 'texto', texto: `${envios[0].texto}\n\n🕗 Nosso atendimento é das 8 h às 20 h — o ${corretor.nome.split(' ')[0]} te responde logo cedo.` };

  if (intencao === 'optout') {
    const { discardLead } = await import('../lead-persistence');
    await discardLead(phone, `opt-out (${ctx.emp.slug}, respostas automáticas)`, 24 * 365 * 5);
  }
  let enviados = 0;
  const { registrarMensagemPorTelefone } = await import('../leads/qualificacaoService');
  for (const e of envios) {
    try {
      if (e.tipo === 'texto') { await transporte.texto(phone, e.texto); await registrarMensagemPorTelefone(phone, 'out', 'bot', e.texto).catch(() => {}); }
      else { await transporte.midia(phone, e); await evento(lead.id, 'midia_enviada', { codigo: e.codigo }); }
      enviados++;
    } catch (err: any) { console.warn(`[Auto-resposta] envio para ${phone}:`, err?.message); }
  }
  await evento(lead.id, 'auto_resposta', { intencao, chacara: chacara ?? null, enviados, foraDoHorario });
  // Com o robô no comando, a régua antiga (1, 3, 7, 14, 30 dias) não sai para este lead
  await import('../leads/followup').then(m => m.cancelarFollowUp(phone)).catch(() => {});
  if (intencao === 'fechar') await passarParaCorretor(lead, ctx, `quer fechar${chacara ? ` a chácara ${chacara}` : ''}`);
  if (intencao === 'visita') {
    await evento(lead.id, 'pediu_visita', {});
    const { notificarAtendimento } = await import('../notificacoes');
    await notificarAtendimento({ leadId: lead.id, responsavelId: lead.responsavelId ?? null, cliente: lead.nome || 'Cliente', empreendimentoId: ctx.emp.id, empreendimentoSlug: ctx.emp.slug, empreendimentoNome: ctx.emp.nome, motivo: 'quer agendar uma visita' }).catch(() => {});
  }
  return { tratado: true, intencao, enviados };
}

/** O robô responde por este empreendimento? (para o fluxo de entrada decidir) */
export async function roboAtivo(slug: string | null | undefined): Promise<boolean> {
  if (!slug) return false;
  const ctx = await contextoDoEmpreendimento(slug).catch(() => null);
  return !!ctx?.cfg.ativo;
}
