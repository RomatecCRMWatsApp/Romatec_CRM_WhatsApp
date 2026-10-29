/**
 * Imobiliárias parceiras: cada uma tem um portal próprio (/parceiro/:token, sem login) com as chácaras disponíveis,
 * os links de divulgação com o código dela (utm_campaign PARC-<codigo>), o "Indicar cliente", os leads que trouxe
 * e as vendas com a comissão prevista. Os leads vão para o corretor da casa definido para a parceira.
 * O escritório cadastra e acompanha em Vendas › Imobiliárias parceiras.
 */
import { randomBytes } from 'node:crypto';
import { eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { Express } from 'express';
import { z } from 'zod';
import { getDb } from './db';
import { contratos, empreendimentos, imobiliariasParceiras, leadQualifications, lotes, users } from '../drizzle/schema';
import { statusPublicoDe } from '../shared/lotes';
import { STATUS_EM_ANDAMENTO, STATUS_VENDIDO, valorDoPlano } from '../shared/roiCampanhas';

export class ParceiroErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'ParceiroErro'; } }
const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new ParceiroErro('Banco indisponível', 503);
  return d;
}
const ROTULO_ETAPA: Record<string, string> = { novo: 'Novo', qualificando: 'Em atendimento', qualificado: 'Qualificado', visita_agendada: 'Visita agendada', visitou: 'Visitou', proposta: 'Proposta', fechado: 'Comprou', perdido: 'Não seguiu' };
/** Data → ISO sem quebrar com valor inválido (no SQLite local as datas podem vir como número) */
const iso = (v: unknown) => { const d = v instanceof Date ? v : new Date(v as any); return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString(); };
export const campanhaDoParceiro = (codigo: string) => `PARC-${codigo}`;

export const dadosParceiraSchema = z.object({
  nome: z.string().trim().min(2).max(160), cnpj: z.string().trim().max(18).optional().nullable(), creci: z.string().trim().max(30).optional().nullable(),
  responsavel: z.string().trim().max(160).optional().nullable(), telefone: z.string().trim().max(20).optional().nullable(), email: z.string().trim().max(160).optional().nullable(),
  comissaoPct: z.number().min(0).max(0.1), corretorInternoId: z.number().int().nullable().optional(), ativo: z.boolean().optional(),
});
export type DadosParceira = z.infer<typeof dadosParceiraSchema>;

export async function criarParceira(e: DadosParceira, autorId: number) {
  const d = await banco();
  let codigo = '';
  for (let i = 0; i < 5; i++) {
    codigo = randomBytes(3).toString('hex').toUpperCase();
    const [ja]: any[] = await d.select({ id: imobiliariasParceiras.id }).from(imobiliariasParceiras).where(eq(imobiliariasParceiras.codigo, codigo)).limit(1);
    if (!ja) break;
  }
  await d.insert(imobiliariasParceiras).values({ ...e, comissaoPct: String(e.comissaoPct), codigo, token: randomBytes(16).toString('hex'), ativo: e.ativo ?? true, criadoPor: autorId, criadoEm: new Date() } as any);
  return { ok: true as const, codigo };
}

export async function atualizarParceira(id: number, e: Partial<DadosParceira>) {
  const d = await banco();
  await d.update(imobiliariasParceiras).set({ ...e, ...(e.comissaoPct != null ? { comissaoPct: String(e.comissaoPct) } : {}) } as any).where(eq(imobiliariasParceiras.id, id));
  return { ok: true as const };
}

export async function novoLinkParceira(id: number) {
  const d = await banco();
  await d.update(imobiliariasParceiras).set({ token: randomBytes(16).toString('hex') } as any).where(eq(imobiliariasParceiras.id, id));
  return { ok: true as const };
}

const doParceiro = (codigo: string) => (l: any) => {
  const utm = typeof l.utm === 'string' ? (() => { try { return JSON.parse(l.utm); } catch { return null; } })() : l.utm;
  const ans = typeof l.answers === 'string' ? (() => { try { return JSON.parse(l.answers); } catch { return null; } })() : l.answers;
  return utm?.campaign === campanhaDoParceiro(codigo) || ans?.parceiro === codigo;
};

