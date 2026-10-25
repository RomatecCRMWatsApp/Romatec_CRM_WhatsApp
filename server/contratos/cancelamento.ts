/**
 * Trava de cancelamento (v1.14). Regras do José:
 * - só o ADMINISTRADOR cancela contrato, cobrança ou recibo — e confirma com a SENHA DE LOGIN dele (step-up);
 * - corretor/secretária só SOLICITAM: o pedido vai para o sininho/push do administrador, que cancela ele mesmo;
 * - tudo fica na auditoria (financeiroAuditoria, só INSERT): quem pediu, quem cancelou, quando e o motivo;
 * - cancelar não apaga nada: contrato fica "cancelado" com o histórico, a chácara volta a disponível
 *   (aviso de "lote liberado") e as cobranças futuras não pagas são canceladas no Asaas (com a chave configurada).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratoPessoas, contratoSolicitacoes, contratos, lotes, loteHistorico, pessoas, recibos, users } from '../../drizzle/schema';
import { statusPublicoDe } from '../../shared/lotes';
import { perfilDe } from '../../shared/equipe';
import { checkLogin } from '../auth-security';
import { auditar, slugDoContrato } from '../financeiro/servico';
import { cancelarCobranca as cancelarNoAsaas, configAsaas } from '../financeiro/asaas';
import { ContratoErro, contratoPorId } from './servico';

const db = async () => {
  const d = await getDb();
  if (!d) throw new ContratoErro('DB', 'Banco indisponível', 503);
  return d as any;
};
const afetadas = (r: any): number => Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? r?.rowsAffected ?? 0);
const hojeBrasil = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export interface Ator { id: number; name?: string | null; role?: string | null; perfil?: string | null }

// ─── Step-up: senha de login do próprio administrador ────────────────────────────────────

const LIMITE_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60_000;
const tentativas = new Map<number, { falhas: number; ate: number }>();

/** Só o administrador; a senha é a de login dele (sem senha separada). 5 erros → 15 min bloqueado. */
export async function exigirAdminComSenha(ator: Ator, senha: string, acao: string, ref: { contratoId?: number | null; cobrancaId?: number | null; ip?: string | null } = {}) {
  if (perfilDe(ator as any) !== 'admin') {
    await auditar('seguranca.acao_negada', { ...ref, usuarioId: ator.id, origem: 'perfil', detalhe: { acao, perfil: perfilDe(ator as any) } });
    throw new ContratoErro('SO_ADMIN', 'Só o administrador pode cancelar contrato, cobrança ou recibo.', 403);
  }
  const t = tentativas.get(ator.id);
  if (t && t.ate > Date.now()) throw new ContratoErro('SENHA_BLOQUEADA', 'Muitas tentativas com a senha errada. Aguarde 15 minutos.', 429);
  const d = await db();
  const [u]: any[] = await d.select({ scrypt: users.passwordScrypt, sha: users.passwordHash }).from(users).where(eq(users.id, ator.id)).limit(1);
  // Sem a senha inicial do ambiente: o step-up confere só a senha cadastrada do administrador
  const ok = !!u && (u.scrypt || u.sha) && (await checkLogin(String(senha ?? ''), { scryptHash: u.scrypt, legacySha256: u.sha }, '')).ok;
  if (!ok) {
    // Bloqueio vencido zera a contagem
    const falhas = (t && t.ate === 0 ? t.falhas : 0) + 1;
    tentativas.set(ator.id, { falhas, ate: falhas >= LIMITE_TENTATIVAS ? Date.now() + BLOQUEIO_MS : 0 });
    await auditar('seguranca.senha_incorreta', { ...ref, usuarioId: ator.id, origem: 'perfil', detalhe: { acao, tentativa: falhas } });
    throw new ContratoErro('SENHA', 'Senha incorreta. O cancelamento não foi feito.', 403);
  }
  tentativas.delete(ator.id);
}

// ─── Pedido de cancelamento (corretor/secretária) ───────────────────────────────────────

async function compradorDe(contratoId: number): Promise<string | null> {
  const d = await db();
  const [p]: any[] = await d.select({ nome: pessoas.nome }).from(contratoPessoas).innerJoin(pessoas, eq(pessoas.id, contratoPessoas.pessoaId))
    .where(and(eq(contratoPessoas.contratoId, contratoId), eq(contratoPessoas.papel, 'comprador'))).limit(1);
  return p?.nome ?? null;
}

