/**
 * Motor de Cadastro de Imóveis (property_intake_engine) + Agente de Cadastro de Imóveis Romatec (property_intake_agent).
 *
 * Mesmo WhatsApp dos leads: o webhook (server/_core/index.ts) chama tratarMensagemAgente() ANTES do fluxo de leads.
 * - Quem fala: número de origem → vínculo verificado (VINCULAR + código gerado no CRM logado) → usuário ativo, perfil
 *   admin/secretária/corretor (empreendedor nunca) e autorização do canal válida, presa à versão de sessão (sair de todos
 *   os aparelhos, trocar a senha ou sair do CRM derrubam a autorização; o rascunho fica).
 * - O que faz: menu de funções → rascunho privado → checklist → texto/áudio (transcrito) → extração estruturada pela IA
 *   (só o que foi dito; conflito e dúvida viram pergunta) → fotos (baixadas, conferidas, sem metadados, no armazenamento)
 *   → CONCLUIR → revisão versionada (hash) → confirmação da versão apresentada → serviço real de imóveis (criarImovel),
 *   imóvel interno (status inactive, nada é publicado nem disparado) → código e link reais.
 * A IA só propõe dados e textos; autorização, validação, estado, gravação e idempotência são do servidor.
 */
import { createHash, randomInt } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { imovelAgenteEventos, imovelRascunhoMidias, imovelRascunhos, users, whatsappVinculos } from '../../drizzle/schema';
import { perfilDe } from '../../shared/equipe';
import {
  CAMPOS, DADOS_VAZIOS, INSTRUCOES_AGENTE, MENU_FUNCOES, ROTULO_TIPO, checklist, codigoVinculo, comandoDe, conteudoRevisao, ehTerreno, formatarCampo,
  normalizarValor, orientacaoFotos, pedeAgenteImovel, pendencias, podeUsarAgenteImovel, resumoTexto, type DadosImovel,
} from '../../shared/cadastroImovelAgente';

export class AgenteErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'AgenteErro'; } }

const MIN = 60_000, DIA = 86_400_000;
export const VALIDADE_AUTORIZACAO_DIAS = 30;
const CODIGO_MIN = 10;
const MODO_EXPIRA_MS = 2 * 3600_000;
const MAX_FOTO_BYTES = 16 * 1024 * 1024;
const ABERTOS = ['collecting', 'processing', 'awaiting_information', 'awaiting_review', 'failed'];

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new AgenteErro('Banco indisponível', 503);
  return d;
}
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const json = <T,>(s: unknown, padrao: T): T => { try { return s ? JSON.parse(String(s)) as T : padrao; } catch { return padrao; } };
const agoraData = (o?: { agora?: number }) => new Date(o?.agora ?? Date.now());

async function auditar(usuarioId: number | null, rascunhoId: number | null, tipo: string, detalhe?: string | null) {
  try { const d = await banco(); await d.insert(imovelAgenteEventos).values({ usuarioId, rascunhoId, tipo, detalhe: detalhe?.slice(0, 500) ?? null, criadoEm: new Date() } as any); } catch { /* auditoria não derruba o fluxo */ }
}

// ─── Envio (trocável nos testes) ─────────────────────────────────────────────
export type Enviar = (telefone: string, texto: string) => Promise<void>;
let enviarPadrao: Enviar = async (tel, texto) => { const { enviarTexto } = await import('../leads/zapiClient'); await enviarTexto(tel, texto); };
export const definirEnvioAgente = (f: Enviar | null) => { enviarPadrao = f ?? (async (tel, texto) => { const { enviarTexto } = await import('../leads/zapiClient'); await enviarTexto(tel, texto); }); };
const enviar = (tel: string, texto: string) => enviarPadrao(tel, texto).catch(e => console.warn('[AgenteImóvel] WhatsApp não enviou:', e?.message));

const linkCrm = (caminho: string) => import('../leads/config').then(m => `${m.appUrl()}${caminho}`);

// ─── Vínculo do WhatsApp e autorização do canal ──────────────────────────────

