/**
 * Follow-up persistente (Fase 1): quando o lead para de responder, o CRM manda
 * até 5 mensagens em 1, 3, 7, 14 e 30 dias após a última conversa.
 *
 * - Gravado no banco (followUpPasso / proximoFollowUpAt): sobrevive a restart e
 *   não depende do agendador de campanhas.
 * - Lead respondeu → cancela; o CRM respondeu → recomeça do dia 1.
 * - Sem escassez inventada; toda mensagem permite sair (SAIR).
 * - Só em horário comercial (seg–sáb, 8h–19h no Maranhão).
 * - Sem duplicidade: o passo é reservado com um UPDATE condicional antes do envio.
 * - Falha no envio: tenta de novo em 30 min e em 2 h; depois segue a cadência e
 *   deixa o erro em followUpErro (aparece na tela do lead).
 * Desliga com FOLLOWUP_AUTOMATICO=off.
 */
import { and, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { appUrl } from './config';

/** Dias desde a última conversa em que sai cada follow-up (passo 1..5) */
export const CADENCIA_DIAS = [1, 3, 7, 14, 30] as const;
const DIA = 24 * 3600_000;
const FUSO = 3 * 3600_000; // UTC-3

export function followUpLigado(): boolean {
  return (process.env.FOLLOWUP_AUTOMATICO || 'on').toLowerCase() !== 'off';
}

/** Data em que sai o passo `passo` (1..5), contando da última conversa; null = acabou */
export function quandoSai(passo: number, ultimaConversa: number): number | null {
  const d = CADENCIA_DIAS[passo - 1];
  return d === undefined ? null : ultimaConversa + d * DIA;
}

/** Próximo horário comercial (seg–sáb 8h–19h, UTC-3) a partir de `t` */
export function proximoHorarioComercial(t: number): number {
  let local = new Date(t - FUSO); // relógio de Açailândia em campos UTC
  for (let i = 0; i < 8; i++) {
    const dow = local.getUTCDay(), h = local.getUTCHours();
    if (dow !== 0 && h >= 8 && h < 19) return local.getTime() + FUSO;
    // pula para as 8h do dia certo
    const prox = new Date(local);
    if (dow !== 0 && h < 8) prox.setUTCHours(8, 0, 0, 0);
    else { prox.setUTCDate(prox.getUTCDate() + 1); prox.setUTCHours(8, 0, 0, 0); }
    local = prox;
  }
  return t;
}

export interface LeadFollowUp {
  nome?: string | null;
  funil?: string | null;
  empreendimentoSlug?: string | null;
  humano?: boolean | number | null;
  blockedUntil?: Date | string | null;
  stage?: string | null;
  etapa?: string | null;
}

/** Lead que não deve receber follow-up automático */
export function followUpPausado(l: LeadFollowUp, agora = Date.now()): string | null {
  if (l.blockedUntil && new Date(l.blockedUntil).getTime() > agora) return 'pediu para sair';
  if (l.humano) return 'com o corretor';
  if (['descartado', 'sem_interesse', 'concluido'].includes(String(l.stage))) return 'encerrado';
  if (['fechado', 'perdido', 'captado'].includes(String(l.etapa))) return 'encerrado';
  return null;
}

function primeiroNome(nome?: string | null) {
  const n = String(nome || '').trim().split(/\s+/)[0] || '';
  return !n || /^cliente$/i.test(n) ? '' : n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

/** Texto do follow-up (sem escassez inventada, sem preço, sempre com saída) */
export function mensagemFollowUp(passo: number, l: LeadFollowUp & { empreendimentoNome?: string | null }): string | null {
  const fn = primeiroNome(l.nome);
  const oi = fn ? `Oi, ${fn}!` : 'Oi!';
  const sair = 'Se preferir não receber mais mensagens, é só responder SAIR.';
  const bj = l.empreendimentoSlug === 'bom-jardims';
  const alvo = bj ? 'o Condomínio de Chácaras Bom Jardims' : l.empreendimentoNome ? `o ${l.empreendimentoNome}` : 'os imóveis que você viu';
  const link = bj ? `${appUrl()}/bom-jardims` : `${appUrl()}/imoveis`;
  if (l.funil === 'proprietario') {
    const t: Record<number, string> = {
      1: `${oi} Ficou alguma dúvida sobre a avaliação ou a venda do seu imóvel? Se me disser o tipo de imóvel e onde fica, já te explico os próximos passos.`,
      2: `${oi} Posso agendar uma visita do corretor José Romário (CRECI/MA 4.705) para avaliar seu imóvel, sem compromisso? Me diga o melhor dia.`,
      3: `${oi} Ainda pensa em vender? Se quiser, te mando como funciona a divulgação e a avaliação. ${sair}`,
      4: `${oi} Passando só para lembrar que estou à disposição para avaliar seu imóvel quando você quiser. ${sair}`,
      5: `${oi} Esta é minha última mensagem por aqui 🙂 Quando quiser retomar, é só chamar. ${sair}`,
    };
    return t[passo] ?? null;
  }
  const t: Record<number, string> = {
    1: `${oi} Ficou alguma dúvida sobre ${alvo}? Posso te mandar fotos, vídeo e a localização.`,
    2: `${oi} Separei as informações de ${alvo} aqui: ${link}\nQuer agendar uma visita sem compromisso? Me diga o melhor dia.`,
    3: `${oi} Você ainda está procurando? Me conta o que é mais importante para você (tamanho, localização, forma de pagamento) que eu te indico as melhores opções. ${sair}`,
    4: `${oi} Passando para lembrar que o corretor José Romário (CRECI/MA 4.705) está à disposição para tirar dúvidas e marcar visita. ${sair}`,
    5: `${oi} Esta é minha última mensagem por aqui 🙂 Quando quiser retomar, é só chamar neste número. ${sair}`,
  };
  return t[passo] ?? null;
}

// ─── Banco ───────────────────────────────────────────────────────────────────
async function db() {
  const { getDb } = await import('../db');
  return getDb();
}

/** O CRM falou com o lead (abertura, bot ou IA): o follow-up recomeça do dia 1 */
export async function agendarFollowUp(phone: string, agora = Date.now()): Promise<void> {
  if (!followUpLigado()) return;
  const d = await db();
  if (!d) return;
  const { leadQualifications } = await import('../../drizzle/schema');
  const fone = phone.replace(/\D/g, '');
  const prox = quandoSai(1, agora);
  await d.update(leadQualifications)
    .set({ followUpPasso: 0, proximoFollowUpAt: prox ? new Date(proximoHorarioComercial(prox)) : null, followUpTentativas: 0 } as any)
    .where(eq(leadQualifications.phone, fone));
}

/** O lead respondeu: cancela o follow-up pendente */
export async function cancelarFollowUp(phone: string): Promise<void> {
  const d = await db();
  if (!d) return;
  const { leadQualifications } = await import('../../drizzle/schema');
  await d.update(leadQualifications)
    .set({ proximoFollowUpAt: null } as any)
    .where(and(eq(leadQualifications.phone, phone.replace(/\D/g, '')), isNotNull(leadQualifications.proximoFollowUpAt)));
}

/** Envia os follow-ups vencidos (até `limite` por rodada) */
export async function processarFollowUps(agora = Date.now(), limite = 15): Promise<number> {
  if (!followUpLigado()) return 0;
  // Fora do horário comercial não sai nada (os vencidos esperam a próxima janela)
  if (proximoHorarioComercial(agora) !== agora) return 0;
  const d = await db();
  if (!d) return 0;
  const { leadQualifications, empreendimentos } = await import('../../drizzle/schema');
  const vencidos: any[] = await d.select().from(leadQualifications)
    .where(lte(leadQualifications.proximoFollowUpAt, new Date(agora))).limit(limite);
  if (!vencidos.length) return 0;
  const slugs = Array.from(new Set(vencidos.map(l => l.empreendimentoSlug).filter(Boolean))) as string[];
  const emps: any[] = slugs.length ? await d.select({ slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).where(inArray(empreendimentos.slug, slugs)) : [];
  const nomeEmp = new Map(emps.map(e => [e.slug, e.nome]));
  const { enviarTexto } = await import('./zapiClient');
  const { registrarMensagem } = await import('./qualificacaoService');
  const { linhasAfetadas, registrarEnvio } = await import('./rotinas');
  let enviados = 0;
  for (const l of vencidos) {
    const anterior = Number(l.followUpPasso) || 0;
    const passo = anterior + 1;
    const pausa = followUpPausado(l, agora);
    const texto = pausa ? null : mensagemFollowUp(passo, { ...l, empreendimentoNome: nomeEmp.get(l.empreendimentoSlug) });
    if (!texto) {
      await d.update(leadQualifications).set({ proximoFollowUpAt: null } as any).where(eq(leadQualifications.id, l.id));
      continue;
    }
    // Reserva atômica: só um servidor (ex.: dois no ar durante o deploy) consegue
    // avançar o passo; quem não conseguiu pula o lead — nada sai em duplicidade.
    const prox = proximoPassoEm(passo, agora);
    const reserva = await d.update(leadQualifications).set({ followUpPasso: passo, proximoFollowUpAt: prox ? new Date(prox) : null } as any)
      .where(and(
        eq(leadQualifications.id, l.id),
        l.followUpPasso == null ? isNull(leadQualifications.followUpPasso) : eq(leadQualifications.followUpPasso, anterior),
        eq(leadQualifications.proximoFollowUpAt, new Date(l.proximoFollowUpAt)),
      ));
    if (linhasAfetadas(reserva) === 0) continue;
    try {
      await enviarTexto(l.phone, texto);
      registrarEnvio('followup', true);
      if (Number(l.followUpTentativas) || l.followUpErro) {
        await d.update(leadQualifications).set({ followUpTentativas: 0, followUpErro: null } as any).where(eq(leadQualifications.id, l.id));
      }
      await registrarMensagem(l.id, 'out', 'sistema', texto).catch(() => {});
      enviados++;
      console.log(`[FollowUp] Lead ${l.id}: passo ${passo} enviado`);
    } catch (e: any) {
      const erro = String(e?.message ?? e).slice(0, 200);
      registrarEnvio('followup', false, erro);
      const tentativas = (Number(l.followUpTentativas) || 0) + 1;
      const de = novaTentativaEm(tentativas, agora);
      if (de) {
        // Devolve o passo e tenta de novo mais tarde (só se ninguém mexeu no lead nesse meio-tempo)
        await d.update(leadQualifications).set({
          followUpPasso: anterior, proximoFollowUpAt: new Date(de), followUpTentativas: tentativas, followUpErro: `Passo ${passo}: ${erro}`,
        } as any).where(and(eq(leadQualifications.id, l.id), eq(leadQualifications.followUpPasso, passo)));
        console.warn(`[FollowUp] Lead ${l.id}: passo ${passo} falhou (${tentativas}/${MAX_TENTATIVAS}), nova tentativa às ${new Date(de).toISOString()}: ${erro}`);
      } else {
        // Desistiu deste passo: segue a cadência normal e deixa o erro registrado
        await d.update(leadQualifications).set({ followUpTentativas: 0, followUpErro: `Passo ${passo} não enviado após ${MAX_TENTATIVAS} tentativas: ${erro}` } as any)
          .where(eq(leadQualifications.id, l.id));
        console.warn(`[FollowUp] Lead ${l.id}: passo ${passo} desistido após ${MAX_TENTATIVAS} tentativas: ${erro}`);
      }
    }
  }
  return enviados;
}

/** Quando sai o passo seguinte a `passo`, contado do envio de agora (null = acabou a cadência) */
export function proximoPassoEm(passo: number, agora: number): number | null {
  const atual = CADENCIA_DIAS[passo - 1], seguinte = CADENCIA_DIAS[passo];
  if (atual === undefined || seguinte === undefined) return null;
  return proximoHorarioComercial(agora + (seguinte - atual) * DIA);
}

/** Tentativas por passo (1 envio + 2 novas tentativas, depois de 30 min e de 2 h) */
export const MAX_TENTATIVAS = 3;
const ESPERA_TENTATIVA = [30 * 60_000, 2 * 3600_000];

/** Quando tentar de novo depois da `tentativas`-ésima falha; null = desiste do passo */
export function novaTentativaEm(tentativas: number, agora: number): number | null {
  const espera = ESPERA_TENTATIVA[tentativas - 1];
  return tentativas >= MAX_TENTATIVAS || espera === undefined ? null : proximoHorarioComercial(agora + espera);
}

let timer: NodeJS.Timeout | null = null;
/** Roda a cada 10 min, independente do agendador de campanhas */
export function iniciarJobFollowUp(intervaloMs = 10 * 60_000) {
  if (timer || !followUpLigado()) return;
  import('./rotinas').then(({ registrarRotina, rodarRotina }) => {
    registrarRotina('followup', intervaloMs);
    timer = setInterval(() => { void rodarRotina('followup', () => processarFollowUps()); }, intervaloMs);
  }).catch(e => console.warn('[FollowUp] Job não iniciado:', e?.message));
  console.log('[FollowUp] Job de follow-up iniciado (1, 3, 7, 14 e 30 dias)');
}