export async function solicitarCancelamento(contratoId: number, ator: Ator, motivo: string) {
  const perfil = perfilDe(ator as any);
  if (perfil !== 'corretor' && perfil !== 'secretario') throw new ContratoErro('PERFIL', 'O pedido de cancelamento é do corretor ou da secretária; o administrador cancela direto.', 403);
  const d = await db();
  const c = await contratoPorId(contratoId);
  if (['cancelado', 'distratado'].includes(c.status)) throw new ContratoErro('STATUS', 'Este contrato já está cancelado.', 409);
  const [aberto]: any[] = await d.select({ id: contratoSolicitacoes.id }).from(contratoSolicitacoes)
    .where(and(eq(contratoSolicitacoes.contratoId, contratoId), eq(contratoSolicitacoes.status, 'pendente'))).limit(1);
  if (aberto) throw new ContratoErro('JA_SOLICITADO', 'Já existe um pedido de cancelamento aguardando o administrador.', 409);
  const r: any = await d.insert(contratoSolicitacoes).values({
    contratoId, tipo: 'cancelamento', motivo: motivo.slice(0, 300), solicitanteId: ator.id, status: 'pendente', criadoEm: new Date(),
  } as any);
  const id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
  const comprador = await compradorDe(contratoId);
  await auditar('contrato.cancel_solicitado', { contratoId, usuarioId: ator.id, origem: 'perfil', detalhe: { solicitacaoId: id, motivo, perfil, comprador } });
  const { dadosDoEmpreendimento, notificarSolicitacaoCancelamento } = await import('../notificacoes');
  dadosDoEmpreendimento(c.empreendimentoId)
    .then(emp => notificarSolicitacaoCancelamento({
      contratoId, contrato: c.numero, lote: c.loteCodigo, empreendimentoId: c.empreendimentoId, empreendimentoNome: emp?.nome ?? null,
      comprador, motivo, autorId: ator.id, autorNome: ator.name ?? null,
    }))
    .catch(e => console.warn('[Cancelamento] notificação:', e?.message ?? e));
  return { id };
}

export async function solicitacoesDo(contratoId: number) {
  const d = await db();
  const ss: any[] = await d.select().from(contratoSolicitacoes).where(eq(contratoSolicitacoes.contratoId, contratoId));
  const ids = Array.from(new Set(ss.flatMap(s => [s.solicitanteId, s.resolvidoPor]).filter(Boolean)));
  const us: any[] = ids.length ? await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  const nome = (id: number | null) => (id ? us.find(u => u.id === id)?.name ?? `#${id}` : null);
  return ss.sort((a, b) => b.id - a.id).map(s => ({
    id: s.id, tipo: s.tipo, motivo: s.motivo, status: s.status, solicitante: nome(s.solicitanteId), resolvidoPor: nome(s.resolvidoPor),
    resolvidoEm: s.resolvidoEm, resposta: s.resposta, criadoEm: s.criadoEm,
  }));
}

/** O administrador recusa o pedido (com a senha, como no cancelamento) */
export async function recusarSolicitacao(solicitacaoId: number, ator: Ator, senha: string, resposta: string, ip?: string | null) {
  const d = await db();
  const [s]: any[] = await d.select().from(contratoSolicitacoes).where(eq(contratoSolicitacoes.id, solicitacaoId)).limit(1);
  if (!s) throw new ContratoErro('NAO_ENCONTRADO', 'Pedido não encontrado', 404);
  await exigirAdminComSenha(ator, senha, 'recusar_pedido', { contratoId: s.contratoId, ip });
  if (s.status !== 'pendente') return { ok: true };
  await d.update(contratoSolicitacoes).set({ status: 'recusada', resolvidoPor: ator.id, resolvidoEm: new Date(), resposta: resposta.slice(0, 300) } as any)
    .where(and(eq(contratoSolicitacoes.id, solicitacaoId), eq(contratoSolicitacoes.status, 'pendente')));
  await auditar('contrato.cancel_recusado', { contratoId: s.contratoId, usuarioId: ator.id, origem: 'perfil', ip, detalhe: { solicitacaoId, resposta, solicitanteId: s.solicitanteId } });
  return { ok: true };
}

// ─── Cancelamentos (só admin + senha) ─────────────────────────────────────────────────

