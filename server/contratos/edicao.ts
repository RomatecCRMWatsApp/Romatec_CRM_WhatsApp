/**
 * Edição e exclusão de contrato — SÓ o administrador, confirmando com a senha de login (step-up, como o cancelamento).
 *
 * Editar: comprador, cônjuge, corretor, lead e condições específicas em qualquer etapa (menos cancelado/distratado);
 * o plano de pagamento só antes da assinatura e sem nenhuma cobrança emitida. Se o contrato já estava gerado ou em
 * assinatura, volta a rascunho (a rodada de assinaturas pendente é descartada) para gerar o PDF novo com os dados certos.
 * Já assinado/ativo: só correção cadastral; o PDF assinado continua o oficial (a mudança vai para a trilha).
 *
 * Excluir: só contrato sem dinheiro envolvido (nenhum boleto emitido no Asaas, pagamento, recibo, repasse ou
 * declaração); com pagamento, o caminho é Cancelar, que guarda o histórico financeiro. A chácara volta a disponível.
 * A trilha de auditoria (financeiroAuditoria) é mantida.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import {
  assinaturaEventos, assinaturaPosicoes, assinaturaSignatarios, carteiras, chacaraDependentes, cobrancaAvisos, cobrancas, comissaoRepasses,
  contratoAditivos, contratoAnexos, contratoPessoas, contratoSolicitacoes, contratoVersoes, contratos, declaracoesQuitacao, lotes, loteHistorico,
  pagamentoRateio, portalChamados, recibos, registrosCartorio, talonarioFolhas,
} from '../../drizzle/schema';
import { statusPublicoDe } from '../../shared/lotes';
import { auditar } from '../financeiro/servico';
import { exigirAdminComSenha, type Ator } from './cancelamento';
import { ContratoErro, condicoesDe, contratoPorId, juridicoDe, planoEscolhido, responsavelTecnicoId, salvarPessoa, type NovoContrato } from './servico';
import type { PessoaForm } from '../../shared/contratos';

const ENCERRADOS = ['cancelado', 'distratado'];
const ANTES_DA_ASSINATURA = ['rascunho', 'minuta', 'apto_assinatura', 'em_assinatura'];
const json = (v: unknown): any => { if (typeof v !== 'string') return v ?? {}; try { return JSON.parse(v); } catch { return {}; } };

async function db(): Promise<any> {
  const d = await getDb();
  if (!d) throw new ContratoErro('BANCO', 'Banco indisponível', 503);
  return d;
}

export interface EdicaoContrato {
  comprador?: PessoaForm;
  /** null remove o cônjuge; ausente mantém */
  conjuge?: PessoaForm | null;
  corretorUserId?: number;
  leadId?: number | null;
  condicoesEspecificas?: string;
  plano?: NovoContrato['plano'];
}

/** O que o administrador pode mudar neste contrato agora (a tela usa para liberar os campos) */
export async function edicaoPermitida(contratoId: number) {
  const d = await db();
  const c = await contratoPorId(contratoId);
  const cobs: any[] = await d.select({ status: cobrancas.status, asaas: cobrancas.asaasPaymentId }).from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const comDinheiro = await temDinheiro(d, contratoId, cobs);
  const encerrado = ENCERRADOS.includes(c.status);
  const concessao = !!json(c.simulacaoJson)?.concessao;
  return {
    editar: !encerrado,
    plano: !encerrado && !concessao && ANTES_DA_ASSINATURA.includes(c.status) && !cobs.some(x => x.asaas || x.status !== 'prevista'),
    voltaRascunho: ['minuta', 'apto_assinatura', 'em_assinatura'].includes(c.status),
    soCadastral: ['assinado', 'ativo', 'quitado'].includes(c.status),
    excluir: !comDinheiro,
    motivoNaoExcluir: comDinheiro ? 'Este contrato tem boleto emitido ou pagamento registrado: use Cancelar, que guarda o histórico financeiro.' : null,
  };
}

