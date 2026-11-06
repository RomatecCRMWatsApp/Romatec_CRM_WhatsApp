/**
 * Controle de acessos dos corretores (administrador e secretária): para cada corretor/empreendedor, se o login está
 * ativo, a situação da licença (paga, cortesia, teste, atrasada, bloqueada…), o último uso do sistema e os logins
 * dos últimos 30 dias (auditoriaAcesso, evento LOGIN). Ações: ativar/desativar o login, liberar/bloquear a licença
 * e desconectar de todos os aparelhos — sempre com registro de quem fez.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { getDb } from "./db";
import { auditoriaAcesso, materialUso, saasAssinaturas, saasFaturas, solicitacaoAcesso, users } from "../drizzle/schema";
import { perfilDe } from "../shared/equipe";
import { podeEntrar, resumoControle, situacaoDePagamento, situacaoDeUso, somarUsoMidias, type SituacaoPagamento, type SituacaoUso, type UsoMidias } from "../shared/controleAcessos";

export class AcessoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = "AcessoErro"; } }

const PERFIS_CONTROLADOS = ["corretor", "empreendedor"] as const;
const DIAS_LOGINS = 30;
const DIA_MS = 86_400_000;

async function banco() {
  const d = await getDb();
  if (!d) throw new AcessoErro("Banco indisponível", 503);
  return d;
}

export type LinhaControle = {
  id: number; nome: string; perfil: string; creci: string | null; telefone: string | null; fotoUrl: string | null;
  ativo: boolean; arquivado: boolean; temSenha: boolean;
  ultimoAcesso: string | null; uso: SituacaoUso; loginsMes: number; ultimoLogin: string | null;
  pagamento: SituacaoPagamento; plano: string | null; licencaFim: string | null; diasRestantes: number | null;
  assinaturaId: number | null; ultimoPagamento: string | null; faturasAbertas: number;
  podeEntrar: boolean;
  /** Materiais baixados/enviados/copiados nos últimos 30 dias (só contagem) */
  midias: UsoMidias;
};

const ativoDe = (u: any) => !(u.ativo === false || u.ativo === 0);
const iso = (v: unknown) => (v ? new Date(v as any).toISOString() : null);

