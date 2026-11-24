/**
 * Comissões de venda a pagar aos corretores (Financeiro › Comissões): contratos assinados com corretor, as partes da
 * comissão com a data do repasse (shared/repasseComissao.ts) e o registro do pagamento (comissaoRepasses).
 * Administrador e secretária veem todos os corretores e marcam os repasses como pagos; o corretor vê só os dele.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, comissaoRepasses, contratos, empreendimentos, users } from '../../drizzle/schema';
import { temAcesso } from '../../shared/permissoes';
import type { PermissoesUsuario } from '../permissoes';
import {
  STATUS_COM_COMISSAO, STATUS_SEM_COMISSAO, gatilhosDoPlano, partesDaComissao, resumoRepasses, type ParteComissao, type PlanoParaRepasse,
} from '../../shared/repasseComissao';

export class RepasseErro extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };

export interface VendaComissao {
  contratoId: number; numero: string; status: string; empreendimento: string; empreendimentoSlug: string; lote: string;
  comprador: string; corretorId: number; corretor: string; formaPagamento: string; valorVenda: number; comissao: number; dataVenda: string;
  partes: ParteComissao[];
}

const ROTULO_FORMA: Record<string, string> = { padrao: 'Entrada de 30%', A: 'Plano A', B: 'Plano B', C: 'Plano C' };
function formaDoPlano(p: PlanoParaRepasse): string {
  if (p.modalidade === 'avista') return 'À vista';
  const c = p.condicao && p.condicao !== 'padrao' ? p.condicao : 'padrao';
  if (c === 'padrao') return (p.entrada_qtd ?? 1) <= 1 ? 'Entrada de 30% à vista' : `Entrada de 30% em ${p.entrada_qtd}×`;
  return ROTULO_FORMA[c] ?? c;
}

export async function comissoesDeVenda(permissoes: PermissoesUsuario, usuarioId: number, filtro: { corretorId?: number; slug?: string } = {}) {
  const perfil = permissoes.perfil;
  const escritorio = perfil === 'admin' || perfil === 'secretario';
  if (!escritorio && perfil !== 'corretor') throw new RepasseErro('As comissões a pagar são do escritório e de cada corretor.', 403);
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const emps: any[] = (await d.select().from(empreendimentos))
    .filter((e: any) => temAcesso(perfil, permissoes.acessos, 'empreendimento', e.id) && (!filtro.slug || e.slug === filtro.slug));
  if (!emps.length) return { vendas: [] as VendaComissao[], resumo: resumoRepasses([]), corretores: [] as { id: number; nome: string }[], escritorio };
  const E = new Map(emps.map((e: any) => [Number(e.id), e]));
  const conds: any[] = [inArray(contratos.empreendimentoId, emps.map((e: any) => Number(e.id))), inArray(contratos.status, [...STATUS_COM_COMISSAO, ...STATUS_SEM_COMISSAO])];
  // O corretor só vê as vendas dele; o escritório pode filtrar por corretor
  const corretorId = escritorio ? filtro.corretorId : usuarioId;
  if (corretorId) conds.push(eq(contratos.corretorUserId, corretorId));
  const lista: any[] = await d.select().from(contratos).where(and(...conds));
  const comComissao = lista.map(c => ({ c, plano: json(c.simulacaoJson) as PlanoParaRepasse & { preco_tabela?: number; preco_avista?: number } }))
    .filter(x => Number(x.plano.comissao_corretor ?? 0) > 0);
  const ids = comComissao.map(x => Number(x.c.id));
  const [cobs, reps]: any[][] = ids.length ? await Promise.all([
    d.select({ contratoId: cobrancas.contratoId, tipo: cobrancas.tipo, numero: cobrancas.numero, vencimento: cobrancas.vencimento, status: cobrancas.status, pagoEm: cobrancas.pagoEm })
      .from(cobrancas).where(and(inArray(cobrancas.contratoId, ids), inArray(cobrancas.tipo, ['avista', 'entrada', 'saldo']))),
    d.select().from(comissaoRepasses).where(inArray(comissaoRepasses.contratoId, ids)),
  ]) : [[], []];
  const pessoas: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  const U = new Map(pessoas.map(p => [Number(p.id), String(p.name ?? '')]));
  const hoje = hojeBR();
  const vendas: VendaComissao[] = comComissao.map(({ c, plano }) => {
    const id = Number(c.id);
    const dados = json(c.dadosJson);
    const partes = partesDaComissao({
      plano, statusContrato: c.status, hoje, entradaPagaNoAto: !!c.entradaPagaNoAto,
      cobrancas: cobs.filter(x => Number(x.contratoId) === id).map(x => ({ tipo: x.tipo, numero: Number(x.numero), vencimento: String(x.vencimento), status: x.status, pagoEm: x.pagoEm ? String(x.pagoEm) : null })),
      repasses: reps.filter(x => Number(x.contratoId) === id).map(x => ({ chave: x.chave, valor: Number(x.valor), pagoEm: String(x.pagoEm), forma: x.forma, comprovanteUrl: x.comprovanteUrl ?? null })),
    });
    const emp = E.get(Number(c.empreendimentoId));
    return {
      contratoId: id, numero: String(c.numero), status: String(c.status), empreendimento: String(emp?.nome ?? ''), empreendimentoSlug: String(emp?.slug ?? ''),
      lote: String(c.loteCodigo), comprador: String(dados.comp_nome ?? '—'), corretorId: Number(c.corretorUserId), corretor: U.get(Number(c.corretorUserId)) || '—',
      formaPagamento: formaDoPlano(plano), valorVenda: r2(Number(plano.modalidade === 'avista' ? plano.preco_avista ?? 0 : plano.preco_tabela ?? 0)),
      comissao: r2(Number(plano.comissao_corretor)), dataVenda: new Date(c.criadoEm ?? Date.now()).toISOString().slice(0, 10), partes,
    };
  }).sort((a, b) => b.contratoId - a.contratoId);
  const corretores = escritorio
    ? Array.from(new Set(lista.map(c => Number(c.corretorUserId)))).map(i => ({ id: i, nome: U.get(i) || `#${i}` })).sort((a, b) => a.nome.localeCompare(b.nome))
    : [];
  return { vendas, resumo: resumoRepasses(vendas.flatMap(v => v.partes)), corretores, escritorio };
}

/** Marca uma parte como paga ao corretor (administrador e secretária) */
export interface ComprovanteRepasse { base64: string; mime: 'image/png' | 'image/jpeg' | 'application/pdf'; nomeArquivo: string }