async function usuario(d: any, id: number) {
  const [u]: any[] = await d.select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

export function autorizacaoValida(v: any, u: any, agora = Date.now()): { ok: true } | { ok: false; motivo: string } {
  if (!u || u.ativo === false || u.ativo === 0) return { ok: false, motivo: 'usuário inativo' };
  if (!podeUsarAgenteImovel(perfilDe(u))) return { ok: false, motivo: 'perfil sem acesso ao cadastro de imóveis' };
  if (!v?.verificadoEm || !v.telefoneChave) return { ok: false, motivo: 'WhatsApp não vinculado' };
  if (v.revogadoEm) return { ok: false, motivo: 'autorização revogada' };
  if (!v.autorizadoAte || new Date(v.autorizadoAte).getTime() <= agora) return { ok: false, motivo: 'autorização vencida' };
  if ((Number(v.sessaoVersao) || 0) !== (Number(u.sessaoVersao) || 0)) return { ok: false, motivo: 'sessão encerrada no CRM' };
  return { ok: true };
}

/** CRM logado: gera o código de uso único (10 min) que o usuário manda do próprio WhatsApp: VINCULAR 123456 */
export async function gerarCodigoVinculo(usuarioId: number, o: { agora?: number } = {}) {
  const d = await banco();
  const u = await usuario(d, usuarioId);
  if (!u || !podeUsarAgenteImovel(perfilDe(u))) throw new AgenteErro('Seu perfil não usa o cadastro de imóveis pelo WhatsApp', 403);
  const { chaveTelefone } = await import('../leads/numerosDaEquipe');
  if (!chaveTelefone(u.telefone)) throw new AgenteErro('Cadastre o seu WhatsApp em Meu cadastro antes de vincular');
  const codigo = String(randomInt(100000, 1000000));
  const expira = new Date((o.agora ?? Date.now()) + CODIGO_MIN * MIN);
  const [v]: any[] = await d.select().from(whatsappVinculos).where(eq(whatsappVinculos.usuarioId, usuarioId)).limit(1);
  const campos = { codigoHash: sha(`vinculo:${codigo}`), codigoExpira: expira, tentativas: 0, atualizadoEm: agoraData(o) };
  if (v) await d.update(whatsappVinculos).set(campos as any).where(eq(whatsappVinculos.id, v.id));
  else await d.insert(whatsappVinculos).values({ usuarioId, ...campos } as any);
  await auditar(usuarioId, null, 'codigo_vinculo');
  const { numeroWhatsAppLeads } = await import('../leads/config');
  return { codigo, expira: expira.toISOString(), numero: numeroWhatsAppLeads(), mensagem: `VINCULAR ${codigo}` };
}

const tentativasPorNumero = new Map<string, { n: number; desde: number }>();

/** WhatsApp: "VINCULAR 123456" do número do cadastro → vínculo verificado e autorização do canal */
async function verificarCodigo(origem: string, codigo: string, o: { agora?: number } = {}): Promise<string> {
  const agora = o.agora ?? Date.now();
  const { chaveTelefone } = await import('../leads/numerosDaEquipe');
  const chave = chaveTelefone(origem);
  const t = tentativasPorNumero.get(chave);
  if (t && agora - t.desde < CODIGO_MIN * MIN && t.n >= 5) return 'Muitas tentativas. Gere um código novo no CRM daqui a alguns minutos.';
  tentativasPorNumero.set(chave, !t || agora - t.desde >= CODIGO_MIN * MIN ? { n: 1, desde: agora } : { n: t.n + 1, desde: t.desde });
  const d = await banco();
  const [v]: any[] = await d.select().from(whatsappVinculos).where(eq(whatsappVinculos.codigoHash, sha(`vinculo:${codigo}`))).limit(1);
  if (!v || !v.codigoExpira || new Date(v.codigoExpira).getTime() < agora) {
    // Código repetido/antigo vindo de um número que já está vinculado e autorizado: não assusta com "inválido"
    const [ja]: any[] = await d.select().from(whatsappVinculos).where(eq(whatsappVinculos.telefoneChave, chave)).limit(1);
    if (ja && autorizacaoValida(ja, await usuario(d, ja.usuarioId), agora).ok) {
      tentativasPorNumero.delete(chave);
      return `✅ Este WhatsApp já está vinculado e autorizado. Não precisa de código.\n\n${MENU_FUNCOES}`;
    }
    return 'Código inválido ou vencido. Gere um novo no CRM em Imóveis › Cadastro pelo WhatsApp (só vale o último código gerado, por 10 minutos).';
  }
  const u = await usuario(d, v.usuarioId);
  if (!u || u.ativo === false || u.ativo === 0 || !podeUsarAgenteImovel(perfilDe(u))) return 'Este acesso não usa o cadastro de imóveis pelo WhatsApp.';
  // O número que mandou o código tem que ser o do cadastro (não basta conhecer o código)
  if (chaveTelefone(u.telefone) !== chave) {
    await auditar(u.id, null, 'vinculo_recusado', 'número diferente do cadastro');
    return 'Este número não é o WhatsApp do seu cadastro. Atualize em Meu cadastro ou mande o código do número cadastrado.';
  }
  const [outro]: any[] = await d.select({ id: whatsappVinculos.id }).from(whatsappVinculos).where(and(eq(whatsappVinculos.telefoneChave, chave), ne(whatsappVinculos.id, v.id))).limit(1);
  if (outro) await d.update(whatsappVinculos).set({ telefoneChave: null, verificadoEm: null, autorizadoAte: null, revogadoEm: new Date(agora) } as any).where(eq(whatsappVinculos.id, outro.id));
  await d.update(whatsappVinculos).set({
    telefoneChave: chave, verificadoEm: new Date(agora), autorizadoAte: new Date(agora + VALIDADE_AUTORIZACAO_DIAS * DIA), sessaoVersao: Number(u.sessaoVersao) || 0,
    revogadoEm: null, codigoHash: null, codigoExpira: null, tentativas: 0, modo: null, atualizadoEm: new Date(agora),
  } as any).where(eq(whatsappVinculos.id, v.id));
  tentativasPorNumero.delete(chave);
  await auditar(u.id, null, 'vinculo_verificado', chave.slice(-4));
  return `✅ WhatsApp vinculado, ${String(u.name || '').split(' ')[0]}! Autorização válida por ${VALIDADE_AUTORIZACAO_DIAS} dias.\n\n${MENU_FUNCOES}`;
}

/** CRM logado: renova a autorização do canal (vínculo já verificado não precisa de código novo) */
export async function autorizarCanal(usuarioId: number, o: { agora?: number } = {}) {
  const d = await banco();
  const u = await usuario(d, usuarioId);
  const [v]: any[] = await d.select().from(whatsappVinculos).where(eq(whatsappVinculos.usuarioId, usuarioId)).limit(1);
  if (!v?.verificadoEm || !v.telefoneChave) throw new AgenteErro('Vincule o seu WhatsApp primeiro');
  if (!u || !podeUsarAgenteImovel(perfilDe(u))) throw new AgenteErro('Seu perfil não usa o cadastro de imóveis pelo WhatsApp', 403);
  const agora = o.agora ?? Date.now();
  await d.update(whatsappVinculos).set({ autorizadoAte: new Date(agora + VALIDADE_AUTORIZACAO_DIAS * DIA), sessaoVersao: Number(u.sessaoVersao) || 0, revogadoEm: null, atualizadoEm: new Date(agora) } as any)
    .where(eq(whatsappVinculos.id, v.id));
  await auditar(usuarioId, null, 'autorizacao_renovada');
  return { ok: true as const };
}

/** Sai do CRM / revogação: o canal para de valer (o vínculo e os rascunhos continuam) */
export async function revogarCanal(usuarioId: number, motivo = 'revogado') {
  const d: any = await getDb();
  if (!d) return;
  await d.update(whatsappVinculos).set({ autorizadoAte: null, revogadoEm: new Date(), modo: null } as any).where(eq(whatsappVinculos.usuarioId, usuarioId));
  await auditar(usuarioId, null, 'autorizacao_revogada', motivo);
}

export async function statusVinculo(usuarioId: number) {
  const d = await banco();
  const u = await usuario(d, usuarioId);
  const [v]: any[] = await d.select().from(whatsappVinculos).where(eq(whatsappVinculos.usuarioId, usuarioId)).limit(1);
  const a = autorizacaoValida(v, u);
  const { numeroWhatsAppLeads } = await import('../leads/config');
  return {
    permitido: !!u && podeUsarAgenteImovel(perfilDe(u)), vinculado: !!v?.verificadoEm && !!v?.telefoneChave, telefoneFinal: v?.telefoneChave ? String(v.telefoneChave).slice(-4) : null,
    autorizado: a.ok, motivo: a.ok ? null : a.motivo, autorizadoAte: v?.autorizadoAte ? new Date(v.autorizadoAte).toISOString() : null,
    numeroCentral: numeroWhatsAppLeads(), iaDisponivel: iaDisponivel(), transcricaoDisponivel: !!(process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENAI_API_KEY),
  };
}

export const iaDisponivel = () => !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY);

// ─── Rascunhos ───────────────────────────────────────────────────────────────

export interface MensagemRascunho { id: string; tipo: 'texto' | 'audio'; texto: string; em: string }

async function rascunho(d: any, id: number) {
  const [r]: any[] = await d.select().from(imovelRascunhos).where(eq(imovelRascunhos.id, id)).limit(1);
  return r ?? null;
}
async function fotos(d: any, rascunhoId: number, todas = false) {
  const rows: any[] = await d.select().from(imovelRascunhoMidias).where(eq(imovelRascunhoMidias.rascunhoId, rascunhoId)).orderBy(imovelRascunhoMidias.ordem, imovelRascunhoMidias.id);
  return todas ? rows : rows.filter(f => !f.removida && f.status === 'ok');
}
const dadosDe = (r: any): DadosImovel => ({ ...DADOS_VAZIOS, ...json<Partial<DadosImovel>>(r?.dadosJson, {}), ...json<Partial<DadosImovel>>(r?.manualJson, {}) });

async function novoRascunho(d: any, autorId: number, vinculoId: number | null, agora = new Date()) {
  const r = await d.insert(imovelRascunhos).values({ autorId, responsavelId: autorId, vinculoId, estado: 'collecting', versao: 1, mensagensJson: '[]', criadoEm: agora, atualizadoEm: agora } as any);
  const id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid);
  await auditar(autorId, id, 'rascunho_criado');
  return id;
}

/** Mudança de dados/fotos depois da revisão: a aprovação/revisão anterior deixa de valer */
async function invalidarRevisao(d: any, r: any, motivo: string) {
  if (r.estado !== 'awaiting_review' && !r.revisaoHash) return;
  await d.update(imovelRascunhos).set({ estado: 'awaiting_information', revisaoHash: null, versao: Number(r.versao) + 1, atualizadoEm: new Date() } as any).where(eq(imovelRascunhos.id, r.id));
  await auditar(r.autorId, r.id, 'revisao_invalidada', motivo);
}

// ─── IA: extração estruturada e textos da apresentação ───────────────────────

const CAMPOS_IA = CAMPOS.map(c => c.campo);
export const SCHEMA_EXTRACAO = {
  type: 'object', additionalProperties: false, required: ['campos', 'conflitos', 'duvidas'],
  properties: {
    campos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['campo', 'valor', 'fonte', 'trecho'], properties: {
      campo: { type: 'string', enum: CAMPOS_IA }, valor: { type: 'string' }, fonte: { type: 'string', description: 'id da mensagem de onde saiu (ex.: m3)' },
      trecho: { type: 'string', description: 'trecho curto da mensagem que sustenta o dado' } } } },
    conflitos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['campo', 'valores'], properties: {
      campo: { type: 'string', enum: CAMPOS_IA }, valores: { type: 'array', items: { type: 'string' } } } } },
    duvidas: { type: 'array', items: { type: 'string' }, description: 'perguntas curtas sobre o que ficou ambíguo ou inaudível' },
  },
};
export const SCHEMA_TEXTOS = {
  type: 'object', additionalProperties: false, required: ['titulo', 'descricao'],
  properties: { titulo: { type: 'string', description: 'até 80 caracteres' }, descricao: { type: 'string', description: 'até 900 caracteres, fiel aos dados' } },
};

