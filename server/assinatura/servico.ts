/**
 * Assinatura eletrônica do contrato (spec §6): signatários, convites por WhatsApp, avançada (leitura + código),
 * ICP-Brasil A1 (em memória), gov.br (upload do arquivo assinado), ordem, manifesto e ativação do contrato.
 *
 * Ordem do fluxo: carimbos das avançadas primeiro (regravam o PDF), depois ICP/gov.br em sequência (incrementais);
 * concluídos todos, o manifesto (Anexo VII) é gerado e o contrato fica ativo.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import { assinaturaEventos, assinaturaOtp, assinaturaPosicoes, assinaturaSignatarios, contratos, contratoVersoes, empreendimentos, users } from '../../drizzle/schema';
import { telefoneWhatsApp } from '../../shared/contratos';
import { lerArquivo, salvarArquivo } from '../contratos/arquivos';
import { contratoPorId, juridicoDe, pessoasDe, registrarAssinado, responsavelTecnicoId } from '../contratos/servico';
import { sha256 } from '../contratos/render';
import { assinarICP, CertificadoInvalidoError, extrairUltimaAssinatura, lerCertificado, normalizarNome, temAssinaturaDigital } from './icp';
import { carimbarAvancada, marcarCaixasDigitais, paginaDeAssinaturas, renderManifesto, type Caixa } from './pdf';

export class AssinaturaErro extends Error {
  constructor(public codigo: string, mensagem: string, public status = 400) { super(mensagem); }
}

export const METODOS = ['avancada', 'govbr', 'icp_a1'] as const;
export type Metodo = typeof METODOS[number];
export const VALIDADE_LINK_DIAS = 15;
export const OTP_MINUTOS = 10;
export const OTP_TENTATIVAS = 5;
const ORDEM_PAPEL = ['comprador', 'conjuge', 'comprador2', 'vendedora', 'titular', 'intermediadora', 'corretor_parceiro'];

const db = async () => {
  const d = (await getDb()) as any;
  if (!d) throw new AssinaturaErro('BANCO', 'Banco indisponível', 503);
  return d;
};
const json = <T>(v: unknown): T | null => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : (v as T));
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
export const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
export const linkDoSignatario = (token: string) => `${urlPublica()}/assinar/${token}`;

/** Envio de WhatsApp (trocável nos testes) */
type Enviador = (telefone: string, mensagem: string) => Promise<void>;
let enviador: Enviador = async (telefone, mensagem) => { const { enviarTexto } = await import('../leads/zapiClient'); await enviarTexto(telefone, mensagem); };
export const definirEnviador = (e: Enviador | null) => {
  enviador = e ?? (async (t, m) => { const { enviarTexto } = await import('../leads/zapiClient'); await enviarTexto(t, m); });
};

// ─── Signatários ─────────────────────────────────────────────────────────────

export interface SignatarioPrevisto { papel: string; nome: string; cpf: string; email: string | null; whatsapp: string | null; metodo: Metodo }