export async function listarControleAcessos(agora = Date.now()) {
  const d = await banco();
  const todos: any[] = await d.select().from(users);
  const pessoas = todos.filter(u => (PERFIS_CONTROLADOS as readonly string[]).includes(perfilDe(u) ?? ""));
  const ids = pessoas.map(p => p.id as number);
  if (!ids.length) return { linhas: [] as LinhaControle[], resumo: resumoControle([]), licenciamentoAtivo: false };

  const S = await import("./saas/servico");
  const { licenciamentoAtivo } = await S.lerConfig(agora);
  const desde = new Date(agora - DIAS_LOGINS * DIA_MS);
  const [logins, assinaturas, usos]: any[][] = await Promise.all([
    d.select({ usuarioId: auditoriaAcesso.usuarioId, criadoEm: auditoriaAcesso.criadoEm }).from(auditoriaAcesso)
      .where(and(inArray(auditoriaAcesso.usuarioId, ids), eq(auditoriaAcesso.evento, "LOGIN"), gte(auditoriaAcesso.criadoEm, desde))),
    d.select({ id: saasAssinaturas.id, usuarioId: saasAssinaturas.usuarioId }).from(saasAssinaturas).where(inArray(saasAssinaturas.usuarioId, ids)),
    d.select({ usuarioId: materialUso.usuarioId, categoria: materialUso.categoria, criadoEm: materialUso.criadoEm }).from(materialUso)
      .where(and(inArray(materialUso.usuarioId, ids), gte(materialUso.criadoEm, desde))).catch(() => []),
  ]);
  const usosPor = new Map<number, any[]>();
  for (const u of usos) { const l = usosPor.get(u.usuarioId) ?? []; l.push(u); usosPor.set(u.usuarioId, l); }
  const idsAssinatura = assinaturas.map(a => a.id as number);
  const faturas: any[] = idsAssinatura.length
    ? await d.select({ assinaturaId: saasFaturas.assinaturaId, status: saasFaturas.status, pagoEm: saasFaturas.pagoEm }).from(saasFaturas).where(inArray(saasFaturas.assinaturaId, idsAssinatura))
    : [];

  const loginsPor = new Map<number, { n: number; ultimo: number }>();
  for (const l of logins) {
    const t = new Date(l.criadoEm).getTime();
    const x = loginsPor.get(l.usuarioId) ?? { n: 0, ultimo: 0 };
    loginsPor.set(l.usuarioId, { n: x.n + 1, ultimo: Math.max(x.ultimo, t) });
  }
  const faturasPor = new Map<number, { pago: number; abertas: number }>();
  for (const f of faturas) {
    const x = faturasPor.get(f.assinaturaId) ?? { pago: 0, abertas: 0 };
    if (f.status === "PAGA" && f.pagoEm) x.pago = Math.max(x.pago, new Date(f.pagoEm).getTime());
    if (f.status === "ABERTA" || f.status === "VENCIDA") x.abertas++;
    faturasPor.set(f.assinaturaId, x);
  }

  const linhas: LinhaControle[] = [];
  for (const u of pessoas) {
    const lic = await S.resumoLicenca(u, agora);
    const pagamento = !lic.exigida ? "nao_exige" : situacaoDePagamento(lic.status ? { status: lic.status, origem: lic.origem ?? "", liberado: lic.liberado } : null, licenciamentoAtivo);
    const ativo = ativoDe(u);
    const l = loginsPor.get(u.id);
    // lastSignedIn nasce com a data do cadastro: sem senha criada, ou sem nenhum uso depois do cadastro, é "nunca entrou"
    const temSenha = !!(u.passwordScrypt || u.passwordHash);
    const ultimo = u.lastSignedIn ? new Date(u.lastSignedIn).getTime() : 0;
    const criado = u.createdAt ? new Date(u.createdAt).getTime() : 0;
    const nuncaEntrou = !ultimo || !temSenha || (!l && criado > 0 && Math.abs(ultimo - criado) < 2 * 60_000);
    const fat = lic.assinaturaId ? faturasPor.get(lic.assinaturaId) : undefined;
    linhas.push({
      id: u.id, nome: u.name || "Sem nome", perfil: perfilDe(u) ?? "corretor", creci: u.creci ?? null, telefone: u.telefone ?? null, fotoUrl: u.fotoUrl ?? null,
      ativo, arquivado: !!u.arquivadoEm, temSenha,
      ultimoAcesso: nuncaEntrou ? null : iso(u.lastSignedIn), uso: nuncaEntrou ? "nunca" : situacaoDeUso(u.lastSignedIn, agora), loginsMes: l?.n ?? 0, ultimoLogin: l ? new Date(l.ultimo).toISOString() : null,
      pagamento, plano: lic.plano ?? null, licencaFim: lic.fim ?? null, diasRestantes: lic.diasRestantes ?? null,
      assinaturaId: lic.assinaturaId ?? null, ultimoPagamento: fat?.pago ? new Date(fat.pago).toISOString() : null, faturasAbertas: fat?.abertas ?? 0,
      podeEntrar: podeEntrar(ativo, pagamento),
      midias: somarUsoMidias(usosPor.get(u.id) ?? []),
    });
  }
  linhas.sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));
  return { linhas, resumo: resumoControle(linhas), licenciamentoAtivo };
}

async function pessoaControlada(id: number) {
  const d = await banco();
  const [u]: any[] = await d.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw new AcessoErro("Pessoa não encontrada", 404);
  if (!(PERFIS_CONTROLADOS as readonly string[]).includes(perfilDe(u) ?? "")) throw new AcessoErro("Este controle é só para corretores e empreendedores", 403);
  return u;
}

/** Liga/desliga o login (quem está desligado não entra; reativar tira do arquivo) */
export async function definirLoginAtivo(id: number, ativo: boolean, motivo: string, autorId: number, ip: string | null = null) {
  if (!motivo.trim()) throw new AcessoErro("Informe o motivo");
  const u = await pessoaControlada(id);
  const d = await banco();
  await d.update(users).set({ ativo, ...(ativo ? { arquivadoEm: null } : {}), updatedAt: new Date() } as any).where(eq(users.id, u.id));
  if (!ativo) { const { encerrarSessoes } = await import("./sessoes"); await encerrarSessoes(u.id); }
  const S = await import("./saas/servico");
  S.limparCaches();
  await S.auditar(u.id, ativo ? "LOGIN_ATIVADO" : "LOGIN_DESATIVADO", { motivo: motivo.slice(0, 300), por: autorId }, ip);
  return { ok: true as const };
}

/**
 * Bloquear a licença (a secretária pode). Liberar, prorrogar e dar cortesia NÃO passam por aqui: viram um pedido
 * que só vale com a senha do administrador (pedirProrrogacao → autorizarPedido).
 */