/** Cancela no Asaas (com a chave do empreendimento) e marca a cobrança; paga não se cancela (vai para o distrato) */
async function cancelarCobrancaInterna(cob: any, slug: string): Promise<{ asaas: 'cancelada' | 'sem_chave' | 'sem_id' | 'erro'; erro?: string }> {
  const d = await db();
  let asaas: 'cancelada' | 'sem_chave' | 'sem_id' | 'erro' = 'sem_id';
  let erro: string | undefined;
  if (cob.asaasPaymentId) {
    const cfg = configAsaas(process.env, slug);
    if (!cfg) asaas = 'sem_chave';
    else {
      try { await cancelarNoAsaas(cfg, cob.asaasPaymentId); asaas = 'cancelada'; } catch (e: any) { asaas = 'erro'; erro = String(e?.message ?? e).slice(0, 200); }
    }
  }
  // Com erro no Asaas a cobrança local não muda: o administrador vê e tenta de novo
  if (asaas !== 'erro') await d.update(cobrancas).set({ status: 'cancelada' } as any).where(eq(cobrancas.id, cob.id));
  return { asaas, erro };
}

export async function cancelarContratoAdmin(contratoId: number, ator: Ator, senha: string, motivo: string, ip?: string | null) {
  await exigirAdminComSenha(ator, senha, 'cancelar_contrato', { contratoId, ip });
  const d = await db();
  const c = await contratoPorId(contratoId);
  if (['cancelado', 'distratado'].includes(c.status)) return { ok: true, jaCancelado: true, cobrancasCanceladas: 0, falhasAsaas: 0 };
  const agora = new Date();
  await d.update(contratos).set({ status: 'cancelado', canceladoEm: agora, canceladoPor: ator.id, canceladoMotivo: motivo.slice(0, 300), atualizadoEm: agora } as any)
    .where(eq(contratos.id, contratoId));

  // Chácara de volta a disponível (só se ainda for deste contrato) + aviso de "lote liberado"
  let liberado = false;
  if (c.loteId) {
    const [lt]: any[] = await d.select().from(lotes).where(eq(lotes.id, c.loteId)).limit(1);
    const r = await d.update(lotes).set({
      situacao: 'disponivel', status: statusPublicoDe('disponivel'), contratoReservaId: null, reservadoAte: null, leadId: null, corretorId: null,
      clienteNome: null, valorVenda: null, valorEntrada: null, numParcelas: null, dataSituacao: agora,
    } as any).where(and(eq(lotes.id, c.loteId), eq(lotes.contratoReservaId, contratoId)));
    liberado = afetadas(r) > 0;
    if (liberado) {
      await d.insert(loteHistorico).values({ loteId: c.loteId, de: lt?.situacao ?? 'reservado', para: 'disponivel', usuarioId: ator.id,
        detalhe: `Contrato ${c.numero} cancelado pelo administrador: ${motivo}`.slice(0, 500), createdAt: agora } as any);
      const { dadosDoEmpreendimento, notificarMudancaLote } = await import('../notificacoes');
      dadosDoEmpreendimento(c.empreendimentoId)
        .then(emp => emp && notificarMudancaLote({
          loteId: c.loteId, codigo: c.loteCodigo, empreendimentoId: c.empreendimentoId, empreendimentoSlug: emp.slug, empreendimentoNome: emp.nome,
          de: lt?.situacao ?? 'reservado', para: 'disponivel', autorId: ator.id, autorNome: ator.name ?? null,
        }))
        .catch(e => console.warn('[Cancelamento] aviso de lote liberado:', e?.message ?? e));
    }
  }

  // Cobranças futuras não pagas: canceladas (Asaas + local). Pagas e vencidas ficam para o acerto do distrato.
  const hoje = hojeBrasil();
  const cobs: any[] = await d.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const futuras = cobs.filter(x => ['prevista', 'emitida'].includes(x.status) && String(x.vencimento).slice(0, 10) >= hoje);
  const slug = await slugDoContrato(contratoId);
  const resultados: { id: number; asaas: string; erro?: string }[] = [];
  for (const cob of futuras) resultados.push({ id: cob.id, ...(await cancelarCobrancaInterna(cob, slug)) });
  const falhasAsaas = resultados.filter(r => r.asaas === 'erro').length;

  // Pedidos pendentes deste contrato: atendidos por este cancelamento
  const pend: any[] = await d.select().from(contratoSolicitacoes).where(and(eq(contratoSolicitacoes.contratoId, contratoId), eq(contratoSolicitacoes.status, 'pendente')));
  if (pend.length) await d.update(contratoSolicitacoes).set({ status: 'atendida', resolvidoPor: ator.id, resolvidoEm: agora, resposta: 'Contrato cancelado pelo administrador' } as any)
    .where(and(eq(contratoSolicitacoes.contratoId, contratoId), eq(contratoSolicitacoes.status, 'pendente')));

  await auditar('contrato.cancelado', {
    contratoId, usuarioId: ator.id, origem: 'perfil', ip,
    detalhe: {
      motivo, statusAnterior: c.status, loteLiberado: liberado, cobrancasCanceladas: resultados.length - falhasAsaas, falhasAsaas, cobrancas: resultados,
      pedidos: pend.map(p => ({ id: p.id, solicitanteId: p.solicitanteId, motivo: p.motivo, em: p.criadoEm })),
      pagasOuVencidas: cobs.filter(x => x.status === 'paga' || x.status === 'vencida').length,
    },
  });
  return { ok: true, jaCancelado: false, loteLiberado: liberado, cobrancasCanceladas: resultados.length - falhasAsaas, falhasAsaas };
}

