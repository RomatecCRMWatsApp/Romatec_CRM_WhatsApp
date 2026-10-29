/**
 * Portal do comprador (/c/:codigo): além do carnê digital (carneDigital.ts), os documentos do contrato, o andamento
 * da obra, a antecipação de parcelas (simulação + pedido) e os chamados. O código de verificação do contrato é a chave;
 * as rotas públicas passam pelo mesmo limite por IP do carnê. O escritório responde pela tela Vendas › Portal do comprador.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { carteiras, contratos, empreendimentos, obraAtualizacoes, portalChamados, users } from '../../drizzle/schema';
import { DOCUMENTOS_CLIENTE, empDocsValido } from '../../shared/documentosCliente';
import { ROTULO_CHAMADO, TIPOS_CHAMADO, antecipaveis, simularAntecipacao, type TipoChamado } from '../../shared/portalComprador';
import { rotuloParcela } from './dados';
import { cobrancasDoContrato, contextoDocs, FinanceiroErro, hojeBrasil, pessoasDoContrato, urlPublica } from './servico';

export const STATUS_PORTAL = ['assinado', 'ativo', 'quitado'];
const MAX_ABERTOS = 5;

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  return d;
}

/** Contrato pelo código (só assinado, ativo ou quitado) */
export async function contratoDoCodigo(codigo: string) {
  if (!/^[A-Z0-9]{12}$/.test(codigo)) throw new FinanceiroErro('CODIGO', 'Código inválido', 404);
  const d = await banco();
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.codigoVerificacao, codigo)).limit(1);
  if (!c) throw new FinanceiroErro('CODIGO', 'Contrato não encontrado — confira o código', 404);
  if (!STATUS_PORTAL.includes(c.status)) throw new FinanceiroErro('STATUS', 'O portal abre depois do contrato assinado por todos.', 409);
  const [emp]: any[] = await d.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  return { c, emp: emp ?? null };
}

/** Parcelas em aberto (não pagas, não canceladas) no formato da simulação */
async function abertasDo(contratoId: number) {
  const cobs = await cobrancasDoContrato(contratoId);
  return cobs.filter((x: any) => !['paga', 'cancelada'].includes(x.status) && x.tipo !== 'antecipacao')
    .map((x: any) => ({ id: Number(x.id), rotulo: rotuloParcela(x), vencimento: String(x.vencimento).slice(0, 10), valor: Number(x.valor) }));
}

