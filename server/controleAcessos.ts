/**
 * Controle de acessos dos corretores (administrador e secretária): para cada corretor/empreendedor, se o login está
 * ativo, a situação da licença (paga, cortesia, teste, atrasada, bloqueada…), o último uso do sistema e os logins
 * dos últimos 30 dias (auditoriaAcesso, evento LOGIN). Ações: ativar/desativar o login, liberar/bloquear a licença
 * e desconectar de todos os aparelhos — sempre com registro de quem fez.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { auditoriaAcesso, saasAssinaturas, saasFaturas, users } from "../drizzle/schema";
import { perfilDe } from "../shared/equipe";
import { podeEntrar, resumoControle, situacaoDePagamento, situacaoDeUso, type SituacaoPagamento, type SituacaoUso } from "../shared/controleAcessos";

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
  const [logins, assinaturas]: any[][] = await Promise.all([
    d.select({ usuarioId: auditoriaAcesso.usuarioId, criadoEm: auditoriaAcesso.criadoEm }).from(auditoriaAcesso)
      .where(and(inArray(auditoriaAcesso.usuarioId, ids), eq(auditoriaAcesso.evento, "LOGIN"), gte(auditoriaAcesso.criadoEm, desde))),
    d.select({ id: saasAssinaturas.id, usuarioId: saasAssinaturas.usuarioId }).from(saasAssinaturas).where(inArray(saasAssinaturas.usuarioId, ids)),
  ]);
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
 * Licença: liberar (até uma data, ou sem fim) ou bloquear. Sem assinatura ainda: liberar cria uma cortesia no plano
 * Corretor Essencial (empreendedor: plano por empreendimento), como faz o SaaS.
 */
export async function definirLicenca(id: number, p: { tipo: "liberar" | "bloquear"; ate?: string | null; motivo: string }, autorId: number) {
  if (!p.motivo.trim()) throw new AcessoErro("Informe o motivo");
  const u = await pessoaControlada(id);
  const S = await import("./saas/servico");
  const a = await S.assinaturaDoUsuario(u);
  if (a) return S.acaoAssinatura(a.id, { tipo: p.tipo === "liberar" ? "desbloquear" : "bloquear", motivo: p.motivo, ate: p.ate ?? null }, autorId);
  if (p.tipo === "bloquear") throw new AcessoErro("Esta pessoa ainda não tem licença para bloquear");
  return S.definirAssinatura({
    usuarioId: u.id, planoCodigo: perfilDe(u) === "empreendedor" ? "EMPREENDEDOR_AVULSO" : "CORRETOR_ESSENCIAL",
    origem: "CORTESIA", periodoFim: p.ate ?? null, motivo: p.motivo,
  }, autorId);
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
  DESBLOQUEIO: "Licença liberada", BLOQUEIO_MANUAL: "Licença bloqueada", LOGIN_ATIVADO: "Login ativado", LOGIN_DESATIVADO: "Login desativado",
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
