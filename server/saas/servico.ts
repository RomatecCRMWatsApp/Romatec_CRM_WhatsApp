/**
 * Camada SaaS — fase 1 (shared/saas.ts): configuração (licenciamento ligado/desligado), licença por usuário,
 * trial no 1º login (um por CPF), cortesia em massa ao ligar, ações do administrador, métricas e as rotinas
 * (expirar trial/cortesia, inadimplência, pacote vencido, lembretes D-3/D-1/D0). Com o licenciamento
 * DESLIGADO nada é cobrado, bloqueado nem enviado.
 */
import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { sincronizarFilaNfse } from './nfse';
import {
  auditoriaAcesso, empreendimentos, leadQualifications, lotes, saasAssinaturas, saasConfig, saasCupons, saasFaturas, saasPlanos, saasTrials, users,
} from '../../drizzle/schema';
import { perfilDe } from '../../shared/equipe';
import {
  DIAS_TOLERANCIA_PADRAO, DIAS_TRIAL, LEMBRETES_DIAS, ROTULO_STATUS, calcularMrr, diasAte, licencaLiberada, motivoBloqueio, precisaLicenca,
  precoComCupom, problemaCupom, type CupomSaas, type StatusAssinatura,
} from '../../shared/saas';

export class SaasErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'SaasErro'; } }

const banco = async () => {
  const d = await getDb();
  if (!d) throw new SaasErro('Banco indisponível', 503);
  return d as any;
};
const json = <T>(v: unknown): T | null => { if (v == null || v === '') return null; try { return typeof v === 'string' ? JSON.parse(v) : (v as T); } catch { return null; } };
const urlBase = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
const DIA = 86_400_000;
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Envios trocáveis nos testes */
export const envio = {
  texto: async (fone: string, msg: string) => { const { enviarTexto } = await import('../leads/zapiClient'); await enviarTexto(fone, msg); },
  disponivel: () => !!(process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN),
};
const fone = (t: string | null | undefined) => { const d = soDig(t); return d.length === 10 || d.length === 11 ? `55${d}` : d; };
async function avisar(telefone: string | null | undefined, texto: string) {
  if (!telefone || !envio.disponivel()) return false;
  try { await envio.texto(fone(telefone), texto); return true; } catch (e: any) { console.warn('[SaaS] WhatsApp:', e?.message); return false; }
}

// ─── Configuração ─────────────────────────────────────────────────────────

let cacheCfg: { em: number; v: { licenciamentoAtivo: boolean; cortesiaAte: string | null } } | null = null;
const cacheLic = new Map<number, { em: number; v: ResumoLicenca }>();
export function limparCaches() { cacheCfg = null; cacheLic.clear(); }

export async function lerConfig(agora = Date.now()) {
  if (cacheCfg && agora - cacheCfg.em < 30_000) return cacheCfg.v;
  const d = await banco();
  const linhas: any[] = await d.select().from(saasConfig);
  const m = new Map(linhas.map(l => [l.chave, l.valor]));
  const v = { licenciamentoAtivo: m.get('licenciamento_ativo') === '1', cortesiaAte: (m.get('cortesia_ate') as string) || null };
  cacheCfg = { em: agora, v };
  return v;
}

async function gravarConfig(chave: string, valor: string | null, autorId: number) {
  const d = await banco();
  await d.delete(saasConfig).where(eq(saasConfig.chave, chave));
  await d.insert(saasConfig).values({ chave, valor, atualizadoPor: autorId, updatedAt: new Date() } as any);
}

export async function auditar(usuarioId: number, evento: string, detalhe: Record<string, unknown> | null = null, ip: string | null = null) {
  try {
    const d = await banco();
    await d.insert(auditoriaAcesso).values({ usuarioId, evento, detalheJson: detalhe ? JSON.stringify(detalhe) : null, ip, criadoEm: new Date() } as any);
  } catch (e: any) { console.warn('[SaaS] auditoria:', e?.message); }
}

// ─── Planos e assinaturas ─────────────────────────────────────────────────

export async function listarPlanos() {
  const d = await banco();
  const ps: any[] = await d.select().from(saasPlanos);
  return ps.map(p => ({
    id: p.id as number, codigo: p.codigo as string, publico: p.publico as string, nome: p.nome as string, precoMensal: Number(p.precoMensal),
    precoAnual: p.precoAnual == null ? null : Number(p.precoAnual), storageGb: Number(p.storageGb), incluiAvalieimob: !!p.incluiAvalieimob,
    unico: !!p.unico, conteudo: (p.conteudo ?? '') as string, ativo: p.ativo !== false && p.ativo !== 0,
  }));
}
async function planoPorCodigo(codigo: string) {
  const p = (await listarPlanos()).find(x => x.codigo === codigo);
  if (!p) throw new SaasErro(`Plano ${codigo} não encontrado`, 404);
  return p;
}