export type ChamadaIaAgente = (o: { sistema: string; pedido: string; schema: any; nome: string }) => Promise<any>;
const iaPadrao: ChamadaIaAgente = async ({ sistema, pedido, schema, nome }) => {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ maxRetries: 1, timeout: 60_000 });
      const resp: any = await client.beta.messages.create({
        model: process.env.ANTHROPIC_MODEL_CADASTRO_IMOVEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 4096, system: sistema,
        messages: [{ role: 'user', content: pedido }], output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      } as any);
      const bloco = resp.content?.find((b: any) => b.type === 'text');
      if (resp.stop_reason !== 'refusal' && bloco?.text) return JSON.parse(bloco.text);
    } catch (e: any) {
      console.warn('[AgenteImóvel] Claude falhou:', e?.message);
      if (!process.env.OPENAI_API_KEY && !process.env.BUILT_IN_FORGE_API_KEY) throw e;
    }
  }
  const { invokeLLM } = await import('../_core/llm');
  const r = await invokeLLM({ messages: [{ role: 'system', content: sistema }, { role: 'user', content: pedido }] as any,
    response_format: { type: 'json_schema', json_schema: { name: nome, schema, strict: true } } });
  const c = r.choices?.[0]?.message?.content;
  return JSON.parse(typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => p.text || '').join('') : '{}');
};
let ia: ChamadaIaAgente = iaPadrao;
export const definirIaAgente = (f: ChamadaIaAgente | null) => { ia = f ?? iaPadrao; };

export type Transcrever = (audioUrl: string) => Promise<string | null>;
let transcrever: Transcrever = async (audioUrl) => {
  const { transcribeAudio } = await import('../_core/voiceTranscription');
  const r: any = await transcribeAudio({ audioUrl, language: 'pt', prompt: 'Corretor descrevendo um imóvel para cadastro: tipo, endereço, preço, área, quartos' });
  if (r && 'text' in r) return String(r.text || '').trim() || null;
  const det = String(r?.details || '');
  console.error('[agente-imovel] transcrição falhou:', r?.code, r?.error, det.slice(0, 300));
  if (/\b429\b/.test(det) && /insufficient_quota|quota|billing|credit/i.test(det)) throw new Error('sem_creditos');
  if (/\b429\b/.test(det)) throw new Error('limite');
  if (/\b401\b/.test(det) || r?.details === 'OPENAI_API_KEY is not set') throw new Error('chave');
  return null;
};

/** Resposta ao corretor quando o áudio não vira texto (o motivo técnico fica no log) */
export function avisoFalhaAudio(motivo: string | null): string {
  if (motivo === 'sem_creditos') return '🎙️ A transcrição de áudio está sem créditos no momento (OpenAI). Pode mandar as informações *por texto*? O administrador já foi avisado no log.';
  if (motivo === 'limite') return '🎙️ A transcrição de áudio está sobrecarregada agora. Tente o áudio de novo em 1 minuto ou mande *por texto*.';
  if (motivo === 'chave') return '🎙️ A transcrição de áudio não está configurada (chave da OpenAI). Mande as informações *por texto*.';
  return '🎙️ Não consegui entender o áudio. Pode mandar de novo ou escrever?';
}
export const definirTranscricaoAgente = (f: Transcrever) => { transcrever = f; };

/** Extrai os dados de TODAS as mensagens do rascunho (correções explícitas valem; conflito vira pergunta) */
async function extrair(d: any, r: any) {
  const msgs = json<MensagemRascunho[]>(r.mensagensJson, []);
  if (!msgs.length) return;
  const pedido = `<mensagens_do_corretor>\n${msgs.map(m => `[${m.id}] (${m.tipo === 'audio' ? 'áudio transcrito' : 'texto'}) ${m.texto.slice(0, 4000)}`).join('\n')}\n</mensagens_do_corretor>\n\nExtraia os dados do imóvel no formato pedido. Campos possíveis: ${CAMPOS_IA.join(', ')}.`;
  const out = await ia({ sistema: INSTRUCOES_AGENTE, pedido, schema: SCHEMA_EXTRACAO, nome: 'extracao_imovel' });
  const dados: any = { ...DADOS_VAZIOS }, fontes: Record<string, { msg: string; trecho: string }> = {};
  for (const c of Array.isArray(out?.campos) ? out.campos : []) {
    if (!CAMPOS_IA.includes(c?.campo)) continue;
    const v = normalizarValor(c.campo, c.valor);
    if (v == null) continue;
    dados[c.campo] = v;
    if (/^m\d+$/.test(String(c.fonte)) && msgs.some(m => m.id === c.fonte)) fontes[c.campo] = { msg: String(c.fonte), trecho: String(c.trecho || '').slice(0, 200) };
  }
  const conflitos = (Array.isArray(out?.conflitos) ? out.conflitos : []).filter((c: any) => CAMPOS_IA.includes(c?.campo) && Array.isArray(c.valores) && c.valores.length > 1)
    .map((c: any) => ({ campo: c.campo, valores: c.valores.map((x: any) => String(x).slice(0, 80)).slice(0, 4) }));
  // Campo em conflito não fica com valor "escolhido" pela IA
  for (const c of conflitos) dados[c.campo] = null;
  const duvidas = (Array.isArray(out?.duvidas) ? out.duvidas : []).map((x: any) => String(x).slice(0, 200)).slice(0, 4);
  await d.update(imovelRascunhos).set({ dadosJson: JSON.stringify(dados), fontesJson: JSON.stringify(fontes), conflitosJson: JSON.stringify(conflitos), duvidasJson: JSON.stringify(duvidas), atualizadoEm: new Date() } as any)
    .where(eq(imovelRascunhos.id, r.id));
}

/** Título e descrição comercial fiéis (sem proprietário e, se não pode divulgar, sem endereço) */
async function gerarTextos(dados: DadosImovel) {
  const publico: any = { ...dados, proprietario: null, ...(dados.divulgarEndereco ? {} : { endereco: null }) };
  const pedido = `<dados_do_imovel>\n${resumoTexto(publico)}\n</dados_do_imovel>\n\nEscreva um título curto e uma descrição comercial em português, usando SOMENTE esses dados. Não acrescente infraestrutura, medidas, documentação ou condições que não estejam aí.`;
  const out = await ia({ sistema: 'Você redige anúncios imobiliários fiéis aos dados recebidos, sem exageros e sem inventar nada.', pedido, schema: SCHEMA_TEXTOS, nome: 'textos_imovel' });
  return { titulo: String(out?.titulo || '').slice(0, 160) || null, descricao: String(out?.descricao || '').slice(0, 4000) || null };
}

// ─── Conversa ────────────────────────────────────────────────────────────────

const filas = new Map<number, Promise<unknown>>();
/** Mensagens do mesmo usuário em ordem (nada de duas mudanças no rascunho ao mesmo tempo) */
function naFila(vinculoId: number, f: () => Promise<void>): Promise<void> {
  const anterior = filas.get(vinculoId) ?? Promise.resolve();
  const p = anterior.then(f, f).catch(e => console.warn('[AgenteImóvel] erro:', e?.message ?? e));
  filas.set(vinculoId, p);
  p.finally(() => { if (filas.get(vinculoId) === p) filas.delete(vinculoId); });
  return p as Promise<void>;
}
/** Testes: espera a fila do vínculo terminar */
export const aguardarFila = async () => { while (filas.size) await Promise.all(Array.from(filas.values())); };

export interface EntradaAgente { phone: string; texto: string; messageId?: string | null; audioUrl?: string | null; imageUrl?: string | null; legenda?: string | null }

/**
 * Webhook: devolve true quando a mensagem é do agente (o fluxo de leads e a ZAYRA não processam).
 * `ceo`: o WhatsApp do CEO também conversa com a ZAYRA — lá o agente só entra com pedido explícito ou fluxo em andamento.
 */
