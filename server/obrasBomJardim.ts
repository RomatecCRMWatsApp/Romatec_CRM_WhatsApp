/**
 * Página de campanha das obras do Bom Jardim (/obras-bom-jardim) — captação do Instagram.
 * Todo lead e todo clique ("Agendar visita", "Quero saber o valor") sai com um corretor do rodízio do
 * empreendimento e com a origem da campanha (utm_source / utm_campaign; padrão Instagram + IG-OBRAS-NOV26).
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Express } from 'express';
import { z } from 'zod';
import { getDb } from './db';
import { acessosCorretor, campanhaCliques, empreendimentos, users } from '../drizzle/schema';
import { escolherResponsavel } from './leads/sla';
import { refDoUsuario, usuarioDaRef } from './cartaoVendas';
import { ingestLead, origemFromUtm, origemVisitaSchema } from './lead-intake';
import { BOM_JARDIMS_CONSENT_TEXT, BOM_JARDIMS_SLUG, bomJardimsWelcome, scoreBomJardims } from './bom-jardims';
import { CAMPANHA_OBRAS, FINALIDADES_OBRAS, PAGAMENTOS_OBRAS, PRAZOS_OBRAS, fichaObrasSchema, msgValorComFicha, rotuloObras, utmObras } from '../shared/obrasBomJardim';

/** WhatsApp do José (CRECI/MA 4.705): quando ninguém da equipe tem telefone cadastrado */
const WHATS_PADRAO = '5599991811246';

const fone = (v: unknown) => {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
};

export interface CorretorRodizio { id: number; nome: string; creci: string | null; whatsapp: string; ref: string }

/**
 * Próximo do rodízio do empreendimento: quem tem "recebe leads", ativo e com WhatsApp, habilitado no
 * Bom Jardims (sem habilitados, a roleta geral; sem roleta, o administrador). Atualiza a vez (ultimoLeadAt).
 */
export async function corretorDoRodizio(slug = BOM_JARDIMS_SLUG): Promise<CorretorRodizio | null> {
  const d: any = await getDb();
  if (!d) return null;
  const todos: any[] = await d.select({ id: users.id, name: users.name, telefone: users.telefone, creci: users.creci, role: users.role, perfil: users.perfil, ativo: users.ativo, recebeLeads: users.recebeLeads, ultimoLeadAt: users.ultimoLeadAt }).from(users);
  const ativos = todos.filter(u => u.ativo !== false && u.ativo !== 0 && u.perfil !== 'empreendedor' && fone(u.telefone));
  const roleta = ativos.filter(u => u.recebeLeads === true || u.recebeLeads === 1);
  const [emp]: any[] = await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  let candidatos = roleta;
  if (emp && roleta.length) {
    const hab: any[] = await d.select({ usuarioId: acessosCorretor.usuarioId }).from(acessosCorretor)
      .where(and(eq(acessosCorretor.tipo, 'empreendimento'), eq(acessosCorretor.refId, emp.id), inArray(acessosCorretor.usuarioId, roleta.map(u => u.id))));
    const ids = new Set(hab.map(h => Number(h.usuarioId)));
    // Administrador na roleta também entra (não precisa de habilitação)
    const doEmp = roleta.filter(u => ids.has(u.id) || u.role === 'admin');
    if (doEmp.length) candidatos = doEmp;
  }
  const escolhido = escolherResponsavel(candidatos) ?? ativos.find(u => u.role === 'admin') ?? null;
  if (!escolhido) return null;
  await d.update(users).set({ ultimoLeadAt: new Date() } as any).where(eq(users.id, escolhido.id));
  return { id: escolhido.id, nome: String(escolhido.name ?? 'Corretor'), creci: escolhido.creci ?? null, whatsapp: fone(escolhido.telefone)!, ref: refDoUsuario(escolhido.id) };
}

/** Corretor do link (?c=): quem compartilhou recebe o lead e o clique; inválido, inativo ou sem WhatsApp → rodízio */
export async function corretorDoLink(ref: string | null | undefined): Promise<CorretorRodizio | null> {
  const id = ref ? usuarioDaRef(ref) : null;
  if (!id) return null;
  const d: any = await getDb();
  if (!d) return null;
  const [u]: any[] = await d.select({ id: users.id, name: users.name, telefone: users.telefone, creci: users.creci, perfil: users.perfil, ativo: users.ativo }).from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.ativo === false || u.ativo === 0 || u.perfil === 'empreendedor' || !fone(u.telefone)) return null;
  return { id: u.id, nome: String(u.name ?? 'Corretor'), creci: u.creci ?? null, whatsapp: fone(u.telefone)!, ref: refDoUsuario(u.id) };
}

/** Quem atende: o dono do link compartilhado ou o próximo do rodízio */
const corretorPara = async (ref?: string | null) => (await corretorDoLink(ref)) ?? (await corretorDoRodizio());