const chaveDe = (usuarioId: number, empreendimentoId: number | null | undefined) => `${usuarioId}:${empreendimentoId ?? 0}`;

/** Empreendimento do empreendedor (pelo slug do cadastro) */
async function empreendimentoDoUsuario(u: any): Promise<number | null> {
  if (perfilDe(u) !== 'empreendedor' || !u.empreendimentoSlug) return null;
  const d = await banco();
  const [e]: any[] = await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, u.empreendimentoSlug)).limit(1);
  return e?.id ?? null;
}

export async function assinaturaDoUsuario(u: any) {
  const d = await banco();
  const empId = await empreendimentoDoUsuario(u);
  const [a]: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.chave, chaveDe(u.id, empId))).limit(1);
  return a ?? null;
}

export interface ResumoLicenca {
  exigida: boolean; liberado: boolean; status: string | null; origem: string | null; plano: string | null; diasRestantes: number | null;
  fim: string | null; motivo: string | null; assinaturaId: number | null;
}

/** Licença do usuário (cache de 30 s). Admin/secretária e licenciamento desligado: liberado, sem exigência. */
export async function resumoLicenca(u: any, agora = Date.now()): Promise<ResumoLicenca> {
  const livre: ResumoLicenca = { exigida: false, liberado: true, status: null, origem: null, plano: null, diasRestantes: null, fim: null, motivo: null, assinaturaId: null };
  if (!u || !precisaLicenca(perfilDe(u))) return livre;
  const cfg = await lerConfig(agora);
  if (!cfg.licenciamentoAtivo) return livre;
  const c = cacheLic.get(u.id);
  if (c && agora - c.em < 30_000) return c.v;
  const a = await assinaturaDoUsuario(u);
  const planos = a ? await listarPlanos() : [];
  const fim = a ? (a.status === 'TRIAL' ? a.trialFim : a.periodoFim) : null;
  const liberado = licencaLiberada(a, agora);
  const v: ResumoLicenca = {
    exigida: true, liberado, status: a?.status ?? null, origem: a?.origem ?? null, plano: planos.find(p => p.id === a?.planoId)?.nome ?? null,
    diasRestantes: diasAte(fim, agora), fim: fim ? new Date(fim).toISOString() : null, motivo: liberado ? null : motivoBloqueio(a), assinaturaId: a?.id ?? null,
  };
  cacheLic.set(u.id, { em: agora, v });
  return v;
}

/** Trial de 7 dias no 1º login do corretor (licenciamento ligado, sem assinatura, CPF ainda sem trial) */
export async function iniciarTrialSeNecessario(u: any, ip: string | null = null, agora = Date.now()) {
  if (!u || perfilDe(u) !== 'corretor') return null;
  const cfg = await lerConfig(agora);
  if (!cfg.licenciamentoAtivo) return null;
  if (await assinaturaDoUsuario(u)) return null;
  const d = await banco();
  const doc = soDig(u.cpf) || `usuario:${u.id}`;
  const [usado]: any[] = await d.select().from(saasTrials).where(eq(saasTrials.cpfCnpj, doc)).limit(1);
  if (usado) return null;
  const plano = await planoPorCodigo('CORRETOR_ESSENCIAL');
  const trialFim = new Date(agora + DIAS_TRIAL * DIA);
  await d.insert(saasTrials).values({ cpfCnpj: doc, usuarioId: u.id, usadoEm: new Date(agora) } as any);
  await d.insert(saasAssinaturas).values({
    usuarioId: u.id, planoId: plano.id, chave: chaveDe(u.id, null), origem: 'TRIAL', ciclo: 'MENSAL', status: 'TRIAL', trialFim,
    diasTolerancia: DIAS_TOLERANCIA_PADRAO, createdAt: new Date(agora), updatedAt: new Date(agora),
  } as any);
  cacheLic.delete(u.id);
  await auditar(u.id, 'TRIAL_INICIADO', { trialFim: trialFim.toISOString() }, ip);
  return { trialFim };
}

// ─── Administrador ────────────────────────────────────────────────────────

