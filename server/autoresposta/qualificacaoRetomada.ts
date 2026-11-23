/**
 * Qualificação dos contatos importados do celular (etiqueta "retomada"): o robô entende a resposta às perguntas
 * finalidade → prazo → pagamento, grava nos slots do lead, recalcula a pontuação e devolve a próxima pergunta ou o
 * encerramento. Quem quer fechar em até 3 meses vai para o corretor com o resumo; os demais seguem com o robô.
 * Pedidos claros (sair, fechar, chácara, visita) e mensagens sem resposta reconhecível seguem o fluxo normal do robô.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { leadEventos, leadQualifications } from '../../drizzle/schema';
import {
  extrairRespostas, proximaPergunta, respostasDosSlots, respostaQualificacao, resumoRetomada, retomadaQuente, ROTULO_RESPOSTA, PERGUNTAS_RETOMADA,
  type RespostasRetomada,
} from '../../shared/importacaoContatos';
import { classificar } from '../../shared/autoresposta';
import { scoreBomJardims } from '../bom-jardims';

export const TAG_RETOMADA = 'retomada';
export const TAG_QUALIFICADO = 'qualificado_retomada';

/** O lead está na qualificação da retomada? (regra pura) */
export function emQualificacao(lead: { tags?: unknown }): boolean {
  const tags = Array.isArray(lead.tags) ? lead.tags.map(String) : [];
  return tags.includes(TAG_RETOMADA) && !tags.includes(TAG_QUALIFICADO);
}

/** Intenções que o robô trata do jeito dele mesmo no meio da qualificação */
const INTENCOES_DO_ROBO = ['optout', 'fechar', 'chacara_especifica', 'visita'];

export interface DecisaoRetomada { texto: string; concluida: boolean; quente: boolean; resumo: string; respostas: RespostasRetomada }

/**
 * Trata a mensagem do lead na qualificação. null = não é com a qualificação (o robô segue normal).
 * `extras.link()` dá o link da simulação (só chamado no encerramento) e `extras.corretor` o nome de quem atende.
 */
export async function tratarRetomada(
  lead: any, texto: string, agora: number,
  extras: { link?: () => Promise<string | null>; corretor?: string | null } = {},
): Promise<DecisaoRetomada | null> {
  if (!emQualificacao(lead)) return null;
  if (INTENCOES_DO_ROBO.includes(classificar(texto, false).intencao)) return null;
  const atuais = respostasDosSlots(lead.slots);
  const pendente = proximaPergunta(atuais);
  if (!pendente) return null;
  const novas = extrairRespostas(texto, pendente);
  const ganhou = PERGUNTAS_RETOMADA.filter(c => novas[c] && novas[c] !== atuais[c]);
  if (!ganhou.length) return null;

  const respostas: RespostasRetomada = { ...atuais, ...novas };
  const concluida = !proximaPergunta(respostas);
  const quente = concluida && retomadaQuente(respostas);
  const em = new Date(agora).toISOString();
  const slots = { ...(lead.slots ?? {}) };
  const answers = { ...(lead.answers ?? {}) };
  for (const c of ganhou) {
    slots[c] = { valor: respostas[c]!, fonte: 'bot', at: em };
    answers[c] = ROTULO_RESPOSTA[c][respostas[c]!] ?? respostas[c];
  }
  const leadScore = scoreBomJardims({ prazo: respostas.prazo, pagamento: respostas.pagamento, cidade: answers.cidade, loteCodigo: lead.loteCodigo ?? undefined });
  const tags = Array.from(new Set([...(Array.isArray(lead.tags) ? lead.tags : []), ...(concluida ? [TAG_QUALIFICADO] : [])]));
  const score = respostas.prazo === 'imediato' || respostas.prazo === '3m' ? 'quente' : respostas.prazo === '12m' ? 'morno' : 'frio';

  const d: any = await getDb();
  if (d) {
    await d.update(leadQualifications).set({
      slots, answers, leadScore, tags, score, ...(concluida ? { etapa: 'qualificado', stage: 'qualificado' } : {}),
      lastActivityAt: new Date(agora), updatedAt: new Date(agora),
    } as any).where(eq(leadQualifications.id, lead.id));
    await d.insert(leadEventos).values({ leadId: lead.id, tipo: concluida ? 'retomada_qualificada' : 'retomada_resposta', dados: { respostas, leadScore }, createdAt: new Date(agora) } as any).catch(() => {});
  }
  const link = concluida && extras.link ? await extras.link().catch(() => null) : null;
  return {
    texto: respostaQualificacao({ nome: lead.nome, respostas, link, corretor: extras.corretor }),
    concluida, quente, resumo: resumoRetomada(respostas), respostas,
  };
}
