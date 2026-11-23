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

/** Ritmo do envio: protege o número do CRM de bloqueio por disparo em massa */
export const INTERVALO_ENVIO_MS = 2 * 60_000;
export const TETO_DIARIO = 80;
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
  const min = Math.ceil((qtd * INTERVALO_ENVIO_MS) / 60_000);
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
    ritmo: { intervaloMin: INTERVALO_ENVIO_MS / 60_000, tetoDiario: TETO_DIARIO, dentroDoHorario: dentroDoHorario() },
  };
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
  texto: async (phone: string, texto: string) => { const z = await import('./zapiClient'); await z.enviarTexto(phone, texto); },
};

/** Um passo do job: manda a próxima retomada se estiver no horário e no ritmo. Devolve o id enviado (ou null) */
export async function processarFilaRetomada(agora = Date.now()): Promise<number | null> {
  if (!dentroDoHorario(agora)) return null;
  const d = await banco();
  // Envio que travou no meio (queda do servidor): volta para a fila
  await d.update(leadRetomadas).set({ status: 'pendente', updatedAt: new Date(agora) } as any)
    .where(and(eq(leadRetomadas.status, 'enviando'), lt(leadRetomadas.updatedAt, new Date(agora - 10 * 60_000)))).catch(() => {});
  const [ultimo]: any[] = await d.select({ em: leadRetomadas.enviadoAt }).from(leadRetomadas).where(eq(leadRetomadas.status, 'enviado')).orderBy(desc(leadRetomadas.enviadoAt)).limit(1);
  if (ultimo?.em && agora - new Date(ultimo.em).getTime() < INTERVALO_ENVIO_MS) return null;
  if ((await enviadosHoje(d, agora)) >= TETO_DIARIO) return null;
  const [item]: any[] = await d.select().from(leadRetomadas).where(eq(leadRetomadas.status, 'pendente')).orderBy(asc(leadRetomadas.id)).limit(1);
  if (!item) return null;
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
    await transporteRetomada.texto(item.phone, item.texto);
    await d.update(leadRetomadas).set({ status: 'enviado', enviadoAt: new Date(agora), erro: null, updatedAt: new Date(agora) } as any).where(eq(leadRetomadas.id, item.id));
    await d.update(leadQualifications).set({ lastActivityAt: new Date(agora), updatedAt: new Date(agora) } as any).where(eq(leadQualifications.id, item.leadId));
    await d.insert(leadEventos).values({ leadId: item.leadId, tipo: 'retomada_enviada', dados: { lote: item.lote }, createdAt: new Date(agora) } as any).catch(() => {});
    await import('./qualificacaoService').then(m => m.registrarMensagem(item.leadId, 'out', 'sistema', item.texto)).catch(() => {});
    // Sem resposta, o robô do empreendimento segue com a régua dele (24 h, 3 dias, 7 dias)
    await import('../autoresposta/motor').then(async m => {
      const ctx = lead.empreendimentoSlug ? await m.contextoDoEmpreendimento(lead.empreendimentoSlug) : null;
      if (ctx?.cfg.ativo) await m.agendarRegua(item.leadId, ctx.emp.id, agora);
    }).catch(() => {});
    return item.id;
  } catch (e: any) {
    const tentativas = Number(item.tentativas ?? 0) + 1;
    await d.update(leadRetomadas).set({ status: tentativas >= MAX_TENTATIVAS ? 'erro' : 'pendente', tentativas, erro: String(e?.message ?? e).slice(0, 250), updatedAt: new Date(agora) } as any).where(eq(leadRetomadas.id, item.id));
    console.warn(`[Importação] retomada para ${item.phone} falhou (${tentativas}/${MAX_TENTATIVAS}):`, e?.message);
    return null;
  }
}

let job: ReturnType<typeof setInterval> | null = null;
export function iniciarJobRetomada(intervaloMs = 30_000) {
  if (job || process.env.NODE_ENV === 'test') return;
  job = setInterval(() => { processarFilaRetomada().catch(e => console.warn('[Importação] fila:', e?.message)); }, intervaloMs);
  job.unref?.();
}
