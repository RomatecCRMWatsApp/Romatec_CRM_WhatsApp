/**
 * Lista exclusiva dos empreendimentos (ex.: Bom Jardims).
 *
 * Todo lead que entra vinculado a um empreendimento recebe, já nas boas-vindas, a
 * confirmação de que está na lista exclusiva daquele empreendimento (nome interpolado).
 * Quando o lead escreve depois, o bot repete a confirmação: o empreendimento está em
 * regularização e em fase de cadastro, ainda sem venda nem reserva; quando as vendas
 * abrirem, quem está na lista recebe o aviso primeiro e tem atendimento prioritário.
 * No máximo 1 vez a cada 24 h por lead (sem spam). Sem preço, sem reserva, sem escassez.
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import { corretorWhatsApp } from './config';

export const INTERVALO_LISTA_MS = 24 * 3600_000;
export const MARCA = 'lista exclusiva';
/** Mensagens antigas ("lista de comunicação", até a v1.2.0) e a resposta de valor também contam no anti-repetição */
const MARCAS = [MARCA, 'lista de comunicação', 'lista de exclusividade'];

// ─── Resposta padrão para pergunta de VALOR/PREÇO (empreendimento em captação) ──
/** Texto aprovado pelo José — não alterar sem aprovação */
export const RESPOSTA_PRECO_CAPTACAO = [
  'Olá! 👋 Obrigado pelo contato! 🌳',
  '',
  'No momento ainda não divulgamos os valores: estamos cadastrando os interessados na nossa *lista de exclusividade*. 📝✨',
  '',
  'O lançamento oficial, com *valores e condições*, sai em no máximo *10 a 15 dias* 🚀 — e quem está na lista tem *prioridade* e recebe tudo em *primeira mão*. ⭐',
  '',
  'Quer participar da lista? 😉 Responde *OK* que já confirmo seu nome! ✅',
].join('\n');
const MARCA_PRECO = 'ainda não divulgamos os valores';
const MARCA_CONFIRMACAO = 'nome está confirmado na';
/** Depois da resposta de valor, o "OK" confirma o nome por até 48 h */
export const JANELA_CONFIRMACAO_MS = 48 * 3600_000;

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O lead está perguntando valor/preço? ("qual o valor?", "preço", "quanto custa", "qto", "qnto"…) */
export function perguntaPreco(texto: string): boolean {
  const t = ` ${semAcento(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  return /\b(valor|valores|preco|precos)\b/.test(t)
    || /\bquanto (custa|custam|e|sai|fica|esta|ta|seria|vale)\b/.test(t)
    || /\b(qto|qnto|qnt)\b/.test(t);
}

/** Resposta curta de aceite ("OK", "sim", "quero", "pode confirmar"…) */
export function respostaAfirmativa(texto: string): boolean {
  const t = semAcento(texto).replace(/[^a-z0-9 👍✅]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 40) return false;
  return /^(ok+|okay|okk+|sim|s|quero|quero sim|quero participar|pode|pode sim|pode confirmar|confirma|confirmo|confirmado|claro|bora|beleza|blz|show|top|isso|com certeza|perfeito|👍|✅)( .*)?$/.test(t);
}

/** Confirmação depois do "OK": nome na lista exclusiva do empreendimento */
export function mensagemConfirmacaoLista(nome: string | null | undefined, empreendimento?: string | null): string {
  const fn = primeiroNome(nome);
  const emp = String(empreendimento || '').trim();
  return [
    `✅ Prontinho${fn ? `, ${fn}` : ''}! Seu nome está confirmado na *${MARCA}*${emp ? ` do empreendimento *${emp}*` : ''}. 📝`,
    '',
    'Assim que o lançamento sair, você recebe os *valores e condições* em *primeira mão*, com atendimento prioritário do corretor José Romário (CRECI/MA 4.705). ⭐',
    '',
    'Para sair da lista, é só responder SAIR.',
  ].join('\n');
}

export type RespostaCaptacao = { tipo: 'preco' | 'confirmacao'; texto: string } | null;

/**
 * Regra (pura): o que responder a um lead de empreendimento em captação, dado o histórico de mensagens
 * enviadas a ele (mais recentes primeiro ou em qualquer ordem).
 *  - Pergunta de valor → resposta padrão (no máximo 1 vez a cada 24 h; depois o corretor responde).
 *  - "OK" depois da resposta de valor (até 48 h, sem confirmação ainda) → confirma o nome na lista.
 *  - Preços já públicos no empreendimento → não usa a resposta de captação.
 */
export function decidirRespostaCaptacao(p: {
  texto: string; nome?: string | null; empreendimento?: string | null; precosPublicos?: boolean;
  enviadas: { texto: string; createdAt: Date | string }[]; agora?: number;
}): RespostaCaptacao {
  if (p.precosPublicos) return null;
  const agora = p.agora ?? Date.now();
  const desde = (ms: number) => p.enviadas.filter(m => agora - new Date(m.createdAt).getTime() < ms);
  if (perguntaPreco(p.texto)) {
    if (desde(INTERVALO_LISTA_MS).some(m => m.texto.includes(MARCA_PRECO))) return null;
    return { tipo: 'preco', texto: RESPOSTA_PRECO_CAPTACAO };
  }
  if (respostaAfirmativa(p.texto)) {
    const recentes = [...desde(JANELA_CONFIRMACAO_MS)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const preco = recentes.findIndex(m => m.texto.includes(MARCA_PRECO));
    if (preco < 0) return null;
    // já confirmou depois dessa resposta de valor? então não repete
    if (recentes.slice(0, preco).some(m => m.texto.includes(MARCA_CONFIRMACAO))) return null;
    return { tipo: 'confirmacao', texto: mensagemConfirmacaoLista(p.nome, p.empreendimento) };
  }
  return null;
}

const primeiroNome = (nome?: string | null) => {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  return /^[A-Za-zÀ-ÿ]{2,20}$/.test(p) && !/^cliente$/i.test(p) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

/** "Você está na lista exclusiva do empreendimento X" — sem nome, frase genérica */
function linhaLista(empreendimento?: string | null): string {
  const nome = String(empreendimento || '').trim();
  return nome ? `Você está na *${MARCA}* do empreendimento *${nome}*.` : `Você está na nossa *${MARCA}*.`;
}

/** O texto já fala da lista? (boas-vindas ou resposta anterior) */
export function falaDaLista(texto?: string | null): boolean {
  return MARCAS.some(m => String(texto || '').includes(m));
}

/** Boas-vindas na entrada do lead de empreendimento (formulário, Meta Lead Ads, campanha no WhatsApp) */
export function boasVindasListaExclusiva(nome: string | null | undefined, empreendimento?: string | null): string {
  const fn = primeiroNome(nome);
  return [
    `Olá${fn ? `, ${fn}` : ''}! 👋 Aqui é da *Romatec Consultoria Total*. Recebemos seu cadastro — obrigado pelo interesse!`,
    '',
    `✅ ${linhaLista(empreendimento)}`,
    '',
    'Quem está na lista *recebe o aviso primeiro* quando as vendas forem abertas, com o mapa e as condições, e tem *atendimento prioritário* com o corretor José Romário (CRECI/MA 4.705).',
    '',
    `Ele vai te chamar pelo número pessoal dele, *${corretorWhatsApp()}*. Se tiver alguma dúvida, é só escrever aqui.`,
    '',
    'Seus dados são usados só para este atendimento. Para sair da lista, responda SAIR.',
  ].join('\n');
}

/** Resposta quando o lead do empreendimento escreve (1x a cada 24 h) */
export function mensagemListaComunicacao(nome: string | null | undefined, empreendimento?: string | null): string {
  const fn = primeiroNome(nome);
  return [
    `Olá${fn ? `, ${fn}` : ''}! Obrigado pela mensagem. 🌳`,
    '',
    linhaLista(empreendimento),
    '',
    'O empreendimento está em fase de regularização e de cadastro de interessados — por isso ainda não estamos vendendo nem reservando chácaras.',
    '',
    'Assim que as vendas forem abertas, quem está na lista *recebe o aviso primeiro*, com o mapa das chácaras e as condições, e tem *atendimento prioritário* com o corretor José Romário (CRECI/MA 4.705).',
    '',
    'Se tiver alguma dúvida, é só escrever aqui. Para sair da lista, responda SAIR.',
  ].join('\n');
}

/** Já mandamos a mensagem da lista para este lead nas últimas 24 h? (função pura sobre as datas) */
export function podeEnviarLista(ultimoEnvio: Date | string | null | undefined, agora = Date.now()): boolean {
  return !ultimoEnvio || agora - new Date(ultimoEnvio).getTime() >= INTERVALO_LISTA_MS;
}

const NOMES: Record<string, string> = { 'bom-jardims': 'Condomínio de Chácaras Bom Jardims' };

/** Nome do empreendimento pelo slug (null quando não existe) */
export async function nomeDoEmpreendimento(slug?: string | null): Promise<string | null> {
  if (!slug) return null;
  if (NOMES[slug]) return NOMES[slug];
  const { getDb } = await import('../db');
  const db: any = await getDb();
  if (!db) return null;
  const { empreendimentos } = await import('../../drizzle/schema');
  const [e]: any[] = await db.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  return e?.nome || null;
}

/**
 * Resposta de captação (valor/preço → resposta padrão; "OK" depois → confirmação na lista), já registrada
 * na conversa. null = não se aplica (o fluxo segue para a mensagem da lista / atendimento humano).
 */
export async function respostaCaptacao(phone: string, nome: string | null | undefined, slug: string, texto: string, agora = Date.now()): Promise<RespostaCaptacao> {
  if (!slug || slug === 'atendimento_humano') return null;
  if (!perguntaPreco(texto) && !respostaAfirmativa(texto)) return null;   // nada a decidir: sem consulta ao banco
  const { getDb } = await import('../db');
  const db: any = await getDb();
  if (!db) return null;
  const { leadQualifications, leadMensagens, empreendimentos } = await import('../../drizzle/schema');
  const fone = phone.replace(/\D/g, '');
  const [lead]: any[] = await db.select({ id: leadQualifications.id, nome: leadQualifications.nome, tags: leadQualifications.tags })
    .from(leadQualifications).where(eq(leadQualifications.phone, fone)).limit(1);
  if (!lead) return null;
  const [emp]: any[] = await db.select({ precosPublicos: empreendimentos.precosPublicos }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  const enviadas: any[] = await db.select({ texto: leadMensagens.texto, createdAt: leadMensagens.createdAt }).from(leadMensagens)
    .where(and(eq(leadMensagens.leadId, lead.id), eq(leadMensagens.direcao, 'out'), gte(leadMensagens.createdAt, new Date(agora - JANELA_CONFIRMACAO_MS))))
    .orderBy(desc(leadMensagens.createdAt)).limit(30);
  const r = decidirRespostaCaptacao({
    texto, nome: lead.nome || nome, empreendimento: await nomeDoEmpreendimento(slug),
    precosPublicos: !!emp?.precosPublicos, enviadas: enviadas.map(m => ({ texto: String(m.texto || ''), createdAt: m.createdAt })), agora,
  });
  if (!r) return null;
  const { registrarMensagem } = await import('./qualificacaoService');
  await registrarMensagem(lead.id, 'in', 'lead', texto);
  await registrarMensagem(lead.id, 'out', 'sistema', r.texto);
  if (r.tipo === 'confirmacao') {
    // Marca o lead como confirmado na lista (filtro no painel)
    const tags: string[] = Array.isArray(lead.tags) ? lead.tags : (() => { try { return JSON.parse(lead.tags || '[]'); } catch { return []; } })();
    if (!tags.includes('lista-exclusiva-confirmada')) {
      await db.update(leadQualifications).set({ tags: [...tags, 'lista-exclusiva-confirmada'], updatedAt: new Date(agora) } as any)
        .where(eq(leadQualifications.id, lead.id)).catch(() => {});
    }
  }
  return r;
}

/** Texto a responder (e já registrado na conversa) ou null quando já foi enviado nas últimas 24 h */
export async function respostaListaComunicacao(phone: string, nome: string | null | undefined, slug: string, agora = Date.now()): Promise<string | null> {
  // Proprietário/handoff (getLeadEmpreendimento devolve 'atendimento_humano'): não é lead de empreendimento
  if (!slug || slug === 'atendimento_humano') return null;
  const { getDb } = await import('../db');
  const db: any = await getDb();
  if (!db) return null;
  const { leadQualifications, leadMensagens } = await import('../../drizzle/schema');
  const fone = phone.replace(/\D/g, '');
  const [lead]: any[] = await db.select({ id: leadQualifications.id, nome: leadQualifications.nome }).from(leadQualifications).where(eq(leadQualifications.phone, fone)).limit(1);
  if (!lead) return null;
  const ultimos: any[] = await db.select({ texto: leadMensagens.texto, createdAt: leadMensagens.createdAt }).from(leadMensagens)
    .where(and(eq(leadMensagens.leadId, lead.id), eq(leadMensagens.direcao, 'out'), gte(leadMensagens.createdAt, new Date(agora - INTERVALO_LISTA_MS))))
    .orderBy(desc(leadMensagens.createdAt)).limit(20);
  const ultimo = ultimos.find(m => falaDaLista(m.texto));
  if (!podeEnviarLista(ultimo?.createdAt, agora)) return null;
  const texto = mensagemListaComunicacao(lead.nome || nome, await nomeDoEmpreendimento(slug));
  const { registrarMensagem } = await import('./qualificacaoService');
  await registrarMensagem(lead.id, 'out', 'sistema', texto);
  return texto;
}