/** Quem assina: comprador, cônjuge, vendedora (titular, se PJ), Romatec (responsável técnico) e corretor parceiro */
export async function signatariosPrevistos(contratoId: number): Promise<SignatarioPrevisto[]> {
  const d = await db();
  const c = await contratoPorId(contratoId);
  const j = await juridicoDe(c.empreendimentoId);
  const { comprador, conjuge } = await pessoasDe(contratoId);
  const v = j.vendedora as Record<string, string>;
  const lista: SignatarioPrevisto[] = [];
  const add = (papel: string, nome: unknown, cpf: unknown, email: unknown, tel: unknown) =>
    lista.push({ papel, nome: String(nome ?? '').trim(), cpf: soDigitos(cpf), email: (email as string) || null, whatsapp: telefoneWhatsApp(tel as string), metodo: 'avancada' });
  if (comprador) add('comprador', comprador.nome, comprador.cpfCnpj, comprador.email, comprador.telefone1);
  if (conjuge) add('conjuge', conjuge.nome, conjuge.cpfCnpj, conjuge.email, conjuge.telefone1);
  if (j.vendedoraTipo === 'PJ') {
    add('vendedora', v.vend_rep_nome, v.vend_rep_cpf, v.vend_email, v.vend_telefone);
    if (v.tit_nome) add('titular', v.tit_nome, v.tit_cpf, null, null);
  } else {
    add('vendedora', v.vend_nome, v.vend_cpf, v.vend_email, v.vend_telefone);
  }
  const resp = await responsavelTecnicoId(j.defaults);
  const usuario = async (id: number) => (await d.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (resp) { const u = await usuario(resp); if (u) add('intermediadora', u.name, u.cpf, u.email, u.telefone); }
  if (c.corretorUserId && c.corretorUserId !== resp) { const u = await usuario(c.corretorUserId); if (u) add('corretor_parceiro', u.name, u.cpf, u.email, u.telefone); }
  return lista.sort((a, b) => ORDEM_PAPEL.indexOf(a.papel) - ORDEM_PAPEL.indexOf(b.papel));
}

/** Pendências antes de enviar (nome, CPF de 11 dígitos, telefone para a avançada) */
export function pendenciasSignatarios(sigs: SignatarioPrevisto[]): string[] {
  const out: string[] = [];
  for (const s of sigs) {
    if (!s.nome) out.push(`${s.papel}: nome`);
    if (s.cpf.length !== 11) out.push(`${s.papel}: CPF`);
    if (s.metodo === 'avancada' && !s.whatsapp) out.push(`${s.papel}: telefone com WhatsApp (para o código)`);
  }
  return out;
}

export async function evento(contratoId: number, signatarioId: number | null, nome: string, o: { ip?: string | null; ua?: string | null; detalhe?: Record<string, unknown> } = {}) {
  try {
    await (await db()).insert(assinaturaEventos).values({ contratoId, signatarioId, evento: nome, ip: o.ip ?? null, userAgent: o.ua?.slice(0, 255) ?? null,
      detalhe: o.detalhe ?? null, criadoEm: new Date() });
  } catch (e: any) { console.warn('[Assinatura] evento:', e?.message); }
}

// ─── Posições ────────────────────────────────────────────────────────────────

/** Caixas do contrato; se não houver, as do gabarito do modelo */
export async function posicoesDe(contratoId: number, modeloVersao: string): Promise<Caixa[]> {
  const d = await db();
  const doContrato: any[] = await d.select().from(assinaturaPosicoes).where(eq(assinaturaPosicoes.contratoId, contratoId));
  const linhas = doContrato.length ? doContrato
    : await d.select().from(assinaturaPosicoes).where(and(isNull(assinaturaPosicoes.contratoId), eq(assinaturaPosicoes.modeloVersao, modeloVersao)));
  return linhas.map((l: any) => ({ papel: l.papel, pagina: Number(l.pagina), x: Number(l.x), y: Number(l.y), w: Number(l.w), h: Number(l.h) }));
}

/** Grava as caixas do contrato (ou o gabarito do modelo, com contratoId nulo) — substitui as anteriores */
export async function salvarPosicoes(caixas: Caixa[], alvo: { contratoId: number } | { modeloVersao: string }) {
  const d = await db();
  const ok = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
  for (const c of caixas) if (!ok(c.x) || !ok(c.y) || !ok(c.w) || !ok(c.h) || !Number.isInteger(c.pagina) || c.pagina === 0) throw new AssinaturaErro('POSICAO', 'Caixa de assinatura inválida');
  if ('contratoId' in alvo) await d.delete(assinaturaPosicoes).where(eq(assinaturaPosicoes.contratoId, alvo.contratoId));
  else await d.delete(assinaturaPosicoes).where(and(isNull(assinaturaPosicoes.contratoId), eq(assinaturaPosicoes.modeloVersao, alvo.modeloVersao)));
  for (const c of caixas) {
    await d.insert(assinaturaPosicoes).values({ contratoId: 'contratoId' in alvo ? alvo.contratoId : null, modeloVersao: 'modeloVersao' in alvo ? alvo.modeloVersao : null,
      papel: c.papel, pagina: c.pagina, x: c.x.toFixed(5), y: c.y.toFixed(5), w: c.w.toFixed(5), h: c.h.toFixed(5) });
  }
}

// ─── Versões ─────────────────────────────────────────────────────────────────

export async function pdfAtual(contratoId: number): Promise<Buffer> {
  const c = await contratoPorId(contratoId);
  if (!c.pdfAtual) throw new AssinaturaErro('SEM_PDF', 'Contrato sem PDF gerado', 409);
  const a = await lerArquivo(c.pdfAtual);
  if (!a) throw new AssinaturaErro('SEM_PDF', 'Arquivo do contrato não encontrado', 404);
  return a.buf;
}

export async function novaVersao(contratoId: number, etapa: string, buf: Buffer) {
  const d = await db();
  const versoes: any[] = await d.select({ versao: contratoVersoes.versao }).from(contratoVersoes).where(eq(contratoVersoes.contratoId, contratoId));
  const versao = versoes.reduce((m, v) => Math.max(m, Number(v.versao)), 0) + 1;
  const chave = `contratos/${contratoId}/v${String(versao).padStart(3, '0')}-${etapa.replace(/[^a-z0-9_]+/gi, '-')}.pdf`;
  const s = await salvarArquivo(chave, buf);
  await d.insert(contratoVersoes).values({ contratoId, versao, etapa: etapa.slice(0, 40), arquivo: chave, sha256: s.sha256, bytes: s.bytes, criadoEm: new Date() });
  await d.update(contratos).set({ pdfAtual: chave, hashAtual: s.sha256 }).where(eq(contratos.id, contratoId));
  return { versao, sha256: s.sha256 };
}

// ─── Envio para assinatura ───────────────────────────────────────────────────

/**
 * Congela o definitivo para assinatura: posiciona as caixas (do contrato, do gabarito ou numa página de assinaturas
 * acrescentada ao fim), marca as caixas ICP/gov.br, cria os signatários com link individual (15 dias) e envia os convites.
 */
export async function enviarParaAssinatura(contratoId: number, metodos: Record<string, Metodo>, usuarioId: number) {
  const d = await db();
  const c = await contratoPorId(contratoId);
  if (c.status !== 'apto_assinatura') throw new AssinaturaErro('STATUS', 'Gere o contrato definitivo antes de enviar para assinatura', 409);
  if (c.modoAssinatura === 'manuscrita') throw new AssinaturaErro('MODO', 'Contrato com assinatura a punho: imprima, colha as assinaturas e use "Registrar contrato assinado"', 409);
  const sigs = (await signatariosPrevistos(contratoId)).map(s => ({ ...s, metodo: (METODOS as readonly string[]).includes(metodos[s.papel]) ? metodos[s.papel] : s.metodo }));
  const pend = pendenciasSignatarios(sigs);
  if (pend.length) throw new AssinaturaErro('PENDENCIAS', `Complete antes de enviar: ${pend.join('; ')}`, 409);

  const j = await juridicoDe(c.empreendimentoId);
  let pdf = await pdfAtual(contratoId);
  if (temAssinaturaDigital(pdf)) throw new AssinaturaErro('PDF', 'O PDF atual já tem assinatura digital', 409);
  let caixas = await posicoesDe(contratoId, j.modeloVersao);
  if (!sigs.every(s => caixas.some(cx => cx.papel === s.papel))) {
    const r = await paginaDeAssinaturas(pdf, sigs, { numero: c.numero, marca: j.marcaSlug, codigo: c.codigoVerificacao });
    pdf = r.pdf;
    caixas = r.caixas;
    await salvarPosicoes(caixas, { contratoId });
  }
  pdf = await marcarCaixasDigitais(pdf, caixas.map(cx => ({ ...cx, metodo: sigs.find(s => s.papel === cx.papel)?.metodo ?? 'avancada' })));
  await novaVersao(contratoId, 'para_assinatura', pdf);

  await d.delete(assinaturaSignatarios).where(and(eq(assinaturaSignatarios.contratoId, contratoId), eq(assinaturaSignatarios.status, 'pendente')));
  const expira = new Date(Date.now() + VALIDADE_LINK_DIAS * 86_400_000);
  for (let i = 0; i < sigs.length; i++) {
    const s = sigs[i];
    await d.insert(assinaturaSignatarios).values({
      contratoId, papel: s.papel, nome: s.nome, cpf: s.cpf, email: s.email, whatsapp: s.whatsapp, metodo: s.metodo, ordem: i + 1,
      status: 'pendente', token: randomBytes(32).toString('base64url'), expiraEm: expira, revisaoManual: 0,
    });
  }
  await d.update(contratos).set({ status: 'em_assinatura', assinaturaIniciadaEm: new Date() }).where(eq(contratos.id, contratoId));
  await evento(contratoId, null, 'enviado_para_assinatura', { detalhe: { usuarioId, signatarios: sigs.length } });
  const convites = await enviarConvites(contratoId);
  return { signatarios: sigs.length, convites };
}

const MENSAGEM_CONVITE = (s: { nome: string }, numero: string, link: string) =>
  `Olá, ${s.nome.split(' ')[0]}! O contrato ${numero} do Condomínio de Chácaras Bom Jardims está pronto para a sua assinatura.\n\n` +
  `Leia e assine pelo link (válido por ${VALIDADE_LINK_DIAS} dias): ${link}\n\nDúvidas: (99) 9 9101-1970.`;

/** Convites (WhatsApp) de quem ainda não assinou; sem telefone, o operador copia o link */
export async function enviarConvites(contratoId: number, soSignatarioId?: number) {
  const d = await db();
  const c = await contratoPorId(contratoId);
  const sigs: any[] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, contratoId));
  const res: { papel: string; enviado: boolean; erro?: string }[] = [];
  for (const s of sigs.filter(x => x.status !== 'assinado' && (!soSignatarioId || x.id === soSignatarioId))) {
    try {
      if (!s.whatsapp) throw new Error('sem WhatsApp cadastrado');
      await enviador(s.whatsapp, MENSAGEM_CONVITE(s, c.numero, linkDoSignatario(s.token)));
      await d.update(assinaturaSignatarios).set({ status: 'convidado' }).where(eq(assinaturaSignatarios.id, s.id));
      await evento(contratoId, s.id, 'convite_enviado', { detalhe: { canal: 'whatsapp' } });
      res.push({ papel: s.papel, enviado: true });
    } catch (e: any) {
      await evento(contratoId, s.id, 'erro', { detalhe: { etapa: 'convite', msg: String(e?.message ?? e).slice(0, 200) } });
      res.push({ papel: s.papel, enviado: false, erro: String(e?.message ?? e) });
    }
  }
  return res;
}

