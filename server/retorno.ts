/**
 * Link de retorno (/retorno/:slug?c=<ref>). O cliente que não pode falar agora marca dia, hora e tipo de
 * retorno (ligação ou visita com busca no endereço dele). O envio cria/atualiza o lead, grava o pedido em
 * leadRetornos, avisa o responsável na hora (WhatsApp/Telegram, sininho/push) e o job avisa de novo perto
 * do horário marcado — 10 min antes da ligação, 1 h antes da busca.
 */
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { getDb } from './db';
import { empreendimentos, leadQualifications, leadRetornos, leadVisitas, users } from '../drizzle/schema';
import { AgendamentoErro, donoDoLink } from './agendamento';
import { CARTAO_PADRAO } from '../shared/cartaoVendas';
import { diaValido } from '../shared/agendamento';
import { antecedenciaMs, DURACAO_MIN, gradeHorarios, livre, quandoDoRetorno, quandoTexto, rotuloTipoRetorno, type Compromisso, type PedidoRetorno } from '../shared/retorno';
import { mesmoTelefone } from './leads/mesmoTelefone';

const db = async () => {
  const d = await getDb();
  if (!d) throw new AgendamentoErro('Sistema indisponível no momento. Fale pelo WhatsApp.', 503);
  return d as any;
};

async function empreendimento(slug: string) {
  const d = await db();
  const [emp]: any[] = await d.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome, municipio: empreendimentos.municipio, uf: empreendimentos.uf })
    .from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new AgendamentoErro('Empreendimento não encontrado', 404);
  return emp;
}

/** Dados da página pública: empreendimento e o contato de quem compartilhou */
export async function dadosRetorno(slug: string, ref: string | null) {
  const emp = await empreendimento(slug);
  const dono = await donoDoLink(ref);
  return {
    empreendimento: { slug: emp.slug, nome: emp.nome, municipio: emp.municipio ?? null, uf: emp.uf ?? null },
    contato: dono?.cartao ?? CARTAO_PADRAO,
  };
}


// ─── Agenda de quem atende: retornos pendentes + visitas abertas ─────────────
const MIN = 60_000;

async function agendaDoDia(dia: string): Promise<Compromisso[]> {
  const d = await db();
  const ini = new Date(`${dia}T00:00:00-03:00`).getTime() - 4 * 3600_000, fim = ini + 32 * 3600_000;
  const rs: any[] = await d.select({ r: leadRetornos.responsavelId, q: leadRetornos.quando, t: leadRetornos.tipo, s: leadRetornos.status })
    .from(leadRetornos).where(and(gte(leadRetornos.quando, new Date(ini)), lte(leadRetornos.quando, new Date(fim))));
  const vs: any[] = await d.select({ r: leadVisitas.responsavelId, q: leadVisitas.quando, s: leadVisitas.status })
    .from(leadVisitas).where(and(gte(leadVisitas.quando, new Date(ini)), lte(leadVisitas.quando, new Date(fim))));
  return [
    ...rs.filter(x => x.s === 'pendente').map(x => ({ responsavelId: x.r ?? null, inicio: new Date(x.q).getTime(), fim: new Date(x.q).getTime() + (DURACAO_MIN[x.t] ?? 30) * MIN })),
    ...vs.filter(x => ['solicitada', 'agendada', 'confirmada'].includes(x.s)).map(x => ({ responsavelId: x.r ?? null, inicio: new Date(x.q).getTime(), fim: new Date(x.q).getTime() + DURACAO_MIN.visita * MIN })),
  ];
}

/** Quem pode atender, em ordem: o dono do link (ou o responsável do lead) e depois a roleta (quem recebeu lead há mais tempo) */
async function atendentes(preferido: number | null): Promise<number[]> {
  const d = await db();
  const todos: any[] = (await d.select().from(users)).filter((u: any) => u.ativo !== false && u.ativo !== 0 && u.perfil !== 'empreendedor');
  const { podeReceberLeads } = await import('./leads/podeReceber');
  const marcados = todos.filter(u => u.recebeLeads === true || u.recebeLeads === 1);
  const ok = await Promise.all(marcados.map(u => podeReceberLeads(u).catch(() => false)));
  const roleta = marcados.filter((_, k) => ok[k])
    .sort((a, b) => (a.ultimoLeadAt ? new Date(a.ultimoLeadAt).getTime() : 0) - (b.ultimoLeadAt ? new Date(b.ultimoLeadAt).getTime() : 0) || a.id - b.id)
    .map(u => Number(u.id));
  const lista = preferido ? [preferido, ...roleta.filter(id => id !== preferido)] : roleta;
  if (!lista.length) { const a = todos.find(u => u.role === 'admin'); if (a) lista.push(Number(a.id)); }
  return lista;
}