async function temDinheiro(d: any, contratoId: number, cobs: any[]): Promise<boolean> {
  if (cobs.some(x => x.asaas || ['paga', 'emitida', 'vencida', 'recebida'].includes(String(x.status)))) return true;
  const [r]: any[] = await d.select({ id: recibos.id }).from(recibos).where(eq(recibos.contratoId, contratoId)).limit(1);
  const [k]: any[] = await d.select({ id: comissaoRepasses.id }).from(comissaoRepasses).where(eq(comissaoRepasses.contratoId, contratoId)).limit(1);
  const [q]: any[] = await d.select({ id: declaracoesQuitacao.id }).from(declaracoesQuitacao).where(eq(declaracoesQuitacao.contratoId, contratoId)).limit(1);
  const [p]: any[] = await d.select({ id: pagamentoRateio.id }).from(pagamentoRateio).where(eq(pagamentoRateio.contratoId, contratoId)).limit(1);
  return !!(r || k || q || p);
}

async function trocarPessoa(d: any, contratoId: number, papel: 'comprador' | 'conjuge', pessoaId: number | null) {
  await d.delete(contratoPessoas).where(and(eq(contratoPessoas.contratoId, contratoId), eq(contratoPessoas.papel, papel)));
  if (pessoaId) await d.insert(contratoPessoas).values({ contratoId, pessoaId, papel } as any);
}

export async function editarContratoAdmin(contratoId: number, ator: Ator, senha: string, e: EdicaoContrato, ip?: string | null) {
  await exigirAdminComSenha(ator, senha, 'editar_contrato', { contratoId, ip });
  const d = await db();
  const c = await contratoPorId(contratoId);
  const pode = await edicaoPermitida(contratoId);
  if (!pode.editar) throw new ContratoErro('STATUS', 'Contrato cancelado ou distratado não pode ser editado', 409);
  if (e.plano && !pode.plano) throw new ContratoErro('PLANO', 'O plano de pagamento só muda antes da assinatura e sem cobranças emitidas. Para contrato assinado, use um termo aditivo.', 409);
  const agora = new Date();
  const mudou: string[] = [];
  let leadId = c.leadId ?? null;
  if (e.leadId !== undefined) { leadId = e.leadId; mudou.push('lead'); }

  if (e.comprador) {
    const id = await salvarPessoa(e.comprador, leadId);
    await trocarPessoa(d, contratoId, 'comprador', id);
    mudou.push('comprador');
  }
  if (e.conjuge !== undefined) {
    const id = e.conjuge ? await salvarPessoa(e.conjuge, null) : null;
    await trocarPessoa(d, contratoId, 'conjuge', id);
    mudou.push(e.conjuge ? 'cônjuge' : 'cônjuge removido');
  }

  const set: Record<string, unknown> = { atualizadoEm: agora };
  if (e.leadId !== undefined) set.leadId = e.leadId;
  if (e.corretorUserId) { set.corretorUserId = e.corretorUserId; mudou.push('corretor'); }
  if (e.condicoesEspecificas !== undefined) {
    const dados = json(c.dadosJson);
    set.dadosJson = { ...dados, condicionantes: { ...(dados.condicionantes ?? {}), ctr_condicoes_especificas: e.condicoesEspecificas.trim() || 'Não há.' } };
    mudou.push('condições específicas');
  }
  let plano: any = null;
  if (e.plano) {
    const [lote]: any[] = await d.select().from(lotes).where(eq(lotes.id, c.loteId)).limit(1);
    if (!lote) throw new ContratoErro('LOTE', 'Chácara do contrato não encontrada', 404);
    const j = await juridicoDe(c.empreendimentoId);
    const resp = await responsavelTecnicoId(j.defaults);
    const corretor = e.corretorUserId ?? c.corretorUserId;
    plano = planoEscolhido(e.plano, Number(lote.areaM2), lote.precoTabela != null ? Number(lote.precoTabela) : null, await condicoesDe(c.empreendimentoId), corretor !== resp);
    set.simulacaoJson = plano;
    // Cobranças ainda só previstas (nada no Asaas): saem; o plano novo gera as dele na ativação
    await d.delete(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), eq(cobrancas.status, 'prevista')));
    mudou.push('plano de pagamento');
  }
  // Já gerado ou em assinatura: volta a rascunho para sair o PDF novo; a rodada de assinaturas pendente é descartada
  if (pode.voltaRascunho && mudou.length) {
    set.status = 'rascunho';
    const sig: any[] = await d.select({ id: assinaturaSignatarios.id }).from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, contratoId));
    if (sig.length) {
      await d.delete(assinaturaPosicoes).where(eq(assinaturaPosicoes.contratoId, contratoId));
      await d.delete(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, contratoId));
    }
  }
  await d.update(contratos).set(set as any).where(eq(contratos.id, contratoId));

  // Chácara acompanha o contrato (cliente, corretor, lead e valores)
  if (c.loteId) {
    const pessoasAgora = e.comprador ? e.comprador.nome.trim() : null;
    const lset: Record<string, unknown> = {};
    if (pessoasAgora) lset.clienteNome = pessoasAgora;
    if (e.corretorUserId) lset.corretorId = e.corretorUserId;
    if (e.leadId !== undefined) lset.leadId = e.leadId;
    if (plano) Object.assign(lset, { valorVenda: String(plano.total_pagar), valorEntrada: String(plano.entrada_valor || plano.total_pagar), numParcelas: plano.saldo_qtd || 1 });
    if (Object.keys(lset).length) await d.update(lotes).set(lset as any).where(eq(lotes.id, c.loteId));
  }
  await auditar('contrato.editado', { contratoId, usuarioId: ator.id, origem: 'perfil', ip, detalhe: { campos: mudou, statusAnterior: c.status, voltouRascunho: !!(pode.voltaRascunho && mudou.length), soCadastral: pode.soCadastral } });
  return { ok: true as const, campos: mudou, voltouRascunho: !!(pode.voltaRascunho && mudou.length), soCadastral: pode.soCadastral };
}

