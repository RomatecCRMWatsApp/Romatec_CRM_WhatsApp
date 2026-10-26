/**
 * Fila de reservas do escritório (administrador e secretária): chácaras em interesse, reservadas ou com entrada que
 * precisam de alguém do escritório — reserva de 72 h vencida (o site já mostra a chácara livre, mas o CRM segue
 * "reservado"), corretor sem acesso (pausado pela assinatura, cancelado ou desativado) ou sem corretor.
 * Ações: passar para outro corretor habilitado, assumir pelo escritório, prorrogar 72 h e liberar (sem contrato ligado —
 * contrato se cancela pelo fluxo próprio, com senha). Tudo vai para o histórico da chácara.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { acessosCorretor, contratos, empreendimentos, leadQualifications, loteHistorico, lotes, saasAssinaturas, users } from '../../drizzle/schema';
import { ROTULO_SITUACAO, statusPublicoDe, type SituacaoLote } from '../../shared/lotes';
import { perfilDe } from '../../shared/equipe';

export class FilaErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'FilaErro'; } }

/** Situações que seguram a chácara para um cliente */
export const ATIVAS: SituacaoLote[] = ['interesse', 'reservado', 'entrada'];
export const HORAS_RESERVA = 72;
const H = 3_600_000;

export type MotivoFila = 'vencida' | 'corretor_sem_acesso' | 'sem_corretor';
export const ROTULO_MOTIVO: Record<MotivoFila, string> = {
  vencida: 'Reserva de 72 h vencida', corretor_sem_acesso: 'Corretor sem acesso', sem_corretor: 'Sem corretor',
};

/** Por que a reserva precisa do escritório (null = segue com o corretor) */
export function motivoFila(l: { situacao: string; reservadoAte?: Date | string | null; corretorId?: number | null }, corretorAtivo: boolean | null, agora = Date.now()): MotivoFila | null {
  if (l.situacao === 'reservado' && l.reservadoAte && new Date(l.reservadoAte).getTime() < agora) return 'vencida';
  if (!l.corretorId) return 'sem_corretor';
  if (corretorAtivo === false) return 'corretor_sem_acesso';
  return null;
}

const banco = async () => {
  const d = await getDb();
  if (!d) throw new FilaErro('Banco indisponível', 503);
  return d as any;
};
const ativo = (u: any) => u && u.ativo !== false && u.ativo !== 0;

