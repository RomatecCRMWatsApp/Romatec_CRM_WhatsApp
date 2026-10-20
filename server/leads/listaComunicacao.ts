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
/** Mensagens antigas ("lista de comunicação", até a v1.2.0) também contam no anti-repetição */
const MARCAS = [MARCA, 'lista de comunicação'];

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
