/**
 * Lista de comunicação dos empreendimentos em pré-lançamento (ex.: Bom Jardims).
 *
 * Quando um lead do empreendimento escreve, o bot responde que ele está na lista de
 * comunicação: o empreendimento está em regularização e em fase de cadastro, ainda sem
 * venda nem reserva; quando as vendas abrirem, quem está na lista recebe o aviso primeiro
 * e tem atendimento prioritário. No máximo 1 vez a cada 24 h por lead (sem spam).
 * Sem preço, sem reserva, sem escassez.
 */
import { and, desc, eq, gte } from 'drizzle-orm';

export const INTERVALO_LISTA_MS = 24 * 3600_000;
const MARCA = 'lista de comunicação';

const primeiroNome = (nome?: string | null) => {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  return /^[A-Za-zÀ-ÿ]{2,20}$/.test(p) && !/^cliente$/i.test(p) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

export function mensagemListaComunicacao(nome: string | null | undefined, empreendimento: string): string {
  const fn = primeiroNome(nome);
  return [
    `Olá${fn ? `, ${fn}` : ''}! Obrigado pela mensagem. 🌳`,
    '',
    `Você está na *${MARCA} do ${empreendimento}*.`,
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

/** Texto a responder (e já registrado na conversa) ou null quando já foi enviado nas últimas 24 h */
export async function respostaListaComunicacao(phone: string, nome: string | null | undefined, slug: string, agora = Date.now()): Promise<string | null> {
  const { getDb } = await import('../db');
  const db: any = await getDb();
  if (!db) return null;
  const { leadQualifications, leadMensagens, empreendimentos } = await import('../../drizzle/schema');
  const fone = phone.replace(/\D/g, '');
  const [lead]: any[] = await db.select({ id: leadQualifications.id, nome: leadQualifications.nome }).from(leadQualifications).where(eq(leadQualifications.phone, fone)).limit(1);
  if (!lead) return null;
  const ultimos: any[] = await db.select({ texto: leadMensagens.texto, createdAt: leadMensagens.createdAt }).from(leadMensagens)
    .where(and(eq(leadMensagens.leadId, lead.id), eq(leadMensagens.direcao, 'out'), gte(leadMensagens.createdAt, new Date(agora - INTERVALO_LISTA_MS))))
    .orderBy(desc(leadMensagens.createdAt)).limit(20);
  const ultimo = ultimos.find(m => String(m.texto).includes(MARCA));
  if (!podeEnviarLista(ultimo?.createdAt, agora)) return null;
  let nomeEmp = NOMES[slug];
  if (!nomeEmp) {
    const [e]: any[] = await db.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
    nomeEmp = e?.nome || 'empreendimento';
  }
  const texto = mensagemListaComunicacao(lead.nome || nome, nomeEmp);
  const { registrarMensagem } = await import('./qualificacaoService');
  await registrarMensagem(lead.id, 'out', 'sistema', texto);
  return texto;
}