export async function cancelarCobrancaAdmin(cobrancaId: number, ator: Ator, senha: string, motivo: string, ip?: string | null) {
  const d = await db();
  const [cob]: any[] = await d.select().from(cobrancas).where(eq(cobrancas.id, cobrancaId)).limit(1);
  if (!cob) throw new ContratoErro('NAO_ENCONTRADO', 'Cobrança não encontrada', 404);
  await exigirAdminComSenha(ator, senha, 'cancelar_cobranca', { contratoId: cob.contratoId, cobrancaId, ip });
  if (cob.status === 'cancelada') return { ok: true };
  if (cob.status === 'paga' || cob.status === 'estornada') throw new ContratoErro('PAGA', 'Parcela paga não se cancela: o acerto é pelo distrato.', 409);
  const r = await cancelarCobrancaInterna(cob, await slugDoContrato(cob.contratoId));
  await auditar('cobranca.cancelada', { contratoId: cob.contratoId, cobrancaId, usuarioId: ator.id, origem: 'perfil', ip, detalhe: { motivo, statusAnterior: cob.status, ...r } });
  if (r.asaas === 'erro') throw new ContratoErro('ASAAS', `O Asaas não cancelou a cobrança: ${r.erro}`, 502);
  return { ok: true, asaas: r.asaas };
}

export async function cancelarReciboAdmin(reciboId: number, ator: Ator, senha: string, motivo: string, ip?: string | null) {
  const d = await db();
  const [rec]: any[] = await d.select().from(recibos).where(eq(recibos.id, reciboId)).limit(1);
  if (!rec) throw new ContratoErro('NAO_ENCONTRADO', 'Recibo não encontrado', 404);
  await exigirAdminComSenha(ator, senha, 'cancelar_recibo', { contratoId: rec.contratoId, cobrancaId: rec.cobrancaId, ip });
  if (rec.canceladoEm) return { ok: true };
  await d.update(recibos).set({ canceladoEm: new Date(), canceladoPor: ator.id, canceladoMotivo: motivo.slice(0, 300) } as any).where(eq(recibos.id, reciboId));
  await auditar('recibo.cancelado', { contratoId: rec.contratoId, cobrancaId: rec.cobrancaId, usuarioId: ator.id, origem: 'perfil', ip, detalhe: { motivo, numero: rec.numero } });
  return { ok: true };
}

/** Trilha do contrato para a tela (somente leitura) */
export async function trilhaDoContrato(contratoId: number) {
  const { financeiroAuditoria } = await import('../../drizzle/schema');
  const d = await db();
  const linhas: any[] = await d.select().from(financeiroAuditoria).where(eq(financeiroAuditoria.contratoId, contratoId));
  const relevantes = linhas.filter(l => /^(contrato|cobranca|recibo|seguranca)\./.test(l.acao));
  const ids = Array.from(new Set(relevantes.map(l => l.usuarioId).filter(Boolean)));
  const us: any[] = ids.length ? await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  return relevantes.sort((a, b) => Number(b.id) - Number(a.id)).map(l => ({
    id: Number(l.id), acao: l.acao, usuario: us.find(u => u.id === l.usuarioId)?.name ?? null, em: l.criadoEm,
    detalhe: typeof l.detalhe === 'string' ? JSON.parse(l.detalhe) : l.detalhe,
  }));
}