/** Leads e vendas de cada parceira (escritório e portal) */
async function numerosDe(parceiras: any[]) {
  const d = await banco();
  const leads: any[] = await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, utm: leadQualifications.utm, answers: leadQualifications.answers, etapa: leadQualifications.etapa,
    stage: leadQualifications.stage, funil: leadQualifications.funil, loteCodigo: leadQualifications.loteCodigo, createdAt: leadQualifications.createdAt })
    .from(leadQualifications).where(or(isNotNull(leadQualifications.utm), isNotNull(leadQualifications.answers)));
  const ctrs: any[] = await d.select({ leadId: contratos.leadId, status: contratos.status, lote: contratos.loteCodigo, plano: contratos.simulacaoJson, criadoEm: contratos.criadoEm }).from(contratos).where(isNotNull(contratos.leadId));
  const { etapaDoLead } = await import('./leads/kanban');
  return new Map(parceiras.map(p => {
    const meus = leads.filter(doParceiro(p.codigo));
    const ids = new Set(meus.map(l => Number(l.id)));
    const vendas = ctrs.filter(c => ids.has(Number(c.leadId)) && (STATUS_VENDIDO.includes(c.status) || STATUS_EM_ANDAMENTO.includes(c.status))).map(c => {
      const v = valorDoPlano(typeof c.plano === 'string' ? JSON.parse(c.plano) : c.plano);
      const vendido = STATUS_VENDIDO.includes(c.status);
      return { chacara: String(c.lote), situacao: vendido ? 'Vendida' : 'Em contrato', valor: v.vgv, comissao: Math.round(v.vgv * Number(p.comissaoPct) * 100) / 100, vendido, data: iso(c.criadoEm) };
    });
    return [Number(p.id), {
      leads: meus.map(l => ({ id: Number(l.id), nome: String(l.nome || 'Cliente'), etapa: ROTULO_ETAPA[etapaDoLead(l)] ?? etapaDoLead(l), chacara: l.loteCodigo ?? null, em: iso(l.createdAt) }))
        .sort((a, b) => b.em.localeCompare(a.em)),
      vendas,
    }];
  }));
}

export async function listarParceiras() {
  const d = await banco();
  const ps: any[] = await d.select().from(imobiliariasParceiras);
  const nums = await numerosDe(ps);
  const us: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  return ps.map(p => {
    const n = nums.get(Number(p.id))!;
    return {
      id: Number(p.id), nome: p.nome, cnpj: p.cnpj, creci: p.creci, responsavel: p.responsavel, telefone: p.telefone, email: p.email, codigo: p.codigo,
      comissaoPct: Number(p.comissaoPct), corretorInternoId: p.corretorInternoId ? Number(p.corretorInternoId) : null,
      corretorInterno: us.find(u => Number(u.id) === Number(p.corretorInternoId))?.name ?? null, ativo: p.ativo === true || p.ativo === 1,
      portal: `${urlPublica()}/parceiro/${p.token}`, leads: n.leads.length, vendidas: n.vendas.filter(v => v.vendido).length,
      comissaoPrevista: n.vendas.filter(v => v.vendido).reduce((s, v) => s + v.comissao, 0),
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function parceiraDoToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new ParceiroErro('Link inválido', 404);
  const d = await banco();
  const [p]: any[] = await d.select().from(imobiliariasParceiras).where(eq(imobiliariasParceiras.token, token)).limit(1);
  if (!p || !(p.ativo === true || p.ativo === 1)) throw new ParceiroErro('Link inválido ou desativado', 404);
  return p;
}

/** Tudo o que o portal da parceira mostra */
export async function portalParceira(token: string) {
  const p = await parceiraDoToken(token);
  const d = await banco();
  const { refDoUsuario } = await import('./cartaoVendas');
  const ref = p.corretorInternoId ? refDoUsuario(Number(p.corretorInternoId)) : null;
  const qs = (extra = '') => `?utm_source=parceiro&utm_campaign=${campanhaDoParceiro(p.codigo)}${ref ? `&c=${ref}` : ''}${extra}`;
  const links = [
    { titulo: 'Página do Bom Jardims (fotos, vídeo e mapa)', url: `${urlPublica()}/bom-jardims${qs()}` },
    { titulo: 'Agendar visita', url: `${urlPublica()}/agendar/bom-jardims${qs()}` },
    { titulo: 'Simulador (com valores)', url: `${urlPublica()}/o/bom-jardims${qs()}` },
    { titulo: 'Documentos (contrato, Estatuto, regras)', url: `${urlPublica()}/documentos/bom-jardims${ref ? `?c=${ref}` : ''}` },
  ];
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, 'bom-jardims')).limit(1);
  const precos = !!emp && (emp.precosPublicos === true || emp.precosPublicos === 1);
  const ls: any[] = emp ? await d.select({ codigo: lotes.codigo, quadra: lotes.quadra, areaM2: lotes.areaM2, situacao: lotes.situacao, comercializavel: lotes.comercializavel, precoTabela: lotes.precoTabela })
    .from(lotes).where(eq(lotes.empreendimentoId, emp.id)) : [];
  const n = (await numerosDe([p])).get(Number(p.id))!;
  const [cor]: any[] = p.corretorInternoId ? await d.select({ name: users.name, telefone: users.telefone }).from(users).where(eq(users.id, p.corretorInternoId)).limit(1) : [];
  return {
    parceira: { nome: p.nome, codigo: p.codigo, comissaoPct: Number(p.comissaoPct) },
    contato: cor ? { nome: String(cor.name ?? ''), telefone: cor.telefone ?? null } : null,
    links,
    chacaras: ls.filter(l => l.comercializavel !== false && l.comercializavel !== 0).map(l => ({
      codigo: String(l.codigo), quadra: l.quadra, areaM2: Number(l.areaM2) || null, situacao: statusPublicoDe((l.situacao || 'disponivel') as any),
      preco: precos && l.precoTabela != null ? Number(l.precoTabela) : null,
    })).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })),
    leads: n.leads.map(l => ({ ...l, nome: l.nome.split(/\s+/).slice(0, 2).join(' ') })),
    vendas: n.vendas,
  };
}

