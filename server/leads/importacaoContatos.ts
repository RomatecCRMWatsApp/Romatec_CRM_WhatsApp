/**
 * Importação de contatos do celular (arquivo .vcf/.csv exportado do celular ou do Google Contatos) para o CRM e
 * retomada pelo número do CRM: cria o lead no empreendimento, põe na fila e o job manda a mensagem de retomada aos
 * poucos (uma a cada ~2 min, só das 8 h às 20 h, teto diário). A resposta do cliente cai no robô do empreendimento,
 * que faz a qualificação (server/autoresposta/qualificacaoRetomada.ts).
 */
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { contacts, leadEventos, leadQualifications, leadRetomadas } from '../../drizzle/schema';
import { chaveTel, montarRetomada, respostasDosSlots, type ContatoMarcado } from '../../shared/importacaoContatos';
import { variantesTelefoneBR } from '../../shared/telefone';
import { dentroDoHorario } from '../../shared/autoresposta';

export class ImportacaoErro extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'ImportacaoErro'; }
}

/**
 * Ritmo do envio: protege o número do CRM de bloqueio por disparo em massa. Entre uma retomada e outra, de 7 a 12 min
 * (varia por contato, para não ter cadência de robô), no máximo 30 por dia, só de segunda a sábado.
 */
export const INTERVALO_ENVIO_MS = 7 * 60_000;
export const VARIACAO_ENVIO_MS = 5 * 60_000;
export const TETO_DIARIO = 30;
/** Espera variável antes deste contato (0 a 5 min a mais, fixa por item) */
export const variacaoDoItem = (id: number) => ((id * 7919) % 300) * 1000;
const domingo = (agora: number) => new Date(agora - 3 * 3_600_000).getUTCDay() === 0;
const MAX_TENTATIVAS = 3;

const banco = async () => { const d = await getDb(); if (!d) throw new ImportacaoErro('Banco indisponível', 503); return d as any; };

export type SituacaoContato = 'novo' | 'ja_no_crm' | 'descadastrado';
export interface LinhaPrevia extends ContatoMarcado {
  situacao: SituacaoContato;
  leadId: number | null;
  empreendimento: string | null;
  etapa: string | null;
  naFila: boolean;
}

/** Leads já existentes para os telefones (uma consulta) */
async function leadsPorTelefone(d: any, telefones: string[]): Promise<Map<string, any>> {
  const formas = Array.from(new Set(telefones.flatMap(t => variantesTelefoneBR(t))));
  const mapa = new Map<string, any>();
  if (!formas.length) return mapa;
  for (let i = 0; i < formas.length; i += 500) {
    const linhas: any[] = await d.select({
      id: leadQualifications.id, phone: leadQualifications.phone, empreendimentoSlug: leadQualifications.empreendimentoSlug,
      etapa: leadQualifications.etapa, stage: leadQualifications.stage, blockedUntil: leadQualifications.blockedUntil,
    }).from(leadQualifications).where(inArray(leadQualifications.phone, formas.slice(i, i + 500)));
    for (const l of linhas) if (!mapa.has(chaveTel(l.phone))) mapa.set(chaveTel(l.phone), l);
  }
  return mapa;
}

const bloqueado = (l: any, agora = Date.now()) => !!l?.blockedUntil && new Date(l.blockedUntil).getTime() > agora;

/**
 * Situação de cada contato marcado (o arquivo é lido no navegador com as regras de shared/importacaoContatos.ts;
 * aqui chegam só os contatos com o marcador). Nada é gravado.
 */
export async function previa(p: { contatos: ContatoMarcado[] }) {
  const contatos = p.contatos;
  const d = await banco();
  const existentes = await leadsPorTelefone(d, contatos.map(c => c.telefone));
  const ids = Array.from(existentes.values()).map(l => l.id);
  const naFila = new Set<number>(ids.length ? (await d.select({ leadId: leadRetomadas.leadId }).from(leadRetomadas).where(inArray(leadRetomadas.leadId, ids))).map((r: any) => r.leadId) : []);
  const linhas: LinhaPrevia[] = contatos.map(c => {
    const l = existentes.get(chaveTel(c.telefone));
    return {
      ...c,
      situacao: !l ? 'novo' : bloqueado(l) ? 'descadastrado' : 'ja_no_crm',
      leadId: l?.id ?? null, empreendimento: l?.empreendimentoSlug ?? null, etapa: l?.etapa ?? null, naFila: !!l && naFila.has(l.id),
    };
  });
  return { linhas };
}

