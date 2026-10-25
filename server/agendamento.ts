/**
 * Link de agendamento por empreendimento (/agendar/:slug?c=<ref>). A página pública mostra as condições e o
 * contato de quem compartilhou; o envio cria (ou atualiza) o lead pelo ingestLead — com o aviso no Telegram/
 * WhatsApp que já existe —, grava o pedido na agenda (leadVisitas "solicitada"), atribui o lead a quem
 * compartilhou (sem ref: o administrador) e avisa essa pessoa no sininho, no push e no WhatsApp.
 */
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { condicoesPagamento, empJuridico, empreendimentos, leadQualifications, leadVisitas, lotes, users } from '../drizzle/schema';
import { condicoesDaLinha, simular, type CondicoesPagamento } from '../shared/simulador';
import { perfilDe } from '../shared/equipe';
import { CARTAO_PADRAO, cartaoDe, type CartaoVendas } from '../shared/cartaoVendas';
import {
  diaValido, observacaoDoPedido, quandoDoPedido, respostasDoPedido, rotuloHorario, type PedidoAgendamento,
} from '../shared/agendamento';
import { usuarioDaRef } from './cartaoVendas';

export class AgendamentoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'AgendamentoErro'; } }

const db = async () => {
  const d = await getDb();
  if (!d) throw new AgendamentoErro('Sistema indisponível no momento. Fale pelo WhatsApp.', 503);
  return d as any;
};
const json = <T>(v: unknown): T | null => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : (v as T));

const camposUsuario = {
  id: users.id, name: users.name, role: users.role, perfil: (users as any).perfil, creci: users.creci, creciUf: (users as any).creciUf,
  telefone: (users as any).telefone, email: users.email, fotoUrl: (users as any).fotoUrl, ativo: users.ativo,
};

/** Dono do link: corretor/secretária/admin ativo da ref; sem ref válida (ou empreendedor), o administrador */
export async function donoDoLink(ref: string | null | undefined): Promise<{ id: number; cartao: CartaoVendas } | null> {
  const d = await db();
  const id = ref ? usuarioDaRef(ref) : null;
  if (id) {
    const [u]: any[] = await d.select(camposUsuario).from(users).where(eq(users.id, id)).limit(1);
    const perfil = u ? perfilDe(u) : null;
    if (u && u.ativo !== false && u.ativo !== 0 && perfil && perfil !== 'empreendedor') return { id: u.id, cartao: cartaoDe(u, perfil) };
  }
  const admins: any[] = (await d.select(camposUsuario).from(users).where(eq(users.role, 'admin'))).filter((a: any) => a.ativo !== false && a.ativo !== 0);
  const a = admins.find(x => x.creci) ?? admins[0];
  return a ? { id: a.id, cartao: cartaoDe(a, 'admin') } : null;
}

async function empreendimentoPublico(slug: string) {
  const d = await db();
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new AgendamentoErro('Empreendimento não encontrado', 404);
  return emp;
}

/** Dados da página: empreendimento, condições (do simulador) e o contato de quem compartilhou */
export async function dadosDaPagina(slug: string, ref: string | null) {
  const d = await db();
  const emp = await empreendimentoPublico(slug);
  // Condição vigente (filtro do "ativo" em JS: o SQLite dos testes não aceita booleano no WHERE)
  const conds: any[] = await d.select().from(condicoesPagamento).where(eq(condicoesPagamento.empreendimentoId, emp.id));
  const cond = conds.filter(x => x.ativo === true || Number(x.ativo) === 1)
    .sort((x, y) => String(y.vigenteDesde).localeCompare(String(x.vigenteDesde)) || y.id - x.id)[0];
  const c = cond ? (condicoesDaLinha(cond) as CondicoesPagamento) : null;
  const ls: any[] = await d.select({ codigo: lotes.codigo, areaM2: lotes.areaM2, precoTabela: lotes.precoTabela, situacao: lotes.situacao, comercializavel: lotes.comercializavel })
    .from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const vendaveis = ls.filter(l => (l.comercializavel === true || Number(l.comercializavel) === 1) && Number(l.areaM2) > 0);
  const disponiveis = vendaveis.filter(l => (l.situacao || 'disponivel') === 'disponivel').map(l => l.codigo as string).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  let condicoes = null as null | Record<string, number>;
  if (c && vendaveis.length) {
    const sims = vendaveis.map(l => simular(Number(l.areaM2), c.entradaMaxParcelas, c, l.precoTabela != null ? Number(l.precoTabela) : null));
    const prazoMax = Math.max(...c.prazos);
    condicoes = {
      areaMin: Math.min(...vendaveis.map(l => Number(l.areaM2))), entradaPct: c.entradaPct, entradaMaxParcelas: c.entradaMaxParcelas,
      descontoEntradaPct: c.descontoAvistaPct, prazoMax, descontoAvistaTotal: c.descontoAvistaTotal, jurosAa: c.jurosAaEfetivo,
      parcelaMin: Math.min(...sims.map(s => s.planos.find(p => p.prazo === prazoMax)!.parcela)),
    };
  }
  const [j]: any[] = await d.select({ defaultsJson: empJuridico.defaultsJson }).from(empJuridico).where(eq(empJuridico.empreendimentoId, emp.id)).limit(1);
  const def = json<Record<string, string>>(j?.defaultsJson) ?? {};
  const dono = await donoDoLink(ref);
  return {
    empreendimento: { slug: emp.slug, nome: emp.nome, municipio: emp.municipio ?? null, uf: emp.uf ?? null, areaHa: def.emp_area_ha ?? null },
    condicoes,
    licenca: def.emp_licenca_ambiental ? { texto: def.emp_licenca_ambiental, orgao: def.emp_licenca_orgao ?? null } : null,
    sigef: !!def.emp_sigef,
    disponiveis,
    contato: dono?.cartao ?? CARTAO_PADRAO,
  };
}