// ─── Página do signatário ────────────────────────────────────────────────────

export async function signatarioPorToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AssinaturaErro('LINK', 'Link inválido', 404);
  const d = await db();
  const [s] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.token, token)).limit(1);
  if (!s) throw new AssinaturaErro('LINK', 'Link inválido', 404);
  const c = await contratoPorId(s.contratoId);
  if (['cancelado', 'distratado'].includes(c.status)) throw new AssinaturaErro('LINK', 'Este contrato foi cancelado', 410);
  const expirado = s.expiraEm && new Date(s.expiraEm).getTime() < Date.now() && s.status !== 'assinado';
  if (expirado) throw new AssinaturaErro('EXPIRADO', 'Este link expirou — peça um novo à administração', 410);
  return { s, c };
}

/** Assinaturas digitais (ICP/gov.br) só depois de todas as avançadas, e em sequência pela ordem */
export async function exigirVez(s: any): Promise<void> {
  const d = await db();
  const todos: any[] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, s.contratoId));
  if (s.metodo === 'avancada') return;
  const avancadasPendentes = todos.filter(t => t.metodo === 'avancada' && t.status !== 'assinado');
  if (avancadasPendentes.length) throw new AssinaturaErro('AGUARDE', `Aguarde: faltam as assinaturas de ${avancadasPendentes.map(t => t.nome.split(' ')[0]).join(', ')} antes das assinaturas digitais`, 409);
  const antes = todos.filter(t => t.metodo !== 'avancada' && t.ordem < s.ordem && t.status !== 'assinado');
  if (antes.length) throw new AssinaturaErro('AGUARDE', `Aguarde: ${antes[0].nome.split(' ')[0]} assina antes de você`, 409);
}