/** Tudo o que o portal mostra além do carnê */
export async function portalDoComprador(codigo: string, hoje = hojeBrasil()) {
  const { c, emp } = await contratoDoCodigo(codigo);
  const d = await banco();
  const docs: { titulo: string; descricao: string; url: string }[] = [];
  if (c.pdfAtual) docs.push({ titulo: `Contrato ${c.numero}`, descricao: 'Versão assinada (PDF)', url: `/api/c/${codigo}/contrato.pdf` });
  if (emp && empDocsValido(emp.slug)) {
    for (const slug of ['estatuto', 'diretrizes', 'tarifa-agua']) {
      const doc = DOCUMENTOS_CLIENTE.find(x => x.slug === slug);
      if (doc) docs.push({ titulo: doc.titulo, descricao: doc.subtitulo, url: `/documentos/${emp.slug}/${slug}` });
    }
  }
  docs.push({ titulo: 'Verificação do contrato', descricao: 'Situação das assinaturas e conferência do arquivo', url: `/c/v/${codigo}` });
  const carts: any[] = await d.select({ numero: carteiras.numero, qrToken: carteiras.qrToken, validade: carteiras.validade, titularTipo: carteiras.titularTipo, status: carteiras.status })
    .from(carteiras).where(and(eq(carteiras.contratoId, c.id), eq(carteiras.status, 'ativa')));
  const obra: any[] = emp ? await d.select().from(obraAtualizacoes).where(eq(obraAtualizacoes.empreendimentoId, emp.id)).orderBy(desc(obraAtualizacoes.data), desc(obraAtualizacoes.id)).limit(30) : [];
  const chamados: any[] = await d.select().from(portalChamados).where(eq(portalChamados.contratoId, c.id)).orderBy(desc(portalChamados.criadoEm));
  const abertas = await abertasDo(c.id);
  const ctx = await contextoDocs(c.id).catch(() => null);
  const { situacaoRegistro } = await import('../cartorio');
  const reg = await situacaoRegistro(Number(c.id)).catch(() => null);
  return {
    registro: reg ? { rotulo: reg.rotulo, status: reg.status, protocolo: reg.protocolo, dataProtocolo: reg.dataProtocolo, matricula: reg.matricula, registradoEm: reg.registradoEm } : null,
    documentos: docs,
    carteirinhas: carts.map(x => ({ numero: String(x.numero), validade: String(x.validade).slice(0, 10), titular: x.titularTipo === 'comprador' ? 'Titular' : x.titularTipo === 'conjuge' ? 'Cônjuge' : 'Dependente', url: `/p/c/${x.qrToken}` })),
    obra: obra.map(o => ({ id: Number(o.id), titulo: String(o.titulo), texto: String(o.texto), percentual: o.percentual == null ? null : Number(o.percentual), data: String(o.data), foto: o.fotoArquivo ? `/api/c/${codigo}/obra/${o.id}.webp` : null })),
    chamados: chamados.map(x => ({ id: Number(x.id), tipo: x.tipo as TipoChamado, rotulo: ROTULO_CHAMADO[x.tipo as TipoChamado] ?? x.tipo, assunto: String(x.assunto), mensagem: String(x.mensagem), status: String(x.status), resposta: x.resposta ?? null, criadoEm: new Date(x.criadoEm).toISOString(), respondidoEm: x.respondidoEm ? new Date(x.respondidoEm).toISOString() : null })),
    antecipacao: { maximo: c.status === 'quitado' ? 0 : antecipaveis(abertas, hoje), taxaMensal: Number(ctx?.plano?.taxa_am ?? 0) },
  };
}