export async function bloquearLicenca(id: number, motivo: string, autorId: number) {
  if (!motivo.trim()) throw new AcessoErro("Informe o motivo");
  const u = await pessoaControlada(id);
  const S = await import("./saas/servico");
  const a = await S.assinaturaDoUsuario(u);
  if (!a) throw new AcessoErro("Esta pessoa ainda não tem licença para bloquear");
  return S.acaoAssinatura(a.id, { tipo: "bloquear", motivo }, autorId);
}

// ─── Prorrogação / desbloqueio / cortesia: pedido + senha do administrador ───────────────────────────────

export const VALIDADE_PEDIDO_MS = 48 * 3600_000;
export const LIMITE_TENTATIVAS_SENHA = 5;

type Ator = { id: number; name?: string | null; perfil?: string | null; role?: string | null };
const ehAdmin = (u: any) => perfilDe(u) === "admin";

/** Confere a senha de login de um administrador (sem a senha inicial do ambiente). Devolve o administrador que bateu. */
async function adminDaSenha(senha: string, ator: Ator): Promise<{ id: number; nome: string } | null> {
  if (!senha) return null;
  const d = await banco();
  const todos: any[] = await d.select().from(users);
  // Administrador logado: só a senha dele. Secretária: a senha de um administrador ativo (ele digita no aparelho dela)
  const candidatos = todos.filter(u => ehAdmin(u) && ativoDe(u) && (!ehAdmin(ator) || u.id === ator.id));
  const { checkLogin } = await import("./auth-security");
  for (const u of candidatos) {
    if (!u.passwordScrypt && !u.passwordHash) continue;
    if ((await checkLogin(senha, { scryptHash: u.passwordScrypt, legacySha256: u.passwordHash }, "")).ok) return { id: u.id, nome: u.name || "Administrador" };
  }
  return null;
}

/** A secretária (ou o administrador) pede para prorrogar/desbloquear com pagamento ou cortesia. Gera o código e avisa o administrador. */
export async function pedirProrrogacao(usuarioId: number, p: { modalidade: "pago" | "cortesia"; ate: string; valor?: number | null; motivo: string }, ator: Ator, agora = Date.now()) {
  if (!p.motivo.trim()) throw new AcessoErro("Informe o motivo");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.ate)) throw new AcessoErro("Informe a nova data de vencimento");
  if (new Date(`${p.ate}T23:59:59-03:00`).getTime() < agora) throw new AcessoErro("A nova data precisa ser hoje ou depois");
  const u = await pessoaControlada(usuarioId);
  const d = await banco();
  // Um pedido aberto por pessoa: o novo substitui o anterior
  await d.update(solicitacaoAcesso).set({ status: "CANCELADA", decididoEm: new Date(agora) } as any)
    .where(and(eq(solicitacaoAcesso.usuarioId, u.id), eq(solicitacaoAcesso.status, "PENDENTE")));
  const codigo = String(randomInt(100000, 1000000));
  const r: any = await d.insert(solicitacaoAcesso).values({
    usuarioId: u.id, modalidade: p.modalidade, ate: p.ate, valor: p.valor != null ? Number(p.valor).toFixed(2) : null,
    motivo: p.motivo.trim().slice(0, 300), codigo, status: "PENDENTE", tentativas: 0, solicitanteId: ator.id, criadoEm: new Date(agora),
  } as any);
  const id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
  const S = await import("./saas/servico");
  await S.auditar(u.id, "PEDIDO_PRORROGACAO", { codigo, modalidade: p.modalidade, ate: p.ate, motivo: p.motivo, por: ator.id });
  if (!ehAdmin(ator)) {
    import("./notificacoes").then(N => N.notificarSolicitacaoAcesso({ solicitacaoId: id, codigo, pessoa: u.name || "corretor", modalidade: p.modalidade, ate: p.ate, autorId: ator.id, autorNome: ator.name, motivo: p.motivo }))
      .catch(e => console.warn("[Acessos] aviso do pedido:", e?.message));
  }
  return { id, codigo };
}