/**
 * Cria os leads (novos) no empreendimento e põe na fila de retomada. Já existentes: entram na fila só se marcado
 * `incluirExistentes` (ganham a etiqueta e o empreendimento se não tinham). Descadastrados nunca.
 */
export async function importar(p: {
  contatos: { nome: string; telefone: string }[]; marcador: string; empreendimentoSlug: string; modelo: string;
  enviar: boolean; incluirExistentes: boolean; userId: number;
}) {
  if (!p.contatos.length) throw new ImportacaoErro('Nenhum contato selecionado');
  if (p.contatos.length > 2000) throw new ImportacaoErro('No máximo 2.000 contatos por importação');
  if (p.enviar && !p.modelo.trim()) throw new ImportacaoErro('Escreva a mensagem de retomada');
  const d = await banco();
  const agora = new Date();
  const lote = `${p.marcador.toUpperCase()}-${agora.toISOString().slice(0, 10)}`;
  const existentes = await leadsPorTelefone(d, p.contatos.map(c => c.telefone));
  const tags = [p.marcador.toUpperCase(), 'retomada'];
  let criados = 0, enfileirados = 0, ignorados = 0;
  const vistos = new Set<string>();

  for (const c of p.contatos) {
    const k = chaveTel(c.telefone);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const nome = String(c.nome || '').trim().slice(0, 120) || 'Cliente';
    let lead = existentes.get(k);
    if (lead && (bloqueado(lead) || !p.incluirExistentes)) { ignorados++; continue; }
    let leadId: number;
    if (lead) {
      leadId = lead.id;
      const [atual]: any[] = await d.select({ tags: leadQualifications.tags, empreendimentoSlug: leadQualifications.empreendimentoSlug }).from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
      const novas = Array.from(new Set([...(Array.isArray(atual?.tags) ? atual.tags : []), ...tags]));
      await d.update(leadQualifications).set({ tags: novas, ...(atual?.empreendimentoSlug ? {} : { empreendimentoSlug: p.empreendimentoSlug }), updatedAt: agora } as any).where(eq(leadQualifications.id, leadId));
    } else {
      const r: any = await d.insert(leadQualifications).values({
        phone: c.telefone, nome, answers: { nome } as any, origem: 'whatsapp', origemCanal: 'importacao_celular', ultimoCanal: 'importacao_celular',
        campanhaOrigem: `Importação ${p.marcador.toUpperCase()}`, empreendimentoSlug: p.empreendimentoSlug, funil: 'comprador',
        stage: 'qual_etapa_1', etapa: 'qualificando', score: 'frio', tags, responsavelId: p.userId, modoQualificacao: 'bot', humano: false,
        lastActivityAt: agora, createdAt: agora, updatedAt: agora,
      } as any);
      leadId = Number(r?.[0]?.insertId ?? r?.lastInsertRowid ?? 0);
      if (!leadId) { ignorados++; continue; }
      criados++;
      await d.insert(contacts).values({ name: nome, phone: c.telefone } as any).catch(() => {}); // base de contatos (telefone único)
      await d.insert(leadEventos).values({ leadId, tipo: 'importado_celular', dados: { lote, nomeOriginal: c.nome }, createdAt: agora } as any).catch(() => {});
    }
    if (p.enviar) {
      const texto = montarRetomada(p.modelo, nome);
      const [ja]: any[] = await d.select({ id: leadRetomadas.id }).from(leadRetomadas).where(eq(leadRetomadas.leadId, leadId)).limit(1);
      if (!ja) {
        await d.insert(leadRetomadas).values({ leadId, phone: c.telefone, lote, texto, status: 'pendente', criadoPor: p.userId, createdAt: agora, updatedAt: agora } as any);
        enfileirados++;
      }
    }
  }
  return { lote, criados, enfileirados, ignorados, previsao: previsaoTermino(enfileirados) };
}

/** Quanto tempo a fila leva no ritmo atual (horas de atendimento) */
export function previsaoTermino(qtd: number): string {
  if (!qtd) return '';
  const min = Math.ceil((qtd * (INTERVALO_ENVIO_MS + VARIACAO_ENVIO_MS / 2)) / 60_000);
  const dias = Math.ceil(qtd / TETO_DIARIO);
  return min < 60 ? `cerca de ${min} min` : dias > 1 ? `cerca de ${dias} dias (até ${TETO_DIARIO} por dia)` : `cerca de ${Math.ceil(min / 60)} h`;
}