const hashOtp = (token: string, codigo: string) => createHash('sha256').update(`${token}:${codigo}`).digest('hex');
const mascararTel = (t: string) => t.replace(/^55(\d{2})\d+(\d{4})$/, '($1) •••••-$2');

export async function solicitarOtp(token: string, o: { ip?: string; ua?: string } = {}) {
  const { s, c } = await signatarioPorToken(token);
  if (s.status === 'assinado') throw new AssinaturaErro('ASSINADO', 'Você já assinou este contrato', 409);
  if (s.metodo !== 'avancada') throw new AssinaturaErro('METODO', 'Este link é para assinatura digital (certificado/gov.br)', 409);
  if (!s.whatsapp) throw new AssinaturaErro('SEM_TELEFONE', 'Sem WhatsApp cadastrado para receber o código — fale com a administração', 409);
  const d = await db();
  const [atual] = await d.select().from(assinaturaOtp).where(eq(assinaturaOtp.signatarioId, s.id)).limit(1);
  if (atual && new Date(atual.expiraEm).getTime() - OTP_MINUTOS * 60_000 > Date.now() - 60_000) {
    throw new AssinaturaErro('AGUARDE', 'Aguarde 1 minuto para pedir outro código', 429);
  }
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const dados = { codigoHash: hashOtp(token, codigo), expiraEm: new Date(Date.now() + OTP_MINUTOS * 60_000), tentativas: 0 };
  if (atual) await d.update(assinaturaOtp).set(dados).where(eq(assinaturaOtp.signatarioId, s.id));
  else await d.insert(assinaturaOtp).values({ signatarioId: s.id, ...dados });
  await enviador(s.whatsapp, `Código para assinar o contrato ${c.numero}: ${codigo}\nVálido por ${OTP_MINUTOS} minutos. Não compartilhe este código.`);
  await evento(s.contratoId, s.id, 'otp_enviado', { ip: o.ip, ua: o.ua, detalhe: { canal: 'whatsapp' } });
  return { destino: mascararTel(s.whatsapp), validadeMin: OTP_MINUTOS };
}