/** Liga/desliga o licenciamento. Ao ligar com cortesia: quem usa o CRM hoje (corretor/empreendedor ativo, sem assinatura) ganha cortesia até a data. */
export async function definirLicenciamento(ativo: boolean, cortesiaAte: string | null, autorId: number, agora = Date.now()) {
  if (ativo && cortesiaAte && !/^\d{4}-\d{2}-\d{2}$/.test(cortesiaAte)) throw new SaasErro('Data da cortesia inválida');
  let cortesias = 0;
  if (ativo && cortesiaAte) {
    const d = await banco();
    const fim = new Date(`${cortesiaAte}T23:59:59-03:00`);
    if (fim.getTime() <= agora) throw new SaasErro('A cortesia precisa terminar depois de hoje');
    const pessoas: any[] = (await d.select().from(users)).filter((u: any) => u.ativo !== false && u.ativo !== 0 && precisaLicenca(perfilDe(u)));
    const planos = await listarPlanos();
    for (const u of pessoas) {
      if (await assinaturaDoUsuario(u)) continue;
      const empreendedor = perfilDe(u) === 'empreendedor';
      const empId = await empreendimentoDoUsuario(u);
      if (empreendedor && !empId) continue;
      const plano = planos.find(p => p.codigo === (empreendedor ? 'EMPREENDEDOR_AVULSO' : 'CORRETOR_ESSENCIAL'))!;
      await d.insert(saasAssinaturas).values({
        usuarioId: u.id, planoId: plano.id, empreendimentoId: empId, chave: chaveDe(u.id, empId), origem: 'CORTESIA', ciclo: 'MENSAL', status: 'ATIVA',
        periodoFim: fim, diasTolerancia: DIAS_TOLERANCIA_PADRAO, motivo: 'Cortesia de implantação do licenciamento', createdAt: new Date(agora), updatedAt: new Date(agora),
      } as any);
      cortesias++;
    }
  }
  await gravarConfig('licenciamento_ativo', ativo ? '1' : '0', autorId);
  if (ativo) await gravarConfig('cortesia_ate', cortesiaAte, autorId);
  limparCaches();
  return { ativo, cortesias };
}

export async function listarAssinaturas() {
  const d = await banco();
  const [as, us, ps, es]: any[][] = await Promise.all([
    d.select().from(saasAssinaturas).orderBy(desc(saasAssinaturas.updatedAt)),
    d.select({ id: users.id, name: users.name, telefone: users.telefone, perfil: users.perfil, role: users.role, cpf: users.cpf }).from(users),
    d.select().from(saasPlanos), d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos),
  ]);
  const U = new Map(us.map(u => [u.id, u])), P = new Map(ps.map(p => [p.id, p])), E = new Map(es.map(e => [e.id, e.nome]));
  const agora = Date.now();
  return as.map(a => ({
    id: a.id as number, usuarioId: a.usuarioId as number, nome: U.get(a.usuarioId)?.name ?? '—', telefone: U.get(a.usuarioId)?.telefone ?? null,
    perfil: U.get(a.usuarioId) ? perfilDe(U.get(a.usuarioId)) : null, plano: P.get(a.planoId)?.nome ?? '—', planoCodigo: P.get(a.planoId)?.codigo ?? '',
    empreendimento: a.empreendimentoId ? E.get(a.empreendimentoId) ?? null : null, empreendimentoId: a.empreendimentoId ?? null,
    origem: a.origem as string, ciclo: a.ciclo as string, status: a.status as string, liberado: licencaLiberada(a, agora),
    precoOverride: a.precoOverride == null ? null : Number(a.precoOverride), trialFim: a.trialFim, periodoFim: a.periodoFim, diasTolerancia: a.diasTolerancia,
    contratoGestaoNr: a.contratoGestaoNr ?? null, motivo: a.motivo ?? null,
  }));
}

/** Pessoas que precisam de licença e ainda não têm assinatura (para criar cortesia/pacote/pagamento) */
export async function semAssinatura() {
  const d = await banco();
  const pessoas: any[] = (await d.select().from(users)).filter((u: any) => u.ativo !== false && u.ativo !== 0 && precisaLicenca(perfilDe(u)));
  const out: { id: number; nome: string; perfil: string; empreendimentoId: number | null }[] = [];
  for (const u of pessoas) if (!(await assinaturaDoUsuario(u))) out.push({ id: u.id, nome: u.name ?? '—', perfil: perfilDe(u)!, empreendimentoId: await empreendimentoDoUsuario(u) });
  return out;
}

async function assinaturaPorId(id: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.id, id)).limit(1);
  if (!a) throw new SaasErro('Assinatura não encontrada', 404);
  return a;
}

async function atualizar(a: any, patch: Record<string, unknown>) {
  const d = await banco();
  await d.update(saasAssinaturas).set({ ...patch, version: (Number(a.version) || 0) + 1, updatedAt: new Date() } as any).where(eq(saasAssinaturas.id, a.id));
  cacheLic.delete(a.usuarioId);
}

