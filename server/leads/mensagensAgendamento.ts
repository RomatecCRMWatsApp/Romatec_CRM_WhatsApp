/**
 * Mensagens do link de agendamento (shared/mensagensAgendamento.ts): modelos editáveis no banco, as duas
 * mensagens de cada pedido (cliente e corretor) e o envio da confirmação pelo WhatsApp do sistema.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { leadQualifications, leadVisitas, modelosMensagem, users } from '../../drizzle/schema';
import { perfilDe } from '../../shared/equipe';
import { cartaoDe, type CartaoVendas } from '../../shared/cartaoVendas';
import {
  CHAVES_MODELO, MODELO_PADRAO, linkWhatsApp, preencherModelo, variaveisDoPedido, type ChaveModelo, type DadosPedido,
} from '../../shared/mensagensAgendamento';

export class MensagemErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'MensagemErro'; } }

const banco = async () => {
  const d = await getDb();
  if (!d) throw new MensagemErro('Banco indisponível', 503);
  return d as any;
};

/** Texto atual do modelo (o salvo nas Configurações; sem ele, o padrão) */
export async function modeloMensagem(chave: ChaveModelo): Promise<string> {
  const d = await banco();
  const [m]: any[] = await d.select().from(modelosMensagem).where(eq(modelosMensagem.chave, chave)).limit(1);
  return String(m?.texto ?? '').trim() || MODELO_PADRAO[chave];
}

export async function listarModelos() {
  const d = await banco();
  const salvos: any[] = await d.select().from(modelosMensagem);
  const S = new Map(salvos.map(s => [s.chave, s]));
  return CHAVES_MODELO.map(chave => ({
    chave, texto: String(S.get(chave)?.texto ?? '').trim() || MODELO_PADRAO[chave], padrao: MODELO_PADRAO[chave],
    personalizado: !!S.get(chave), atualizadoEm: S.get(chave)?.updatedAt ?? null,
  }));
}

/** Salva o texto do modelo; texto vazio (ou igual ao padrão) volta ao padrão */
export async function salvarModelo(chave: ChaveModelo, texto: string, autorId: number) {
  const d = await banco();
  const t = texto.trim();
  await d.delete(modelosMensagem).where(eq(modelosMensagem.chave, chave));
  if (t && t !== MODELO_PADRAO[chave]) await d.insert(modelosMensagem).values({ chave, texto: t, atualizadoPor: autorId, updatedAt: new Date() } as any);
  return { ok: true as const };
}

const campos = {
  id: users.id, name: users.name, role: users.role, perfil: (users as any).perfil, creci: users.creci, creciUf: (users as any).creciUf,
  telefone: (users as any).telefone, email: users.email, fotoUrl: (users as any).fotoUrl, instagram: (users as any).instagram, ativo: users.ativo,
};

/** Cartão de quem recebeu o agendamento; sem responsável (ou inativo), o do administrador */
export async function cartaoDoResponsavel(responsavelId: number | null | undefined): Promise<CartaoVendas> {
  const d = await banco();
  if (responsavelId) {
    const [u]: any[] = await d.select(campos).from(users).where(eq(users.id, responsavelId)).limit(1);
    const perfil = u ? perfilDe(u) : null;
    if (u && u.ativo !== false && u.ativo !== 0 && perfil && perfil !== 'empreendedor') return cartaoDe(u, perfil);
  }
  const { donoDoLink } = await import('../agendamento');
  const { CARTAO_PADRAO } = await import('../../shared/cartaoVendas');
  return (await donoDoLink(null))?.cartao ?? CARTAO_PADRAO;
}

/** As duas mensagens de um pedido, com os modelos atuais */
export async function montarMensagens(p: DadosPedido, responsavelId: number | null | undefined) {
  const corretor = await cartaoDoResponsavel(responsavelId);
  const v = variaveisDoPedido(p, corretor);
  const [mc, mr] = await Promise.all([modeloMensagem('agendamento_cliente'), modeloMensagem('agendamento_corretor')]);
  return { cliente: preencherModelo(mc, v), corretor: preencherModelo(mr, v), corretorNome: corretor.nome };
}

const pedidoDa = (v: any): DadosPedido | null => {
  if (!v?.pedidoJson) return null;
  try { return typeof v.pedidoJson === 'string' ? JSON.parse(v.pedidoJson) : v.pedidoJson; } catch { return null; }
};

/** Card do agendamento: mensagens prontas, wa.me do cliente e se o WhatsApp do sistema está disponível */
export async function mensagensDaVisita(visitaId: number) {
  const d = await banco();
  const [v]: any[] = await d.select().from(leadVisitas).where(eq(leadVisitas.id, visitaId)).limit(1);
  if (!v) throw new MensagemErro('Agendamento não encontrado', 404);
  const p = pedidoDa(v);
  if (!p) throw new MensagemErro('Este agendamento não veio do link (sem mensagens prontas)', 404);
  const [l]: any[] = await d.select({ phone: leadQualifications.phone }).from(leadQualifications).where(eq(leadQualifications.id, v.leadId)).limit(1);
  const telefone = String(l?.phone || p.telefone);
  const m = await montarMensagens(p, v.responsavelId);
  const { zapiDisponivel } = await import('../lead-intake');
  return {
    leadId: v.leadId as number, cliente: m.cliente, corretor: m.corretor, telefone,
    waCliente: linkWhatsApp(telefone), waComConfirmacao: linkWhatsApp(telefone, m.cliente),
    zapi: zapiDisponivel(), enviadaEm: v.confirmacaoEnviadaAt ?? null,
  };
}

/** Envia (ou reenvia, com o texto editado) a confirmação ao cliente pelo WhatsApp do sistema */
export async function enviarConfirmacao(visitaId: number, texto?: string | null, agora = Date.now()): Promise<{ enviada: boolean }> {
  const d = await banco();
  const [v]: any[] = await d.select().from(leadVisitas).where(eq(leadVisitas.id, visitaId)).limit(1);
  if (!v) throw new MensagemErro('Agendamento não encontrado', 404);
  const p = pedidoDa(v);
  const [l]: any[] = await d.select({ phone: leadQualifications.phone, nome: leadQualifications.nome }).from(leadQualifications).where(eq(leadQualifications.id, v.leadId)).limit(1);
  const telefone = String(l?.phone || p?.telefone || '');
  if (!telefone) throw new MensagemErro('O cliente não tem WhatsApp no cadastro');
  const msg = String(texto ?? '').trim() || (p ? (await montarMensagens(p, v.responsavelId)).cliente : '');
  if (!msg) throw new MensagemErro('Escreva a mensagem');
  const { enviarMensagemSistema, zapiDisponivel } = await import('../lead-intake');
  if (!zapiDisponivel()) throw new MensagemErro('WhatsApp do sistema indisponível agora — copie a mensagem ou use "Abrir no WhatsApp".', 412);
  const ok = await enviarMensagemSistema(telefone, msg, l?.nome ?? '');
  if (!ok) throw new MensagemErro('O WhatsApp do sistema não conseguiu enviar agora — copie a mensagem ou use "Abrir no WhatsApp".', 502);
  await d.update(leadVisitas).set({ confirmacaoEnviadaAt: new Date(agora) } as any).where(eq(leadVisitas.id, visitaId));
  const { registrarMensagem } = await import('./qualificacaoService');
  await registrarMensagem(v.leadId, 'out', 'sistema', msg).catch(() => {});
  return { enviada: true };
}