async function concluirSignatario(s: any, metodo: string, evid: Record<string, unknown>) {
  const d = await db();
  await d.update(assinaturaSignatarios).set({ status: 'assinado', metodo, assinadoEm: new Date(), evidenciasJson: evid as any,
    ...(evid.revisaoManual ? { revisaoManual: 1 } : {}) }).where(eq(assinaturaSignatarios.id, s.id));
  await evento(s.contratoId, s.id, 'assinado', { ip: evid.ip as string, ua: evid.ua as string, detalhe: { metodo } });
  return concluirSeTodos(s.contratoId);
}

/** Avançada: leitura integral + código + aceite → carimbo na caixa (enquanto não houver assinatura digital no arquivo) */
export async function confirmarAvancada(token: string, codigo: string, o: { ip: string; ua?: string; leuAteOFim: boolean; aceite: boolean; geo?: { lat: number; lon: number } | null }) {
  const { s, c } = await signatarioPorToken(token);
  if (s.status === 'assinado') throw new AssinaturaErro('ASSINADO', 'Você já assinou este contrato', 409);
  if (s.metodo !== 'avancada') throw new AssinaturaErro('METODO', 'Este link é para assinatura digital', 409);
  if (!o.leuAteOFim) throw new AssinaturaErro('LEITURA', 'Leia o contrato até o fim antes de assinar', 400);
  if (!o.aceite) throw new AssinaturaErro('ACEITE', 'Confirme que leu e concorda com o contrato', 400);
  const d = await db();
  const [otp] = await d.select().from(assinaturaOtp).where(eq(assinaturaOtp.signatarioId, s.id)).limit(1);
  if (!otp) throw new AssinaturaErro('OTP', 'Peça o código de confirmação primeiro', 400);
  if (otp.tentativas >= OTP_TENTATIVAS) throw new AssinaturaErro('OTP_BLOQUEADO', 'Tentativas esgotadas — peça um novo código', 429);
  if (new Date(otp.expiraEm).getTime() < Date.now()) throw new AssinaturaErro('OTP_EXPIRADO', 'Código expirado — peça um novo', 400);
  const esperado = Buffer.from(otp.codigoHash, 'hex'), recebido = Buffer.from(hashOtp(token, String(codigo).replace(/\D/g, '')), 'hex');
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    await d.update(assinaturaOtp).set({ tentativas: otp.tentativas + 1 }).where(eq(assinaturaOtp.signatarioId, s.id));
    await evento(s.contratoId, s.id, 'otp_errado', { ip: o.ip, ua: o.ua });
    throw new AssinaturaErro('OTP_INVALIDO', `Código incorreto (${OTP_TENTATIVAS - otp.tentativas - 1} tentativa(s) restante(s))`, 400);
  }
  await d.delete(assinaturaOtp).where(eq(assinaturaOtp.signatarioId, s.id));
  const quando = new Date();
  const atual = await pdfAtual(s.contratoId);
  const hashAssinado = sha256(atual);
  let carimbado = false;
  if (!temAssinaturaDigital(atual)) {
    const j = await juridicoDe(c.empreendimentoId);
    const cx = (await posicoesDe(s.contratoId, j.modeloVersao)).find(x => x.papel === s.papel);
    if (cx) {
      await novaVersao(s.contratoId, `carimbo_avancada:${s.id}`, await carimbarAvancada(atual, cx, { nome: s.nome, cpf: s.cpf, quando, ip: o.ip, codigo: c.codigoVerificacao }));
      carimbado = true;
    }
  }
  return concluirSignatario(s, 'avancada', {
    ip: o.ip, ua: o.ua ?? null, geo: o.geo ?? null, otpCanal: 'whatsapp', quando: quando.toISOString(), hashVersaoLida: hashAssinado, carimbado,
  });
}

