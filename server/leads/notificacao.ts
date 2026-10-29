/**
 * Aviso de lead para o José (§9), com canais plugáveis.
 * NOTIFY_CANAIS=telegram (padrão) | whatsapp | telegram,whatsapp.
 * Mesmo texto nos dois canais. WhatsApp falhou → loga e cai no Telegram.
 */
import { canaisNotificacao, telefonesNotificacao, appUrl, type CanalNotificacao } from './config';
import { enviarTexto } from './zapiClient';
import type { Funil } from './atribuicao';

export type TipoAviso = 'novo_lead' | 'recorrente' | 'quente' | 'visita' | 'avaliacao' | 'humano' | 'completa';

export interface DadosAviso {
  tipo: TipoAviso;
  leadId: number;
  nome: string;
  telefone: string;
  funil: Funil;
  score?: number | null;
  classe?: 'frio' | 'morno' | 'quente' | null;
  /** Comprador: imóvel de interesse. preco null = "Valor sob consulta" */
  imovel?: { codigo?: string | null; titulo: string; preco?: number | null } | null;
  /** Proprietário: resumo do imóvel que quer vender (tipo · local · área · doc) */
  imovelProprietario?: string | null;
  origem: string;
  campanhaCodigo?: string | null;
  /** Linhas livres já resumidas (pagamento, prazo, visita...) */
  detalhes?: string[];
  tags?: string[];
  /** Lead de empreendimento (ex.: Bom Jardims): atendimento humano desde o 1º contato */
  empreendimento?: boolean;
  /** Preenchidos por notificarLead (server/leads/sla.ts) */
  responsavelNome?: string | null;
  linkAtendido?: string | null;
  /** Link do CRM que marca o atendimento e abre o WhatsApp do cliente (sla.linkWhatsAppAtendido) */
  linkWhatsApp?: string | null;
}

const TITULO: Record<TipoAviso, string> = {
  novo_lead: 'NOVO LEAD',
  recorrente: 'LEAD RECORRENTE — NOVO IMÓVEL',
  quente: 'LEAD FICOU QUENTE',
  visita: 'QUER VISITA',
  avaliacao: 'QUER AVALIAÇÃO',
  humano: 'PEDIU ATENDIMENTO HUMANO',
  completa: 'QUALIFICAÇÃO CONCLUÍDA — ASSUMA A CONVERSA',
};
const EMOJI_CLASSE = { frio: '🔵', morno: '🟡', quente: '🔴' } as const;
const PRIORITARIOS: TipoAviso[] = ['quente', 'visita', 'avaliacao', 'humano', 'completa'];
const ANTI_SPAM_MS = 10 * 60 * 1000;

export function formatarTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(9)(\d{4})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]} ${m[3]}-${m[4]}` : `+${d}`;
}

export function formatarReais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function montarAviso(d: DadosAviso): string {
  const funil = d.funil === 'proprietario' ? 'PROPRIETÁRIO' : 'COMPRADOR';
  const scoreTxt = d.score !== null && d.score !== undefined
    ? ` · Score ${d.score}${d.classe ? ` (${d.classe.toUpperCase()} ${EMOJI_CLASSE[d.classe]})` : ''}`
    : '';
  const fone = d.telefone.replace(/\D/g, '');
  const linhas = [
    `🟢 ${TITULO[d.tipo]} — ${funil}${scoreTxt}`,
    `👤 ${d.nome || 'Sem nome'} · ${formatarTelefone(fone)}`,
  ];
  if (d.funil === 'proprietario' && d.imovelProprietario) {
    linhas.push(`🏠 Quer vender: ${d.imovelProprietario}`);
  } else if (d.imovel) {
    const preco = d.imovel.preco ? formatarReais(d.imovel.preco) : 'Valor sob consulta';
    linhas.push(`🏡 ${d.imovel.codigo ? `${d.imovel.codigo} — ` : ''}${d.imovel.titulo} (${preco})`);
  }
  linhas.push(`📣 Origem: ${d.origem}${d.campanhaCodigo ? ` · #${d.campanhaCodigo}` : ''}`);
  for (const l of d.detalhes ?? []) linhas.push(l);
  linhas.push(`🏷️ Tags: ${d.tags?.length ? d.tags.join(', ') : '—'}`);
  if (d.responsavelNome) linhas.push(`🧑‍💼 Responsável: ${d.responsavelNome}`);
  linhas.push(`🔗 Painel: ${appUrl()}/leads/lead/${d.leadId}`);
  // Pelo link do CRM: abrir a conversa já marca o lead como atendido
  linhas.push(d.linkWhatsApp ? `💬 Atender no WhatsApp (já conta como atendido): ${d.linkWhatsApp}` : `💬 Responder: https://wa.me/${fone}`);
  if (d.linkAtendido) linhas.push(`✅ Já atendi (para o alerta de 5 min): ${d.linkAtendido}`);
  return linhas.join('\n');
}