/** Situação da fila (por importação) */
export async function situacaoFila() {
  const d = await banco();
  const linhas: any[] = await d.select({ lote: leadRetomadas.lote, status: leadRetomadas.status, n: sql<number>`count(*)` })
    .from(leadRetomadas).groupBy(leadRetomadas.lote, leadRetomadas.status);
  const lotes = new Map<string, Record<string, number>>();
  for (const l of linhas) { const m = lotes.get(l.lote) ?? {}; m[l.status] = Number(l.n); lotes.set(l.lote, m); }
  const ultimos: any[] = await d.select({ id: leadRetomadas.id, leadId: leadRetomadas.leadId, phone: leadRetomadas.phone, status: leadRetomadas.status, erro: leadRetomadas.erro, enviadoAt: leadRetomadas.enviadoAt, nome: leadQualifications.nome, etapa: leadQualifications.etapa, score: leadQualifications.score, slots: leadQualifications.slots, humano: leadQualifications.humano })
    .from(leadRetomadas).leftJoin(leadQualifications, eq(leadQualifications.id, leadRetomadas.leadId)).orderBy(desc(leadRetomadas.id)).limit(300);
  return {
    lotes: Array.from(lotes.entries()).map(([lote, s]) => ({ lote, ...s })),
    contatos: ultimos.map(u => ({ ...u, respostas: respostasDosSlots(u.slots) })),
    ritmo: { intervaloMin: INTERVALO_ENVIO_MS / 60_000, tetoDiario: TETO_DIARIO, dentroDoHorario: dentroDoHorario(), ...(await situacaoDoRitmo(d)) },
  };
}


/** Por que a fila está (ou não) andando agora: texto para a tela */
export function motivoDoRitmo(p: { agora: number; enviadosHoje: number; temPendente: boolean; temPausado?: boolean }): string {
  if (!p.temPendente) return p.temPausado ? 'Pausado por você: clique em Continuar para voltar a enviar.' : 'Fila vazia: todas as retomadas já saíram.';
  if (domingo(p.agora)) return 'Domingo não há envio: recomeça segunda às 8 h.';
  const h = new Date(p.agora - 3 * 3_600_000).getUTCHours();
  const proximo = new Date(p.agora - 3 * 3_600_000).getUTCDay() === 6 ? 'segunda às 8 h' : 'amanhã às 8 h';
  if (h >= 20) return `Fora do horário (8 h às 20 h): recomeça ${proximo}.`;
  if (h < 8) return 'Fora do horário: começa hoje às 8 h.';
  if (p.enviadosHoje >= TETO_DIARIO) return `Limite do dia atingido (${p.enviadosHoje} de ${TETO_DIARIO} enviadas hoje): recomeça ${proximo}.`;
  return `Enviando: ${p.enviadosHoje} de ${TETO_DIARIO} hoje, uma a cada 7 a 12 minutos.`;
}
export const ritmoAtivo = (motivo: string) => motivo.startsWith('Enviando');

async function situacaoDoRitmo(d: any, agora = Date.now()) {
  const hoje = await enviadosHoje(d, agora);
  const [p]: any[] = await d.select({ id: leadRetomadas.id }).from(leadRetomadas).where(eq(leadRetomadas.status, 'pendente')).limit(1);
  const [pz]: any[] = p ? [] : await d.select({ id: leadRetomadas.id }).from(leadRetomadas).where(eq(leadRetomadas.status, 'pausado')).limit(1);
  const motivo = motivoDoRitmo({ agora, enviadosHoje: hoje, temPendente: !!p, temPausado: !!pz });
  return { enviadosHoje: hoje, motivo, ativo: ritmoAtivo(motivo) };
}

/** Pausar (pendente → pausado), continuar (pausado → pendente) ou cancelar (pendente/pausado → cancelado) um lote */
export async function mudarLote(lote: string, acao: 'pausar' | 'continuar' | 'cancelar') {
  const d = await banco();
  const de = acao === 'continuar' ? ['pausado'] : acao === 'pausar' ? ['pendente'] : ['pendente', 'pausado'];
  const para = acao === 'pausar' ? 'pausado' : acao === 'continuar' ? 'pendente' : 'cancelado';
  await d.update(leadRetomadas).set({ status: para, updatedAt: new Date() } as any).where(and(eq(leadRetomadas.lote, lote), inArray(leadRetomadas.status, de)));
  return { ok: true };
}