export async function simularDoCodigo(codigo: string, quantidade: number, hoje = hojeBrasil()) {
  const { c } = await contratoDoCodigo(codigo);
  const ctx = await contextoDocs(c.id);
  return simularAntecipacao(await abertasDo(c.id), Number(ctx.plano?.taxa_am ?? 0), quantidade, hoje);
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Abre um chamado (texto livre) ou o pedido de antecipação (com a simulação) */
export async function abrirChamado(codigo: string, e: { tipo: string; assunto?: string; mensagem?: string; quantidade?: number }, hoje = hojeBrasil()) {
  const { c, emp } = await contratoDoCodigo(codigo);
  if (!(TIPOS_CHAMADO as readonly string[]).includes(e.tipo)) throw new FinanceiroErro('TIPO', 'Escolha o assunto', 400);
  const d = await banco();
  const abertos: any[] = await d.select({ id: portalChamados.id }).from(portalChamados).where(and(eq(portalChamados.contratoId, c.id), eq(portalChamados.status, 'aberto')));
  if (abertos.length >= MAX_ABERTOS) throw new FinanceiroErro('LIMITE', `Você já tem ${MAX_ABERTOS} chamados em aberto. Aguarde a resposta da administração.`, 429);
  let assunto = String(e.assunto ?? '').trim().slice(0, 160);
  let mensagem = String(e.mensagem ?? '').trim().slice(0, 3000);
  let dadosJson: string | null = null;
  if (e.tipo === 'antecipacao') {
    const ctx = await contextoDocs(c.id);
    const sim = simularAntecipacao(await abertasDo(c.id), Number(ctx.plano?.taxa_am ?? 0), Number(e.quantidade) || 0, hoje);
    if (!sim.parcelas.length) throw new FinanceiroErro('ANTECIPACAO', 'Escolha quantas parcelas quer antecipar', 400);
    assunto = `Antecipar ${sim.parcelas.length} parcela(s) — ${brl(sim.totalAPagar)}`;
    mensagem = `${mensagem ? `${mensagem}\n\n` : ''}Simulação de ${hoje.split('-').reverse().join('/')}: ${sim.parcelas.map(p => p.rotulo).join(', ')}. ` +
      `Valor das parcelas ${brl(sim.totalNominal)}; com o desconto dos juros, ${brl(sim.totalAPagar)} (economia de ${brl(sim.economia)}).`;
    dadosJson = JSON.stringify(sim);
  } else {
    if (assunto.length < 3) throw new FinanceiroErro('ASSUNTO', 'Escreva o assunto', 400);
    if (mensagem.length < 5) throw new FinanceiroErro('MENSAGEM', 'Escreva a mensagem', 400);
  }
  await d.insert(portalChamados).values({ contratoId: c.id, tipo: e.tipo, assunto, mensagem, dadosJson, status: 'aberto', criadoEm: new Date() } as any);
  const { notificarChamado } = await import('../notificacoes');
  notificarChamado({ contrato: c.numero, lote: c.loteCodigo, empreendimentoId: c.empreendimentoId, empreendimentoSlug: emp?.slug ?? '', tipo: e.tipo, assunto })
    .catch(err => console.warn('[Portal] aviso de chamado:', err?.message ?? err));
  return { ok: true as const, assunto };
}

// ─── Escritório ──────────────────────────────────────────────────────────────

export async function listarChamados(status?: 'aberto' | 'respondido' | 'fechado' | null) {
  const d = await banco();
  const rs: any[] = await d.select().from(portalChamados).where(status ? eq(portalChamados.status, status) : undefined as any).orderBy(desc(portalChamados.criadoEm)).limit(300);
  if (!rs.length) return [];
  const cids = Array.from(new Set(rs.map(x => Number(x.contratoId))));
  const cs: any[] = await d.select({ id: contratos.id, numero: contratos.numero, lote: contratos.loteCodigo, codigo: contratos.codigoVerificacao }).from(contratos).where(inArray(contratos.id, cids));
  const uids = Array.from(new Set(rs.map(x => Number(x.respondidoPor)).filter(Boolean)));
  const us: any[] = uids.length ? await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uids)) : [];
  const nomes = new Map<number, string>();
  for (const id of cids) {
    const { comprador } = await pessoasDoContrato(id).catch(() => ({ comprador: null as any }));
    nomes.set(id, String(comprador?.nome ?? '—'));
  }
  return rs.map(x => {
    const c = cs.find(k => Number(k.id) === Number(x.contratoId));
    return {
      id: Number(x.id), contratoId: Number(x.contratoId), contrato: c?.numero ?? '—', lote: c?.lote ?? '—', comprador: nomes.get(Number(x.contratoId)) ?? '—',
      tipo: String(x.tipo), rotulo: ROTULO_CHAMADO[x.tipo as TipoChamado] ?? x.tipo, assunto: String(x.assunto), mensagem: String(x.mensagem),
      status: String(x.status), resposta: x.resposta ?? null, respondidoPor: x.respondidoPor ? us.find(u => Number(u.id) === Number(x.respondidoPor))?.name ?? null : null,
      criadoEm: new Date(x.criadoEm).toISOString(), respondidoEm: x.respondidoEm ? new Date(x.respondidoEm).toISOString() : null,
    };
  });
}

export type Enviador = (telefone: string, texto: string) => Promise<unknown>;
const enviadorPadrao: Enviador = async (tel, txt) => { const { enviarTexto } = await import('../leads/zapiClient'); return enviarTexto(tel, txt); };
const fone = (v: unknown) => { const s = String(v ?? '').replace(/\D/g, ''); return s.length < 10 ? null : s.startsWith('55') && s.length >= 12 ? s : `55${s}`; };