/** Primeiro atendente livre no horário (null = todos ocupados) */
export async function quemAtende(dia: string, hora: string, tipo: string, preferido: number | null): Promise<number | null> {
  const inicio = quandoDoRetorno(dia, hora).getTime(), fim = inicio + (DURACAO_MIN[tipo] ?? 30) * MIN;
  const agenda = await agendaDoDia(dia);
  for (const id of await atendentes(preferido)) if (livre(agenda, id, inicio, fim)) return id;
  return null;
}

/** Horários do dia com alguém livre para atender (os passados e os lotados ficam de fora) */
export async function horariosLivres(slug: string, ref: string | null, dia: string, tipo: string, agora = Date.now()): Promise<string[]> {
  if (!diaValido(dia, agora)) return [];
  await empreendimento(slug);
  const dono = await donoDoLink(ref);
  const ids = await atendentes(dono?.id ?? null);
  const agenda = await agendaDoDia(dia);
  const dur = (DURACAO_MIN[tipo] ?? 30) * MIN;
  return gradeHorarios(tipo).filter(h => {
    const ini = quandoDoRetorno(dia, h).getTime();
    return ini > agora + 30 * MIN && ids.some(id => livre(agenda, id, ini, ini + dur));
  });
}

const fone = (p: string | null | undefined) => String(p || '').replace(/\D/g, '');

/** Texto do aviso ao responsável (na hora do pedido e perto do horário) */
export function textoAviso(r: { tipo: string; nome?: string | null; phone?: string | null; quando: Date | string | number; enderecoBusca?: string | null; pessoas?: number | null; observacao?: string | null; local?: string | null; leadId: number }, fase: 'pedido' | 'lembrete', base: string): string {
  const q = new Date(r.quando);
  const hora = new Date(q.getTime() - 3 * 3600_000).toISOString();
  const quando = `${hora.slice(8, 10)}/${hora.slice(5, 7)} às ${hora.slice(11, 16)}`;
  const f = fone(r.phone);
  const cab = r.tipo === 'visita_busca'
    ? (fase === 'lembrete' ? `🚗 Hora de sair para buscar ${r.nome || 'o cliente'} — visita marcada ${quando}` : `🚗 Novo pedido de visita com busca — ${quando}`)
    : (fase === 'lembrete' ? `📞 Hora de ligar para ${r.nome || 'o cliente'} — retorno marcado ${quando}` : `📞 Novo pedido de retorno por ligação — ${quando}`);
  return [
    cab,
    `${r.nome || 'Lead'} · +${f}${r.local ? ` · ${r.local}` : ''}`,
    r.tipo === 'visita_busca' && r.enderecoBusca ? `📍 Buscar em: ${r.enderecoBusca}${r.pessoas ? ` (${r.pessoas} pessoa${r.pessoas > 1 ? 's' : ''})` : ''}` : '',
    r.observacao ? `📝 ${r.observacao}` : '',
    f ? `💬 https://wa.me/${f}` : '',
    `🔗 ${base}/leads/lead/${r.leadId}`,
  ].filter(Boolean).join('\n');
}

/** Mensagem de confirmação ao cliente */
export function textoConfirmacao(p: PedidoRetorno, nomeResp: string | null): string {
  const primeiro = p.nome.trim().split(/\s+/)[0];
  const q = quandoTexto(p.dia, p.hora);
  const quem = nomeResp ? `Aqui é ${nomeResp}. ` : '';
  return p.tipo === 'visita_busca'
    ? `Olá, ${primeiro}! ${quem}Recebi seu pedido de visita com busca para ${q}. Vamos buscar vocês em: ${p.enderecoBusca}. Antes de sair eu te chamo por aqui para confirmar. 🚗`
    : `Olá, ${primeiro}! ${quem}Combinado: eu te ligo em ${q}. Se precisar mudar o horário, é só me avisar por aqui. 📞`;
}