export async function tratarMensagemAgente(e: EntradaAgente, o: { ceo?: boolean; agora?: number } = {}): Promise<boolean> {
  const d: any = await getDb();
  if (!d) return false;
  // Retenção curta das fotos avulsas (sem destino): no máximo uma limpeza por hora, aproveitando o tráfego
  if (Date.now() - ultimaLimpeza > 3600_000) { ultimaLimpeza = Date.now(); void limparAvulsas().catch(() => {}); }
  const texto = String(e.texto || '').trim();
  const codigo = codigoVinculo(texto);
  if (codigo) { await enviar(e.phone, await verificarCodigo(e.phone, codigo, o)); return true; }
  const { chaveTelefone } = await import('../leads/numerosDaEquipe');
  const chave = chaveTelefone(e.phone);
  if (!chave) return false;
  const [v]: any[] = await d.select().from(whatsappVinculos).where(eq(whatsappVinculos.telefoneChave, chave)).limit(1);
  const agora = o.agora ?? Date.now();
  const emFluxo = !!v?.modo && !!v.modoEm && agora - new Date(v.modoEm).getTime() < MODO_EXPIRA_MS;
  if (!v?.verificadoEm) {
    // Usuário do CRM pedindo a função sem vínculo: orienta (cliente comum segue no fluxo de leads)
    if (pedeAgenteImovel(texto)) {
      const eh = (await d.select({ telefone: users.telefone, perfil: (users as any).perfil, role: users.role, ativo: users.ativo }).from(users))
        .some((x: any) => chaveTelefone(x.telefone) === chave && x.ativo !== false && x.ativo !== 0 && podeUsarAgenteImovel(perfilDe(x)));
      if (eh) { await enviar(e.phone, `Para cadastrar imóveis por aqui, vincule o seu WhatsApp no CRM: ${await linkCrm('/imoveis/whatsapp')} (toque em "Vincular meu WhatsApp" e mande o código que aparecer).`); return true; }
    }
    return false;
  }
  if (o.ceo && !emFluxo && !pedeAgenteImovel(texto)) return false;
  const u = await usuario(d, v.usuarioId);
  const a = autorizacaoValida(v, u, agora);
  if (!a.ok) {
    if (perfilDe(u) === 'empreendedor') return false;
    if (emFluxo || pedeAgenteImovel(texto)) {
      await enviar(e.phone, `🔒 Seu acesso ao cadastro pelo WhatsApp precisa ser renovado (${a.motivo}). Entre no CRM e toque em "Autorizar este WhatsApp": ${await linkCrm('/imoveis/whatsapp')}\nSeu rascunho continua salvo.`);
      await auditar(v.usuarioId, v.rascunhoAtivoId ?? null, 'acesso_negado', a.motivo);
      return true;
    }
    return false;
  }
  void naFila(v.id, () => processar(d, v.id, u, e, agora));
  return true;
}

let ultimaLimpeza = 0;
const ackFotos = new Map<number, ReturnType<typeof setTimeout>>();

async function processar(d: any, vinculoId: number, u: any, e: EntradaAgente, agora: number) {
  const [v]: any[] = await d.select().from(whatsappVinculos).where(eq(whatsappVinculos.id, vinculoId)).limit(1);
  if (!v) return;
  const tel = e.phone;
  const emFluxo = !!v.modo && !!v.modoEm && agora - new Date(v.modoEm).getTime() < MODO_EXPIRA_MS;
  const modo = emFluxo ? v.modo : null;
  const setModo = (m: string | null, extra: Record<string, unknown> = {}) =>
    d.update(whatsappVinculos).set({ modo: m, modoEm: m ? new Date(agora) : null, ...extra, atualizadoEm: new Date(agora) } as any).where(eq(whatsappVinculos.id, vinculoId));
  let r = v.rascunhoAtivoId ? await rascunho(d, v.rascunhoAtivoId) : null;
  if (r && !ABERTOS.includes(r.estado)) r = null;

  // ── Foto ──
  if (e.imageUrl) {
    const destino = modo === 'cadastro' && r ? r.id : null;
    const midia = await receberFoto(d, vinculoId, destino, e);
    if (!midia) return;
    if (!destino) {
      await setModo('escolhendo');
      await enviar(tel, `📷 Recebi a foto. Antes de usar, me diga a função:\n\n${MENU_FUNCOES}`);
      return;
    }
    await setModo('cadastro');
    if (r.estado === 'awaiting_review') await invalidarRevisao(d, r, 'foto nova');
    // Uma resposta só por lote de fotos
    clearTimeout(ackFotos.get(vinculoId));
    ackFotos.set(vinculoId, setTimeout(async () => {
      ackFotos.delete(vinculoId);
      const total = (await fotos(d, r.id)).length;
      const atual = await rascunho(d, r.id);
      await enviar(tel, `📸 ${total} foto(s) neste imóvel${atual?.revisaoHash == null && r.estado === 'awaiting_review' ? ' (a revisão anterior foi descartada)' : ''}. Mande mais ou responda *CONCLUIR* quando terminar.`);
    }, process.env.NODE_ENV === 'test' ? 0 : 6000));
    return;
  }

  // ── Texto ou áudio ──
  let texto = String(e.texto || '').trim();
  let tipo: 'texto' | 'audio' = 'texto';
  if (!texto && e.audioUrl) {
    tipo = 'audio';
    let motivo: string | null = null;
    texto = (await transcrever(e.audioUrl).catch((err: any) => { motivo = String(err?.message || '') || null; return null; })) || '';
    if (!texto) { await enviar(tel, avisoFalhaAudio(motivo)); return; }
  }
  if (!texto) return;

  // Pergunta em aberto: fotos recebidas antes de escolher a função
  if (v.pergunta === 'fotos_avulsas' && r) {
    const c = comandoDe(texto, 'sim_nao');
    if (c === 'sim' || c === 'nao') {
      if (c === 'sim') await d.update(imovelRascunhoMidias).set({ rascunhoId: r.id } as any).where(and(eq(imovelRascunhoMidias.vinculoId, vinculoId), isNull(imovelRascunhoMidias.rascunhoId)));
      else await d.update(imovelRascunhoMidias).set({ removida: true } as any).where(and(eq(imovelRascunhoMidias.vinculoId, vinculoId), isNull(imovelRascunhoMidias.rascunhoId)));
      await d.update(whatsappVinculos).set({ pergunta: null } as any).where(eq(whatsappVinculos.id, vinculoId));
      await enviar(tel, c === 'sim' ? '✅ Fotos anexadas a este cadastro. Pode mandar as informações.' : 'Ok, não vou usar essas fotos. Pode mandar as informações.');
      return;
    }
  }

  const contexto = modo === 'escolhendo' || !modo ? 'menu' : r?.estado === 'awaiting_review' ? 'revisao' : 'coleta';
  const cmd = comandoDe(texto, contexto);

  if (cmd === 'menu') { await setModo('escolhendo'); await enviar(tel, MENU_FUNCOES); return; }
  if (cmd === 'outras') {
    await setModo(null);
    await enviar(tel, `Outras funções pelo CRM:\n• Leads recebidos: ${await linkCrm('/leads/recebidos')}\n• Caixa de entrada: ${await linkCrm('/caixa-entrada')}\n• Materiais: ${await linkCrm('/materiais')}\n\nPara cadastrar imóvel, responda *MENU*.`);
    return;
  }
  if (cmd === 'cadastrar' || cmd === 'novo') {
    // "1" e depois "cadastrar imóvel" (ou repetido) não abre outro rascunho vazio: reaproveita o atual ainda sem nada
    const vazio = r && r.estado === 'collecting' && json<MensagemRascunho[]>(r.mensagensJson, []).length === 0
      && !(await d.select({ id: imovelRascunhoMidias.id }).from(imovelRascunhoMidias).where(and(eq(imovelRascunhoMidias.rascunhoId, r.id), eq(imovelRascunhoMidias.removida, false as any))).limit(1)).length;
    if (vazio) { await setModo('cadastro', { rascunhoAtivoId: r.id }); await enviar(tel, `🏡 O rascunho nº ${r.id} já está aberto. Pode mandar as informações por áudio ou texto e depois as fotos.`); return; }
    const id = await novoRascunho(d, u.id, vinculoId);
    const avulsas: any[] = await d.select({ id: imovelRascunhoMidias.id }).from(imovelRascunhoMidias)
      .where(and(eq(imovelRascunhoMidias.vinculoId, vinculoId), isNull(imovelRascunhoMidias.rascunhoId), eq(imovelRascunhoMidias.removida, false as any), eq(imovelRascunhoMidias.status, 'ok')));
    await setModo('cadastro', { rascunhoAtivoId: id, pergunta: avulsas.length ? 'fotos_avulsas' : null });
    const antes = r && !vazio ? `\n\n(O cadastro anterior, nº ${r.id}, ficou salvo: responda *CONTINUAR* para voltar a ele depois.)` : '';
    await enviar(tel, `🏡 Vamos cadastrar um imóvel (rascunho nº ${id}). Pode mandar as informações por áudio ou texto. Depois, envie as fotos. Vou organizar tudo e pedir sua confirmação antes de cadastrar.\n\n${checklist()}${antes}`);
    if (avulsas.length) await enviar(tel, `Você mandou ${avulsas.length} foto(s) antes de escolher a função. Usar neste cadastro?\n1. Sim\n2. Não`);
    return;
  }
  if (cmd === 'continuar') {
    const alvo = r ?? (await d.select().from(imovelRascunhos).where(and(eq(imovelRascunhos.autorId, u.id), inArray(imovelRascunhos.estado, ABERTOS))).orderBy(desc(imovelRascunhos.atualizadoEm)).limit(1))[0];
    if (!alvo) { await setModo('escolhendo'); await enviar(tel, `Você não tem cadastro em andamento.\n\n${MENU_FUNCOES}`); return; }
    await setModo('cadastro', { rascunhoAtivoId: alvo.id });
    await enviar(tel, await mensagemSituacao(d, alvo.id, `Continuando o rascunho nº ${alvo.id}.`));
    return;
  }
  if (!modo || modo === 'escolhendo' || !r) { await setModo('escolhendo'); await enviar(tel, MENU_FUNCOES); return; }

  // ── Dentro do cadastro ──
  await setModo('cadastro');
  if (cmd === 'cancelar') {
    await d.update(imovelRascunhos).set({ estado: 'cancelled', atualizadoEm: new Date(agora) } as any).where(eq(imovelRascunhos.id, r.id));
    await setModo(null, { rascunhoAtivoId: null });
    await auditar(u.id, r.id, 'rascunho_cancelado');
    await enviar(tel, `Cadastro nº ${r.id} cancelado. Nada foi gravado em Imóveis. Responda *MENU* quando quiser.`);
    return;
  }
  if (cmd === 'confirmar') { await enviar(tel, (await confirmarRascunho(r.id, { id: u.id, canal: 'whatsapp' }, { agora })).mensagem); return; }
  if (cmd === 'corrigir') {
    await invalidarRevisao(d, r, 'corrigir');
    await enviar(tel, `O que devo corrigir? Mande por áudio ou texto (ex.: "o preço é 320 mil"), ou corrija na tela: ${await linkCrm(`/imoveis/whatsapp/${r.id}`)}`);
    return;
  }
  if (cmd === 'concluir') { await enviar(tel, await concluirEnvio(r.id, { agora })); return; }

  // Informação do imóvel: entra no rascunho e a IA reorganiza tudo
  const msgs = json<MensagemRascunho[]>(r.mensagensJson, []);
  msgs.push({ id: `m${msgs.length + 1}`, tipo, texto: texto.slice(0, 6000), em: new Date(agora).toISOString() });
  await d.update(imovelRascunhos).set({ mensagensJson: JSON.stringify(msgs), atualizadoEm: new Date(agora) } as any).where(eq(imovelRascunhos.id, r.id));
  if (r.estado === 'awaiting_review') await invalidarRevisao(d, r, 'informação nova');
  if (!iaDisponivel()) { await enviar(tel, 'Anotei. A organização automática está indisponível agora (falta a chave da IA no servidor): complete pela tela do CRM.'); return; }
  try { await extrair(d, await rascunho(d, r.id)); }
  catch (err: any) {
    await d.update(imovelRascunhos).set({ erro: `IA: ${String(err?.message ?? err).slice(0, 250)}` } as any).where(eq(imovelRascunhos.id, r.id));
    await auditar(u.id, r.id, 'erro_ia', err?.message);
    await enviar(tel, 'Anotei a mensagem, mas não consegui organizar agora. Mande a próxima informação ou tente de novo em instantes.');
    return;
  }
  await enviar(tel, await mensagemSituacao(d, r.id));
}

