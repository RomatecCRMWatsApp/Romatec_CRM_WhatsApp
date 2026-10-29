/**
 * Ranking de vendas por corretor + campanha "Bonificação Surpresa" — regras puras (servidor e tela).
 * Participa: corretor cadastrado e ativo. Conta: chácara vendida no empreendimento.
 * Venda válida: contrato assinado (assinado | ativo | quitado) + sinal pago (entrada ou à vista paga).
 * Vencedor: maior nº de chácaras vendidas; empate → quem chegou primeiro ao total.
 * Término (definido só pelo administrador, por empreendimento): indeterminado (padrão), data de encerramento
 * ou esgotamento do estoque. O estoque esgotado encerra a campanha em qualquer modo. Encerrada → ranking congelado.
 */
import { z } from 'zod';

export const STATUS_CONTRATO_VALIDO = ['assinado', 'ativo', 'quitado'] as const;
export const TIPOS_SINAL = ['entrada', 'avista'] as const;

export const MODOS_TERMINO = ['indeterminado', 'data', 'estoque'] as const;
export type ModoTermino = typeof MODOS_TERMINO[number];
export const ROTULO_MODO_TERMINO: Record<ModoTermino, string> = {
  indeterminado: 'Por tempo indeterminado',
  data: 'Por data de encerramento',
  estoque: 'Por esgotamento de estoque',
};

export const PREMIO_PADRAO = 'Honda Biz 125 EX 2026 0km OU R$ 19.265,00 (FIPE)';
export const NOME_CAMPANHA = 'Bonificação Surpresa';

export const prazoSchema = z.object({
  empreendimentoId: z.number().int().positive(),
  modo: z.enum(MODOS_TERMINO),
  /** AAAA-MM-DD (obrigatória no modo "data") */
  dataEncerramento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  senha: z.string().min(1).max(200),
}).superRefine((v, ctx) => {
  if (v.modo === 'data' && !v.dataEncerramento) ctx.addIssue({ code: 'custom', path: ['dataEncerramento'], message: 'Informe a data de encerramento' });
});

/** Fim do dia da data de encerramento no horário do Maranhão (UTC−3) */
export function fimDoDia(data: string): Date {
  return new Date(`${data}T23:59:59.999-03:00`);
}

export interface Prazo { modo: ModoTermino; dataEncerramento: string | null }

/** Por que a campanha acabou (null = em andamento) */
export function motivoEncerramento(p: Prazo, estoqueRestante: number | null, agora = Date.now()): 'data' | 'estoque' | null {
  if (estoqueRestante !== null && estoqueRestante <= 0) return 'estoque';
  if (p.modo === 'data' && p.dataEncerramento && fimDoDia(p.dataEncerramento).getTime() < agora) return 'data';
  return null;
}

export interface VendaValida {
  corretorId: number;
  /** Empreendimento + lote: a mesma chácara só conta uma vez */
  chave: string;
  /** Quando a venda ficou válida (o mais tarde entre assinatura e sinal pago) */
  em: Date;
}

export interface Participante { id: number; nome: string; creci: string | null }

export interface LinhaRanking extends Participante { posicao: number; vendas: number; ultimaVendaEm: string | null }

/** Classificação: mais vendas primeiro; empate → quem chegou antes; sem vendas → por nome */
export function classificar(participantes: Participante[], vendas: VendaValida[], ate?: Date | null): LinhaRanking[] {
  const porCorretor = new Map<number, { chaves: Set<string>; ultima: number }>();
  const vistas = new Set<string>();
  // A chácara conta para a primeira venda válida dela (contrato substituído não duplica)
  for (const v of [...vendas].sort((a, b) => a.em.getTime() - b.em.getTime())) {
    if (ate && v.em.getTime() > ate.getTime()) continue;
    if (vistas.has(v.chave)) continue;
    vistas.add(v.chave);
    const r = porCorretor.get(v.corretorId) ?? { chaves: new Set<string>(), ultima: 0 };
    r.chaves.add(v.chave);
    r.ultima = Math.max(r.ultima, v.em.getTime());
    porCorretor.set(v.corretorId, r);
  }
  const linhas = participantes.map(p => {
    const r = porCorretor.get(p.id);
    return { ...p, vendas: r?.chaves.size ?? 0, ultima: r?.ultima ?? Number.POSITIVE_INFINITY };
  });
  linhas.sort((a, b) => b.vendas - a.vendas || a.ultima - b.ultima || a.nome.localeCompare(b.nome, 'pt-BR'));
  let posicao = 0;
  return linhas.map((l, i) => {
    const anterior = linhas[i - 1];
    // Quem não vendeu divide a mesma posição
    if (!anterior || anterior.vendas !== l.vendas || (l.vendas > 0 && anterior.ultima !== l.ultima)) posicao = i + 1;
    return { id: l.id, nome: l.nome, creci: l.creci, posicao, vendas: l.vendas, ultimaVendaEm: Number.isFinite(l.ultima) ? new Date(l.ultima).toISOString() : null };
  });
}

const MEDALHA = ['🥇', '🥈', '🥉'];
const dataBr = (d: string) => d.split('-').reverse().join('/');

/** Mensagem de WhatsApp com a classificação */
export function textoRanking(o: {
  empreendimento: string; linhas: LinhaRanking[]; prazo: Prazo; encerrada: boolean; premio?: string; estoqueRestante?: number | null;
}): string {
  const linhas = o.linhas.length
    ? o.linhas.map(l => `${MEDALHA[l.posicao - 1] ?? `${l.posicao}º`} ${l.nome}${l.creci ? ` (CRECI ${l.creci})` : ''} — *${l.vendas}* ${l.vendas === 1 ? 'chácara' : 'chácaras'}`).join('\n')
    : 'Nenhum corretor participando ainda.';
  const prazo = o.encerrada ? '🏁 *Campanha encerrada* — ranking congelado para apuração do vencedor.'
    : o.prazo.modo === 'data' && o.prazo.dataEncerramento ? `⏳ Encerra em *${dataBr(o.prazo.dataEncerramento)}*.`
    : o.prazo.modo === 'estoque' ? '⏳ Vale até a última chácara vendida.'
    : '⏳ Campanha por tempo indeterminado.';
  return [
    `🏆 *Ranking de vendas — ${o.empreendimento}*`,
    `Campanha *${NOME_CAMPANHA}*`,
    '',
    linhas,
    '',
    `🎁 Prêmio ao 1º lugar: *${o.premio || PREMIO_PADRAO}* — bônus além dos 2% de comissão.`,
    'Venda válida = contrato assinado + sinal pago.',
    o.estoqueRestante != null ? `📦 Chácaras disponíveis: ${o.estoqueRestante}` : '',
    prazo,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
}
