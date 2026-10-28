/**
 * Exclusão definitiva (v1.59.0) — só o ADMINISTRADOR, com a senha de login (step-up do cancelamento) e auditoria.
 * - Convite de recrutamento: apaga (não tem valor legal); o aprovado fica, porque é o registro do acesso criado.
 * - Lead: apaga com a conversa, interesses, visitas e reuniões; com contrato ou chácara vinculada, não.
 * - Usuário desativado: sem vínculo, apaga; com histórico (contrato, lead, financeiro…), arquiva — sai da lista da
 *   Equipe, mas fica no banco para os contratos e relatórios continuarem íntegros.
 * CONTRATO NÃO SE EXCLUI: fica "cancelado" pela retenção legal (server/contratos/cancelamento.ts).
 */
import { eq, inArray, or } from 'drizzle-orm';
import { getDb } from './db';
import * as S from '../drizzle/schema';
import { exigirAdminComSenha, type Ator } from './contratos/cancelamento';
import { ContratoErro } from './contratos/servico';
import { auditar } from './financeiro/servico';

const db = async () => {
  const d = await getDb();
  if (!d) throw new ContratoErro('DB', 'Banco indisponível', 503);
  return d as any;
};
const existe = async (d: any, tabela: any, cond: any) => (await d.select().from(tabela).where(cond).limit(1)).length > 0;

export async function excluirRecrutamento(id: number, ator: Ator, senha: string, ip?: string | null) {
  await exigirAdminComSenha(ator, senha, 'excluir_convite', { ip });
  const d = await db();
  const [r]: any[] = await d.select().from(S.recrutamentos).where(eq(S.recrutamentos.id, id)).limit(1);
  if (!r) throw new ContratoErro('NAO_ACHOU', 'Convite não encontrado', 404);
  if (r.status === 'aprovado') throw new ContratoErro('APROVADO', 'Convite aprovado é o registro do acesso criado: desative o usuário pela Equipe.', 409);
  await d.delete(S.recrutamentoDocs).where(eq(S.recrutamentoDocs.recrutamentoId, id));
  await d.delete(S.recrutamentos).where(eq(S.recrutamentos.id, id));
  await auditar('exclusao.convite', { usuarioId: ator.id, origem: 'perfil', ip, detalhe: { id, nome: r.nome, telefone: r.telefone, status: r.status } });
  return { ok: true as const };
}

export async function excluirLead(id: number, ator: Ator, senha: string, ip?: string | null) {
  await exigirAdminComSenha(ator, senha, 'excluir_lead', { ip });
  const d = await db();
  const [l]: any[] = await d.select().from(S.leadQualifications).where(eq(S.leadQualifications.id, id)).limit(1);
  if (!l) throw new ContratoErro('NAO_ACHOU', 'Lead não encontrado', 404);
  if (await existe(d, S.contratos, eq(S.contratos.leadId, id)) || await existe(d, S.lotes, eq(S.lotes.leadId, id))) {
    throw new ContratoErro('VINCULO', 'Este lead tem contrato ou chácara vinculada: descarte em vez de excluir.', 409);
  }
  for (const t of [S.leadInteresses, S.leadMensagens, S.leadScoreHistorico, S.autoRespostaRegua, S.linksOferta, S.leadVisitas, S.reunioes]) {
    await d.delete(t).where(eq((t as any).leadId, id));
  }
  // Histórico de outras telas fica, sem apontar para o lead
  for (const t of [S.simulacoes, S.loteHistorico, S.leadEventos, S.pessoas]) {
    await d.update(t).set({ leadId: null } as any).where(eq((t as any).leadId, id));
  }
  await d.delete(S.leadQualifications).where(eq(S.leadQualifications.id, id));
  await import('./leads/followup').then(m => m.cancelarFollowUp(l.phone)).catch(() => {});
  await auditar('exclusao.lead', { usuarioId: ator.id, origem: 'perfil', ip, detalhe: { id, nome: l.nome, telefone: l.phone, stage: l.stage } });
  return { ok: true as const };
}