export async function excluirContratoAdmin(contratoId: number, ator: Ator, senha: string, motivo: string, ip?: string | null) {
  await exigirAdminComSenha(ator, senha, 'excluir_contrato', { contratoId, ip });
  const d = await db();
  const c = await contratoPorId(contratoId);
  const cobs: any[] = await d.select({ status: cobrancas.status, asaas: cobrancas.asaasPaymentId }).from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  if (await temDinheiro(d, contratoId, cobs)) throw new ContratoErro('COM_PAGAMENTO', 'Este contrato tem boleto emitido ou pagamento registrado: use Cancelar, que guarda o histórico financeiro.', 409);
  const agora = new Date();

  // Chácara de volta a disponível, se ainda for deste contrato
  let liberado = false;
  if (c.loteId) {
    const [lt]: any[] = await d.select().from(lotes).where(eq(lotes.id, c.loteId)).limit(1);
    if (lt && Number(lt.contratoReservaId) === contratoId) {
      await d.update(lotes).set({
        situacao: 'disponivel', status: statusPublicoDe('disponivel'), contratoReservaId: null, reservadoAte: null, leadId: null, corretorId: null,
        clienteNome: null, valorVenda: null, valorEntrada: null, numParcelas: null, dataSituacao: agora,
      } as any).where(eq(lotes.id, c.loteId));
      await d.insert(loteHistorico).values({ loteId: c.loteId, de: lt.situacao ?? 'reservado', para: 'disponivel', usuarioId: ator.id,
        detalhe: `Contrato ${c.numero} excluído pelo administrador: ${motivo}`.slice(0, 500), createdAt: agora } as any);
      liberado = true;
    }
  }
  const sig: any[] = await d.select({ id: assinaturaSignatarios.id }).from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, contratoId));
  const cobIds: any[] = await d.select({ id: cobrancas.id }).from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  if (cobIds.length) await d.delete(cobrancaAvisos).where(inArray(cobrancaAvisos.cobrancaId, cobIds.map(x => Number(x.id)))).catch(() => {});
  for (const t of [assinaturaEventos, assinaturaPosicoes, assinaturaSignatarios, carteiras, chacaraDependentes, cobrancaAvisos, cobrancas, contratoAditivos,
    contratoAnexos, contratoPessoas, contratoSolicitacoes, contratoVersoes, portalChamados, registrosCartorio] as any[]) {
    if (t.contratoId) await d.delete(t).where(eq(t.contratoId, contratoId));
  }
  await d.update(talonarioFolhas).set({ contratoId: null } as any).where(eq(talonarioFolhas.contratoId, contratoId));
  await d.delete(contratos).where(eq(contratos.id, contratoId));
  await auditar('contrato.excluido', {
    contratoId, usuarioId: ator.id, origem: 'perfil', ip,
    detalhe: { numero: c.numero, lote: c.loteCodigo, status: c.status, motivo, loteLiberado: liberado, assinaturasDescartadas: sig.length, cobrancasPrevistas: cobs.length },
  });
  return { ok: true as const, numero: c.numero, loteLiberado: liberado };
}