/** Enviados hoje (dia de Açailândia, UTC−3) */
async function enviadosHoje(d: any, agora: number): Promise<number> {
  const local = new Date(agora - 3 * 3_600_000);
  const inicio = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + 3 * 3_600_000);
  const [r]: any[] = await d.select({ n: sql<number>`count(*)` }).from(leadRetomadas).where(and(eq(leadRetomadas.status, 'enviado'), gte(leadRetomadas.enviadoAt, inicio)));
  return Number(r?.n ?? 0);
}

/** Transporte (injetável nos testes) */
export const transporteRetomada = {
  /**
   * Z-API: manda o texto da retomada. WhatsApp oficial: a retomada é a primeira mensagem (fora da janela de 24 h),
   * então sai no modelo aprovado WHATSAPP_CLOUD_TEMPLATE_RETOMADA com {{1}} = primeiro nome ("tudo bem" se não houver).
   */
  texto: async (phone: string, texto: string, nome?: string | null) => {
    const cloud = await import('./whatsappCloud');
    if (cloud.cloudAtivo()) {
      const { templateRetomada } = cloud.configCloud();
      if (!templateRetomada) throw new Error('WhatsApp oficial sem o modelo da retomada (WHATSAPP_CLOUD_TEMPLATE_RETOMADA)');
      const { primeiroNome } = await import('../../shared/importacaoContatos');
      await cloud.enviarModeloCloud(phone, templateRetomada, [primeiroNome(nome) || 'tudo bem']);
      return;
    }
    const z = await import('./zapiClient');
    await z.enviarTexto(phone, texto, { atraso: { mensagem: 3, digitando: 8 } });
  },
};

/** Um passo do job: manda a próxima retomada se estiver no horário e no ritmo. Devolve o id enviado (ou null) */
export async function processarFilaRetomada(agora = Date.now()): Promise<number | null> {
  if (!dentroDoHorario(agora) || domingo(agora)) return null;
  if (await import('../configSistema').then(m => m.robosPausados()).catch(() => false)) return null;
  const d = await banco();
  // Envio que travou no meio (queda do servidor): volta para a fila
  await d.update(leadRetomadas).set({ status: 'pendente', updatedAt: new Date(agora) } as any)
    .where(and(eq(leadRetomadas.status, 'enviando'), lt(leadRetomadas.updatedAt, new Date(agora - 10 * 60_000)))).catch(() => {});
  const [ultimo]: any[] = await d.select({ em: leadRetomadas.enviadoAt }).from(leadRetomadas).where(eq(leadRetomadas.status, 'enviado')).orderBy(desc(leadRetomadas.enviadoAt)).limit(1);
  if (ultimo?.em && agora - new Date(ultimo.em).getTime() < INTERVALO_ENVIO_MS) return null;
  if ((await enviadosHoje(d, agora)) >= TETO_DIARIO) return null;
  const [item]: any[] = await d.select().from(leadRetomadas).where(eq(leadRetomadas.status, 'pendente')).orderBy(asc(leadRetomadas.id)).limit(1);
  if (!item) return null;
  if (ultimo?.em && agora - new Date(ultimo.em).getTime() < INTERVALO_ENVIO_MS + variacaoDoItem(Number(item.id))) return null;
  const [lead]: any[] = await d.select().from(leadQualifications).where(eq(leadQualifications.id, item.leadId)).limit(1);
  // Saiu, foi descadastrado, já está com o corretor ou já conversou depois da importação: não manda
  if (!lead || bloqueado(lead, agora) || lead.humano === true || lead.humano === 1) {
    await d.update(leadRetomadas).set({ status: 'cancelado', erro: !lead ? 'lead excluído' : bloqueado(lead, agora) ? 'descadastrado' : 'com o corretor', updatedAt: new Date(agora) } as any).where(eq(leadRetomadas.id, item.id));
    return null;
  }
  // Reserva antes do envio (dois servidores não mandam o mesmo)
  const r: any = await d.update(leadRetomadas).set({ status: 'enviando', updatedAt: new Date(agora) } as any).where(and(eq(leadRetomadas.id, item.id), eq(leadRetomadas.status, 'pendente')));
  const afetados = Number(r?.[0]?.affectedRows ?? r?.changes ?? 1);
  if (!afetados) return null;
  try {
    await transporteRetomada.texto(item.phone, item.texto, lead.nome);
    await d.update(leadRetomadas).set({ status: 'enviado', enviadoAt: new Date(agora), erro: null, updatedAt: new Date(agora) } as any).where(eq(leadRetomadas.id, item.id));
    // Sem resposta, ninguém manda mais nada: o robô só conversa (e a régua dele só começa) quando o cliente responder
    await d.update(leadQualifications).set({ lastActivityAt: new Date(agora), updatedAt: new Date(agora) } as any).where(eq(leadQualifications.id, item.leadId));
    await d.insert(leadEventos).values({ leadId: item.leadId, tipo: 'retomada_enviada', dados: { lote: item.lote }, createdAt: new Date(agora) } as any).catch(() => {});
    await import('./qualificacaoService').then(m => m.registrarMensagem(item.leadId, 'out', 'sistema', item.texto)).catch(() => {});
    return item.id;
  } catch (e: any) {
    const tentativas = Number(item.tentativas ?? 0) + 1;
    await d.update(leadRetomadas).set({ status: tentativas >= MAX_TENTATIVAS ? 'erro' : 'pendente', tentativas, erro: String(e?.message ?? e).slice(0, 250), updatedAt: new Date(agora) } as any).where(eq(leadRetomadas.id, item.id));
    console.warn(`[Importação] retomada para ${item.phone} falhou (${tentativas}/${MAX_TENTATIVAS}):`, e?.message);
    return null;
  }
}