/** ICP-Brasil A1 do próprio signatário: confere CPF do certificado, assina em memória e zera o .pfx */
export async function assinarComCertificado(token: string, pfx: Buffer, senha: string, o: { ip: string; ua?: string }) {
  try {
    const { s, c } = await signatarioPorToken(token);
    if (s.status === 'assinado') throw new AssinaturaErro('ASSINADO', 'Você já assinou este contrato', 409);
    if (s.metodo !== 'icp_a1') throw new AssinaturaErro('METODO', 'Este link não é para certificado digital', 409);
    await exigirVez(s);
    let info;
    try { info = lerCertificado(pfx, senha); } catch (e) {
      if (e instanceof CertificadoInvalidoError) { await evento(s.contratoId, s.id, 'erro', { ip: o.ip, detalhe: { etapa: 'icp', msg: e.message } }); throw new AssinaturaErro('CERTIFICADO', e.message, 422); }
      throw e;
    }
    if (!info.cpf || info.cpf !== s.cpf) throw new AssinaturaErro('CPF', 'O CPF do certificado não confere com o do signatário', 403);
    const atual = await pdfAtual(s.contratoId);
    const assinado = await assinarICP(atual, pfx, senha, { motivo: `Contrato ${c.numero} — ${s.papel}`, nome: info.nome });
    await novaVersao(s.contratoId, `icp:${s.id}`, assinado);
    return concluirSignatario(s, 'icp_a1', { ip: o.ip, ua: o.ua ?? null, serial: info.serial, emissor: info.emissor, cpfCert: info.cpf, validade: info.validade.toISOString() });
  } finally {
    pfx.fill(0);
  }
}