export async function listarReservas(agora = Date.now()) {
  const d = await banco();
  const rows: any[] = await d.select().from(lotes).where(inArray(lotes.situacao, ATIVAS as string[]));
  const emps: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos);
  const E = new Map(emps.map(e => [Number(e.id), e]));
  const us: any[] = await d.select().from(users);
  const U = new Map(us.map(u => [Number(u.id), u]));
  const bloqueados = new Set(((await d.select({ usuarioId: saasAssinaturas.usuarioId, status: saasAssinaturas.status }).from(saasAssinaturas)) as any[])
    .filter(a => ['BLOQUEADO', 'CANCELADA'].includes(String(a.status))).map(a => Number(a.usuarioId)));
  const leadIds = Array.from(new Set(rows.map(r => r.leadId).filter(Boolean))) as number[];
  const leads: any[] = leadIds.length ? await d.select({ id: leadQualifications.id, nome: leadQualifications.nome }).from(leadQualifications).where(inArray(leadQualifications.id, leadIds)) : [];
  const L = new Map(leads.map(l => [Number(l.id), l.nome]));
  const cIds = Array.from(new Set(rows.map(r => r.contratoReservaId).filter(Boolean))) as number[];
  const cs: any[] = cIds.length ? await d.select({ id: contratos.id, numero: contratos.numero, status: contratos.status }).from(contratos).where(inArray(contratos.id, cIds)) : [];
  const C = new Map(cs.map(c => [Number(c.id), c]));

  const itens = rows.map(r => {
    const corretor = r.corretorId ? U.get(Number(r.corretorId)) : null;
    const corretorAtivo = r.corretorId ? !!(ativo(corretor) && !bloqueados.has(Number(r.corretorId))) : null;
    const motivo = motivoFila(r, corretorAtivo, agora);
    const vence = r.situacao === 'reservado' && r.reservadoAte ? new Date(r.reservadoAte).getTime() : null;
    const emp = E.get(Number(r.empreendimentoId));
    const contrato = r.contratoReservaId ? C.get(Number(r.contratoReservaId)) ?? null : null;
    return {
      loteId: Number(r.id), codigo: r.codigo as string, empreendimento: emp?.nome ?? '', slug: emp?.slug ?? '', empreendimentoId: Number(r.empreendimentoId),
      situacao: r.situacao as SituacaoLote, rotuloSituacao: ROTULO_SITUACAO[r.situacao as SituacaoLote] ?? r.situacao,
      cliente: (r.leadId && L.get(Number(r.leadId))) || r.clienteNome || null,
      corretorId: r.corretorId ? Number(r.corretorId) : null, corretorNome: corretor?.name ?? null, corretorAtivo,
      contrato: contrato ? { id: Number(contrato.id), numero: contrato.numero as string, status: contrato.status as string } : null,
      reservadoAte: vence ? new Date(vence).toISOString() : null, horasRestantes: vence ? Math.round((vence - agora) / H) : null,
      desde: r.dataSituacao ? new Date(r.dataSituacao).toISOString() : null, observacao: r.observacao ?? null,
      motivo, rotuloMotivo: motivo ? ROTULO_MOTIVO[motivo] : null,
    };
  });
  // Na fila primeiro (vencidas, depois sem acesso, depois sem corretor); o resto pelo prazo mais curto
  const ordem: Record<string, number> = { vencida: 0, corretor_sem_acesso: 1, sem_corretor: 2 };
  itens.sort((a, b) => (ordem[a.motivo ?? ''] ?? 9) - (ordem[b.motivo ?? ''] ?? 9) || (a.horasRestantes ?? 1e9) - (b.horasRestantes ?? 1e9) || a.codigo.localeCompare(b.codigo));
  return { fila: itens.filter(i => i.motivo), todas: itens };
}