/** Envio do formulário: lead + pedido de retorno + avisos */
export async function registrarRetorno(slug: string, p: PedidoRetorno, ip?: string | null, agora = Date.now()) {
  if (!diaValido(p.dia, agora)) throw new AgendamentoErro('Escolha um dia a partir de hoje (até 90 dias).');
  const quando = quandoDoRetorno(p.dia, p.hora);
  if (quando.getTime() < agora - 5 * 60_000) throw new AgendamentoErro('Esse horário já passou. Escolha um horário mais à frente.');
  const emp = await empreendimento(slug);
  const dono = await donoDoLink(p.ref || null);
  const { ingestLead } = await import('./lead-intake');
  const answers: Record<string, string> = {
    'tipo de retorno': rotuloTipoRetorno(p.tipo),
    'retorno em': quandoTexto(p.dia, p.hora),
    ...(p.tipo === 'visita_busca' && p.enderecoBusca ? { 'endereço de busca': p.enderecoBusca } : {}),
    ...(p.tipo === 'visita_busca' && p.pessoas ? { 'pessoas na visita': String(p.pessoas) } : {}),
    ...(p.observacao ? { observação: p.observacao } : {}),
  };
  const r = await ingestLead({
    nome: p.nome, phone: p.telefone, origem: 'site', campanha: 'Link de retorno', empreendimentoSlug: emp.slug,
    answers, funil: 'comprador', responsavelId: dono?.id ?? null, semBoasVindas: true,
    consentimento: { at: new Date(agora).toISOString(), texto: 'Aceito ser contatado(a) no horário que escolhi.', origem: 'link_retorno', ...(ip ? { ip } : {}) },
  } as any);
  if (!r.ok) {
    if (r.reason === 'invalid_phone') throw new AgendamentoErro('Informe um celular válido com DDD.');
    if (r.reason === 'db_unavailable') throw new AgendamentoErro('Sistema indisponível no momento. Fale pelo WhatsApp.', 503);
    return { ok: true as const, retornoId: null, leadId: null, confirmacao: null as string | null };
  }
  const d = await db();
  const [lead]: any[] = await d.select().from(leadQualifications).where(mesmoTelefone(leadQualifications.phone, r.phone)).limit(1);
  if (!lead) return { ok: true as const, retornoId: null, leadId: null, confirmacao: null as string | null };
  // Quem atende: o responsável do lead (ou o dono do link); se ele já tem compromisso nesse horário, o próximo livre da roleta
  const preferido: number | null = lead.responsavelId ?? dono?.id ?? null;
  const livreId = await quemAtende(p.dia, p.hora, p.tipo, preferido);
  if (!livreId) throw new AgendamentoErro('Esse horário acabou de ser ocupado. Escolha outro horário, por favor.', 409);
  const responsavelId: number = livreId;
  const redistribuido = !!preferido && preferido !== responsavelId;
  if (lead.responsavelId !== responsavelId) {
    await d.update(leadQualifications).set({ responsavelId, updatedAt: new Date(agora) } as any).where(eq(leadQualifications.id, lead.id));
    if (redistribuido || lead.responsavelId == null) {
      const { registrarEncaminhamento } = await import('./leads/distribuicao');
      await registrarEncaminhamento({ leadId: lead.id, deId: lead.responsavelId ?? null, paraId: responsavelId, origem: 'automatico',
        observacao: redistribuido ? `Agenda: horário ${quandoTexto(p.dia, p.hora)} ocupado — retorno distribuído` : 'Link de retorno' });
      if (redistribuido) await d.update(users).set({ ultimoLeadAt: new Date(agora) } as any).where(eq(users.id, responsavelId));
    }
  }
  const ins: any = await d.insert(leadRetornos).values({
    leadId: lead.id, tipo: p.tipo, quando, enderecoBusca: p.tipo === 'visita_busca' ? (p.enderecoBusca || null) : null,
    pessoas: p.tipo === 'visita_busca' ? (p.pessoas ?? null) : null, observacao: p.observacao || null, local: emp.nome,
    status: 'pendente', responsavelId, createdAt: new Date(agora), updatedAt: new Date(agora),
  } as any);
  const retornoId = Number(ins?.[0]?.insertId ?? ins?.insertId ?? ins?.lastInsertRowid ?? 0) || null;

  let nomeResp: string | null = null;
  if (responsavelId) {
    const [u]: any[] = await d.select({ name: users.name }).from(users).where(eq(users.id, responsavelId)).limit(1);
    nomeResp = u?.name ? String(u.name).trim().split(/\s+/)[0] : null;
  }
  const confirmacao = textoConfirmacao(p, nomeResp);
  const { enviarMensagemSistema, zapiDisponivel } = await import('./lead-intake');
  if (zapiDisponivel()) {
    const ok = await enviarMensagemSistema(r.phone, confirmacao, p.nome).catch(() => false);
    if (ok) {
      const { registrarMensagem } = await import('./leads/qualificacaoService');
      await registrarMensagem(lead.id, 'out', 'sistema', confirmacao).catch(() => {});
    }
  }

  const { appUrl } = await import('./leads/config');
  const aviso = textoAviso({ ...p, phone: r.phone, quando, local: emp.nome, leadId: lead.id, pessoas: p.pessoas ?? null }, 'pedido', appUrl());
  const { avisarCorretor } = await import('./leads/visitas');
  await avisarCorretor(responsavelId, aviso).catch(e => console.warn('[Retorno] aviso ao responsável:', e?.message));
  if (redistribuido && preferido) {
    const [u]: any[] = await d.select({ name: users.name }).from(users).where(eq(users.id, responsavelId)).limit(1);
    await avisarCorretor(preferido, `🔀 Você já tinha compromisso ${quandoTexto(p.dia, p.hora)}. O retorno de ${p.nome} (${rotuloTipoRetorno(p.tipo)}) foi distribuído para ${u?.name || 'outro corretor'}.`)
      .catch(() => {});
  }
  {
    const { notificarAgendamento } = await import('./notificacoes');
    await notificarAgendamento({
      responsavelId, leadId: lead.id, cliente: p.nome, empreendimentoId: emp.id, empreendimentoNome: emp.nome,
      quando: quandoTexto(p.dia, p.hora), detalhe: rotuloTipoRetorno(p.tipo),
    }).catch(e => console.warn('[Retorno] sininho/push:', e?.message));
  }
  console.log(`[Retorno] ${emp.slug}: lead ${lead.id} → ${p.tipo} ${quandoTexto(p.dia, p.hora)} · responsável ${responsavelId ?? '-'}`);
  return { ok: true as const, retornoId, leadId: lead.id as number, confirmacao, responsavelId, redistribuido };
}