async function pedidoAberto(ref: { id?: number; codigo?: string }, agora: number) {
  const d = await banco();
  const cond = ref.id ? eq(solicitacaoAcesso.id, ref.id) : eq(solicitacaoAcesso.codigo, String(ref.codigo ?? ""));
  const [s]: any[] = await d.select().from(solicitacaoAcesso).where(and(cond, eq(solicitacaoAcesso.status, "PENDENTE"))).orderBy(desc(solicitacaoAcesso.id)).limit(1);
  if (!s) throw new AcessoErro("Pedido não encontrado ou já decidido", 404);
  if (agora - new Date(s.criadoEm).getTime() > VALIDADE_PEDIDO_MS) {
    await d.update(solicitacaoAcesso).set({ status: "EXPIRADA", decididoEm: new Date(agora) } as any).where(eq(solicitacaoAcesso.id, s.id));
    throw new AcessoErro("Este pedido passou de 48 horas e expirou. Faça um novo pedido.");
  }
  return s;
}

/** Só a senha do administrador libera: aplica a prorrogação (pagamento ou cortesia) e desbloqueia */
export async function autorizarPedido(ref: { id?: number; codigo?: string }, senha: string, ator: Ator, ip: string | null = null, agora = Date.now()) {
  const s = await pedidoAberto(ref, agora);
  const d = await banco();
  const S = await import("./saas/servico");
  const admin = await adminDaSenha(String(senha ?? ""), ator);
  if (!admin) {
    const tentativas = Number(s.tentativas || 0) + 1;
    const esgotou = tentativas >= LIMITE_TENTATIVAS_SENHA;
    await d.update(solicitacaoAcesso).set({ tentativas, ...(esgotou ? { status: "CANCELADA", decididoEm: new Date(agora) } : {}) } as any).where(eq(solicitacaoAcesso.id, s.id));
    await S.auditar(s.usuarioId, "SENHA_ADMIN_ERRADA", { codigo: s.codigo, tentativa: tentativas, por: ator.id }, ip);
    throw new AcessoErro(esgotou ? "Senha errada 5 vezes: o pedido foi cancelado. Faça um novo pedido." : `Senha do administrador incorreta. Nada foi alterado (${LIMITE_TENTATIVAS_SENHA - tentativas} tentativas restantes).`, 403);
  }
  const valor = s.valor != null ? Number(s.valor) : null;
  const motivo = `${s.motivo}${s.modalidade === "pago" && valor ? ` (pagamento de R$ ${valor.toFixed(2).replace(".", ",")})` : ""} · autorizado por ${admin.nome}`;
  await S.prorrogarAssinatura(s.usuarioId, { modalidade: s.modalidade, ate: s.ate, motivo }, admin.id, agora);
  await d.update(solicitacaoAcesso).set({ status: "APROVADA", decididoPor: admin.id, decididoEm: new Date(agora) } as any).where(eq(solicitacaoAcesso.id, s.id));
  await S.auditar(s.usuarioId, "PRORROGACAO_AUTORIZADA", { codigo: s.codigo, modalidade: s.modalidade, ate: s.ate, motivo: s.motivo, por: admin.id, pedidoPor: s.solicitanteId }, ip);
  return { ok: true as const, ate: s.ate, modalidade: s.modalidade as string };
}

/** Administrador logado prorroga direto: cria o pedido e autoriza com a senha dele, num passo só */
export async function prorrogarComSenha(usuarioId: number, p: { modalidade: "pago" | "cortesia"; ate: string; valor?: number | null; motivo: string }, senha: string, ator: Ator, ip: string | null = null) {
  if (!ehAdmin(ator)) throw new AcessoErro("Peça a autorização: só o administrador prorroga direto", 403);
  const { id } = await pedirProrrogacao(usuarioId, p, ator);
  return autorizarPedido({ id }, senha, ator, ip);
}

/** Recusar (administrador) ou desistir do pedido (quem pediu) */
export async function encerrarPedido(id: number, ator: Ator, agora = Date.now()) {
  const d = await banco();
  const [s]: any[] = await d.select().from(solicitacaoAcesso).where(eq(solicitacaoAcesso.id, id)).limit(1);
  if (!s || s.status !== "PENDENTE") throw new AcessoErro("Pedido não encontrado ou já decidido", 404);
  if (!ehAdmin(ator) && s.solicitanteId !== ator.id) throw new AcessoErro("Só o administrador ou quem pediu pode encerrar", 403);
  const status = ehAdmin(ator) && s.solicitanteId !== ator.id ? "RECUSADA" : "CANCELADA";
  await d.update(solicitacaoAcesso).set({ status, decididoPor: ator.id, decididoEm: new Date(agora) } as any).where(eq(solicitacaoAcesso.id, id));
  const S = await import("./saas/servico");
  await S.auditar(s.usuarioId, status === "RECUSADA" ? "PRORROGACAO_RECUSADA" : "PEDIDO_CANCELADO", { codigo: s.codigo, por: ator.id });
  return { ok: true as const, status };
}