/** Envio do formulário: lead + pedido na agenda + avisos */
export async function registrarAgendamento(slug: string, p: PedidoAgendamento, ip?: string | null, agora = Date.now()) {
  if (!diaValido(p.dia, agora)) throw new AgendamentoErro('Escolha um dia a partir de hoje (até 90 dias).');
  const emp = await empreendimentoPublico(slug);
  const dono = await donoDoLink(p.ref || null);
  const { ingestLead } = await import('./lead-intake');
  const r = await ingestLead({
    nome: p.nome, phone: p.telefone, origem: 'site', campanha: 'Link de agendamento', empreendimentoSlug: emp.slug,
    loteCodigo: /^[A-Z]\d{2}$/i.test(p.unidade || '') ? p.unidade!.toUpperCase() : undefined,
    answers: respostasDoPedido(p), funil: 'comprador',
    consentimento: { at: new Date(agora).toISOString(), texto: 'Aceito ser contatado(a) sobre o agendamento e o empreendimento.', origem: 'link_agendamento', ...(ip ? { ip } : {}) },
  });
  if (!r.ok) {
    if (r.reason === 'invalid_phone') throw new AgendamentoErro('Informe um celular válido com DDD.');
    if (r.reason === 'db_unavailable') throw new AgendamentoErro('Sistema indisponível no momento. Fale pelo WhatsApp.', 503);
    // Bloqueado/duplicado: não revela ao público
    return { ok: true as const, leadId: null, visitaId: null, responsavelId: null };
  }
  const d = await db();
  const [lead]: any[] = await d.select().from(leadQualifications).where(eq(leadQualifications.phone, r.phone)).limit(1);
  if (!lead) return { ok: true as const, leadId: null, visitaId: null, responsavelId: null };
  // Atribuição: lead novo ou sem responsável → dono do link; lead que já tem corretor continua com ele
  let responsavelId: number | null = lead.responsavelId ?? null;
  if (!responsavelId && dono) {
    responsavelId = dono.id;
    await d.update(leadQualifications).set({ responsavelId, updatedAt: new Date(agora) } as any).where(eq(leadQualifications.id, lead.id));
  }
  const quando = quandoDoPedido(p.dia, p.horario);
  const vr: any = await d.insert(leadVisitas).values({
    leadId: lead.id, quando, local: emp.nome, status: 'solicitada', observacao: observacaoDoPedido(p),
    responsavelId, criadoPor: null, createdAt: new Date(agora), updatedAt: new Date(agora),
  } as any);
  const visitaId = Number(vr?.[0]?.insertId ?? vr?.insertId ?? vr?.lastInsertRowid ?? 0) || null;

  const quandoTexto = `${p.dia.split('-').reverse().join('/')}, ${rotuloHorario(p.horario)}`;
  if (responsavelId) {
    const { notificarAgendamento } = await import('./notificacoes');
    await notificarAgendamento({
      responsavelId, leadId: lead.id, cliente: p.nome, empreendimentoId: emp.id, empreendimentoNome: emp.nome, quando: quandoTexto,
      detalhe: `${p.pessoas} pessoa(s), ${respostasDoPedido(p)['forma de pagamento']}`,
    }).catch(e => console.warn('[Agendamento] sininho/push:', e?.message));
    const { avisarPedidoDeAgendamento } = await import('./leads/visitas');
    if (visitaId) await avisarPedidoDeAgendamento(visitaId).catch(e => console.warn('[Agendamento] WhatsApp do responsável:', e?.message));
  }
  console.log(`[Agendamento] ${emp.slug}: lead ${lead.id} (${r.created ? 'novo' : 'existente'}) → responsável ${responsavelId ?? '-'} · ${quandoTexto}`);
  return { ok: true as const, leadId: lead.id as number, visitaId, responsavelId };
}
