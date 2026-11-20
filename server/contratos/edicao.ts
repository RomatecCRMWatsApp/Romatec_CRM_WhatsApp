/**
 * Edição e exclusão de contrato — SÓ o administrador, confirmando com a senha de login (step-up, como o cancelamento).
 *
 * Editar: comprador, cônjuge, corretor, lead e condições específicas em qualquer etapa (menos cancelado/distratado);
 * o plano de pagamento enquanto o contrato não foi assinado por todos e nada foi pago. Boleto já emitido e não pago
 * (ex.: o da entrada, que sai com o link de assinatura) é cancelado no Asaas e o novo sai no reenvio para assinatura,
 * com o aviso da alteração na mensagem. Se o contrato já estava gerado ou em
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
  const pago = await temPagamento(d, contratoId, cobs);
  const boletosEmitidos = cobs.filter(x => x.asaas && !['paga', 'recebida', 'cancelada'].includes(String(x.status))).length;
  return {
    editar: !encerrado,
    plano: !encerrado && !concessao && ANTES_DA_ASSINATURA.includes(c.status) && !pago,
    /** Boletos emitidos e não pagos que serão cancelados no Asaas se o plano mudar */
    boletosACancelar: boletosEmitidos,
    voltaRascunho: ['minuta', 'apto_assinatura', 'em_assinatura'].includes(c.status),
    soCadastral: ['assinado', 'ativo', 'quitado'].includes(c.status),
    excluir: !comDinheiro,
    motivoNaoExcluir: comDinheiro ? 'Este contrato tem boleto emitido ou pagamento registrado: use Cancelar, que guarda o histórico financeiro.' : null,
  };
}

/** Algum pagamento já entrou (cobrança paga/recebida, recibo, repasse, quitação ou rateio): aí o plano não muda mais */
async function temPagamento(d: any, contratoId: number, cobs: any[]): Promise<boolean> {
  if (cobs.some(x => ['paga', 'recebida'].includes(String(x.status)))) return true;
  const [r]: any[] = await d.select({ id: recibos.id }).from(recibos).where(eq(recibos.contratoId, contratoId)).limit(1);
  const [k]: any[] = await d.select({ id: comissaoRepasses.id }).from(comissaoRepasses).where(eq(comissaoRepasses.contratoId, contratoId)).limit(1);
  const [q]: any[] = await d.select({ id: declaracoesQuitacao.id }).from(declaracoesQuitacao).where(eq(declaracoesQuitacao.contratoId, contratoId)).limit(1);
  const [p]: any[] = await d.select({ id: pagamentoRateio.id }).from(pagamentoRateio).where(eq(pagamentoRateio.contratoId, contratoId)).limit(1);
  return !!(r || k || q || p);
}