// ─── Envio ───────────────────────────────────────────────────────────────────
export type Enviador = (texto: string) => Promise<void>;

export async function enviarTelegram(texto: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram não configurado');
  const TelegramBot = await import('node-telegram-bot-api').then(m => m.default);
  await new TelegramBot(token, { polling: false }).sendMessage(chatId, texto, { disable_web_page_preview: true });
}

async function enviarWhatsApp(texto: string, destino?: string | null): Promise<void> {
  // Responsável com telefone recebe o aviso; sem ele, os números de NOTIFY_PHONES
  const fones = destino ? [destino] : telefonesNotificacao();
  if (!fones.length) throw new Error('NOTIFY_PHONES vazio');
  for (const f of fones) await enviarTexto(f, texto);
}

const ultimoAviso = new Map<number, number>();

export interface ResultadoAviso { enviado: boolean; canais: CanalNotificacao[]; pulado?: 'anti_spam'; erros: string[] }

export async function notificarLead(
  dados: DadosAviso,
  opts: { enviadores?: Partial<Record<CanalNotificacao, Enviador>>; canais?: CanalNotificacao[]; now?: number; semSla?: boolean } = {},
): Promise<ResultadoAviso> {
  const now = opts.now ?? Date.now();
  const ultimo = ultimoAviso.get(dados.leadId);
  if (!PRIORITARIOS.includes(dados.tipo) && ultimo !== undefined && now - ultimo < ANTI_SPAM_MS) {
    return { enviado: false, canais: [], pulado: 'anti_spam', erros: [] };
  }

  // Responsável (rodízio) e prazo de atendimento humano — server/leads/sla.ts
  let destinoWhats: string | null = null;
  const sla = opts.semSla ? null : await import('./sla').catch(() => null);
  const precisa = sla?.precisaDeGente(dados.tipo, { funil: dados.funil, empreendimento: dados.empreendimento }) ?? false;
  if (sla && dados.leadId) {
    try {
      const resp = await sla.garantirResponsavel(dados.leadId);
      if (resp) dados = { ...dados, responsavelNome: resp.name ?? null };
      destinoWhats = await sla.telefoneDoResponsavel(dados.leadId);
      dados = { ...dados, linkWhatsApp: sla.linkWhatsAppAtendido(dados.leadId) };
      if (precisa) dados = { ...dados, linkAtendido: sla.linkAtendido(dados.leadId) };
    } catch (e: any) {
      console.warn('[Notificação] Responsável/SLA indisponível:', e?.message);
    }
  }

  const enviadores: Record<CanalNotificacao, Enviador> = {
    telegram: opts.enviadores?.telegram ?? enviarTelegram,
    whatsapp: opts.enviadores?.whatsapp ?? (t => enviarWhatsApp(t, destinoWhats)),
  };
  const canais = opts.canais ?? canaisNotificacao();
  const texto = montarAviso(dados);
  const ok: CanalNotificacao[] = [];
  const erros: string[] = [];

  for (const canal of canais) {
    try {
      await enviadores[canal](texto);
      ok.push(canal);
    } catch (e: any) {
      erros.push(`${canal}: ${e?.message || e}`);
      console.error(`[Notificação] Falha no ${canal} (lead ${dados.leadId}):`, e?.message || e);
    }
  }

  // WhatsApp falhou e o Telegram não estava na lista → cai no Telegram para o aviso não se perder
  if (!ok.length && canais.includes('whatsapp') && !canais.includes('telegram')) {
    try {
      await enviadores.telegram(texto);
      ok.push('telegram');
    } catch (e: any) {
      erros.push(`telegram (fallback): ${e?.message || e}`);
    }
  }

  if (ok.length) ultimoAviso.set(dados.leadId, now);
  // Começa o relógio do atendimento (5 min → lembrete; 15 → repassa; 60 → administrador)
  if (precisa && sla && dados.leadId) await sla.aguardarCorretor(dados.leadId).catch(() => {});
  return { enviado: ok.length > 0, canais: ok, erros };
}

/** Só para testes */
export function _resetAntiSpam() { ultimoAviso.clear(); }