/** Texto do WhatsApp ao corretor quando a comissão é paga */
export function mensagemRepassePago(o: { corretor: string; valor: number; parte: string; lote: string; contrato: string; empreendimento: string; pagoEm: string; forma?: string | null; comComprovante: boolean }) {
  const nome = String(o.corretor || '').trim().split(/\s+/)[0] || 'tudo bem';
  const valor = `R$ ${o.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    `Olá, ${nome}! 💰 A Romatec pagou a sua comissão:`, '',
    `Valor: ${valor}`, `Referente a: ${o.parte}`, `Venda: chácara ${o.lote} · ${o.empreendimento} (contrato ${o.contrato})`,
    `Pago em ${o.pagoEm.split('-').reverse().join('/')}${o.forma ? ` por ${o.forma}` : ''}`,
    ...(o.comComprovante ? ['', 'Segue o comprovante. Obrigado pela parceria! 🤝'] : ['', 'Obrigado pela parceria! 🤝']),
  ].join('\n');
}

export type AvisoRepasse = (tel: string, texto: string, comp: ComprovanteRepasse | null) => Promise<void>;
let avisoRepasse: AvisoRepasse = async (tel, texto, comp) => {
  const Z = await import('../leads/zapiClient');
  if (comp?.mime === 'application/pdf') await Z.enviarDocumento(tel, { base64: comp.base64, extensao: 'pdf', mime: comp.mime, nomeArquivo: comp.nomeArquivo || 'comprovante.pdf', legenda: texto });
  else if (comp) await Z.enviarImagem(tel, { base64: comp.base64, mime: comp.mime, legenda: texto });
  else await Z.enviarTexto(tel, texto);
};
/** Testes trocam o envio */
export const definirAvisoRepasse = (f: AvisoRepasse | null) => { if (f) avisoRepasse = f; };

export async function registrarRepasse(permissoes: PermissoesUsuario, usuarioId: number, i: { contratoId: number; chave: string; pagoEm: string; forma?: string; observacao?: string; comprovante?: ComprovanteRepasse | null; avisar?: boolean }) {
  if (permissoes.perfil !== 'admin' && permissoes.perfil !== 'secretario') throw new RepasseErro('Só o administrador e a secretária registram o pagamento da comissão.', 403);
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, i.contratoId)).limit(1);
  if (!c) throw new RepasseErro('Contrato não encontrado', 404);
  if (!temAcesso(permissoes.perfil, permissoes.acessos, 'empreendimento', Number(c.empreendimentoId))) throw new RepasseErro('Sem acesso a este empreendimento', 403);
  if (!STATUS_COM_COMISSAO.includes(c.status)) throw new RepasseErro(`Contrato ${c.status}: não há comissão a pagar`, 409);
  const plano = json(c.simulacaoJson) as PlanoParaRepasse;
  const parte = partesDaComissao({ plano, statusContrato: c.status, cobrancas: [], repasses: [], hoje: hojeBR() }).find(p => p.chave === i.chave);
  if (!parte || !gatilhosDoPlano(plano).some(g => g.chave === i.chave)) throw new RepasseErro('Parte da comissão inválida para este contrato', 400);
  const [ja]: any[] = await d.select({ id: comissaoRepasses.id }).from(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, i.contratoId), eq(comissaoRepasses.chave, i.chave))).limit(1);
  if (ja) throw new RepasseErro('Esta parte da comissão já está registrada como paga', 409);
  // Comprovante do Pix/transferência (fica no registro e vai ao corretor)
  let comprovanteUrl: string | null = null;
  if (i.comprovante) {
    const buf = Buffer.from(i.comprovante.base64, 'base64');
    if (buf.length > 10 * 1024 * 1024) throw new RepasseErro('Comprovante grande demais (máx. 10 MB)', 400);
    const { uploadToCloudinary } = await import('../cloudinary');
    comprovanteUrl = (await uploadToCloudinary(buf, i.comprovante.mime, i.comprovante.nomeArquivo, { folder: 'financeiro/comissoes' })).url;
  }
  await d.insert(comissaoRepasses).values({
    contratoId: i.contratoId, corretorUserId: Number(c.corretorUserId), chave: i.chave, valor: parte.valor.toFixed(2), pagoEm: i.pagoEm,
    forma: i.forma?.slice(0, 30) || null, observacao: i.observacao?.slice(0, 300) || null, registradoPor: usuarioId, comprovanteUrl,
  } as any);
  // Aviso ao corretor no WhatsApp, com o comprovante
  let avisado = false; let erroAviso: string | null = null;
  if (i.avisar !== false) {
    const [u]: any[] = await d.select({ name: users.name, telefone: users.telefone }).from(users).where(eq(users.id, Number(c.corretorUserId))).limit(1);
    const tel = String(u?.telefone ?? '').replace(/\D/g, '');
    if (tel.length < 10) erroAviso = 'corretor sem WhatsApp no cadastro';
    else {
      const [e]: any[] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, Number(c.empreendimentoId))).limit(1);
      const texto = mensagemRepassePago({ corretor: String(u?.name ?? ''), valor: parte.valor, parte: parte.quando, lote: String(c.loteCodigo), contrato: String(c.numero), empreendimento: String(e?.nome ?? ''), pagoEm: i.pagoEm, forma: i.forma, comComprovante: !!i.comprovante });
      try { await avisoRepasse(tel.startsWith('55') && tel.length >= 12 ? tel : `55${tel}`, texto, i.comprovante ?? null); avisado = true; }
      catch (err: any) { erroAviso = String(err?.message ?? err).slice(0, 160); console.warn('[Comissão] aviso ao corretor:', erroAviso); }
    }
  }
  return { ok: true as const, valor: parte.valor, comprovanteUrl, avisado, erroAviso };
}

/** Desfaz um registro de pagamento (só o administrador, para corrigir engano) */
export async function desfazerRepasse(permissoes: PermissoesUsuario, i: { contratoId: number; chave: string }) {
  if (permissoes.perfil !== 'admin') throw new RepasseErro('Só o administrador desfaz o registro de pagamento.', 403);
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const ant: any[] = await d.select().from(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, i.contratoId), eq(comissaoRepasses.chave, i.chave)));
  await d.delete(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, i.contratoId), eq(comissaoRepasses.chave, i.chave)));
  // Recebimento da proprietária: a saída lançada no caixa do empreendimento é cancelada junto
  const { cancelarSaidaComissao } = await import('./saidaComissao');
  for (const r of ant) await cancelarSaidaComissao(r.observacao, 0);
  return { ok: true as const };
}