/**
 * Importado que nunca respondeu não recebe a régua do robô (escassez 24 h, 3 dias, 7 dias): tira quem entrou nela
 * pela retomada. Quem respondeu segue com a régua (o robô agenda de novo a cada resposta).
 */
export async function pararReguaSemResposta(): Promise<number> {
  const d = await banco();
  const { autoRespostaRegua, leadMensagens } = await import('../../drizzle/schema');
  const naRegua: any[] = await d.select({ leadId: autoRespostaRegua.leadId }).from(autoRespostaRegua)
    .innerJoin(leadQualifications, eq(leadQualifications.id, autoRespostaRegua.leadId))
    .where(eq(leadQualifications.origemCanal, CANAL_IMPORTADO));
  let n = 0;
  for (const { leadId } of naRegua) {
    const [falou]: any[] = await d.select({ id: leadMensagens.id }).from(leadMensagens)
      .where(and(eq(leadMensagens.leadId, leadId), eq(leadMensagens.direcao, 'in'))).limit(1);
    if (!falou) { await d.delete(autoRespostaRegua).where(eq(autoRespostaRegua.leadId, leadId)); n++; }
  }
  if (n) console.log(`[Importação] ${n} importado(s) sem resposta fora da régua do robô`);
  return n;
}

let job: ReturnType<typeof setInterval> | null = null;
export function iniciarJobRetomada(intervaloMs = 30_000) {
  if (job || process.env.NODE_ENV === 'test') return;
  pararReguaSemResposta().catch(e => console.warn('[Importação] régua dos sem resposta:', e?.message));
  job = setInterval(() => { processarFilaRetomada().catch(e => console.warn('[Importação] fila:', e?.message)); }, intervaloMs);
  job.unref?.();
}

// ─── Tela "Leads importados" ──────────────────────────────────────────────────

export type FiltroImportados = 'novos' | 'todos' | 'sem_corretor' | 'na_fila' | 'sem_resposta' | 'responderam' | 'quentes' | 'removidos';
/** Tag de quem a secretária tirou da lista (já comprou, já foi atendido, aguardando retorno fora do robô) */
export const TAG_FORA_DA_LISTA = 'fora_da_lista';
export const CANAL_IMPORTADO = 'importacao_celular';

/**
 * Leads que vieram da importação do celular (não de captação), com o envio da retomada, as respostas da
 * qualificação e o responsável. "sem_corretor" = sem responsável ou só com o escritório (ainda não encaminhado).
 */