/** gov.br: o signatário baixa a versão atual, assina no assinador.iti.br e envia — a versão anterior tem de ser prefixo exato */
export async function receberGovbr(token: string, enviado: Buffer, o: { ip: string; ua?: string }) {
  const { s } = await signatarioPorToken(token);
  if (s.status === 'assinado') throw new AssinaturaErro('ASSINADO', 'Você já assinou este contrato', 409);
  if (s.metodo !== 'govbr') throw new AssinaturaErro('METODO', 'Este link não é para gov.br', 409);
  await exigirVez(s);
  const atual = await pdfAtual(s.contratoId);
  if (enviado.length <= atual.length || !enviado.subarray(0, atual.length).equals(atual)) {
    throw new AssinaturaErro('ARQUIVO', 'O arquivo não é a versão atual do contrato assinada no gov.br. Baixe de novo e assine sem alterar o PDF.', 422);
  }
  const ass = extrairUltimaAssinatura(enviado);
  if (!ass?.nome) throw new AssinaturaErro('SEM_ASSINATURA', 'Nenhuma assinatura digital encontrada no arquivo', 422);
  const porCpf = !!ass.cpf;
  const confere = porCpf ? ass.cpf === s.cpf : normalizarNome(ass.nome) === normalizarNome(s.nome);
  if (!confere) throw new AssinaturaErro('TITULAR', 'A assinatura não pertence ao signatário deste link', 403);
  await novaVersao(s.contratoId, `govbr:${s.id}`, enviado);
  return concluirSignatario(s, 'govbr', { ip: o.ip, ua: o.ua ?? null, emissor: ass.emissor, cpfCert: ass.cpf, nomeCert: ass.nome, revisaoManual: !porCpf });
}

// ─── Conclusão, manifesto e verificação ──────────────────────────────────────

export async function concluirSeTodos(contratoId: number): Promise<{ concluido: boolean }> {
  const d = await db();
  const sigs: any[] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, contratoId));
  if (!sigs.length || sigs.some(x => x.status !== 'assinado')) return { concluido: false };
  const c = await contratoPorId(contratoId);
  if (c.manifestoArquivo) return { concluido: true };
  const [emp] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const j = await juridicoDe(c.empreendimentoId);
  const final = await pdfAtual(contratoId);
  const manifesto = await renderManifesto({
    numero: c.numero, codigo: c.codigoVerificacao, sha256: sha256(final), url: `${urlPublica()}/c/v/${c.codigoVerificacao}`, marca: j.marcaSlug,
    empreendimento: emp?.nome ?? '', emitidoEm: new Date(),
    linhas: sigs.sort((a, b) => a.ordem - b.ordem).map(x => {
      const e = json<Record<string, any>>(x.evidenciasJson) ?? {};
      return { papel: x.papel, nome: x.nome, cpf: x.cpf, metodo: x.metodo, quando: x.assinadoEm ? new Date(x.assinadoEm) : null, ip: e.ip, emissor: e.emissor, status: x.status };
    }),
  });
  const chave = `contratos/${contratoId}/manifesto-${c.numero}.pdf`;
  await salvarArquivo(chave, manifesto);
  await d.update(contratos).set({ manifestoArquivo: chave, status: 'assinado' }).where(eq(contratos.id, contratoId));
  await evento(contratoId, null, 'manifesto_gerado', { detalhe: { sha256: sha256(final) } });
  // Todas as assinaturas + manifesto: contrato ativo (lote vendido e plano de cobranças gravado)
  await registrarAssinado(contratoId, null, 0);
  return { concluido: true };
}

