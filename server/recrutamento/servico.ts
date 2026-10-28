/**
 * Recrutamento (shared/recrutamento.ts): convite → formulário público (link com token) → aprovação, que cria o
 * acesso pela mesma regra da Equipe (criarUsuarioComCadastro) com senha provisória enviada pelo WhatsApp.
 * Empreendedor: acesso direto com os dados do proprietário do empreendimento (empJuridico.vendedoraJson).
 */
import crypto from 'node:crypto';
import { and, desc, eq, ne } from 'drizzle-orm';
import { getDb } from '../db';
import { empJuridico, empreendimentos, recrutamentoDocs, recrutamentos, users, usuarioFoto } from '../../drizzle/schema';
import { MAX_FOTO_BYTES, detectarMime, problemaArquivo } from '../../shared/cadastro';
import { MODULOS } from '../../shared/permissoes';
import {
  DIAS_LINK_FORMULARIO, DIAS_SENHA_PROVISORIA, documentosDoPerfil, gerarSenhaProvisoria, linkFormulario, mensagemAcesso, mensagemConvite,
  mensagemFormularioRecebido, type PerfilRecrutamento,
} from '../../shared/recrutamento';

export class RecrutamentoErro extends Error {
  constructor(msg: string, public status = 400, public campos?: Record<string, string>) { super(msg); this.name = 'RecrutamentoErro'; }
}

const banco = async () => {
  const d = await getDb();
  if (!d) throw new RecrutamentoErro('Sistema indisponível no momento', 503);
  return d as any;
};
const urlBase = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
const json = <T>(v: unknown): T | null => { if (v == null) return null; try { return typeof v === 'string' ? JSON.parse(v) : (v as T); } catch { return null; } };
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const dias = (n: number, agora = Date.now()) => new Date(agora + n * 86_400_000);

/** Envios trocáveis nos testes (WhatsApp do sistema) */
export const envio = {
  texto: async (fone: string, msg: string) => { const { enviarTexto } = await import('../leads/zapiClient'); await enviarTexto(fone, msg); },
  documento: async (fone: string, doc: { base64: string; extensao: string; mime: string; nomeArquivo: string }) => {
    const { enviarDocumento } = await import('../leads/zapiClient');
    await enviarDocumento(fone, doc);
  },
  disponivel: () => !!(process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN),
};

const foneWhats = (t: string) => { const d = soDig(t); return d.length === 10 || d.length === 11 ? `55${d}` : d; };

// ─── Administrador ────────────────────────────────────────────────────────

export async function criarConvite(dados: { perfil: PerfilRecrutamento; nome: string; telefone: string; empreendimentoSlug?: string | null }, autorId: number, agora = Date.now()) {
  if (dados.perfil === 'empreendedor') throw new RecrutamentoErro('Empreendedor não usa formulário: use "Criar acesso do empreendedor".');
  const tel = soDig(dados.telefone);
  if (tel.length < 10 || tel.length > 11) throw new RecrutamentoErro('Informe o WhatsApp com DDD');
  const d = await banco();
  if (dados.empreendimentoSlug) await nomeDoEmpreendimento(dados.empreendimentoSlug);
  // Mesmo WhatsApp e perfil: reaproveita o convite que já existe (cancelado volta a valer) em vez de duplicar
  const { chaveTelefone } = await import('../leads/numerosDaEquipe');
  const mesmos: any[] = (await d.select().from(recrutamentos).where(and(eq(recrutamentos.perfil, dados.perfil), ne(recrutamentos.status, 'aprovado'))).orderBy(desc(recrutamentos.id)))
    .filter((x: any) => chaveTelefone(x.telefone) === chaveTelefone(tel));
  if (mesmos[0]) {
    const x = mesmos[0];
    const reabre = x.status === 'cancelado' || x.status === 'recusado';
    await d.update(recrutamentos).set({
      nome: dados.nome.trim().slice(0, 150), telefone: tel, empreendimentoSlug: dados.empreendimentoSlug || null, tokenExpira: dias(DIAS_LINK_FORMULARIO, agora),
      ...(reabre ? { status: 'convidado', motivo: null, decididoEm: null, decididoPor: null } : {}), updatedAt: new Date(agora),
    } as any).where(eq(recrutamentos.id, x.id));
    return { id: x.id as number, link: linkFormulario(urlBase(), x.token), reaproveitado: true };
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const r: any = await d.insert(recrutamentos).values({
    perfil: dados.perfil, nome: dados.nome.trim().slice(0, 150), telefone: tel, empreendimentoSlug: dados.empreendimentoSlug || null, token, tokenExpira: dias(DIAS_LINK_FORMULARIO, agora), status: 'convidado',
    dadosJson: JSON.stringify({ nome: dados.nome.trim(), telefone: tel }), criadoPor: autorId, createdAt: new Date(agora), updatedAt: new Date(agora),
  } as any);
  const id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
  return { id, link: linkFormulario(urlBase(), token), reaproveitado: false };
}

/** Nome do empreendimento da convocação (erro se o slug não existe) */
async function nomeDoEmpreendimento(slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  const d = await banco();
  const [e]: any[] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!e) throw new RecrutamentoErro('Empreendimento não encontrado', 404);
  return e.nome as string;
}

