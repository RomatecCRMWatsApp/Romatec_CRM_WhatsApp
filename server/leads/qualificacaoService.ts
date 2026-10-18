/**
 * Liga a qualificação por IA ao WhatsApp (chamado no início do processBotMessage).
 *
 * Passa pela IA o lead que veio da captação (tem origemCanal), não está com o
 * corretor, não é de empreendimento com roteiro próprio e não caiu no modo bot.
 * Devolve o texto a enviar, ou null para o bot de perguntas seguir como antes.
 */
import { desc, eq } from 'drizzle-orm';
import { assistenteNome } from './config';
import {
  chamarIaPadrao, iaDisponivel, processarTurno, MSG_HANDOFF,
  type ChamadaIa, type ImovelPrompt, type MensagemHistorico,
} from './iaQualificacao';
import { tipoImovelDe, type SlotsLead } from './slots';
import type { Funil } from './atribuicao';

export function qualificacaoIaLigada(): boolean {
  return (process.env.QUALIFICACAO_IA || 'on').toLowerCase() !== 'off' && iaDisponivel();
}

/** Lead elegível para a IA (regra pura) */
export function elegivelIa(lead: {
  origemCanal?: string | null; humano?: boolean | number | null; empreendimentoSlug?: string | null;
  modoQualificacao?: string | null; blockedUntil?: Date | string | null; stage?: string | null;
}, now = Date.now()): boolean {
  if (!lead.origemCanal) return false;                       // leads antigos seguem no bot de sempre
  if (lead.humano) return false;
  if (lead.empreendimentoSlug) return false;                  // Bom Jardims: roteiro próprio + humano
  if ((lead.modoQualificacao || 'ia') !== 'ia') return false;
  if (lead.blockedUntil && new Date(lead.blockedUntil).getTime() > now) return false;
  if (['qualificado', 'concluido', 'descartado'].includes(String(lead.stage))) return false;
  return true;
}

async function dbx() {
  const { getDb } = await import('../db');
  return getDb();
}

export async function registrarMensagem(leadId: number, direcao: 'in' | 'out', autor: 'lead' | 'ia' | 'bot' | 'sistema', texto: string) {
  const db = await dbx();
  if (!db || !texto) return;
  const { leadMensagens } = await import('../../drizzle/schema');
  await db.insert(leadMensagens).values({ leadId, direcao, autor, texto: texto.slice(0, 4000) } as any).catch((e: any) => console.warn('[IA] Mensagem não gravada:', e?.message));
}

export async function registrarMensagemPorTelefone(phone: string, direcao: 'in' | 'out', autor: 'lead' | 'ia' | 'bot' | 'sistema', texto: string) {
  const db = await dbx();
  if (!db) return;
  const { leadQualifications } = await import('../../drizzle/schema');
  const [lead] = await db.select({ id: leadQualifications.id }).from(leadQualifications).where(eq(leadQualifications.phone, phone.replace(/\D/g, ''))).limit(1);
  if (lead) await registrarMensagem(lead.id, direcao, autor, texto);
}