/** Rótulo curto do plano para o aviso da reassinatura ("Plano C · 120×", "Entrada de 30% · 120×") */
function rotuloPlano(p: any): string {
  if (!p) return '—';
  if (p.modalidade === 'avista') return 'à vista';
  const cond = p.condicao && p.condicao !== 'padrao' ? `Plano ${p.condicao}` : 'Entrada + saldo';
  return `${cond} (${p.saldo_qtd}× de R$ ${Number(p.saldo_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}
const dataBR = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

/** Texto do aviso que vai junto com o novo link de assinatura quando o plano mudou */
export function avisoAlteracaoPlano(antes: any, depois: any): string {
  const partes: string[] = [];
  if (rotuloPlano(antes) !== rotuloPlano(depois)) partes.push(`plano de pagamento: de ${rotuloPlano(antes)} para ${rotuloPlano(depois)}`);
  if (Number(antes?.entrada_valor) !== Number(depois?.entrada_valor)) partes.push(`entrada: R$ ${Number(depois?.entrada_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  if ((antes?.entrada_venc1 || '') !== (depois?.entrada_venc1 || '')) partes.push(`vencimento da entrada: ${dataBR(depois?.entrada_venc1)}`);
  if ((antes?.saldo_venc1 || '') !== (depois?.saldo_venc1 || '')) partes.push(`1ª parcela: ${dataBR(depois?.saldo_venc1)}`);
  return partes.length ? partes.join('; ') : 'condições de pagamento';
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
  if (e.plano && !pode.plano) throw new ContratoErro('PLANO', 'O plano de pagamento só muda enquanto o contrato não foi assinado por todos e nada foi pago. Para contrato assinado, use um termo aditivo.', 409);
  const agora = new Date();
  const mudou: string[] = [];
  let leadId = c.leadId ?? null;
  if (e.leadId !== undefined) { leadId = e.leadId; mudou.push('lead'); }

  if (e.comprador) {
    const id = await salvarPessoa(e.comprador, leadId);
    await trocarPessoa(d, contratoId, 'comprador', id);
    // Empresa compradora: os sócios que assinam por ela (PF: remove eventuais sócios antigos)
    const { salvarSocios } = await import('./servico');
    await salvarSocios(contratoId, e.comprador.tipo === 'PJ' ? e.comprador.socios ?? [] : []);
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
    // Boletos emitidos e não pagos (ex.: o da entrada, que saiu com o link de assinatura): cancela no Asaas antes de
    // trocar o plano. Se o Asaas recusar (ex.: já foi pago), nada muda e o administrador vê o motivo.
    const todas: any[] = await d.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
    const { cancelarCobrancaInterna } = await import('./cancelamento');
    const { slugDoContrato } = await import('../financeiro/servico');
    const slug = await slugDoContrato(contratoId);
    const canceladas: { id: number; tipo: string; numero: number; valor: string; vencimento: string; asaas: string | null }[] = [];
    for (const cob of todas.filter(x => x.asaasPaymentId && !['paga', 'recebida', 'cancelada'].includes(String(x.status)))) {
      const r = await cancelarCobrancaInterna(cob, slug);
      if (r.asaas === 'erro' || r.asaas === 'sem_chave') {
        throw new ContratoErro('ASAAS', `Não consegui cancelar no Asaas o boleto ${cob.tipo} ${cob.numero} (${r.erro ?? 'sem chave do Asaas'}). O plano não foi alterado; confira no Asaas e tente de novo.`, 502);
      }
      canceladas.push({ id: Number(cob.id), tipo: String(cob.tipo), numero: Number(cob.numero), valor: String(cob.valor), vencimento: String(cob.vencimento).slice(0, 10), asaas: cob.asaasPaymentId ?? null });
    }
    // As linhas do plano antigo saem (previstas e as canceladas acima: nenhuma foi paga); o plano novo grava as dele
    // no reenvio para assinatura (boleto novo da entrada) e na ativação (carnê). O histórico fica na auditoria.
    const ids = todas.filter(x => !['paga', 'recebida'].includes(String(x.status))).map(x => Number(x.id));
    if (ids.length) {
      await d.delete(cobrancaAvisos).where(inArray(cobrancaAvisos.cobrancaId, ids)).catch(() => {});
      await d.delete(cobrancas).where(inArray(cobrancas.id, ids));
    }
    if (canceladas.length) await auditar('contrato.boletos_cancelados_troca_plano', { contratoId, usuarioId: ator.id, origem: 'perfil', ip, detalhe: { canceladas } });
    // Aviso que vai junto com o novo link de assinatura (usado no próximo envio)
    const dados = json(set.dadosJson ?? c.dadosJson);
    set.dadosJson = { ...dados, avisoReassinatura: { texto: avisoAlteracaoPlano(json(c.simulacaoJson), plano), em: agora.toISOString(), boletosCancelados: canceladas.length } };
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

/**
 * Venda antes do registro do parcelamento (venda na planta): SÓ o administrador, com a senha. Liga ou desliga no
 * empreendimento; o contrato passa a dizer a situação real (contexto.ts → tagsRegistro), com o protocolo, o prazo para
 * o registro e a devolução integral ao comprador se não registrar no prazo. Fica na trilha de auditoria.
 */
export async function vendaAntesDoRegistro(contratoId: number, ator: Ator, senha: string, o: { ligado: boolean; protocolo?: string; prazoDias?: number }, ip?: string | null) {
  await exigirAdminComSenha(ator, senha, 'venda_antes_registro', { contratoId, ip });
  const d = await db();
  const c = await contratoPorId(contratoId);
  const { empJuridico } = await import('../../drizzle/schema');
  const [j]: any[] = await d.select().from(empJuridico).where(eq(empJuridico.empreendimentoId, c.empreendimentoId)).limit(1);
  if (!j) throw new ContratoErro('JURIDICO', 'Configuração jurídica do empreendimento não encontrada', 404);
  const atual = json(j.defaultsJson);
  const prazo = Math.max(30, Math.min(720, Math.round(Number(o.prazoDias) || 180)));
  const novos = { ...atual, emp_venda_antes_registro: o.ligado, emp_registro_protocolo: String(o.protocolo ?? atual.emp_registro_protocolo ?? '').trim().slice(0, 60), emp_registro_prazo_dias: prazo };
  await d.update(empJuridico).set({ defaultsJson: novos, atualizadoEm: new Date() } as any).where(eq(empJuridico.empreendimentoId, c.empreendimentoId));
  await auditar('empreendimento.venda_antes_registro', { contratoId, usuarioId: ator.id, origem: 'perfil', ip, detalhe: { ligado: o.ligado, protocolo: novos.emp_registro_protocolo, prazoDias: prazo, empreendimentoId: c.empreendimentoId } });
  return { ok: true as const, ligado: o.ligado, prazoDias: prazo };
}
