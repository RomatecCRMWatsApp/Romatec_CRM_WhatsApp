/**
 * Página de oferta (/o/:slug?l=token): o link que o robô manda. Mostra as condições, o simulador por chácara livre, a
 * contagem de disponíveis ao vivo e o corretor do lead. Com o token, conta a abertura (quem abriu e quantas vezes).
 * Só números do simulador; nada da negociação interna (cliente, corretor de outra chácara etc.).
 */
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { leadEventos, leadQualifications, linksOferta, users } from '../../drizzle/schema';
import { avisoLegal, variaveisDaOferta } from '../../shared/autoresposta';
import { precoLote, simular } from '../../shared/simulador';
import { CARTAO_PADRAO, cartaoDe } from '../../shared/cartaoVendas';
import { perfilDe } from '../../shared/equipe';
import { contextoDoEmpreendimento } from './motor';

export class OfertaErro extends Error { constructor(msg: string, public status = 404) { super(msg); this.name = 'OfertaErro'; } }

const banco = async () => { const d = await getDb(); if (!d) throw new OfertaErro('Sistema indisponível no momento.', 503); return d as any; };

/** Conta a abertura do link pessoal; devolve o lead (só id, nome, responsável e chácara) ou null */
export async function registrarAbertura(token: string, empreendimentoId: number, agora = Date.now()) {
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(token)) return null;
  const d = await banco();
  const [l]: any[] = await d.select().from(linksOferta).where(eq(linksOferta.token, token)).limit(1);
  if (!l || Number(l.empreendimentoId) !== empreendimentoId) return null;
  await d.update(linksOferta).set({
    aberturas: sql`${linksOferta.aberturas} + 1`, ultimaAberturaAt: new Date(agora), ...(l.primeiraAberturaAt ? {} : { primeiraAberturaAt: new Date(agora) }),
  } as any).where(eq(linksOferta.token, token));
  await d.insert(leadEventos).values({ leadId: l.leadId, tipo: 'abriu_oferta', dados: { vez: (Number(l.aberturas) || 0) + 1 }, createdAt: new Date(agora) } as any).catch(() => {});
  const [lead]: any[] = await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, responsavelId: leadQualifications.responsavelId, loteCodigo: leadQualifications.loteCodigo })
    .from(leadQualifications).where(eq(leadQualifications.id, l.leadId)).limit(1);
  return lead ?? null;
}

export async function dadosDaOferta(slug: string, token: string | null, agora = Date.now()) {
  const ctx = await contextoDoEmpreendimento(slug);
  if (!ctx) throw new OfertaErro('Página não encontrada');
  if (!ctx.cond) throw new OfertaErro('Oferta indisponível no momento', 404);
  const lead = token ? await registrarAbertura(token, ctx.emp.id, agora).catch(() => null) : null;

  // Contato: o corretor do lead; sem ele, o padrão do escritório
  let contato = CARTAO_PADRAO;
  if (lead?.responsavelId) {
    const d = await banco();
    const [u]: any[] = await d.select().from(users).where(eq(users.id, lead.responsavelId)).limit(1);
    const perfil = u ? perfilDe(u) : null;
    if (u && u.ativo !== false && u.ativo !== 0 && perfil && perfil !== 'empreendedor') contato = cartaoDe(u, perfil);
  }

  const c = ctx.cond;
  const ent = Math.min(ctx.cfg.entradaParcelas, c.entradaMaxParcelas);
  const livres = ctx.lotes.filter(l => l.situacao === 'disponivel' && l.areaM2 > 0).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const ancora = livres.find(l => l.codigo === (lead?.loteCodigo || ctx.cfg.loteAncora)) ?? null;
  const area = ancora?.areaM2 || c.areaBaseM2;
  const sim = simular(area, ent, c, ancora?.precoTabela ?? precoLote(area, c));
  const vars = variaveisDaOferta({ sim, c, disponiveis: livres.length, condicaoValidaAte: ctx.cfg.condicaoValidaAte, entradaParcelas: ent });
  const { numeroWhatsAppLeads } = await import('../leads/config');
  return {
    empreendimento: { slug: ctx.emp.slug, nome: ctx.emp.nome },
    nome: lead?.nome ? String(lead.nome).trim().split(/\s+/)[0] : null,
    // Comissão é interna: não vai para a página pública
    condicoes: { ...c, comissaoTotalPct: 0, comissaoCorretorPct: 0, comissao1aParcelaPct: 0 }, entradaParcelas: ent,
    validade: vars.validade_condicao,
    aviso: avisoLegal(vars, ctx.cfg.avisoLegal),
    disponiveis: livres.length,
    lotes: livres.map(l => ({ codigo: l.codigo, areaM2: l.areaM2, preco: l.precoTabela ?? precoLote(l.areaM2, c) })),
    sugerida: ancora?.codigo ?? null,
    contato,
    whatsapp: numeroWhatsAppLeads(),
    imagem: ctx.midias.OFERTA?.url ?? null,
  };
}

/** Contagem ao vivo (a página consulta de minuto em minuto, sem contar abertura) */
export async function disponiveisAgora(slug: string): Promise<{ disponiveis: number; livres: string[] }> {
  const ctx = await contextoDoEmpreendimento(slug);
  if (!ctx) throw new OfertaErro('Página não encontrada');
  const livres = ctx.lotes.filter(l => l.situacao === 'disponivel' && l.areaM2 > 0).map(l => l.codigo).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  return { disponiveis: livres.length, livres };
}