/** Cria ou redefine a assinatura do usuário (cortesia, pacote de gestão ou paga) */
export async function definirAssinatura(p: {
  usuarioId: number; empreendimentoId?: number | null; planoCodigo: string; origem: 'CORTESIA' | 'PACOTE_GESTAO' | 'PAGA';
  ciclo?: 'MENSAL' | 'ANUAL'; periodoFim?: string | null; contratoGestaoNr?: string | null; precoOverride?: number | null; motivo: string;
}, autorId: number, agora = Date.now()) {
  if (!p.motivo?.trim()) throw new SaasErro('Informe o motivo');
  if (p.origem === 'PACOTE_GESTAO' && (!p.contratoGestaoNr || !p.periodoFim)) throw new SaasErro('Pacote: informe o nº do contrato de gestão e o término');
  const plano = await planoPorCodigo(p.planoCodigo);
  const d = await banco();
  const [u]: any[] = await d.select().from(users).where(eq(users.id, p.usuarioId)).limit(1);
  if (!u) throw new SaasErro('Usuário não encontrado', 404);
  const empId = p.empreendimentoId ?? (await empreendimentoDoUsuario(u));
  const fim = p.periodoFim ? new Date(`${p.periodoFim}T23:59:59-03:00`) : null;
  const dados = {
    planoId: plano.id, origem: p.origem, ciclo: p.ciclo ?? 'MENSAL', status: 'ATIVA', periodoFim: fim, trialFim: null,
    contratoGestaoNr: p.origem === 'PACOTE_GESTAO' ? p.contratoGestaoNr : null, precoOverride: p.precoOverride ?? null, motivo: p.motivo.slice(0, 300),
  };
  const [ja]: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.chave, chaveDe(u.id, empId))).limit(1);
  if (ja) await atualizar(ja, dados);
  else await d.insert(saasAssinaturas).values({ usuarioId: u.id, empreendimentoId: empId, chave: chaveDe(u.id, empId), diasTolerancia: DIAS_TOLERANCIA_PADRAO, ...dados, createdAt: new Date(agora), updatedAt: new Date(agora) } as any);
  cacheLic.delete(u.id);
  await auditar(u.id, 'DESBLOQUEIO', { origem: p.origem, plano: plano.codigo, ate: p.periodoFim ?? null, motivo: p.motivo, por: autorId });
  return { ok: true as const };
}

/** Pagamento recebido fora do sistema (Pix, transferência…) enquanto a fase 2 não chega: estende o período e desbloqueia */
export async function registrarPagamentoManual(id: number, p: { ciclo: 'MENSAL' | 'ANUAL'; valor: number; observacao: string }, autorId: number, agora = Date.now()) {
  if (!(p.valor > 0)) throw new SaasErro('Informe o valor recebido');
  const a = await assinaturaPorId(id);
  const base = Math.max(agora, a.periodoFim ? new Date(a.periodoFim).getTime() : 0);
  const fim = new Date(base);
  fim.setMonth(fim.getMonth() + (p.ciclo === 'ANUAL' ? 12 : 1));
  const d = await banco();
  const competencia = new Date(agora - 3 * 3600_000).toISOString().slice(0, 7);
  const existentes: any[] = await d.select({ competencia: saasFaturas.competencia }).from(saasFaturas).where(eq(saasFaturas.assinaturaId, id));
  // Mais de um pagamento na mesma competência (adiantado): numera a competência seguinte
  let comp = competencia;
  while (existentes.some(f => f.competencia === comp)) { const [y, m] = comp.split('-').map(Number); comp = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; }
  await d.insert(saasFaturas).values({
    assinaturaId: id, competencia: comp, valor: p.valor.toFixed(2), metodo: 'MANUAL', status: 'PAGA', vencimento: new Date(agora - 3 * 3600_000).toISOString().slice(0, 10),
    pagoEm: new Date(agora), observacao: p.observacao.slice(0, 300) || null, criadoPor: autorId, createdAt: new Date(agora),
  } as any);
  await atualizar(a, { origem: 'PAGA', status: 'ATIVA', ciclo: p.ciclo, periodoFim: fim, trialFim: null, motivo: null });
  await auditar(a.usuarioId, 'PAGAMENTO_CONFIRMADO', { assinaturaId: id, valor: p.valor, metodo: 'MANUAL', ate: fim.toISOString(), por: autorId });
  await sincronizarFilaNfse(agora).catch((e: any) => console.warn('[NFS-e] fila:', e?.message));
  return { ok: true as const, periodoFim: fim.toISOString() };
}