async function recrutamentoPorId(id: number) {
  const d = await banco();
  const [r]: any[] = await d.select().from(recrutamentos).where(eq(recrutamentos.id, id)).limit(1);
  if (!r) throw new RecrutamentoErro('Recrutamento não encontrado', 404);
  return r;
}

/** Manda pelo WhatsApp: texto com o link + formulário em PDF e em DOC. Renova a validade do link. */
export async function enviarConvite(id: number, agora = Date.now()) {
  const r = await recrutamentoPorId(id);
  if (!['convidado', 'preenchido'].includes(r.status)) throw new RecrutamentoErro('Este recrutamento já foi concluído', 409);
  const link = linkFormulario(urlBase(), r.token);
  const empreendimento = await nomeDoEmpreendimento(r.empreendimentoSlug).catch(() => null);
  const texto = mensagemConvite(r.nome, r.perfil, link, empreendimento);
  if (!envio.disponivel()) return { enviado: false, texto, link };
  const fone = foneWhats(r.telefone);
  const { formularioPdf, formularioDocx } = await import('./formularioArquivos');
  await envio.texto(fone, texto);
  const nomeBase = `Formulario-cadastro-${r.perfil}`;
  await envio.documento(fone, { base64: (await formularioPdf(r.perfil, { nome: r.nome, empreendimento })).toString('base64'), extensao: 'pdf', mime: 'application/pdf', nomeArquivo: `${nomeBase}.pdf` });
  await envio.documento(fone, {
    base64: (await formularioDocx(r.perfil, { nome: r.nome, empreendimento })).toString('base64'), extensao: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', nomeArquivo: `${nomeBase}.docx`,
  });
  const d = await banco();
  await d.update(recrutamentos).set({ enviadoEm: new Date(agora), tokenExpira: dias(DIAS_LINK_FORMULARIO, agora), updatedAt: new Date(agora) } as any).where(eq(recrutamentos.id, id));
  return { enviado: true, texto, link };
}

export async function listarRecrutamentos() {
  const d = await banco();
  const rows: any[] = await d.select().from(recrutamentos).orderBy(desc(recrutamentos.createdAt)).limit(300);
  const docs: any[] = await d.select({ recrutamentoId: recrutamentoDocs.recrutamentoId, tipo: recrutamentoDocs.tipo }).from(recrutamentoDocs);
  const { chaveTelefone } = await import('../leads/numerosDaEquipe');
  const porFone = new Map<string, number>();
  for (const r of rows) { const k = `${r.perfil}:${chaveTelefone(r.telefone)}`; porFone.set(k, (porFone.get(k) ?? 0) + 1); }
  return rows.map(r => {
    const meus = docs.filter(x => x.recrutamentoId === r.id).map(x => x.tipo);
    const faltam = r.perfil === 'empreendedor' ? [] : documentosDoPerfil(r.perfil).filter(x => x.obrigatorio && !meus.includes(x.tipo)).map(x => x.rotulo);
    return {
      id: r.id as number, perfil: r.perfil as PerfilRecrutamento, nome: r.nome as string, telefone: r.telefone as string, status: r.status as string,
      empreendimentoSlug: (r.empreendimentoSlug ?? null) as string | null,
      link: linkFormulario(urlBase(), r.token), linkVencido: new Date(r.tokenExpira).getTime() < Date.now(), docs: meus.length, faltam,
      usuarioId: r.usuarioId ?? null, enviadoEm: r.enviadoEm ?? null, preenchidoEm: r.preenchidoEm ?? null, decididoEm: r.decididoEm ?? null,
      motivo: r.motivo ?? null, createdAt: r.createdAt,
      /** Outro convite com o mesmo WhatsApp e perfil (sobra de antes da v1.59): dá para excluir */
      duplicado: (porFone.get(`${r.perfil}:${chaveTelefone(r.telefone)}`) ?? 0) > 1,
    };
  });
}