export const indicacaoSchema = z.object({
  nome: z.string().trim().min(3).max(160), telefone: z.string().trim().min(10).max(25), chacara: z.string().trim().regex(/^[A-Z]\d{2}$/i).optional().or(z.literal('')),
  mensagem: z.string().trim().max(1000).optional(), consentimento: z.literal(true, { message: 'Confirme que o cliente autorizou o contato' }),
});

export async function indicarCliente(token: string, b: z.infer<typeof indicacaoSchema>) {
  const p = await parceiraDoToken(token);
  const { ingestLead } = await import('./lead-intake');
  const r: any = await ingestLead({
    nome: b.nome, phone: b.telefone, origem: 'parceiro', campanha: campanhaDoParceiro(p.codigo), empreendimentoSlug: 'bom-jardims',
    loteCodigo: b.chacara ? b.chacara.toUpperCase() : undefined, responsavelId: p.corretorInternoId ?? null,
    utm: { source: 'parceiro', campaign: campanhaDoParceiro(p.codigo) },
    answers: { parceiro: p.codigo, imobiliaria: p.nome, mensagem: b.mensagem ?? '' },
    consentimento: { at: new Date().toISOString(), texto: `Contato autorizado pelo cliente, declarado pela imobiliária parceira ${p.nome}`, origem: 'portal_parceiro' },
  } as any);
  if (!r?.ok) throw new ParceiroErro(r?.reason === 'invalid_phone' ? 'WhatsApp inválido (com DDD)' : 'Não foi possível registrar agora', 400);
  return { ok: true as const, novo: !!r.created };
}

export function registrarRotasParceiros(app: Express, allow: (k: string) => boolean) {
  const erro = (res: any, e: any) => res.status(e instanceof ParceiroErro ? e.status : 500).json({ ok: false, mensagem: e instanceof ParceiroErro ? e.message : 'Falha — tente de novo' });
  app.get('/api/parceiro/:token', async (req, res) => {
    try { res.setHeader('Cache-Control', 'no-store'); res.json(await portalParceira(String(req.params.token))); } catch (e: any) { if (!(e instanceof ParceiroErro)) console.error('[Parceiro]', e); erro(res, e); }
  });
  app.post('/api/parceiro/:token/indicar', async (req, res) => {
    try {
      if (!allow(`parceiro:${req.params.token}`)) return res.status(429).json({ ok: false, mensagem: 'Muitas indicações seguidas. Aguarde alguns minutos.' });
      const b = indicacaoSchema.safeParse(req.body ?? {});
      if (!b.success) return res.status(400).json({ ok: false, mensagem: b.error.issues[0]?.message });
      res.json(await indicarCliente(String(req.params.token), b.data));
    } catch (e: any) { if (!(e instanceof ParceiroErro)) console.error('[Parceiro]', e); erro(res, e); }
  });
}