export async function leadsImportados(p: { filtro: FiltroImportados; busca?: string }) {
  const d = await banco();
  const { users } = await import('../../drizzle/schema');
  const { idsDoEscritorio } = await import('./distribuicao');
  const linhas: any[] = await d.select({
    id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, etapa: leadQualifications.etapa,
    score: leadQualifications.score, leadScore: leadQualifications.leadScore, humano: leadQualifications.humano, slots: leadQualifications.slots,
    responsavelId: leadQualifications.responsavelId, blockedUntil: leadQualifications.blockedUntil, createdAt: leadQualifications.createdAt,
    atendidoAt: leadQualifications.atendidoAt, etapaKanban: leadQualifications.etapa, motivoPerda: leadQualifications.motivoPerda,
    envio: leadRetomadas.status, enviadoAt: leadRetomadas.enviadoAt, lote: leadRetomadas.lote, tags: leadQualifications.tags,
  }).from(leadQualifications).leftJoin(leadRetomadas, eq(leadRetomadas.leadId, leadQualifications.id))
    .where(eq(leadQualifications.origemCanal, CANAL_IMPORTADO)).orderBy(desc(leadQualifications.createdAt)).limit(3000);
  const escritorio = await idsDoEscritorio(d);
  const nomes = new Map<number, string>(((await d.select({ id: users.id, name: users.name }).from(users)) as any[]).map(u => [Number(u.id), String(u.name || 'Sem nome')]));
  const b = String(p.busca ?? '').trim().toLowerCase();
  const dig = b.replace(/\D/g, '');
  const agora = Date.now();
  const todosItens = linhas.map(l => {
    const respostas = respostasDosSlots(typeof l.slots === 'string' ? safeJson(l.slots) : l.slots);
    const respondeu = Object.keys(respostas).length > 0;
    const resp = l.responsavelId ? Number(l.responsavelId) : null;
    const tags = (typeof l.tags === 'string' ? safeJson(l.tags) : l.tags) as unknown;
    return {
      removido: Array.isArray(tags) && tags.includes(TAG_FORA_DA_LISTA),
      id: Number(l.id), nome: l.nome || 'Sem nome', telefone: String(l.phone), etapa: l.etapa ?? null, score: l.score ?? null, leadScore: l.leadScore ?? null,
      comCorretor: !!resp && !escritorio.has(resp), responsavelId: resp, responsavel: resp ? nomes.get(resp) ?? 'Usuário removido' : null,
      humano: l.humano === true || l.humano === 1, saiu: !!l.blockedUntil && new Date(l.blockedUntil).getTime() > agora,
      envio: l.envio ?? null, enviadoAt: l.enviadoAt ? new Date(l.enviadoAt).toISOString() : null, lote: l.lote ?? null,
      atendido: !!l.atendidoAt, perdido: l.etapa === 'perdido' || l.etapa === 'fechado',
      respostas, respondeu, qualificado: l.etapa === 'qualificado', importadoEm: l.createdAt ? new Date(l.createdAt).toISOString() : null,
    };
  });
  // Novos = para trabalhar: ninguém atendeu ainda, não pediu para sair, não está com corretor, não foi perdido/fechado
  const removidos = todosItens.filter(i => i.removido).length;
  const itens = todosItens.filter(i => (p.filtro === 'removidos') === i.removido);
  const ehNovo = (i: (typeof itens)[number]) => !i.saiu && !i.humano && !i.comCorretor && !i.atendido && !i.perdido;
  const base = p.filtro === 'removidos' ? todosItens.filter(i => !i.removido) : itens;
  const resumo = {
    removidos,
    total: base.length,
    novos: base.filter(ehNovo).length,
    semCorretor: base.filter(i => !i.comCorretor).length,
    naFila: base.filter(i => i.envio === 'pendente' || i.envio === 'enviando' || i.envio === 'pausado').length,
    enviados: base.filter(i => i.envio === 'enviado').length,
    responderam: base.filter(i => i.respondeu).length,
    quentes: base.filter(i => i.score === 'quente').length,
    sairam: base.filter(i => i.saiu).length,
    // Para o contador do topo: conversando com o robô, mensagem enviada e parados sem resposta, ainda sem mensagem
    conversando: base.filter(i => i.respondeu && !i.saiu && !i.qualificado && !i.humano).length,
    qualificados: base.filter(i => i.qualificado).length,
    comCorretor: base.filter(i => (i.humano || i.comCorretor) && !i.saiu).length,
    semResposta: base.filter(i => i.envio === 'enviado' && !i.respondeu && !i.saiu && !i.humano).length,
  };
  const filtrados = itens.filter(i =>
    (p.filtro === 'todos' || p.filtro === 'removidos'
      || (p.filtro === 'novos' && ehNovo(i))
      || (p.filtro === 'sem_corretor' && !i.comCorretor)
      || (p.filtro === 'na_fila' && (i.envio === 'pendente' || i.envio === 'enviando' || i.envio === 'pausado'))
      || (p.filtro === 'sem_resposta' && i.envio === 'enviado' && !i.respondeu && !i.humano)
      || (p.filtro === 'responderam' && i.respondeu)
      || (p.filtro === 'quentes' && i.score === 'quente'))
    && (!b || i.nome.toLowerCase().includes(b) || (dig.length >= 4 && i.telefone.includes(dig))));
  return { resumo, ritmo: await situacaoDoRitmo(d).catch(() => null), itens: filtrados.slice(0, 1000) };
}

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }

// ─── Ações da secretária na tela "Leads importados" ───────────────────────────

/**
 * Tira os leads do robô: não recebe mais retomada nem régua (escassez 24 h, 3 e 7 dias) e, se escrever,
 * o robô não responde (atendimento humano).
 */
async function tirarDoRobo(d: Awaited<ReturnType<typeof banco>>, ids: number[], motivo: string) {
  if (!ids.length) return;
  const { autoRespostaRegua } = await import('../../drizzle/schema');
  await d.update(leadQualifications).set({ humano: true, updatedAt: new Date() } as any).where(inArray(leadQualifications.id, ids));
  await d.delete(autoRespostaRegua).where(inArray(autoRespostaRegua.leadId, ids));
  await d.update(leadRetomadas).set({ status: 'cancelado', erro: motivo, updatedAt: new Date() } as any)
    .where(and(inArray(leadRetomadas.leadId, ids), inArray(leadRetomadas.status, ['pendente', 'pausado'])));
}

const idsValidos = (ids: number[]) => Array.from(new Set(ids.filter(n => Number.isInteger(n) && n > 0))).slice(0, 200);

/** Encaminha ao corretor e o robô sai da conversa (o corretor assume a tratativa) */
export async function passarAoCorretor(p: { leadIds: number[]; paraId: number; por: { id: number; nome: string }; observacao?: string | null }) {
  const ids = idsValidos(p.leadIds);
  const { encaminharManual } = await import('./distribuicao');
  const r = await encaminharManual(ids, p.paraId, p.por, p.observacao);
  const d = await banco();
  await tirarDoRobo(d, ids, 'com o corretor');
  for (const id of ids) await d.insert(leadEventos).values({ leadId: id, tipo: 'robo_desligado', dados: { motivo: 'encaminhado ao corretor', por: p.por.nome } } as any).catch(() => null);
  return r;
}

async function trocarTag(d: Awaited<ReturnType<typeof banco>>, id: number, colocar: boolean) {
  const [l]: any[] = await d.select({ tags: leadQualifications.tags }).from(leadQualifications).where(eq(leadQualifications.id, id)).limit(1);
  if (!l) return false;
  const atual = (typeof l.tags === 'string' ? safeJson(l.tags) : l.tags) as unknown;
  const lista = Array.isArray(atual) ? atual.map(String).filter(t => t !== TAG_FORA_DA_LISTA) : [];
  if (colocar) lista.push(TAG_FORA_DA_LISTA);
  await d.update(leadQualifications).set({ tags: lista, updatedAt: new Date() } as any).where(eq(leadQualifications.id, id));
  return true;
}

/** Tira da lista quem não precisa mais estar aqui (já comprou, já foi atendido…). O lead continua no CRM e o robô para. */
export async function removerDaLista(p: { leadIds: number[]; motivo?: string | null; por: { id: number; nome: string } }) {
  const ids = idsValidos(p.leadIds);
  if (!ids.length) throw new ImportacaoErro('Escolha pelo menos um lead');
  const d = await banco();
  let removidos = 0;
  for (const id of ids) {
    if (!(await trocarTag(d, id, true))) continue;
    removidos++;
    await d.insert(leadEventos).values({ leadId: id, tipo: 'importado_removido', dados: { motivo: p.motivo ?? null, por: p.por.nome } } as any).catch(() => null);
  }
  await tirarDoRobo(d, ids, 'tirado da lista');
  return { removidos };
}

/** Desfaz a remoção: volta para a lista (o robô continua desligado; quem decide é a secretária) */
export async function voltarParaLista(p: { leadIds: number[] }) {
  const ids = idsValidos(p.leadIds);
  const d = await banco();
  let voltaram = 0;
  for (const id of ids) if (await trocarTag(d, id, false)) voltaram++;
  return { voltaram };
}
