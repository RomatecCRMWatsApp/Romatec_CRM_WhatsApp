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

/** Id da despesa lançada no caixa pelo repasse (marcado na observação do registro) */
export function despesaDoRegistro(obs: unknown): number | null { const m = /despesa:#(\d+)/.exec(String(obs ?? '')); return m ? Number(m[1]) : null; }

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

const dataTxt = (v: unknown): string | null => { if (v == null || v === '') return null; if (typeof v === 'string' && /^\d+$/.test(v)) v = Number(v); const d = v instanceof Date ? v : typeof v === 'number' ? new Date(v < 1e11 ? v * 1000 : v) : new Date(String(v).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

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
      repasses: reps.filter(x => Number(x.contratoId) === id).map(x => ({ chave: x.chave, valor: Number(x.valor), pagoEm: String(x.pagoEm), forma: x.forma, comprovanteUrl: x.comprovanteUrl ?? null, despesaId: despesaDoRegistro(x.observacao), demonstrativoAssinadoEm: dataTxt(x.demonstrativoAssinadoEm), demonstrativoEnviadoEm: dataTxt(x.demonstrativoEnviadoEm) })),
    });
    const emp = E.get(Number(c.empreendimentoId));
    return {
      contratoId: id, numero: String(c.numero), status: String(c.status), empreendimento: String(emp?.nome ?? ''), empreendimentoSlug: String(emp?.slug ?? ''),
      lote: String(c.loteCodigo), comprador: String(dados.comp_nome ?? '—'), corretorId: Number(c.corretorUserId), corretor: U.get(Number(c.corretorUserId)) || '—',
      formaPagamento: formaDoPlano(plano), valorVenda: r2(Number(plano.modalidade === 'avista' ? plano.preco_avista ?? 0 : plano.preco_tabela ?? 0)),
      comissao: r2(Number(plano.comissao_corretor)), dataVenda: (dataTxt(c.criadoEm) ?? new Date().toISOString()).slice(0, 10), partes,
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

export async function registrarRepasse(permissoes: PermissoesUsuario, usuarioId: number, i: { contratoId: number; chave: string; pagoEm: string; forma?: string; observacao?: string; comprovante?: ComprovanteRepasse | null; avisar?: boolean; doCaixa?: boolean }) {
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
  // Comprovante do Pix/transferência (fica no registro e vai ao corretor): o valor tem que bater com a parte
  let comprovanteUrl: string | null = null;
  const conferencia = i.comprovante ? await conferirValorComprovante(i.comprovante, parte.valor) : null;
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
  // Saiu do caixa do empreendimento: despesa no saldo da proprietária, com o pedido de ciência dela
  let despesaId: number | null = null;
  if (i.doCaixa !== false) despesaId = await debitarNoCaixa(d, c, i.chave, parte.valor, parte.quando, { pagoEm: i.pagoEm, forma: i.forma, comprovanteUrl }, usuarioId);
  // O demonstrativo só vai ao corretor depois de assinado pelo administrador (certificado digital): ver assinarDemonstrativo
  return { ok: true as const, valor: parte.valor, comprovanteUrl, despesaId, aguardandoAssinatura: true as const, valorConferido: conferencia?.conferido ?? null };
}

/** Lança a parte do corretor como despesa paga no caixa do empreendimento e marca o registro do repasse */
async function debitarNoCaixa(d: any, c: any, chave: string, valor: number, quando: string, o: { pagoEm: string; forma?: string | null; comprovanteUrl: string | null }, usuarioId: number): Promise<number | null> {
  const [u]: any[] = await d.select({ name: users.name }).from(users).where(eq(users.id, Number(c.corretorUserId))).limit(1);
  const nome = String(u?.name ?? 'corretor(a)');
  const { lancarSaidaComissao } = await import('./saidaComissao');
  const despesaId = await lancarSaidaComissao({
    empreendimentoId: Number(c.empreendimentoId), descricao: `Comissão do corretor — chácara ${c.loteCodigo} (${c.numero}) · ${quando}`,
    valor, pagoEm: o.pagoEm, forma: o.forma, autorId: usuarioId, fornecedor: nome, comprovanteUrl: o.comprovanteUrl, pedirCiencia: true, comissao: { contratoId: Number(c.id), chave },
    observacao: `Repasse da comissão de corretagem ao corretor(a) ${nome} (parte da comissão de venda; a parte do escritório sai à parte)`,
  });
  if (despesaId) {
    const [r]: any[] = await d.select({ id: comissaoRepasses.id, observacao: comissaoRepasses.observacao }).from(comissaoRepasses)
      .where(and(eq(comissaoRepasses.contratoId, Number(c.id)), eq(comissaoRepasses.chave, chave))).limit(1);
    if (r) await d.update(comissaoRepasses).set({ observacao: [r.observacao, `despesa:#${despesaId}`].filter(Boolean).join(' · ').slice(0, 300) } as any).where(eq(comissaoRepasses.id, r.id));
    await ajustarGestaoAntiga(d, Number(c.id), chave, valor, usuarioId);
  }
  return despesaId;
}

/**
 * Recebimentos da comissão de gestão registrados antes da divisão escritório × corretor lançaram a parte inteira
 * (escritório + corretor) no caixa. Quando o repasse do corretor dessa parte sai do caixa, aquela despesa fica só
 * com a parte do escritório, para não contar a do corretor duas vezes.
 */
async function ajustarGestaoAntiga(d: any, contratoId: number, chave: string, valorCorretor: number, usuarioId: number) {
  const { chaveGestao } = await import('./saldoProprietaria');
  const [g]: any[] = await d.select().from(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, contratoId), eq(comissaoRepasses.chave, chaveGestao(chave)))).limit(1);
  const idDesp = despesaDoRegistro(g?.observacao);
  if (!g || !idDesp) return;
  const { financeiroDespesas } = await import('../../drizzle/schema');
  const [x]: any[] = await d.select().from(financeiroDespesas).where(eq(financeiroDespesas.id, idDesp)).limit(1);
  const atual = Number(x?.valorPago ?? x?.valor ?? 0);
  if (!x || Math.abs(atual - Number(g.valor)) > 0.01 || !(atual - valorCorretor > 0)) return; // já está dividida
  const novo = r2(atual - valorCorretor);
  await d.update(financeiroDespesas).set({ valor: novo.toFixed(2), valorPago: novo.toFixed(2), updatedAt: new Date() } as any).where(eq(financeiroDespesas.id, idDesp));
  await d.update(comissaoRepasses).set({ valor: novo.toFixed(2) } as any).where(eq(comissaoRepasses.id, g.id));
  console.log(`[Comissão] despesa #${idDesp} ajustada para a parte do escritório (R$ ${novo.toFixed(2)}) por ${usuarioId}`);
}