/** Bloquear/desbloquear à mão (motivo obrigatório), preço negociado e tolerância */
export async function acaoAssinatura(id: number, acao: { tipo: 'bloquear' | 'desbloquear' | 'override' | 'tolerancia' | 'cancelar'; motivo: string; preco?: number | null; dias?: number; ate?: string | null }, autorId: number) {
  const a = await assinaturaPorId(id);
  if (!acao.motivo?.trim()) throw new SaasErro('Informe o motivo');
  const motivo = acao.motivo.slice(0, 300);
  if (acao.tipo === 'bloquear') await atualizar(a, { status: 'BLOQUEADO', motivo });
  else if (acao.tipo === 'desbloquear') {
    const fim = acao.ate ? new Date(`${acao.ate}T23:59:59-03:00`) : a.periodoFim;
    await atualizar(a, { status: 'ATIVA', origem: a.origem === 'TRIAL' ? 'CORTESIA' : a.origem, periodoFim: fim, motivo });
  } else if (acao.tipo === 'override') await atualizar(a, { precoOverride: acao.preco == null ? null : Number(acao.preco).toFixed(2), motivo });
  else if (acao.tipo === 'tolerancia') await atualizar(a, { diasTolerancia: Math.max(0, Math.min(60, Math.round(acao.dias ?? DIAS_TOLERANCIA_PADRAO))), motivo });
  else await atualizar(a, { status: 'CANCELADA', motivo });
  await auditar(a.usuarioId, acao.tipo === 'desbloquear' ? 'DESBLOQUEIO' : acao.tipo === 'bloquear' ? 'BLOQUEIO_MANUAL' : `ADMIN_${acao.tipo.toUpperCase()}`, { assinaturaId: id, motivo, por: autorId });
  return { ok: true as const };
}

export async function atualizarPlano(id: number, p: { nome?: string; precoMensal?: number; precoAnual?: number | null; conteudo?: string; ativo?: boolean }) {
  const d = await banco();
  await d.update(saasPlanos).set({
    ...(p.nome ? { nome: p.nome.slice(0, 80) } : {}), ...(p.precoMensal != null ? { precoMensal: p.precoMensal.toFixed(2) } : {}),
    ...(p.precoAnual !== undefined ? { precoAnual: p.precoAnual == null ? null : p.precoAnual.toFixed(2) } : {}),
    ...(p.conteudo !== undefined ? { conteudo: p.conteudo } : {}), ...(p.ativo !== undefined ? { ativo: p.ativo ? 1 : 0 } : {}),
  } as any).where(eq(saasPlanos.id, id));
  limparCaches();
  return { ok: true as const };
}

// ─── Cupons (regras do AvalieImob) ────────────────────────────────────────

const cupomDaLinha = (c: any): CupomSaas & { id: number; descricao: string | null } => ({
  id: c.id, codigo: c.codigo, tipo: c.tipo, valor: Number(c.valor), planoAlvo: c.planoAlvo ?? null, limiteUsos: Number(c.limiteUsos),
  usosRealizados: Number(c.usosRealizados), validade: c.validade ?? null, status: c.status, duracaoCiclos: Number(c.duracaoCiclos) || 1,
  precosFixos: json<Record<string, number>>(c.precosFixosJson), descricao: c.descricao ?? null,
});

export async function listarCupons(agora = Date.now()) {
  const d = await banco();
  const cs: any[] = await d.select().from(saasCupons).orderBy(desc(saasCupons.createdAt));
  // Vencidos passam a "expirado" (como no AvalieImob)
  for (const c of cs.filter(x => x.status === 'ativo' && x.validade && new Date(x.validade).getTime() < agora)) {
    await d.update(saasCupons).set({ status: 'expirado', updatedAt: new Date(agora) } as any).where(eq(saasCupons.id, c.id));
    c.status = 'expirado';
  }
  return cs.map(cupomDaLinha);
}

const gerarCodigo = (prefixo = 'ROMATEC') => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
  return `${prefixo.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ROMATEC'}-${s}`;
};