async function registrarClique(acao: string, corretorId: number | null, utm: { source?: string; campaign?: string }) {
  try {
    const d: any = await getDb();
    if (d) await d.insert(campanhaCliques).values({ campanha: utm.campaign || CAMPANHA_OBRAS, acao, corretorId, utmSource: utm.source ?? null, criadoEm: new Date() });
  } catch (e: any) { console.warn('[Obras] clique não registrado:', e?.message); }
}

const utmField = z.string().trim().max(100).optional().transform(v => v || undefined);
const utmSchema = z.object({ source: utmField, medium: utmField, campaign: utmField, content: utmField }).optional();

/** Ficha completa (shared/obrasBomJardim.ts) + origem da visita */
export const obrasLeadSchema = fichaObrasSchema.extend({
  utm: utmSchema,
  origemVisita: origemVisitaSchema,
  ref: z.string().max(20).optional(),
  website: z.string().max(500).optional(), // honeypot
});

// "Quero saber o valor" não tem atalho: só depois da ficha completa (/lead devolve o WhatsApp)
const cliqueSchema = z.object({ acao: z.literal('visita'), utm: utmSchema, ref: z.string().max(20).optional() });

const ipDe = (req: any) => {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  return fwd[fwd.length - 1] || req.socket?.remoteAddress || 'unknown';
};

export function registrarRotasObras(app: Express, allow: (key: string) => boolean) {
  /**
   * Ficha completa → lead no CRM com todos os dados (corretor do link ou do rodízio, aviso de lead novo) e só
   * então o WhatsApp do corretor, com a mensagem já trazendo quem é o cliente
   */
  app.post('/api/public/obras-bom-jardim/lead', async (req, res) => {
    try {
      const ip = ipDe(req);
      if (!allow(ip)) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      const parsed = obrasLeadSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' });
      const p = parsed.data;
      if (p.website) return res.json({ ok: true });
      const utm = utmObras(p.utm);
      const corretor = await corretorPara(p.ref);
      const r = await ingestLead({
        nome: p.nome, phone: p.phone, origem: origemFromUtm(utm), campanha: utm.campaign, utm, origemVisita: p.origemVisita,
        empreendimentoSlug: BOM_JARDIMS_SLUG, funil: 'comprador', responsavelId: corretor?.id ?? null,
        leadScore: scoreBomJardims({ prazo: p.prazo, pagamento: p.pagamento, cidade: p.cidade }),
        answers: {
          campanha: 'Instagram/Obras — lançamento das obras', email: p.email, cidade: p.cidade,
          finalidade: rotuloObras(FINALIDADES_OBRAS, p.finalidade), pagamento: rotuloObras(PAGAMENTOS_OBRAS, p.pagamento), prazo: rotuloObras(PRAZOS_OBRAS, p.prazo),
          pediu: 'Valores / tabela',
        },
        consentimento: { at: new Date().toISOString(), texto: BOM_JARDIMS_CONSENT_TEXT, origem: `campanha /obras-bom-jardim (utm_source=${utm.source})`, ip },
        welcomeMessage: bomJardimsWelcome(p.nome),
      });
      if (!r.ok && r.reason === 'invalid_phone') return res.status(400).json({ ok: false, error: 'Informe um WhatsApp válido com DDD' });
      if (!r.ok && r.reason === 'db_unavailable') return res.status(503).json({ ok: false, error: 'Sistema indisponível no momento. Fale pelo WhatsApp.' });
      await registrarClique('cadastro', corretor?.id ?? null, utm);
      const whatsapp = corretor?.whatsapp ?? WHATS_PADRAO;
      res.json({
        ok: true, corretor: corretor ? { nome: corretor.nome, creci: corretor.creci, whatsapp } : null,
        whatsappUrl: `https://wa.me/${whatsapp}?text=${encodeURIComponent(msgValorComFicha(p))}`,
      });
    } catch (e) {
      console.error('[Obras] cadastro:', e);
      res.status(500).json({ ok: false, error: 'Erro ao enviar. Fale pelo WhatsApp.' });
    }
  });

  /** "Agendar visita": link de agendamento do corretor do link ou da vez */
  app.post('/api/public/obras-bom-jardim/corretor', async (req, res) => {
    try {
      const parsed = cliqueSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ ok: false, error: 'Dados inválidos' });
      const ip = ipDe(req);
      const utm = utmObras(parsed.data.utm);
      // Excesso de cliques do mesmo IP não gira o rodízio: vai para o WhatsApp padrão
      const corretor = (await corretorDoLink(parsed.data.ref)) ?? (allow(`obras:${ip}`) ? await corretorDoRodizio() : null);
      await registrarClique(parsed.data.acao, corretor?.id ?? null, utm);
      const qs = new URLSearchParams({ utm_source: utm.source, utm_campaign: utm.campaign, ...(utm.medium ? { utm_medium: utm.medium } : {}) });
      if (corretor) qs.set('c', corretor.ref);
      res.json({ ok: true, url: `/agendar/${BOM_JARDIMS_SLUG}?${qs}` });
    } catch (e) {
      console.error('[Obras] clique:', e);
      res.json({ ok: true, url: `/agendar/${BOM_JARDIMS_SLUG}` });
    }
  });
}