/** Responde (e opcionalmente encerra) o chamado; o comprador recebe aviso no WhatsApp com o link do portal */
export async function responderChamado(id: number, resposta: string, fechar: boolean, autorId: number, enviar: Enviador = enviadorPadrao) {
  const d = await banco();
  const [x]: any[] = await d.select().from(portalChamados).where(eq(portalChamados.id, id)).limit(1);
  if (!x) throw new FinanceiroErro('NAO_ENCONTRADO', 'Chamado não encontrado', 404);
  const texto = resposta.trim().slice(0, 3000);
  if (texto.length < 2) throw new FinanceiroErro('RESPOSTA', 'Escreva a resposta', 400);
  await d.update(portalChamados).set({ resposta: texto, status: fechar ? 'fechado' : 'respondido', respondidoPor: autorId, respondidoEm: new Date() } as any).where(eq(portalChamados.id, id));
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, x.contratoId)).limit(1);
  const { comprador } = await pessoasDoContrato(Number(x.contratoId)).catch(() => ({ comprador: null as any }));
  const tel = fone(comprador?.telefone1);
  let avisado = false;
  if (tel && c) {
    const nome = String(comprador?.nome ?? '').trim().split(/\s+/)[0] || 'cliente';
    await enviar(tel, `Olá, ${nome}! A administração respondeu o seu chamado "${x.assunto}". Veja no seu portal: ${urlPublica()}/c/${c.codigoVerificacao}`)
      .then(() => { avisado = true; }).catch((e: any) => console.warn('[Portal] WhatsApp da resposta:', e?.message ?? e));
  }
  return { ok: true as const, avisado };
}

export async function listarObra(empreendimentoId: number) {
  const d = await banco();
  const rs: any[] = await d.select().from(obraAtualizacoes).where(eq(obraAtualizacoes.empreendimentoId, empreendimentoId)).orderBy(desc(obraAtualizacoes.data), desc(obraAtualizacoes.id));
  return rs.map(o => ({ id: Number(o.id), titulo: String(o.titulo), texto: String(o.texto), percentual: o.percentual == null ? null : Number(o.percentual), data: String(o.data), temFoto: !!o.fotoArquivo }));
}

/** Nova atualização da obra (foto opcional, reduzida para 1600 px em WEBP) */
export async function publicarObra(e: { empreendimentoId: number; titulo: string; texto: string; percentual: number | null; data: string; fotoBase64?: string | null }, autorId: number) {
  const d = await banco();
  let fotoArquivo: string | null = null;
  if (e.fotoBase64) {
    const bruto = Buffer.from(e.fotoBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (bruto.length > 12 * 1024 * 1024) throw new FinanceiroErro('FOTO', 'Foto maior que 12 MB', 413);
    const sharp = (await import('sharp')).default;
    const webp = await sharp(bruto).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
      .catch(() => { throw new FinanceiroErro('FOTO', 'Imagem inválida (use JPG, PNG ou WEBP)', 415); });
    const { salvarArquivo } = await import('../contratos/arquivos');
    fotoArquivo = `obra/${e.empreendimentoId}/${Date.now()}.webp`;
    await salvarArquivo(fotoArquivo, webp, 'image/webp');
  }
  await d.insert(obraAtualizacoes).values({
    empreendimentoId: e.empreendimentoId, titulo: e.titulo.trim().slice(0, 160), texto: e.texto.trim().slice(0, 5000),
    percentual: e.percentual == null ? null : Math.max(0, Math.min(100, Math.round(e.percentual))), data: e.data, fotoArquivo, criadoPor: autorId, criadoEm: new Date(),
  } as any);
  return { ok: true as const };
}

export async function excluirObra(id: number) {
  const d = await banco();
  await d.delete(obraAtualizacoes).where(eq(obraAtualizacoes.id, id));
  return { ok: true as const };
}

/** Foto de uma atualização (só para contrato do mesmo empreendimento) */
export async function fotoObra(codigo: string, id: number): Promise<Buffer | null> {
  const { emp } = await contratoDoCodigo(codigo);
  const d = await banco();
  const [o]: any[] = await d.select().from(obraAtualizacoes).where(eq(obraAtualizacoes.id, id)).limit(1);
  if (!o || !emp || Number(o.empreendimentoId) !== Number(emp.id) || !o.fotoArquivo) return null;
  const { lerArquivo } = await import('../contratos/arquivos');
  return (await lerArquivo(o.fotoArquivo))?.buf ?? null;
}

/** PDF do contrato assinado (versão atual) */
export async function contratoPdfDoCodigo(codigo: string): Promise<{ buf: Buffer; numero: string } | null> {
  const { c } = await contratoDoCodigo(codigo);
  if (!c.pdfAtual) return null;
  const { lerArquivo } = await import('../contratos/arquivos');
  const a = await lerArquivo(c.pdfAtual);
  return a ? { buf: a.buf, numero: String(c.numero) } : null;
}