export async function criarCupom(p: {
  codigo?: string | null; tipo: 'PERCENTUAL' | 'VALOR_FIXO' | 'PRECO_FIXO'; valor?: number; precosFixos?: Record<string, number> | null; planoAlvo?: string | null;
  limiteUsos: number; validade?: string | null; duracaoCiclos?: number; descricao?: string | null;
}, autorId: number) {
  const codigo = (p.codigo?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || gerarCodigo()).slice(0, 40);
  if (p.tipo === 'PERCENTUAL' && !((p.valor ?? 0) > 0 && (p.valor ?? 0) <= 100)) throw new SaasErro('Percentual entre 1 e 100');
  if (p.tipo === 'VALOR_FIXO' && !((p.valor ?? 0) > 0)) throw new SaasErro('Informe o valor do desconto');
  if (p.tipo === 'PRECO_FIXO' && !(p.precosFixos && Object.keys(p.precosFixos).length)) throw new SaasErro('Informe o preço fixo por plano');
  const d = await banco();
  const [ja]: any[] = await d.select({ id: saasCupons.id }).from(saasCupons).where(eq(saasCupons.codigo, codigo)).limit(1);
  if (ja) throw new SaasErro(`O código ${codigo} já existe`, 409);
  await d.insert(saasCupons).values({
    codigo, tipo: p.tipo, valor: (p.valor ?? 0).toFixed(2), precosFixosJson: p.precosFixos ? JSON.stringify(p.precosFixos) : null, planoAlvo: p.planoAlvo || null,
    limiteUsos: Math.max(1, Math.round(p.limiteUsos)), usosRealizados: 0, validade: p.validade ? new Date(`${p.validade}T23:59:59-03:00`) : null,
    duracaoCiclos: Math.max(1, Math.round(p.duracaoCiclos ?? 1)), status: 'ativo', descricao: p.descricao ?? null, criadoPor: autorId, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return { ok: true as const, codigo };
}

export async function cancelarCupom(id: number) {
  const d = await banco();
  await d.update(saasCupons).set({ status: 'cancelado', updatedAt: new Date() } as any).where(eq(saasCupons.id, id));
  return { ok: true as const };
}

/** Cupom vale para o plano/ciclo? Devolve o preço do ciclo com o desconto (o uso só conta no pagamento — fase 2) */
export async function validarCupom(codigo: string, planoCodigo: string, ciclo: 'MENSAL' | 'ANUAL') {
  const d = await banco();
  const [c]: any[] = await d.select().from(saasCupons).where(eq(saasCupons.codigo, codigo.trim().toUpperCase())).limit(1);
  const cupom = c ? cupomDaLinha(c) : null;
  const erro = problemaCupom(cupom, planoCodigo);
  if (erro) throw new SaasErro(erro);
  const plano = await planoPorCodigo(planoCodigo);
  const preco = ciclo === 'ANUAL' && plano.precoAnual != null ? plano.precoAnual : plano.precoMensal;
  return { codigo: cupom!.codigo, preco, precoComDesconto: precoComCupom(preco, cupom, planoCodigo), duracaoCiclos: cupom!.duracaoCiclos };
}

// ─── Métricas ─────────────────────────────────────────────────────────────

export async function metricas(agora = Date.now()) {
  const d = await banco();
  const [as, ps, fs, ts]: any[][] = await Promise.all([d.select().from(saasAssinaturas), d.select().from(saasPlanos), d.select().from(saasFaturas), d.select().from(saasTrials)]);
  const P = new Map(ps.map(p => [p.id, p]));
  const comPlano = as.map(a => ({ ...a, plano: P.get(a.planoId) ?? { precoMensal: 0 } }));
  const mes = new Date(agora - 3 * 3600_000).toISOString().slice(0, 7);
  const pagantes = new Set(as.filter(a => a.origem === 'PAGA').map(a => a.usuarioId));
  const trialistas = ts.map(t => t.usuarioId).filter(Boolean);
  const cfg = await lerConfig(agora);
  return {
    licenciamentoAtivo: cfg.licenciamentoAtivo, cortesiaAte: cfg.cortesiaAte,
    mrr: calcularMrr(comPlano),
    ativos: as.filter(a => a.status === 'ATIVA' && a.origem === 'PAGA').length,
    cortesias: as.filter(a => a.status === 'ATIVA' && (a.origem === 'CORTESIA' || a.origem === 'PACOTE_GESTAO')).length,
    trials: as.filter(a => a.status === 'TRIAL' && licencaLiberada(a, agora)).length,
    conversao: trialistas.length ? Math.round((trialistas.filter(id => pagantes.has(id)).length / trialistas.length) * 1000) / 10 : null,
    inadimplentes: as.filter(a => a.status === 'INADIMPLENTE').length,
    bloqueados: as.filter(a => a.status === 'BLOQUEADO').length,
    receitaMes: Math.round(fs.filter(f => { const t = f.pagoEm ? new Date(f.pagoEm).getTime() : NaN; return f.status === 'PAGA' && Number.isFinite(t) && new Date(t - 3 * 3600_000).toISOString().slice(0, 7) === mes; })
      .reduce((s, f) => s + Number(f.valor), 0) * 100) / 100,
  };
}

/** Área do assinante: resumo, planos do público e faturas */
export async function minhaAssinatura(u: any) {
  const licenca = await resumoLicenca(u);
  const planos = (await listarPlanos()).filter(p => p.ativo && !p.unico && p.codigo !== 'EMPREENDEDOR_PACOTE' && p.publico === (perfilDe(u) === 'empreendedor' ? 'EMPREENDEDOR' : 'CORRETOR'));
  const a = await assinaturaDoUsuario(u);
  const d = await banco();
  const faturas: any[] = a ? await d.select().from(saasFaturas).where(eq(saasFaturas.assinaturaId, a.id)).orderBy(desc(saasFaturas.competencia)) : [];
  return {
    licenca, planos, ciclo: a?.ciclo ?? 'MENSAL',
    faturas: faturas.map(f => ({ id: f.id, competencia: f.competencia, valor: Number(f.valor), status: f.status, metodo: f.metodo, pagoEm: f.pagoEm, vencimento: f.vencimento })),
  };
}

// ─── Rotinas (a cada 15 min; só com o licenciamento ligado) ──────────────

const MSG = {
  lembrete: (nome: string, dias: number, tipo: 'teste' | 'cortesia') => `Olá, ${String(nome || '').split(' ')[0]}! ⏰ ${dias === 0 ? `O seu período de ${tipo} no Romatec CRM termina hoje` : `Faltam ${dias} dia(s) para terminar o seu período de ${tipo} no Romatec CRM`}.\nPara continuar usando, assine em ${urlBase()}/assinatura`,
  bloqueio: (nome: string, motivo: string) => `Olá, ${String(nome || '').split(' ')[0]}. ${motivo} O seu acesso ao Romatec CRM foi pausado e as suas reservas ativas e leads passaram para o escritório. Para voltar, assine em ${urlBase()}/assinatura`,
};

/** Bloqueio: leads atribuídos voltam para a distribuição do escritório; reservas ativas são avisadas ao escritório (contratos assinados continuam) */
async function transferirParaEscritorio(usuarioId: number) {
  const d = await banco();
  const leads: any[] = await d.select({ id: leadQualifications.id }).from(leadQualifications).where(eq(leadQualifications.responsavelId, usuarioId));
  if (leads.length) await d.update(leadQualifications).set({ responsavelId: null, updatedAt: new Date() } as any).where(eq(leadQualifications.responsavelId, usuarioId));
  const reservas: any[] = (await d.select({ id: lotes.id, codigo: lotes.codigo, situacao: lotes.situacao }).from(lotes).where(eq(lotes.corretorId, usuarioId)))
    // Interesse, reserva e entrada (antes procurava "sinal", que não existe — as com entrada não chegavam ao aviso)
    .filter((l: any) => ['interesse', 'reservado', 'entrada'].includes(String(l.situacao)));
  return { leads: leads.length, reservas: reservas.map(r => r.codigo as string) };
}

async function avisarEscritorio(texto: string) {
  const d = await banco();
  const equipe: any[] = (await d.select().from(users)).filter((u: any) => u.ativo !== false && u.ativo !== 0 && ['admin', 'secretario'].includes(perfilDe(u) ?? ''));
  for (const u of equipe) await avisar(u.telefone, texto);
}

async function bloquear(a: any, u: any, motivoTexto: string, evento: string) {
  await atualizar(a, { status: 'BLOQUEADO', motivo: motivoTexto });
  const t = await transferirParaEscritorio(a.usuarioId);
  await auditar(a.usuarioId, evento, { assinaturaId: a.id, leadsDevolvidos: t.leads, reservas: t.reservas });
  await avisar(u?.telefone, MSG.bloqueio(u?.name, motivoTexto));
  if (t.leads || t.reservas.length) {
    await avisarEscritorio(`🔒 Acesso pausado: ${u?.name ?? 'usuário'} (${motivoTexto}). ${t.leads} lead(s) voltaram para a distribuição${t.reservas.length ? ` · reservas ativas na Fila de reservas do escritório: ${t.reservas.join(', ')} — ${urlBase()}/reservas` : ''}.`);
  }
}

const horaFortaleza = (agora: number) => new Date(agora - 3 * 3600_000).getUTCHours();

export async function rotinaSaas(agora = Date.now()) {
  const cfg = await lerConfig(agora);
  if (!cfg.licenciamentoAtivo) return { ativo: false as const };
  const d = await banco();
  const as: any[] = await d.select().from(saasAssinaturas);
  if (!as.length) return { ativo: true as const, bloqueados: 0, lembretes: 0 };
  const us: any[] = await d.select().from(users).where(inArray(users.id, Array.from(new Set(as.map(a => a.usuarioId)))));
  const U = new Map(us.map(u => [u.id, u]));
  let bloqueados = 0, lembretes = 0;
  for (const a of as) {
    const u = U.get(a.usuarioId);
    const fimPeriodo = a.periodoFim ? new Date(a.periodoFim).getTime() : null;
    // Expirações
    if (a.status === 'TRIAL' && a.trialFim && new Date(a.trialFim).getTime() <= agora) { await bloquear(a, u, 'Seu período de teste terminou.', 'TRIAL_EXPIRADO'); bloqueados++; continue; }
    if (a.status === 'ATIVA' && a.origem === 'CORTESIA' && fimPeriodo && fimPeriodo <= agora) { await bloquear(a, u, 'O seu período de cortesia terminou.', 'CORTESIA_EXPIRADA'); bloqueados++; continue; }
    // Cancelada pelo assinante: termina no fim do período, sem cobrança de atraso
    if (['ATIVA', 'INADIMPLENTE'].includes(a.status) && a.origem === 'PAGA' && (a.cancelarNoFim === true || a.cancelarNoFim === 1) && fimPeriodo && fimPeriodo <= agora) {
      await atualizar(a, { status: 'CANCELADA', motivo: 'Cancelada pelo assinante' }); continue;
    }
    if (a.status === 'ATIVA' && a.origem === 'PAGA' && fimPeriodo && fimPeriodo <= agora) { await atualizar(a, { status: 'INADIMPLENTE' }); a.status = 'INADIMPLENTE'; }
    if (a.status === 'INADIMPLENTE' && fimPeriodo && fimPeriodo + (Number(a.diasTolerancia) || 0) * DIA <= agora) { await bloquear(a, u, 'Pagamento em atraso.', 'BLOQUEIO_INADIMPLENCIA'); bloqueados++; continue; }
    if (a.status === 'ATIVA' && a.origem === 'PACOTE_GESTAO' && fimPeriodo && fimPeriodo <= agora) {
      await atualizar(a, { status: 'PENDENTE_CONVERSAO' });
      await avisarEscritorio(`📄 O contrato de gestão ${a.contratoGestaoNr ?? ''} de ${u?.name ?? 'empreendedor'} venceu: converta em avulso ou encerre em Admin › SaaS.`);
      continue;
    }
    // Lembretes (09h–20h): fim do teste/cortesia D-3, D-1, D0; pacote ao administrador D-30 e D-7
    if (horaFortaleza(agora) < 9 || horaFortaleza(agora) >= 20) continue;
    const enviados = new Set(json<string[]>(a.lembretesJson) ?? []);
    const marcar = async (k: string) => { enviados.add(k); await atualizar(a, { lembretesJson: JSON.stringify(Array.from(enviados)) }); a.version = (Number(a.version) || 0) + 1; };
    const tipo = a.status === 'TRIAL' ? 'teste' : a.status === 'ATIVA' && a.origem === 'CORTESIA' ? 'cortesia' : null;
    if (tipo) {
      const dias = diasAte(a.status === 'TRIAL' ? a.trialFim : a.periodoFim, agora);
      if (dias != null && (LEMBRETES_DIAS as readonly number[]).includes(dias) && !enviados.has(`${tipo}:${dias}`)) {
        await avisar(u?.telefone, MSG.lembrete(u?.name, dias, tipo as any));
        await marcar(`${tipo}:${dias}`);
        lembretes++;
      }
    } else if (a.status === 'ATIVA' && a.origem === 'PACOTE_GESTAO') {
      const dias = diasAte(a.periodoFim, agora);
      for (const marco of [30, 7]) {
        if (dias === marco && !enviados.has(`pacote:${marco}`)) {
          await avisarEscritorio(`📄 Contrato de gestão ${a.contratoGestaoNr ?? ''} de ${u?.name ?? 'empreendedor'} termina em ${marco} dias.`);
          await marcar(`pacote:${marco}`);
        }
      }
    }
  }
  return { ativo: true as const, bloqueados, lembretes };
}

let rodando = false;
/** Rotina a cada 15 min (expirações, inadimplência, pacote, lembretes) — não faz nada com o licenciamento desligado */
export function iniciarJobsSaas() {
  const tick = async () => {
    if (rodando) return;
    rodando = true;
    try { await rotinaSaas(); } catch (e: any) { console.warn('[SaaS] rotina:', e?.message); } finally { rodando = false; }
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 15 * 60_000).unref?.();
}

export const rotuloStatus = (s: string) => ROTULO_STATUS[s as StatusAssinatura] ?? s;