/** Conferência: dados preenchidos e documentos (sem o conteúdo) */
export async function detalheRecrutamento(id: number) {
  const r = await recrutamentoPorId(id);
  const d = await banco();
  const docs: any[] = await d.select({ id: recrutamentoDocs.id, tipo: recrutamentoDocs.tipo, nome: recrutamentoDocs.nome, mime: recrutamentoDocs.mime, tamanhoBytes: recrutamentoDocs.tamanhoBytes, validade: recrutamentoDocs.validade })
    .from(recrutamentoDocs).where(eq(recrutamentoDocs.recrutamentoId, id));
  return { id: r.id as number, perfil: r.perfil as PerfilRecrutamento, nome: r.nome, telefone: r.telefone, status: r.status, empreendimento: await nomeDoEmpreendimento(r.empreendimentoSlug).catch(() => null), dados: json<Record<string, any>>(r.dadosJson) ?? {}, docs, exigidos: documentosDoPerfil(r.perfil) };
}

export async function arquivoDoDoc(docId: number) {
  const d = await banco();
  const [x]: any[] = await d.select().from(recrutamentoDocs).where(eq(recrutamentoDocs.id, docId)).limit(1);
  if (!x) throw new RecrutamentoErro('Documento não encontrado', 404);
  return { buf: Buffer.from(String(x.conteudoBase64), 'base64'), mime: x.mime as string, nome: x.nome as string };
}

/** Pacote base do perfil (módulos marcados por padrão); corretor: o empreendimento da convocação (sem ele, todos) */
async function acessoPadrao(perfil: 'corretor' | 'secretario', slug?: string | null) {
  const d = await banco();
  const emps: any[] = slug ? await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, slug))
    : await d.select({ id: empreendimentos.id }).from(empreendimentos);
  return { modulos: MODULOS.filter(m => m.padrao[perfil]).map(m => m.chave), empreendimentosIds: perfil === 'corretor' ? emps.map(e => e.id) : [], imoveisIds: [] as number[] };
}

/** Senha provisória nova: troca obrigatória no 1º login; vence em DIAS_SENHA_PROVISORIA */
async function definirSenhaProvisoria(usuarioId: number, agora = Date.now()) {
  const { hashPassword } = await import('../auth-security');
  const senha = gerarSenhaProvisoria(n => crypto.randomInt(n));
  const d = await banco();
  await d.update(users).set({
    passwordScrypt: await hashPassword(senha), passwordHash: null, trocarSenha: 1, senhaProvisoriaExpira: dias(DIAS_SENHA_PROVISORIA, agora),
    conviteHash: null, conviteExpira: null, ativo: 1,
  } as any).where(eq(users.id, usuarioId));
  return senha;
}