/**
 * Confere o valor do comprovante com o valor da parte da comissão: divergência bloqueia o registro (evita anexar o
 * comprovante de outra venda). Se o valor não puder ser lido, segue e avisa na tela para conferir.
 */
export async function conferirValorComprovante(comp: ComprovanteRepasse, esperado: number): Promise<{ conferido: boolean; lido: number | null }> {
  let lido: number | null = null;
  try {
    const { lerComprovante } = await import('./comprovante');
    lido = (await lerComprovante({ base64: comp.base64, mime: comp.mime })).valor ?? null;
  } catch (e: any) { console.warn('[Comissão] comprovante não lido:', e?.message); }
  if (lido == null) return { conferido: false, lido: null };
  if (Math.abs(lido - esperado) > 0.01) {
    const f = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    throw new RepasseErro(`O comprovante é de ${f(lido)}, mas esta parte da comissão é de ${f(esperado)}. Confira se é o comprovante desta venda: o registro não foi feito.`, 409);
  }
  return { conferido: true, lido };
}

/** Guardar, ler e assinar o demonstrativo (testes trocam) */
export const demonstrativoIO = {
  async guardar(pdf: Buffer, nome: string): Promise<string> {
    const { uploadToCloudinary } = await import('../cloudinary');
    return (await uploadToCloudinary(pdf, 'application/pdf', nome, { folder: 'financeiro/comissoes/demonstrativos' })).url;
  },
  async ler(url: string): Promise<Buffer> {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`demonstrativo assinado indisponível (HTTP ${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  },
  async assinar(usuarioId: number, pdf: Buffer, senha: string, pfxAgora: Buffer | null): Promise<{ pdf: Buffer; titular: string }> {
    const { assinarComMeuCertificado } = await import('../certificado/servico');
    const r = await assinarComMeuCertificado(usuarioId, pdf, senha, { motivo: 'Demonstrativo de pagamento de comissão', pfxAgora });
    return { pdf: r.pdf, titular: r.info.nome };
  },
};

async function registroDaParte(d: any, contratoId: number, chave: string) {
  const [r]: any[] = await d.select().from(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, contratoId), eq(comissaoRepasses.chave, chave))).limit(1);
  return r ?? null;
}

/** Manda ao corretor o demonstrativo JÁ ASSINADO da parte paga */
async function enviarDemonstrativoAoCorretor(d: any, c: any, chave: string): Promise<{ avisado: boolean; erroAviso: string | null }> {
  const reg = await registroDaParte(d, Number(c.id), chave);
  if (!reg?.demonstrativoUrl) return { avisado: false, erroAviso: 'o demonstrativo ainda não foi assinado' };
  const D = await import('./demonstrativoComissao');
  const dados = await D.dadosDemonstrativo(Number(c.id), hojeBR());
  if (!dados) return { avisado: false, erroAviso: 'contrato não encontrado' };
  const tel = dados.corretor.telefone.replace(/\D/g, '');
  if (tel.length < 10) return { avisado: false, erroAviso: 'corretor sem WhatsApp no cadastro' };
  const parte = dados.partes.find(p => p.chave === chave);
  if (!parte || parte.situacao !== 'paga') return { avisado: false, erroAviso: 'esta parte ainda não está paga' };
  const texto = mensagemRepassePago({ corretor: dados.corretor.nome, valor: parte.valor, parte: parte.quando, lote: dados.lote, contrato: dados.contrato.numero, empreendimento: dados.empreendimento, pagoEm: parte.pagoEm!, forma: parte.forma, comComprovante: true });
  let pdf: Buffer;
  try { pdf = await demonstrativoIO.ler(String(reg.demonstrativoUrl)); }
  catch (e: any) { return { avisado: false, erroAviso: String(e?.message ?? e).slice(0, 160) }; }
  const anexo: ComprovanteRepasse = { base64: pdf.toString('base64'), mime: 'application/pdf', nomeArquivo: D.nomeDemonstrativo(dados, chave) };
  try {
    await avisoRepasse(tel.startsWith('55') && tel.length >= 12 ? tel : `55${tel}`, texto, anexo);
    await d.update(comissaoRepasses).set({ demonstrativoEnviadoEm: new Date() } as any).where(eq(comissaoRepasses.id, reg.id));
    return { avisado: true, erroAviso: null };
  } catch (err: any) { const m = String(err?.message ?? err).slice(0, 160); console.warn('[Comissão] aviso ao corretor:', m); return { avisado: false, erroAviso: m }; }
}

async function contratoAutorizado(permissoes: PermissoesUsuario, contratoId: number) {
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new RepasseErro('Contrato não encontrado', 404);
  if (!temAcesso(permissoes.perfil, permissoes.acessos, 'empreendimento', Number(c.empreendimentoId))) throw new RepasseErro('Sem acesso a este empreendimento', 403);
  return { d, c };
}

/** Repasse já pago que não saiu do caixa do empreendimento (registrado antes): lança agora e pede a ciência */
export async function debitarRepasse(permissoes: PermissoesUsuario, usuarioId: number, i: { contratoId: number; chave: string }) {
  if (permissoes.perfil !== 'admin' && permissoes.perfil !== 'secretario') throw new RepasseErro('Só o administrador e a secretária lançam no caixa.', 403);
  const { d, c } = await contratoAutorizado(permissoes, i.contratoId);
  const [r]: any[] = await d.select().from(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, i.contratoId), eq(comissaoRepasses.chave, i.chave))).limit(1);
  if (!r) throw new RepasseErro('Este repasse ainda não foi registrado como pago', 404);
  if (despesaDoRegistro(r.observacao)) throw new RepasseErro('Este repasse já saiu do caixa do empreendimento', 409);
  const parte = gatilhosDoPlano(json(c.simulacaoJson)).find(g => g.chave === i.chave);
  const despesaId = await debitarNoCaixa(d, c, i.chave, Number(r.valor), parte?.quando ?? i.chave, { pagoEm: String(r.pagoEm).slice(0, 10), forma: r.forma, comprovanteUrl: r.comprovanteUrl ?? null }, usuarioId);
  if (!despesaId) throw new RepasseErro('Não foi possível lançar a despesa (empreendimento sem caixa?)', 409);
  return { ok: true as const, despesaId };
}

/**
 * O administrador assina o demonstrativo com o certificado digital dele (o comprovante vai anexo antes da assinatura)
 * e o CRM manda o PDF assinado ao corretor. Assinar de novo troca o PDF (vale o último).
 */
export async function assinarDemonstrativo(permissoes: PermissoesUsuario, usuarioId: number, i: { contratoId: number; chave: string; senha: string; pfxBase64?: string | null; enviar?: boolean }) {
  if (permissoes.perfil !== 'admin') throw new RepasseErro('Só o administrador assina o demonstrativo de comissão.', 403);
  if (!i.senha) throw new RepasseErro('Informe a senha do certificado digital.', 400);
  const { d, c } = await contratoAutorizado(permissoes, i.contratoId);
  const reg = await registroDaParte(d, i.contratoId, i.chave);
  if (!reg) throw new RepasseErro('Registre o pagamento desta parte antes de assinar o demonstrativo.', 409);
  const D = await import('./demonstrativoComissao');
  const dados = await D.dadosDemonstrativo(Number(c.id), hojeBR());
  if (!dados || !dados.partes.some(p => p.chave === i.chave)) throw new RepasseErro('Parte da comissão não encontrada', 404);
  const base = await D.pdfDemonstrativo(dados, i.chave, reg.comprovanteUrl ? { url: String(reg.comprovanteUrl) } : null);
  let assinado: { pdf: Buffer; titular: string };
  try { assinado = await demonstrativoIO.assinar(usuarioId, base, i.senha, i.pfxBase64 ? Buffer.from(i.pfxBase64, 'base64') : null); }
  catch (e: any) { throw new RepasseErro(String(e?.message ?? e).slice(0, 220), Number(e?.status) || 422); }
  const url = await demonstrativoIO.guardar(assinado.pdf, D.nomeDemonstrativo(dados, i.chave).replace(/\.pdf$/, '-assinado'));
  await d.update(comissaoRepasses).set({ demonstrativoUrl: url, demonstrativoAssinadoEm: new Date() } as any).where(eq(comissaoRepasses.id, reg.id));
  let avisado = false; let erroAviso: string | null = null;
  if (i.enviar !== false) ({ avisado, erroAviso } = await enviarDemonstrativoAoCorretor(d, c, i.chave));
  return { ok: true as const, titular: assinado.titular, avisado, erroAviso };
}

/**
 * Troca ou remove o comprovante de um repasse já registrado (ex.: comprovante de outra venda anexado por engano).
 * Vale também para a despesa no caixa da proprietária. Se o demonstrativo já foi assinado, ele precisa ser assinado de novo.
 */
export async function trocarComprovante(permissoes: PermissoesUsuario, usuarioId: number, i: { contratoId: number; chave: string; comprovante: ComprovanteRepasse | null }) {
  if (permissoes.perfil !== 'admin' && permissoes.perfil !== 'secretario') throw new RepasseErro('Só o administrador e a secretária mexem no comprovante.', 403);
  const { d } = await contratoAutorizado(permissoes, i.contratoId);
  const reg = await registroDaParte(d, i.contratoId, i.chave);
  if (!reg) throw new RepasseErro('Este repasse ainda não foi registrado como pago', 404);
  let url: string | null = null;
  const conferencia = i.comprovante ? await conferirValorComprovante(i.comprovante, Number(reg.valor)) : null;
  if (i.comprovante) {
    const buf = Buffer.from(i.comprovante.base64, 'base64');
    if (buf.length > 10 * 1024 * 1024) throw new RepasseErro('Comprovante grande demais (máx. 10 MB)', 400);
    const { uploadToCloudinary } = await import('../cloudinary');
    url = (await uploadToCloudinary(buf, i.comprovante.mime, i.comprovante.nomeArquivo, { folder: 'financeiro/comissoes' })).url;
  }
  await d.update(comissaoRepasses).set({ comprovanteUrl: url, demonstrativoUrl: null, demonstrativoAssinadoEm: null, demonstrativoEnviadoEm: null } as any).where(eq(comissaoRepasses.id, reg.id));
  const idDesp = despesaDoRegistro(reg.observacao);
  if (idDesp) {
    const { financeiroDespesas } = await import('../../drizzle/schema');
    await d.update(financeiroDespesas).set({ comprovanteUrl: url, updatedAt: new Date() } as any).where(eq(financeiroDespesas.id, idDesp));
  }
  console.log(`[Comissão] comprovante do repasse ${i.contratoId}/${i.chave} ${url ? 'trocado' : 'removido'} por ${usuarioId}`);
  return { ok: true as const, comprovanteUrl: url, reassinar: !!reg.demonstrativoUrl, valorConferido: conferencia?.conferido ?? null };
}

/** Reenvia ao corretor o demonstrativo assinado de uma parte paga */
export async function reenviarDemonstrativo(permissoes: PermissoesUsuario, i: { contratoId: number; chave: string }) {
  if (permissoes.perfil !== 'admin' && permissoes.perfil !== 'secretario') throw new RepasseErro('Só o administrador e a secretária enviam o demonstrativo.', 403);
  const { d, c } = await contratoAutorizado(permissoes, i.contratoId);
  const r = await enviarDemonstrativoAoCorretor(d, c, i.chave);
  if (!r.avisado) throw new RepasseErro(`Demonstrativo não enviado: ${r.erroAviso}`, 409);
  return { ok: true as const };
}

/** O PDF do demonstrativo: o assinado; antes da assinatura, o escritório vê a prévia (sem assinatura) e o corretor ainda não tem acesso */
export async function demonstrativoPdf(permissoes: PermissoesUsuario, usuarioId: number, i: { contratoId: number; chave: string }) {
  const { d, c } = await contratoAutorizado(permissoes, i.contratoId);
  const escritorio = permissoes.perfil === 'admin' || permissoes.perfil === 'secretario';
  if (!escritorio && !(permissoes.perfil === 'corretor' && Number(c.corretorUserId) === usuarioId)) throw new RepasseErro('Sem acesso a este demonstrativo', 403);
  const D = await import('./demonstrativoComissao');
  const dados = await D.dadosDemonstrativo(Number(c.id), hojeBR());
  if (!dados || !dados.partes.some(p => p.chave === i.chave)) throw new RepasseErro('Parte da comissão não encontrada', 404);
  const reg = await registroDaParte(d, i.contratoId, i.chave);
  if (reg?.demonstrativoUrl) {
    const pdf = await demonstrativoIO.ler(String(reg.demonstrativoUrl));
    return { base64: pdf.toString('base64'), nome: D.nomeDemonstrativo(dados, i.chave).replace(/\.pdf$/, '-assinado.pdf'), assinado: true };
  }
  if (!escritorio) throw new RepasseErro('O demonstrativo desta parte ainda não foi assinado pelo escritório.', 409);
  const pdf = await D.pdfDemonstrativo(dados, i.chave, reg?.comprovanteUrl ? { url: String(reg.comprovanteUrl) } : null);
  return { base64: pdf.toString('base64'), nome: D.nomeDemonstrativo(dados, i.chave).replace(/\.pdf$/, '-PREVIA.pdf'), assinado: false };
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