/** Corretores ativos (com acesso) habilitados no empreendimento — para passar a reserva */
export async function corretoresHabilitados(empreendimentoId: number) {
  const d = await banco();
  const hab: any[] = await d.select({ usuarioId: acessosCorretor.usuarioId }).from(acessosCorretor)
    .where(and(eq(acessosCorretor.tipo, 'empreendimento' as any), eq(acessosCorretor.refId, empreendimentoId)));
  const ids = new Set(hab.map(h => Number(h.usuarioId)));
  const bloqueados = new Set(((await d.select({ usuarioId: saasAssinaturas.usuarioId, status: saasAssinaturas.status }).from(saasAssinaturas)) as any[])
    .filter(a => ['BLOQUEADO', 'CANCELADA'].includes(String(a.status))).map(a => Number(a.usuarioId)));
  const us: any[] = await d.select().from(users);
  return us.filter(u => perfilDe(u) === 'corretor' && ativo(u) && ids.has(Number(u.id)) && !bloqueados.has(Number(u.id)))
    .map(u => ({ id: Number(u.id), nome: String(u.name ?? '—') })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type AcaoFila =
  | { tipo: 'reatribuir'; corretorId: number }
  | { tipo: 'assumir' }
  | { tipo: 'prorrogar' }
  | { tipo: 'liberar'; motivo: string };

export async function acaoReserva(loteId: number, acao: AcaoFila, autorId: number, agora = Date.now()) {
  const d = await banco();
  const [l]: any[] = await d.select().from(lotes).where(eq(lotes.id, loteId)).limit(1);
  if (!l) throw new FilaErro('Chácara não encontrada', 404);
  if (!ATIVAS.includes(l.situacao)) throw new FilaErro(`A chácara ${l.codigo} não está mais reservada (${ROTULO_SITUACAO[l.situacao as SituacaoLote] ?? l.situacao}).`, 409);
  const historico = (para: string, detalhe: string, corretorId: number | null = l.corretorId ?? null) =>
    d.insert(loteHistorico).values({ loteId: l.id, de: l.situacao, para, leadId: l.leadId ?? null, corretorId, usuarioId: autorId, detalhe: detalhe.slice(0, 500), createdAt: new Date(agora) } as any);

  if (acao.tipo === 'reatribuir') {
    const ok = (await corretoresHabilitados(Number(l.empreendimentoId))).find(c => c.id === acao.corretorId);
    if (!ok) throw new FilaErro('Escolha um corretor ativo e habilitado neste empreendimento');
    await d.update(lotes).set({ corretorId: ok.id, updatedAt: new Date(agora) } as any).where(eq(lotes.id, l.id));
    // O lead do cliente vai junto para o novo corretor (o contrato continua o mesmo)
    if (l.leadId) await d.update(leadQualifications).set({ responsavelId: ok.id, updatedAt: new Date(agora) } as any).where(eq(leadQualifications.id, l.leadId));
    await historico(l.situacao, `Fila do escritório: reserva passada para ${ok.nome}`, ok.id);
    return { ok: true as const, mensagem: `Chácara ${l.codigo} agora com ${ok.nome}` };
  }
  if (acao.tipo === 'assumir') {
    await d.update(lotes).set({ corretorId: null, updatedAt: new Date(agora) } as any).where(eq(lotes.id, l.id));
    await historico(l.situacao, 'Fila do escritório: reserva assumida pelo escritório', null);
    return { ok: true as const, mensagem: `Chácara ${l.codigo} com o escritório` };
  }
  if (acao.tipo === 'prorrogar') {
    if (l.situacao !== 'reservado') throw new FilaErro('Só reserva (sem entrada) tem o prazo de 72 h');
    const base = Math.max(agora, l.reservadoAte ? new Date(l.reservadoAte).getTime() : 0);
    const ate = new Date(base + HORAS_RESERVA * H);
    await d.update(lotes).set({ reservadoAte: ate, status: statusPublicoDe('reservado'), updatedAt: new Date(agora) } as any).where(eq(lotes.id, l.id));
    await historico('reservado', `Fila do escritório: reserva prorrogada até ${ate.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}`);
    return { ok: true as const, mensagem: `Reserva da ${l.codigo} prorrogada por ${HORAS_RESERVA} h` };
  }
  // liberar
  if (!acao.motivo?.trim() || acao.motivo.trim().length < 3) throw new FilaErro('Informe o motivo para liberar');
  if (l.contratoReservaId) {
    const [c]: any[] = await d.select({ numero: contratos.numero, status: contratos.status }).from(contratos).where(eq(contratos.id, l.contratoReservaId)).limit(1);
    if (c && !['cancelado', 'distratado'].includes(String(c.status))) {
      throw new FilaErro(`A chácara ${l.codigo} está presa ao contrato ${c.numero}. Para liberar, cancele o contrato pela tela dele.`, 409);
    }
  }
  await d.update(lotes).set({
    situacao: 'disponivel', status: statusPublicoDe('disponivel'), comercializavel: true, contratoReservaId: null, reservadoAte: null,
    leadId: null, corretorId: null, clienteNome: null, valorVenda: null, valorEntrada: null, numParcelas: null, dataSituacao: new Date(agora), updatedAt: new Date(agora),
  } as any).where(eq(lotes.id, l.id));
  await historico('disponivel', `Fila do escritório: chácara liberada — ${acao.motivo.trim()}`, null);
  return { ok: true as const, mensagem: `Chácara ${l.codigo} liberada` };
}