/** Pedidos abertos e os decididos nos últimos 7 dias */
export async function listarPedidos(agora = Date.now()) {
  const d = await banco();
  const linhas: any[] = await d.select().from(solicitacaoAcesso).orderBy(desc(solicitacaoAcesso.id)).limit(100);
  const ids = new Set<number>();
  for (const l of linhas) { ids.add(l.usuarioId); ids.add(l.solicitanteId); if (l.decididoPor) ids.add(l.decididoPor); }
  const us: any[] = ids.size ? await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, Array.from(ids))) : [];
  const nome = new Map(us.map(u => [u.id, u.name || "—"]));
  return linhas
    .map(l => {
      const expirou = l.status === "PENDENTE" && agora - new Date(l.criadoEm).getTime() > VALIDADE_PEDIDO_MS;
      return {
        id: l.id as number, usuarioId: l.usuarioId as number, pessoa: nome.get(l.usuarioId) ?? "—", modalidade: l.modalidade as "pago" | "cortesia",
        ate: l.ate as string, valor: l.valor != null ? Number(l.valor) : null, motivo: l.motivo as string, codigo: l.codigo as string,
        status: (expirou ? "EXPIRADA" : l.status) as string, solicitante: nome.get(l.solicitanteId) ?? "—", solicitanteId: l.solicitanteId as number,
        decididoPor: l.decididoPor ? nome.get(l.decididoPor) ?? null : null, criadoEm: iso(l.criadoEm), decididoEm: iso(l.decididoEm),
      };
    })
    .filter(l => l.status === "PENDENTE" || (l.decididoEm && agora - new Date(l.decididoEm).getTime() < 7 * 86_400_000));
}

/** Desconecta de todos os aparelhos (senha emprestada, celular perdido) */
export async function desconectar(id: number, autorId: number) {
  const u = await pessoaControlada(id);
  const { encerrarSessoes } = await import("./sessoes");
  await encerrarSessoes(u.id);
  const S = await import("./saas/servico");
  await S.auditar(u.id, "SAIR_DE_TODOS", { por: autorId });
  return { ok: true as const };
}

const ROTULO_EVENTO: Record<string, string> = {
  LOGIN: "Entrou no sistema", SAIR_DE_TODOS: "Desconectado de todos os aparelhos", VER_COMO: "Visto pelo escritório (Ver como)",
  DESBLOQUEIO: "Licença liberada", PEDIDO_PRORROGACAO: "Pedido de prorrogação", PRORROGACAO_AUTORIZADA: "Prorrogação autorizada (senha do administrador)",
  PRORROGACAO_RECUSADA: "Prorrogação recusada", PEDIDO_CANCELADO: "Pedido cancelado", SENHA_ADMIN_ERRADA: "Senha do administrador errada", BLOQUEIO_MANUAL: "Licença bloqueada", LOGIN_ATIVADO: "Login ativado", LOGIN_DESATIVADO: "Login desativado",
  PAGAMENTO_CONFIRMADO: "Pagamento confirmado", CHECKOUT_INICIADO: "Abriu o pagamento", ADMIN_CANCELAR: "Licença cancelada",
  ADMIN_OVERRIDE: "Preço negociado", ADMIN_TOLERANCIA: "Tolerância alterada",
};

/** Últimos acontecimentos da pessoa (logins, liberações, bloqueios) */
export async function historicoAcessos(id: number, limite = 30) {
  await pessoaControlada(id);
  const d = await banco();
  const ev: any[] = await d.select().from(auditoriaAcesso).where(eq(auditoriaAcesso.usuarioId, id)).orderBy(desc(auditoriaAcesso.criadoEm)).limit(limite);
  const autores = new Set<number>();
  const det = ev.map(e => { let j: any = null; try { j = e.detalheJson ? JSON.parse(e.detalheJson) : null; } catch { /* texto livre */ } if (j?.por) autores.add(Number(j.por)); return j; });
  const nomes = new Map<number, string>();
  if (autores.size) {
    const us: any[] = await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, Array.from(autores)));
    for (const x of us) nomes.set(x.id, x.name || "Escritório");
  }
  return ev.map((e, i) => ({
    id: e.id as number, quando: iso(e.criadoEm), evento: e.evento as string, rotulo: ROTULO_EVENTO[e.evento] ?? e.evento,
    motivo: det[i]?.motivo ?? null, por: det[i]?.por ? nomes.get(Number(det[i].por)) ?? null : null,
  }));
}