/** O que impede apagar o usuário (contrato, lead, financeiro…): com isso ele é arquivado */
export async function vinculosDoUsuario(id: number): Promise<string[]> {
  const d = await db();
  const checar: [string, any, any][] = [
    ['contratos', S.contratos, or(eq(S.contratos.corretorUserId, id), eq(S.contratos.criadoPor, id), eq(S.contratos.canceladoPor, id))],
    ['chácaras', S.lotes, eq(S.lotes.corretorId, id)],
    ['histórico de chácaras', S.loteHistorico, or(eq(S.loteHistorico.corretorId, id), eq(S.loteHistorico.usuarioId, id))],
    ['leads', S.leadQualifications, eq(S.leadQualifications.responsavelId, id)],
    ['visitas', S.leadVisitas, or(eq(S.leadVisitas.responsavelId, id), eq(S.leadVisitas.criadoPor, id))],
    ['simulações', S.simulacoes, eq(S.simulacoes.usuarioId, id)],
    ['talonários', S.talonarios, eq(S.talonarios.usuarioId, id)],
    ['assinatura', S.saasAssinaturas, eq(S.saasAssinaturas.usuarioId, id)],
    ['financeiro', S.financeiroAuditoria, eq(S.financeiroAuditoria.usuarioId, id)],
    ['pagamentos', S.pagamentosManuais, eq(S.pagamentosManuais.lancadoPor, id)],
    ['recibos', S.recibos, eq(S.recibos.canceladoPor, id)],
    ['despesas', S.financeiroDespesas, eq(S.financeiroDespesas.criadoPor, id)],
    ['pedidos de cancelamento', S.contratoSolicitacoes, eq(S.contratoSolicitacoes.solicitanteId, id)],
    ['reuniões', S.reunioes, eq(S.reunioes.criadoPor, id)],
    ['convites de reunião', S.reunioesAgenda, eq(S.reunioesAgenda.criadoPor, id)],
  ];
  const achados: string[] = [];
  for (const [rotulo, t, cond] of checar) if (await existe(d, t, cond)) achados.push(rotulo);
  return achados;
}

/** Usuário desativado sai da lista: apaga se não tem vínculo, senão arquiva (e diz por quê) */
export async function removerUsuario(id: number, ator: Ator, senha: string, ip?: string | null) {
  await exigirAdminComSenha(ator, senha, 'excluir_usuario', { ip });
  const d = await db();
  const [u]: any[] = await d.select().from(S.users).where(eq(S.users.id, id)).limit(1);
  if (!u) throw new ContratoErro('NAO_ACHOU', 'Usuário não encontrado', 404);
  if (u.id === ator.id || u.role === 'admin') throw new ContratoErro('ADMIN', 'O acesso de administrador não pode ser removido.', 409);
  if (u.ativo !== false && u.ativo !== 0) throw new ContratoErro('ATIVO', 'Desative o acesso antes de remover.', 409);
  const vinculos = await vinculosDoUsuario(id);
  if (vinculos.length) {
    await d.update(S.users).set({ arquivadoEm: new Date(), recebeLeads: 0, updatedAt: new Date() } as any).where(eq(S.users.id, id));
    await auditar('exclusao.usuario_arquivado', { usuarioId: ator.id, origem: 'perfil', ip, detalhe: { id, nome: u.name, vinculos } });
    return { modo: 'arquivado' as const, vinculos };
  }
  const docs: any[] = await d.select({ id: S.usuarioDocumentos.id }).from(S.usuarioDocumentos).where(eq(S.usuarioDocumentos.usuarioId, id));
  if (docs.length) await d.delete(S.usuarioDocumentoPaginas).where(inArray(S.usuarioDocumentoPaginas.documentoId, docs.map(x => x.id)));
  for (const t of [S.usuarioDocumentos, S.usuarioConjuge, S.usuarioFoto, S.notificacoes, S.pushInscricoes, S.permissoesUsuario, S.acessosCorretor, S.systemReleaseLeitura]) {
    await d.delete(t).where(eq((t as any).usuarioId, id));
  }
  await d.update(S.recrutamentos).set({ usuarioId: null } as any).where(eq(S.recrutamentos.usuarioId, id));
  await d.delete(S.users).where(eq(S.users.id, id));
  await auditar('exclusao.usuario', { usuarioId: ator.id, origem: 'perfil', ip, detalhe: { id, nome: u.name, perfil: u.perfil } });
  return { modo: 'excluido' as const, vinculos: [] as string[] };
}