/** "Anotei: … Falta: … Dúvida: …" (uma resposta consolidada) */
async function mensagemSituacao(d: any, id: number, abertura = 'Anotei.'): Promise<string> {
  const r = await rascunho(d, id);
  const dados = dadosDe(r);
  const qtd = (await fotos(d, id)).length;
  const conflitos = json<{ campo: string; valores: string[] }[]>(r.conflitosJson, []);
  const duvidas = json<string[]>(r.duvidasJson, []);
  const falta = pendencias(dados, qtd).filter(p => !conflitos.some(c => CAMPOS.find(x => x.campo === c.campo)?.rotulo === p));
  const partes = [abertura];
  const resumo = resumoTexto({ ...dados, proprietario: dados.proprietario ? '(anotado, privado)' : null });
  if (resumo) partes.push(`\n${resumo}`);
  for (const c of conflitos) partes.push(`\n❓ ${CAMPOS.find(x => x.campo === c.campo)?.rotulo}: você falou ${c.valores.map(x => `"${x}"`).join(' e ')}. Qual é o correto?`);
  for (const q of duvidas) partes.push(`\n❓ ${q}`);
  if (falta.filter(f => f !== 'Pelo menos 1 foto').length) partes.push(`\n📝 Falta: ${falta.filter(f => f !== 'Pelo menos 1 foto').join(', ')}.`);
  if (!qtd) partes.push(`\n${orientacaoFotos(dados.tipo)}`);
  else partes.push(`\n📸 ${qtd} foto(s). Quando terminar, responda *CONCLUIR*.`);
  return partes.join('\n');
}

/** CONCLUIR com pendência: primeiro e só o que falta (o resumo completo vem na revisão) */
async function mensagemPendencias(d: any, id: number): Promise<string> {
  const r = await rascunho(d, id);
  const qtd = (await fotos(d, id)).length;
  const conflitos = json<{ campo: string; valores: string[] }[]>(r.conflitosJson, []);
  const falta = pendencias(dadosDe(r), qtd).filter(p => !conflitos.some(c => CAMPOS.find(x => x.campo === c.campo)?.rotulo === p));
  const partes = ['📝 Para fazer a revisão, falta:'];
  for (const f of falta) partes.push(f === 'Tipo' ? '• Tipo do imóvel (casa, apartamento, lote, terreno, chácara, sala comercial, galpão…)' : `• ${f}`);
  for (const c of conflitos) partes.push(`• ${CAMPOS.find(x => x.campo === c.campo)?.rotulo}: você falou ${c.valores.map(x => `"${x}"`).join(' e ')}. Qual é o correto?`);
  partes.push('\nResponda aqui (texto ou áudio) e mande *CONCLUIR* de novo.');
  return partes.join('\n');
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

export type Baixar = (url: string) => Promise<{ bytes: Buffer; tipo: string }>;
let baixar: Baixar = async (url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('mídia sem https');
  const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (Number(r.headers.get('content-length') || 0) > MAX_FOTO_BYTES) throw new Error('foto grande demais');
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > MAX_FOTO_BYTES) throw new Error('foto grande demais');
  return { bytes, tipo: r.headers.get('content-type') || '' };
};
export type Guardar = (jpeg: Buffer, nome: string) => Promise<string>;
let guardar: Guardar = async (jpeg, nome) => {
  const { uploadToCloudinary } = await import('../cloudinary');
  return (await uploadToCloudinary(jpeg, 'image/jpeg', nome, { folder: 'romatec_imoveis_whatsapp' })).url;
};
export const definirMidiaAgente = (o: { baixar?: Baixar; guardar?: Guardar }) => { if (o.baixar) baixar = o.baixar; if (o.guardar) guardar = o.guardar; };