export async function processarMensagemQualificacao(
  input: { phone: string; texto: string },
  deps: { chamar?: ChamadaIa; now?: Date } = {},
): Promise<{ texto: string; acao: string } | null> {
  if (!input.texto.trim() || (!deps.chamar && !qualificacaoIaLigada())) return null;
  const db = await dbx();
  if (!db) return null;
  const { leadQualifications, leadMensagens, properties } = await import('../../drizzle/schema');
  const phone = input.phone.replace(/\D/g, '');
  const now = deps.now ?? new Date();
  const [lead] = await db.select().from(leadQualifications).where(eq(leadQualifications.phone, phone)).limit(1);
  if (!lead || !elegivelIa(lead, now.getTime())) return null;

  const historicoRows = await db.select({ direcao: leadMensagens.direcao, texto: leadMensagens.texto })
    .from(leadMensagens).where(eq(leadMensagens.leadId, lead.id)).orderBy(desc(leadMensagens.createdAt)).limit(12);
  const historico: MensagemHistorico[] = historicoRows.reverse().map((m: any) => ({ role: m.direcao === 'in' ? 'user' : 'assistant', content: m.texto }));
  await registrarMensagem(lead.id, 'in', 'lead', input.texto);

  let imovel: ImovelPrompt | null = null;
  let tipoImovel: string | null = null;
  if (lead.propertyId) {
    const [p] = await db.select().from(properties).where(eq(properties.id, lead.propertyId)).limit(1);
    if (p) {
      const { precoPublico } = await import('./inbound');
      tipoImovel = tipoImovelDe(p.propertyType);
      imovel = {
        codigo: p.codigo, titulo: p.denomination, cidade: p.city, tipo: p.propertyType,
        area: p.areaTerreno ? `${Number(p.areaTerreno).toLocaleString('pt-BR')} m²` : null,
        preco: precoPublico({ preco: Number(p.price) || null, exibirPreco: p.exibirPreco !== false }),
      };
    }
  }

  const funilAtual: Funil = lead.funil === 'proprietario' ? 'proprietario' : 'comprador';
  const r = await processarTurno(
    { funil: funilAtual, slots: lead.slots as SlotsLead, perguntasIa: lead.perguntasIa ?? 0, falhasIa: lead.falhasIa ?? 0, tipoImovel, imovel, historico },
    input.texto,
    { chamar: deps.chamar ?? chamarIaPadrao, assistente: assistenteNome(), now },
  );

  const { notificarLead } = await import('./notificacao');
  const { rotuloCanal } = await import('./inbound');
  const avisar = (tipo: 'humano' | 'completa') => notificarLead({
    tipo, leadId: lead.id, nome: lead.nome || 'Lead', telefone: phone, funil: funilAtual,
    score: lead.leadScore, classe: lead.score as any, imovel: imovel ? { codigo: imovel.codigo, titulo: imovel.titulo, preco: null } : null,
    origem: rotuloCanal(lead.ultimoCanal || lead.origemCanal || 'whatsapp'),
  }).catch(e => console.warn('[IA] Aviso falhou:', e?.message));

  if (r.tipo === 'falha') {
    console.warn(`[IA] Falha ${r.falhasIa}/2 no lead ${lead.id}: ${r.erro}`);
    const vaiProBot = r.cairNoBot;
    // Proprietário não tem bot de perguntas: se a IA cair, o corretor assume
    const viraHumano = vaiProBot && funilAtual === 'proprietario';
    await db.update(leadQualifications).set({
      falhasIa: r.falhasIa,
      ...(vaiProBot ? { modoQualificacao: 'bot' } : {}),
      ...(viraHumano ? { humano: true } : {}),
    } as any).where(eq(leadQualifications.id, lead.id));
    if (viraHumano) {
      await avisar('humano');
      await registrarMensagem(lead.id, 'out', 'sistema', MSG_HANDOFF);
      return { texto: MSG_HANDOFF, acao: 'handoff' };
    }
    return null; // o bot de perguntas responde esta mensagem (os slots continuam salvos)
  }

  // Slots, funil e contadores
  await db.update(leadQualifications).set({
    slots: r.slots,
    funil: r.funil,
    perguntasIa: r.perguntasIa,
    falhasIa: 0,
    lastActivityAt: now,
    updatedAt: now,
    ...(r.acao === 'handoff' || r.acao === 'completa' ? { humano: true } : {}),
    ...(r.acao === 'completa' ? { stage: 'qualificado' } : {}),
  } as any).where(eq(leadQualifications.id, lead.id));

  if (r.acao === 'optout') {
    const { discardLead } = await import('../lead-persistence');
    await discardLead(phone, 'opt-out (SAIR)', 24 * 365 * 5);
    await registrarMensagem(lead.id, 'out', 'ia', r.texto);
    return { texto: r.texto, acao: 'optout' };
  }

  // Score pelas regras; virou quente → passa para o corretor (§7.3)
  const { recalcularScoreLead } = await import('./scoreService');
  const novos = Object.fromEntries(r.aceitos.map(k => [k, r.slots[k].valor]));
  const antes = lead.score;
  const sc = await recalcularScoreLead(lead.id, { motivo: 'resposta_ia', slotsNovos: novos }).catch(() => null);
  let texto = r.texto;
  let acao: string = r.acao;
  if (r.acao === 'continuar' && sc?.classe === 'quente' && antes !== 'quente') {
    await db.update(leadQualifications).set({ humano: true } as any).where(eq(leadQualifications.id, lead.id));
    texto = `${r.texto.replace(/\s*[^.!?]*\?\s*$/, '').trim() || 'Ótimo!'}\n\n${MSG_HANDOFF}`.trim();
    acao = 'handoff_quente'; // o aviso de "ficou quente" já sai pelo recálculo
  } else if (r.acao === 'handoff') {
    await avisar('humano');
  } else if (r.acao === 'completa') {
    await avisar('completa');
  }

  await registrarMensagem(lead.id, 'out', 'ia', texto);
  console.log(`[IA] Lead ${lead.id} ${acao} · slots +${r.aceitos.length}${r.recusados.length ? ` (descartados: ${r.recusados.join(', ')})` : ''} · perguntas ${r.perguntasIa}`);
  return { texto, acao };
}