const loginDe = (u: { creci?: string | null; cpf?: string | null; email?: string | null }) =>
  u.creci ? `CRECI ${u.creci}` : u.cpf ? `CPF ${String(u.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : String(u.email ?? '');

/** Manda login + senha provisória; sem Z-API, devolve para o administrador repassar */
async function enviarAcesso(usuarioId: number, telefone: string, senha: string) {
  const d = await banco();
  const [u]: any[] = await d.select({ name: users.name, creci: users.creci, cpf: users.cpf, email: users.email }).from(users).where(eq(users.id, usuarioId)).limit(1);
  const login = loginDe(u ?? {});
  const texto = mensagemAcesso(u?.name ?? '', login, senha, urlBase());
  let enviado = false;
  if (envio.disponivel()) {
    try { await envio.texto(foneWhats(telefone), texto); enviado = true; } catch (e: any) { console.warn('[Recrutamento] envio do acesso:', e?.message); }
  }
  return { enviado, login, senha, texto };
}

/** Aprova: cria o acesso com o cadastro e os documentos do formulário e manda a senha provisória */
export async function aprovarRecrutamento(id: number, autor: { id: number; role?: string | null }, agora = Date.now()) {
  const r = await recrutamentoPorId(id);
  if (r.status !== 'preenchido') throw new RecrutamentoErro('Só dá para aprovar depois que o candidato enviar o formulário', 409);
  const perfil = r.perfil as 'corretor' | 'secretario';
  const dados = { ...(json<Record<string, any>>(r.dadosJson) ?? {}), perfil, recebeLeads: false };
  const d = await banco();
  const docs: any[] = await d.select().from(recrutamentoDocs).where(eq(recrutamentoDocs.recrutamentoId, id));
  const faltam = documentosDoPerfil(perfil).filter(x => x.obrigatorio && !docs.some(y => y.tipo === x.tipo));
  if (faltam.length) throw new RecrutamentoErro(`Faltam documentos: ${faltam.map(x => x.rotulo).join(', ')}`, 422);
  const { criarUsuarioComCadastro } = await import('../cadastroUsuario');
  let usuarioId: number;
  try {
    ({ id: usuarioId } = await criarUsuarioComCadastro(dados, await acessoPadrao(perfil, r.empreendimentoSlug), autor));
  } catch (e: any) {
    throw new RecrutamentoErro(e?.message || 'Cadastro inválido', 422, e?.cause?.campos ?? e?.campos);
  }
  const avisos: string[] = [];
  const { enviarDocumento } = await import('../credenciais');
  for (const x of docs) {
    const buf = Buffer.from(String(x.conteudoBase64), 'base64');
    try {
      if (x.tipo === 'foto') {
        await d.insert(usuarioFoto).values({ usuarioId, mime: x.mime, conteudoBase64: x.conteudoBase64 } as any);
        await d.update(users).set({ fotoUrl: `/api/usuarios/${usuarioId}/foto?v=${agora}` } as any).where(eq(users.id, usuarioId));
      } else {
        await enviarDocumento(usuarioId, x.tipo, buf, x.nome, { validade: x.validade ?? null }, autor.id);
      }
    } catch (e: any) { avisos.push(`${x.tipo}: ${e?.message || 'não copiado'}`); }
  }
  const senha = await definirSenhaProvisoria(usuarioId, agora);
  const acesso = await enviarAcesso(usuarioId, r.telefone, senha);
  await d.update(recrutamentos).set({ status: 'aprovado', usuarioId, decididoEm: new Date(agora), decididoPor: autor.id, updatedAt: new Date(agora) } as any).where(eq(recrutamentos.id, id));
  return { usuarioId, ...acesso, avisos };
}

export async function recusarRecrutamento(id: number, motivo: string, autorId: number, cancelar = false) {
  const r = await recrutamentoPorId(id);
  if (r.status === 'aprovado') throw new RecrutamentoErro('Acesso já criado: desative pela Equipe', 409);
  const d = await banco();
  await d.update(recrutamentos).set({ status: cancelar ? 'cancelado' : 'recusado', motivo: motivo.slice(0, 300) || null, decididoEm: new Date(), decididoPor: autorId, updatedAt: new Date() } as any)
    .where(eq(recrutamentos.id, id));
  return { ok: true as const };
}

/** Nova senha provisória (esqueceu ou venceu) */
export async function reenviarAcesso(usuarioId: number) {
  const d = await banco();
  const [u]: any[] = await d.select({ id: users.id, telefone: users.telefone, role: users.role }).from(users).where(eq(users.id, usuarioId)).limit(1);
  if (!u) throw new RecrutamentoErro('Usuário não encontrado', 404);
  if (u.role === 'admin') throw new RecrutamentoErro('O acesso do administrador não usa senha provisória');
  if (!u.telefone) throw new RecrutamentoErro('Usuário sem WhatsApp no cadastro');
  return enviarAcesso(u.id, u.telefone, await definirSenhaProvisoria(u.id));
}

// ─── Empreendedor: acesso com os dados do proprietário ────────────────────

export async function dadosDoProprietario(slug: string) {
  const d = await banco();
  const [e]: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!e) throw new RecrutamentoErro('Empreendimento não encontrado', 404);
  const [j]: any[] = await d.select({ v: empJuridico.vendedoraJson }).from(empJuridico).where(eq(empJuridico.empreendimentoId, e.id)).limit(1);
  const v = json<Record<string, any>>(j?.v) ?? {};
  return {
    empreendimento: e.nome as string, nome: String(v.vend_nome ?? v.vend_razao_social ?? '').trim(), cpf: soDig(v.vend_cpf), cnpj: soDig(v.vend_cnpj),
    email: String(v.vend_email ?? '').trim().toLowerCase(), telefone: soDig(v.vend_telefone),
  };
}

export async function criarAcessoEmpreendedor(p: { slug: string; email: string; telefone?: string | null }, autor: { id: number }, agora = Date.now()) {
  const prop = await dadosDoProprietario(p.slug);
  if (!prop.nome) throw new RecrutamentoErro('O empreendimento não tem os dados do proprietário (Empreendimentos → Jurídico)');
  const email = p.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new RecrutamentoErro('E-mail inválido');
  const telefone = soDig(p.telefone || prop.telefone);
  if (telefone.length < 10) throw new RecrutamentoErro('Informe o WhatsApp do empreendedor');
  const d = await banco();
  const [mesmoEmail]: any[] = await d.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (mesmoEmail) throw new RecrutamentoErro('Este e-mail já tem acesso ao sistema');
  if (prop.cpf) {
    const [mesmoCpf]: any[] = await d.select({ id: users.id }).from(users).where(eq(users.cpf, prop.cpf)).limit(1);
    if (mesmoCpf) throw new RecrutamentoErro('O proprietário já tem acesso (mesmo CPF). Use "Reenviar acesso" na lista.');
  }
  const marca = crypto.randomUUID();
  const res: any = await d.insert(users).values({
    openId: `equipe:${marca}`, name: prop.nome, email, loginMethod: 'senha', role: 'user', perfil: 'empreendedor', empreendimentoSlug: p.slug,
    cpf: prop.cpf || null, telefone, ativo: 1, recebeLeads: 0, createdAt: new Date(agora), updatedAt: new Date(agora), lastSignedIn: new Date(agora),
  } as any);
  let usuarioId = Number(res?.[0]?.insertId ?? res?.insertId ?? res?.lastInsertRowid ?? 0);
  if (!usuarioId) [{ id: usuarioId }] = await d.select({ id: users.id }).from(users).where(eq(users.openId, `equipe:${marca}`)).limit(1);
  const senha = await definirSenhaProvisoria(usuarioId, agora);
  const acesso = await enviarAcesso(usuarioId, telefone, senha);
  await d.insert(recrutamentos).values({
    perfil: 'empreendedor', nome: prop.nome, telefone, email, empreendimentoSlug: p.slug, token: crypto.randomBytes(24).toString('base64url'),
    tokenExpira: new Date(agora), status: 'aprovado', usuarioId, criadoPor: autor.id, decididoEm: new Date(agora), decididoPor: autor.id,
    createdAt: new Date(agora), updatedAt: new Date(agora),
  } as any);
  return { usuarioId, ...acesso };
}

// ─── Formulário público (link com token) ──────────────────────────────────

async function porToken(token: string, agora = Date.now()) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new RecrutamentoErro('Link inválido', 404);
  const d = await banco();
  const [r]: any[] = await d.select().from(recrutamentos).where(eq(recrutamentos.token, token)).limit(1);
  if (!r || r.perfil === 'empreendedor') throw new RecrutamentoErro('Link inválido', 404);
  if (['aprovado', 'recusado', 'cancelado'].includes(r.status)) throw new RecrutamentoErro('Este formulário já foi concluído. Fale com a Romatec pelo WhatsApp.', 410);
  if (new Date(r.tokenExpira).getTime() < agora) throw new RecrutamentoErro('Este link venceu. Peça um novo à Romatec pelo WhatsApp.', 410);
  return r;
}

export async function formularioPublico(token: string) {
  const r = await porToken(token);
  const d = await banco();
  const docs: any[] = await d.select({ tipo: recrutamentoDocs.tipo, nome: recrutamentoDocs.nome }).from(recrutamentoDocs).where(eq(recrutamentoDocs.recrutamentoId, r.id));
  return {
    perfil: r.perfil as PerfilRecrutamento, status: r.status as string, dados: json<Record<string, any>>(r.dadosJson) ?? {}, docs, exigidos: documentosDoPerfil(r.perfil),
    empreendimento: await nomeDoEmpreendimento(r.empreendimentoSlug).catch(() => null),
  };
}

/** Rascunho (enviar=false) ou envio final: valida tudo pela regra do cadastro, sem duplicar CPF/e-mail/CRECI */
export async function salvarFormulario(token: string, dados: Record<string, any>, enviar: boolean, agora = Date.now()) {
  const r = await porToken(token, agora);
  const d = await banco();
  const limpo = { ...dados, perfil: r.perfil, recebeLeads: false };
  delete (limpo as any).empreendimentoSlug;
  await d.update(recrutamentos).set({ dadosJson: JSON.stringify(limpo), updatedAt: new Date(agora) } as any).where(eq(recrutamentos.id, r.id));
  if (!enviar) return { ok: true as const, status: r.status };
  const { cadastroSchema, errosPorCampo } = await import('../cadastroUsuario');
  const v = cadastroSchema.safeParse(limpo);
  if (!v.success) {
    const campos = errosPorCampo(v.error);
    throw new RecrutamentoErro(`Confira: ${Object.values(campos)[0]}`, 422, campos);
  }
  const dup = async (col: any, val: string | null | undefined, campo: string, msg: string) => {
    if (!val) return;
    const outros: any[] = await d.select({ id: users.id, ativo: users.ativo }).from(users).where(eq(col, val));
    if (outros.some(o => o.ativo !== false && o.ativo !== 0)) throw new RecrutamentoErro(msg, 409, { [campo]: msg });
  };
  await dup(users.cpf, v.data.cpf, 'cpf', 'Este CPF já tem cadastro no sistema. Fale com a Romatec.');
  await dup(users.email, v.data.email, 'email', 'Este e-mail já tem cadastro no sistema. Use outro ou fale com a Romatec.');
  await dup(users.creci, v.data.creci, 'creci', 'Este CRECI já tem cadastro no sistema. Fale com a Romatec.');
  const docs: any[] = await d.select({ tipo: recrutamentoDocs.tipo }).from(recrutamentoDocs).where(eq(recrutamentoDocs.recrutamentoId, r.id));
  const faltam = documentosDoPerfil(r.perfil).filter(x => x.obrigatorio && !docs.some(y => y.tipo === x.tipo));
  if (faltam.length) throw new RecrutamentoErro(`Anexe: ${faltam.map(x => x.rotulo).join(', ')}`, 422);
  const primeiroEnvio = r.status === 'convidado';
  await d.update(recrutamentos).set({ status: 'preenchido', preenchidoEm: new Date(agora), nome: v.data.nome, email: v.data.email, updatedAt: new Date(agora) } as any)
    .where(eq(recrutamentos.id, r.id));
  if (primeiroEnvio) await avisarAdministradores(mensagemFormularioRecebido(v.data.nome, r.perfil, urlBase()));
  return { ok: true as const, status: 'preenchido' };
}

async function avisarAdministradores(texto: string) {
  if (!envio.disponivel()) return;
  const d = await banco();
  const admins: any[] = await d.select({ telefone: users.telefone, ativo: users.ativo }).from(users).where(eq(users.role, 'admin'));
  for (const a of admins.filter(x => x.ativo !== false && x.ativo !== 0 && x.telefone)) {
    await envio.texto(foneWhats(a.telefone), texto).catch(e => console.warn('[Recrutamento] aviso ao administrador:', e?.message));
  }
}

/** Anexo do formulário (um por tipo; reenviar substitui) */
export async function salvarDocPublico(token: string, tipo: string, buf: Buffer, nomeArquivo: string, validade?: string | null) {
  const r = await porToken(token);
  if (!documentosDoPerfil(r.perfil).some(x => x.tipo === tipo)) throw new RecrutamentoErro('Documento não pedido neste cadastro');
  const mime = buf?.length ? detectarMime(buf) : null;
  if (tipo === 'foto') {
    if (!mime || mime === 'application/pdf') throw new RecrutamentoErro('Envie a foto em JPG, PNG ou WEBP', 415);
    if (buf.length > MAX_FOTO_BYTES) throw new RecrutamentoErro('Foto acima de 5 MB', 413);
  } else {
    const p = problemaArquivo(tipo, buf);
    if (p) throw new RecrutamentoErro(p.erro, p.status);
  }
  const d = await banco();
  await d.delete(recrutamentoDocs).where(and(eq(recrutamentoDocs.recrutamentoId, r.id), eq(recrutamentoDocs.tipo, tipo)));
  await d.insert(recrutamentoDocs).values({
    recrutamentoId: r.id, tipo, nome: (nomeArquivo || tipo).slice(0, 200), mime: mime!, tamanhoBytes: buf.length, conteudoBase64: buf.toString('base64'),
    validade: validade && /^\d{4}-\d{2}-\d{2}$/.test(validade) ? validade : null, createdAt: new Date(),
  } as any);
  return { ok: true as const, tipo };
}

export async function removerDocPublico(token: string, tipo: string) {
  const r = await porToken(token);
  const d = await banco();
  await d.delete(recrutamentoDocs).where(and(eq(recrutamentoDocs.recrutamentoId, r.id), eq(recrutamentoDocs.tipo, tipo)));
  return { ok: true as const };
}