/** Baixa (URL do provedor, nunca uma ditada pelo usuário), confere que é imagem, tira os metadados (GPS) e guarda */
async function receberFoto(d: any, vinculoId: number, rascunhoId: number | null, e: EntradaAgente) {
  const messageId = String(e.messageId || `sem-id-${sha(String(e.imageUrl)).slice(0, 16)}`).slice(0, 120);
  const ordem = rascunhoId ? (await fotos(d, rascunhoId, true)).length + 1 : 0;
  try {
    await d.insert(imovelRascunhoMidias).values({ rascunhoId, vinculoId, messageId, tipo: 'foto', status: 'pendente', legenda: e.legenda?.slice(0, 200) || null, ordem, criadoEm: new Date() } as any);
  } catch (err: any) {
    if (/unique|duplicate/i.test(String(err?.message ?? err?.cause?.message ?? ''))) return null; // reentrega do webhook
    throw err;
  }
  const [m]: any[] = await d.select().from(imovelRascunhoMidias).where(and(eq(imovelRascunhoMidias.vinculoId, vinculoId), eq(imovelRascunhoMidias.messageId, messageId))).limit(1);
  try {
    const { bytes } = await baixar(String(e.imageUrl));
    const sharp = (await import('sharp')).default;
    const meta = await sharp(bytes, { failOn: 'error' }).metadata();
    if (!meta.width || !meta.height) throw new Error('arquivo não é imagem');
    const hash = sha(bytes);
    if (rascunhoId) {
      const dup: any[] = await d.select({ id: imovelRascunhoMidias.id }).from(imovelRascunhoMidias)
        .where(and(eq(imovelRascunhoMidias.rascunhoId, rascunhoId), eq(imovelRascunhoMidias.hash, hash), eq(imovelRascunhoMidias.status, 'ok'))).limit(1);
      if (dup.length) { await d.update(imovelRascunhoMidias).set({ status: 'duplicada', hash } as any).where(eq(imovelRascunhoMidias.id, m.id)); return m; }
    }
    // Derivado da galeria: JPEG sem EXIF/GPS, girado conforme a câmera, até 2560 px
    const jpeg = await sharp(bytes).rotate().resize(2560, 2560, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    const url = await guardar(jpeg, `rasc${rascunhoId ?? 'x'}_${m.id}`);
    await d.update(imovelRascunhoMidias).set({ status: 'ok', url, hash, bytes: jpeg.length } as any).where(eq(imovelRascunhoMidias.id, m.id));
  } catch (err: any) {
    await d.update(imovelRascunhoMidias).set({ status: 'erro', erro: String(err?.message ?? err).slice(0, 200) } as any).where(eq(imovelRascunhoMidias.id, m.id));
    console.warn('[AgenteImóvel] foto:', err?.message);
  }
  return m;
}

// ─── Concluir envio, revisão e confirmação ───────────────────────────────────

/** CONCLUIR: espera as fotos em processamento, pergunta o que falta ou monta a revisão versionada */
export async function concluirEnvio(id: number, o: { agora?: number; esperaMs?: number } = {}): Promise<string> {
  const d = await banco();
  const limite = Date.now() + (o.esperaMs ?? 120_000);
  let r = await rascunho(d, id);
  while ((await fotos(d, id, true)).some(f => f.status === 'pendente') && Date.now() < limite) await new Promise(ok => setTimeout(ok, 1500));
  if ((await fotos(d, id, true)).some(f => f.status === 'pendente')) return '⏳ Ainda estou processando fotos. Responda *CONCLUIR* de novo em instantes.';
  r = await rascunho(d, id);
  const dados = dadosDe(r);
  const lista = await fotos(d, id);
  const conflitos = json<any[]>(r.conflitosJson, []);
  const falta = pendencias(dados, lista.length);
  if (falta.length || conflitos.length) {
    await d.update(imovelRascunhos).set({ estado: 'awaiting_information', atualizadoEm: new Date() } as any).where(eq(imovelRascunhos.id, id));
    return await mensagemPendencias(d, id);
  }
  let textos = { titulo: r.titulo as string | null, descricao: r.descricao as string | null };
  if (iaDisponivel() && (!textos.titulo || !textos.descricao)) {
    try { textos = await gerarTextos(dados); } catch (err: any) { await auditar(r.autorId, id, 'erro_ia', `textos: ${err?.message}`); }
  }
  if (!textos.titulo) textos.titulo = `${ROTULO_TIPO[dados.tipo!] ?? 'Imóvel'} em ${dados.bairro || dados.cidade}`;
  const capa = lista.find(f => f.capa) ? null : lista[0]?.id;
  if (capa) await d.update(imovelRascunhoMidias).set({ capa: true } as any).where(eq(imovelRascunhoMidias.id, capa));
  const fotosRev = (await fotos(d, id)).map(f => ({ id: Number(f.id), capa: !!f.capa }));
  const versao = Number(r.versao) + (r.estado === 'awaiting_review' ? 0 : 1);
  const hash = sha(conteudoRevisao(dados, fotosRev, textos));
  await d.update(imovelRascunhos).set({ estado: 'awaiting_review', versao, revisaoHash: hash, titulo: textos.titulo, descricao: textos.descricao, erro: null, atualizadoEm: new Date() } as any)
    .where(eq(imovelRascunhos.id, id));
  await auditar(r.autorId, id, 'revisao', `v${versao}`);
  return [`🧾 *Revisão do cadastro nº ${id}* (versão ${versao})`, '', `*${textos.titulo}*`, resumoTexto({ ...dados, proprietario: dados.proprietario ? '(privado)' : null }),
    `• Fotos: ${fotosRev.length}`, '', `Confira as fotos e o texto: ${await linkCrm(`/imoveis/whatsapp/${id}`)}`, '',
    'Posso cadastrar esse imóvel no CRM?\n1. Confirmar cadastro\n2. Corrigir\n3. Cancelar'].join('\n');
}

/** Monta a revisão pela tela (mesma regra do CONCLUIR) */
export const prepararRevisao = (id: number) => concluirEnvio(id, { esperaMs: 5_000 });

/**
 * Confirmação da versão apresentada: revalida acesso, confere o hash (nada mudou), grava UMA vez pelo serviço real de
 * imóveis (imóvel interno, nada publicado) e devolve o código. Repetir a confirmação devolve o mesmo imóvel.
 */
export async function confirmarRascunho(id: number, autor: { id: number; canal: 'whatsapp' | 'crm'; versao?: number }, o: { agora?: number } = {}): Promise<{ ok: boolean; mensagem: string; propertyId?: number; codigo?: string | null }> {
  const d = await banco();
  const r = await rascunho(d, id);
  if (!r) return { ok: false, mensagem: 'Rascunho não encontrado.' };
  if (r.propertyId) return { ok: true, mensagem: `Este imóvel já foi cadastrado (rascunho nº ${id}).`, propertyId: Number(r.propertyId) };
  // Gravação interrompida (queda do servidor depois de criar): reconcilia pela chave do rascunho antes de criar de novo
  if (r.estado === 'saving') {
    const achado = await imovelDoRascunho(d, id);
    if (achado) {
      await d.update(imovelRascunhos).set({ estado: 'saved', propertyId: achado.id, erro: null } as any).where(eq(imovelRascunhos.id, id));
      await auditar(autor.id, id, 'reconciliado', String(achado.codigo ?? achado.id));
      return { ok: true, mensagem: `Este imóvel já foi cadastrado. Código: ${achado.codigo ?? achado.id}.`, propertyId: achado.id, codigo: achado.codigo };
    }
    if (Date.now() - new Date(r.aprovadoEm ?? r.atualizadoEm).getTime() < 5 * MIN) return { ok: false, mensagem: 'O cadastro já está sendo gravado. Aguarde.' };
    await d.update(imovelRascunhos).set({ estado: 'failed', erro: 'Gravação interrompida' } as any).where(eq(imovelRascunhos.id, id));
    r.estado = 'failed';
  }
  const u = await usuario(d, autor.id);
  if (!u || u.ativo === false || u.ativo === 0 || !podeUsarAgenteImovel(perfilDe(u))) return { ok: false, mensagem: 'Seu acesso não pode confirmar este cadastro.' };
  if (autor.canal === 'whatsapp') {
    const [v]: any[] = await d.select().from(whatsappVinculos).where(eq(whatsappVinculos.usuarioId, autor.id)).limit(1);
    const a = autorizacaoValida(v, u, o.agora);
    if (!a.ok) return { ok: false, mensagem: `🔒 Renove a autorização no CRM para confirmar (${a.motivo}). O rascunho continua salvo.` };
  }
  const escritorio = ['admin', 'secretario'].includes(String(perfilDe(u)));
  if (Number(r.autorId) !== autor.id && Number(r.responsavelId) !== autor.id && !escritorio) return { ok: false, mensagem: 'Este rascunho é de outra pessoa.' };
  if (!['awaiting_review', 'failed'].includes(r.estado) || !r.revisaoHash) return { ok: false, mensagem: 'Primeiro responda *CONCLUIR* para eu montar a revisão.' };
  if (autor.versao != null && autor.versao !== Number(r.versao)) return { ok: false, mensagem: 'A revisão mudou depois que você abriu. Confira a versão nova.' };
  const dados = dadosDe(r);
  const lista = await fotos(d, id);
  if ((await fotos(d, id, true)).some(f => f.status === 'pendente')) return { ok: false, mensagem: '⏳ Ainda há fotos em processamento. Tente de novo em instantes.' };
  const hashAtual = sha(conteudoRevisao(dados, lista.map(f => ({ id: Number(f.id), capa: !!f.capa })), { titulo: r.titulo, descricao: r.descricao }));
  if (hashAtual !== r.revisaoHash) {
    await invalidarRevisao(d, r, 'dados mudaram');
    return { ok: false, mensagem: 'Os dados ou as fotos mudaram depois da revisão. Responda *CONCLUIR* para revisar de novo.' };
  }
  if (pendencias(dados, lista.length).length) return { ok: false, mensagem: `Ainda falta: ${pendencias(dados, lista.length).join(', ')}.` };
  // Reserva: só uma confirmação grava (webhook repetido, dois toques, tela e WhatsApp juntos)
  const reserva = await d.update(imovelRascunhos).set({ estado: 'saving', aprovadoPor: autor.id, aprovadoEm: agoraData(o), versaoAprovada: r.versao } as any)
    .where(and(eq(imovelRascunhos.id, id), inArray(imovelRascunhos.estado, ['awaiting_review', 'failed']), eq(imovelRascunhos.versao, r.versao), isNull(imovelRascunhos.propertyId)));
  const afetadas = Number(reserva?.[0]?.affectedRows ?? reserva?.affectedRows ?? reserva?.changes ?? 0);
  if (afetadas !== 1) {
    const atual = await rascunho(d, id);
    return atual?.propertyId ? { ok: true, mensagem: `Este imóvel já foi cadastrado.`, propertyId: Number(atual.propertyId) } : { ok: false, mensagem: 'O cadastro já está sendo gravado. Aguarde.' };
  }
  await auditar(autor.id, id, 'confirmado', `v${r.versao} via ${autor.canal}`);
  try {
    const resp = await usuario(d, r.responsavelId);
    const capaPrimeiro = [...lista.filter(f => f.capa), ...lista.filter(f => !f.capa)].map(f => String(f.url));
    const regiao = [dados.bairro, dados.cidade].filter(Boolean).join(', ');
    const { criarImovel } = await import('./servico');
    const novo = await criarImovel({
      denomination: String(r.titulo || `${ROTULO_TIPO[dados.tipo!]} em ${regiao}`).slice(0, 255),
      address: dados.divulgarEndereco ? String(dados.endereco) : (regiao || String(dados.cidade)),
      city: dados.cidade, state: dados.uf, price: String(dados.preco), areaConstruida: dados.areaConstruida, areaTerreno: dados.areaTerreno,
      bedrooms: ehTerreno(dados.tipo) ? null : dados.quartos, bathrooms: ehTerreno(dados.tipo) ? null : dados.banheiros, garageSpaces: ehTerreno(dados.tipo) ? null : dados.vagas,
      propertyType: ROTULO_TIPO[dados.tipo!] ?? null, description: r.descricao, images: capaPrimeiro, finalidade: dados.finalidade === 'aluguel' ? 'aluguel' : 'venda',
      // Interno: não aparece no site nem nas landings até alguém publicar
      status: 'inactive', exibirPreco: dados.divulgarPreco !== false,
    }, { responsavelId: r.responsavelId, responsavelPerfil: perfilDe(resp), habilitadoPor: autor.id, chave: chaveRascunho(id) });
    await d.update(imovelRascunhos).set({ estado: 'saved', propertyId: novo.id, erro: null, atualizadoEm: new Date() } as any).where(eq(imovelRascunhos.id, id));
    await d.update(whatsappVinculos).set({ modo: null, rascunhoAtivoId: null } as any).where(eq(whatsappVinculos.rascunhoAtivoId, id));
    await auditar(autor.id, id, 'imovel_criado', `${novo.codigo ?? novo.id}`);
    return { ok: true, propertyId: novo.id, codigo: novo.codigo,
      mensagem: `✅ Imóvel cadastrado! Código: ${novo.codigo ?? novo.id}. As informações e as ${lista.length} foto(s) estão organizadas; ele está *interno* (não publicado). Ele já está em Imóveis, com galeria e especificações, pronto para você conferir e criar campanha: ${await linkCrm('/properties')}` };
  } catch (err: any) {
    await d.update(imovelRascunhos).set({ estado: 'failed', erro: `Gravação: ${String(err?.message ?? err).slice(0, 250)}` } as any).where(eq(imovelRascunhos.id, id));
    await auditar(autor.id, id, 'erro_gravacao', err?.message);
    return { ok: false, mensagem: '⚠️ Não consegui gravar o imóvel agora. O rascunho continua salvo: tente *CONFIRMAR* de novo em instantes.' };
  }
}

/** Chave idempotente gravada no slug do imóvel (…-rasc12): achar o imóvel de um rascunho depois de uma queda */
export const chaveRascunho = (id: number) => `rasc${id}`;
async function imovelDoRascunho(d: any, id: number): Promise<{ id: number; codigo: string | null } | null> {
  const { properties } = await import('../../drizzle/schema');
  const { like } = await import('drizzle-orm');
  const [p]: any[] = await d.select({ id: properties.id, codigo: properties.codigo }).from(properties).where(like(properties.publicSlug, `%-${chaveRascunho(id)}`)).limit(1);
  return p ? { id: Number(p.id), codigo: p.codigo ?? null } : null;
}

// ─── Tela do CRM ─────────────────────────────────────────────────────────────

const escritorioDe = (perfil: string | null | undefined) => ['admin', 'secretario'].includes(String(perfil));

export async function listarRascunhos(usuarioId: number, perfil: string) {
  if (!podeUsarAgenteImovel(perfil)) throw new AgenteErro('Sem acesso', 403);
  const d = await banco();
  const cond = escritorioDe(perfil) ? undefined : or(eq(imovelRascunhos.autorId, usuarioId), eq(imovelRascunhos.responsavelId, usuarioId));
  const rows: any[] = await (cond ? d.select().from(imovelRascunhos).where(cond) : d.select().from(imovelRascunhos)).orderBy(desc(imovelRascunhos.atualizadoEm)).limit(200);
  const us: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  const nome = (id: unknown) => us.find(x => Number(x.id) === Number(id))?.name ?? '—';
  return Promise.all(rows.map(async r => {
    const dados = dadosDe(r);
    const qtd = (await fotos(d, r.id)).length;
    return { id: Number(r.id), estado: String(r.estado), versao: Number(r.versao), titulo: r.titulo ?? null, tipo: dados.tipo, cidade: dados.cidade, preco: dados.preco, fotos: qtd,
      pendencias: pendencias(dados, qtd), autor: nome(r.autorId), responsavel: nome(r.responsavelId), propertyId: r.propertyId ? Number(r.propertyId) : null,
      erro: r.erro ?? null, atualizadoEm: new Date(r.atualizadoEm).toISOString() };
  }));
}

async function rascunhoPermitido(d: any, id: number, usuarioId: number, perfil: string) {
  if (!podeUsarAgenteImovel(perfil)) throw new AgenteErro('Sem acesso', 403);
  const r = await rascunho(d, id);
  if (!r || (!escritorioDe(perfil) && Number(r.autorId) !== usuarioId && Number(r.responsavelId) !== usuarioId)) throw new AgenteErro('Rascunho não encontrado', 404);
  return r;
}

export async function detalheRascunho(id: number, usuarioId: number, perfil: string) {
  const d = await banco();
  const r = await rascunhoPermitido(d, id, usuarioId, perfil);
  const lista = await fotos(d, id, true);
  const dados = dadosDe(r);
  return {
    id, estado: String(r.estado), versao: Number(r.versao), titulo: r.titulo ?? '', descricao: r.descricao ?? '', dados, manuais: Object.keys(json(r.manualJson, {})),
    fontes: json<Record<string, { msg: string; trecho: string }>>(r.fontesJson, {}), conflitos: json<any[]>(r.conflitosJson, []), duvidas: json<string[]>(r.duvidasJson, []),
    mensagens: json<MensagemRascunho[]>(r.mensagensJson, []), pendencias: pendencias(dados, lista.filter(f => f.status === 'ok' && !f.removida).length),
    fotos: lista.filter(f => !f.removida).map(f => ({ id: Number(f.id), url: f.url, status: String(f.status), capa: !!f.capa, legenda: f.legenda ?? null, erro: f.erro ?? null })),
    responsavelId: Number(r.responsavelId), autorId: Number(r.autorId), propertyId: r.propertyId ? Number(r.propertyId) : null, erro: r.erro ?? null,
    podeTrocarResponsavel: escritorioDe(perfil), revisaoPronta: r.estado === 'awaiting_review' && !!r.revisaoHash,
  };
}

/** Correção na tela: vence a IA e invalida a revisão anterior */
export async function salvarCampos(id: number, usuarioId: number, perfil: string, p: { dados?: Partial<Record<keyof DadosImovel, unknown>>; titulo?: string | null; descricao?: string | null; responsavelId?: number | null }) {
  const d = await banco();
  const r = await rascunhoPermitido(d, id, usuarioId, perfil);
  if (!ABERTOS.includes(r.estado)) throw new AgenteErro('Rascunho já finalizado');
  const manual: Record<string, unknown> = json(r.manualJson, {});
  for (const [k, v] of Object.entries(p.dados ?? {})) {
    if (!CAMPOS.some(c => c.campo === k)) continue;
    const nv = v === '' || v == null ? null : normalizarValor(k as keyof DadosImovel, typeof v === 'boolean' ? String(v) : v);
    manual[k] = nv;
  }
  const set: any = { manualJson: JSON.stringify(manual), atualizadoEm: new Date() };
  if (p.titulo !== undefined) set.titulo = p.titulo?.slice(0, 160) || null;
  if (p.descricao !== undefined) set.descricao = p.descricao?.slice(0, 4000) || null;
  if (p.responsavelId) {
    if (!escritorioDe(perfil)) throw new AgenteErro('Só o escritório troca o responsável', 403);
    const resp = await usuario(d, p.responsavelId);
    if (!resp || !podeUsarAgenteImovel(perfilDe(resp))) throw new AgenteErro('Responsável inválido');
    set.responsavelId = p.responsavelId;
  }
  // Conflito do campo corrigido some
  set.conflitosJson = JSON.stringify(json<any[]>(r.conflitosJson, []).filter(c => !(c.campo in manual)));
  await d.update(imovelRascunhos).set(set).where(eq(imovelRascunhos.id, id));
  await invalidarRevisao(d, { ...r, ...set }, 'correção na tela');
  await auditar(usuarioId, id, 'correcao_tela', Object.keys(p.dados ?? {}).join(','));
  return detalheRascunho(id, usuarioId, perfil);
}

export async function mexerFoto(id: number, fotoId: number, acao: 'capa' | 'remover', usuarioId: number, perfil: string) {
  const d = await banco();
  const r = await rascunhoPermitido(d, id, usuarioId, perfil);
  if (!ABERTOS.includes(r.estado)) throw new AgenteErro('Rascunho já finalizado');
  const [f]: any[] = await d.select().from(imovelRascunhoMidias).where(and(eq(imovelRascunhoMidias.id, fotoId), eq(imovelRascunhoMidias.rascunhoId, id))).limit(1);
  if (!f) throw new AgenteErro('Foto não encontrada', 404);
  if (acao === 'capa') {
    await d.update(imovelRascunhoMidias).set({ capa: false } as any).where(eq(imovelRascunhoMidias.rascunhoId, id));
    await d.update(imovelRascunhoMidias).set({ capa: true } as any).where(eq(imovelRascunhoMidias.id, fotoId));
  } else await d.update(imovelRascunhoMidias).set({ removida: true, capa: false } as any).where(eq(imovelRascunhoMidias.id, fotoId));
  await invalidarRevisao(d, r, `foto ${acao}`);
  return detalheRascunho(id, usuarioId, perfil);
}

export async function cancelarRascunho(id: number, usuarioId: number, perfil: string) {
  const d = await banco();
  const r = await rascunhoPermitido(d, id, usuarioId, perfil);
  if (!ABERTOS.includes(r.estado)) throw new AgenteErro('Rascunho já finalizado');
  await d.update(imovelRascunhos).set({ estado: 'cancelled', atualizadoEm: new Date() } as any).where(eq(imovelRascunhos.id, id));
  await d.update(whatsappVinculos).set({ modo: null, rascunhoAtivoId: null } as any).where(eq(whatsappVinculos.rascunhoAtivoId, id));
  await auditar(usuarioId, id, 'rascunho_cancelado', 'tela');
  return { ok: true as const };
}

/** Administrador: vínculos, fila, erros recentes e disponibilidade do motor */
export async function painelAdmin() {
  const d = await banco();
  const vs: any[] = await d.select().from(whatsappVinculos);
  const us: any[] = await d.select({ id: users.id, name: users.name, perfil: (users as any).perfil, role: users.role, ativo: users.ativo, sessaoVersao: (users as any).sessaoVersao }).from(users);
  const eventos: any[] = await d.select().from(imovelAgenteEventos).where(inArray(imovelAgenteEventos.tipo, ['erro_ia', 'erro_gravacao', 'acesso_negado', 'vinculo_recusado'])).orderBy(desc(imovelAgenteEventos.criadoEm)).limit(30);
  const pendentes: any[] = await d.select({ n: sql<number>`count(*)` }).from(imovelRascunhoMidias).where(eq(imovelRascunhoMidias.status, 'pendente'));
  const porEstado: any[] = await d.select({ estado: imovelRascunhos.estado, n: sql<number>`count(*)` }).from(imovelRascunhos).groupBy(imovelRascunhos.estado);
  return {
    agente: 'Agente de Cadastro de Imóveis Romatec (property_intake_agent)', motor: 'Motor de Cadastro de Imóveis (property_intake_engine)',
    ia: { disponivel: iaDisponivel(), provedor: process.env.ANTHROPIC_API_KEY ? 'Claude (Anthropic)' : (process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY) ? 'OpenAI / Forge' : 'não configurada',
      modelo: process.env.ANTHROPIC_MODEL_CADASTRO_IMOVEL || process.env.ANTHROPIC_MODEL || (process.env.ANTHROPIC_API_KEY ? 'claude-sonnet-5-5' : 'padrão do invokeLLM'),
      transcricao: !!(process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENAI_API_KEY), visao: false },
    fotosEmProcessamento: Number(pendentes[0]?.n ?? 0), rascunhosPorEstado: porEstado.map(x => ({ estado: x.estado, n: Number(x.n) })),
    vinculos: vs.map(v => { const u = us.find(x => Number(x.id) === Number(v.usuarioId)); const a = autorizacaoValida(v, u);
      return { usuarioId: Number(v.usuarioId), nome: u?.name ?? '—', perfil: perfilDe(u), telefoneFinal: v.telefoneChave ? String(v.telefoneChave).slice(-4) : null, vinculado: !!v.verificadoEm, autorizado: a.ok, motivo: a.ok ? null : a.motivo }; }),
    erros: eventos.map(e => ({ quando: new Date(e.criadoEm).toISOString(), tipo: e.tipo, usuarioId: e.usuarioId, rascunhoId: e.rascunhoId, detalhe: e.detalhe })),
  };
}

/** Fotos avulsas (antes de escolher a função) com mais de 24 h: descartadas */
export async function limparAvulsas(agora = Date.now()) {
  const d: any = await getDb();
  if (!d) return;
  await d.update(imovelRascunhoMidias).set({ removida: true } as any).where(and(isNull(imovelRascunhoMidias.rascunhoId), lt(imovelRascunhoMidias.criadoEm, new Date(agora - DIA))));
}

export { formatarCampo };