/** Uma rodada do job: avisa o responsável perto do horário de cada retorno pendente (uma vez só) */
export async function processarRetornos(agora = Date.now()): Promise<number> {
  const d = await getDb() as any;
  if (!d) return 0;
  const { linhasAfetadas } = await import('./leads/rotinas');
  const { appUrl } = await import('./leads/config');
  const proximos: any[] = await d.select().from(leadRetornos)
    .where(and(eq(leadRetornos.status, 'pendente'), isNull(leadRetornos.avisoAt), gte(leadRetornos.quando, new Date(agora - 6 * 3600_000)), lte(leadRetornos.quando, new Date(agora + 2 * 3600_000))))
    .limit(100);
  let n = 0;
  for (const r of proximos) {
    if (new Date(r.quando).getTime() - antecedenciaMs(r.tipo) > agora) continue;
    const res = await d.update(leadRetornos).set({ avisoAt: new Date(agora) } as any).where(and(eq(leadRetornos.id, r.id), isNull(leadRetornos.avisoAt)));
    if (linhasAfetadas(res) === 0) continue;
    const [l]: any[] = await d.select({ nome: leadQualifications.nome, phone: leadQualifications.phone }).from(leadQualifications).where(eq(leadQualifications.id, r.leadId)).limit(1);
    const { avisarCorretor } = await import('./leads/visitas');
    await avisarCorretor(r.responsavelId, textoAviso({ ...r, nome: l?.nome, phone: l?.phone }, 'lembrete', appUrl()))
      .catch(e => console.warn(`[Retornos] aviso do retorno ${r.id}:`, e?.message));
    n++;
  }
  return n;
}

let timer: NodeJS.Timeout | null = null;
export function iniciarJobRetornos(intervaloMs = 60_000) {
  if (timer) return;
  import('./leads/rotinas').then(({ registrarRotina, rodarRotina, ROTULO_ROTINA }) => {
    ROTULO_ROTINA.retornos = 'Avisos de retorno (link)';
    registrarRotina('retornos', intervaloMs);
    timer = setInterval(() => { void rodarRotina('retornos', () => processarRetornos()); }, intervaloMs);
  }).catch(e => console.warn('[Retornos] Job não iniciado:', e?.message));
  console.log('[Retornos] Avisos do link de retorno ativos');
}