/** Página pública /c/v/:codigo: situação, hash e signatários mascarados (sem dado pessoal completo) */
export async function verificacaoPublica(codigo: string) {
  if (!/^[A-Z0-9]{12}$/.test(codigo)) throw new AssinaturaErro('CODIGO', 'Código inválido', 404);
  const d = await db();
  const [c] = await d.select().from(contratos).where(eq(contratos.codigoVerificacao, codigo)).limit(1);
  if (!c) throw new AssinaturaErro('CODIGO', 'Contrato não encontrado', 404);
  const [emp] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const sigs: any[] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, c.id));
  const iniciais = (n: string) => n.split(/\s+/).map((p, i) => (i === 0 ? p : `${p[0]}.`)).join(' ');
  return {
    numero: c.numero, empreendimento: emp?.nome ?? '', status: c.status, sha256: c.hashAtual, manifesto: !!c.manifestoArquivo,
    signatarios: sigs.sort((a, b) => a.ordem - b.ordem).map(s => ({ papel: s.papel, nome: iniciais(s.nome), cpf: s.cpf.replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2'), metodo: s.metodo, status: s.status, assinadoEm: s.assinadoEm })),
  };
}

/** Confere um arquivo pelo SHA-256 (calculado no navegador) contra as versões do contrato */
export async function conferirArquivo(codigo: string, hash: string) {
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new AssinaturaErro('HASH', 'Hash inválido', 400);
  const d = await db();
  const [c] = await d.select().from(contratos).where(eq(contratos.codigoVerificacao, codigo)).limit(1);
  if (!c) throw new AssinaturaErro('CODIGO', 'Contrato não encontrado', 404);
  const vs: any[] = await d.select().from(contratoVersoes).where(eq(contratoVersoes.contratoId, c.id));
  const v = vs.find(x => x.sha256.toLowerCase() === hash.toLowerCase());
  return { confere: !!v, versaoFinal: !!v && c.hashAtual?.toLowerCase() === hash.toLowerCase(), etapa: v?.etapa ?? null };
}

/** Lembretes D+1 e D+3 do envio para quem ainda não assinou (uma vez cada) */
export async function enviarLembretes(agora = Date.now()) {
  const d = await db();
  const cs: any[] = await d.select().from(contratos).where(eq(contratos.status, 'em_assinatura'));
  let enviados = 0;
  for (const c of cs) {
    if (!c.assinaturaIniciadaEm) continue;
    const dias = (agora - new Date(c.assinaturaIniciadaEm).getTime()) / 86_400_000;
    const marco = dias >= 3 ? 'lembrete_d3' : dias >= 1 ? 'lembrete_d1' : null;
    if (!marco) continue;
    const evs: any[] = await d.select().from(assinaturaEventos).where(and(eq(assinaturaEventos.contratoId, c.id), eq(assinaturaEventos.evento, marco)));
    const sigs: any[] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, c.id));
    for (const s of sigs.filter(x => x.status !== 'assinado' && x.whatsapp && !evs.some(e => e.signatarioId === x.id))) {
      try {
        await enviador(s.whatsapp, `Lembrete: o contrato ${c.numero} aguarda a sua assinatura. Link: ${linkDoSignatario(s.token)}`);
        await evento(c.id, s.id, marco);
        enviados++;
      } catch (e: any) { await evento(c.id, s.id, 'erro', { detalhe: { etapa: marco, msg: String(e?.message ?? e).slice(0, 200) } }); }
    }
  }
  return enviados;
}
