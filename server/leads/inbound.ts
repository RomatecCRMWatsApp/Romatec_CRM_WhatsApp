/**
 * Entrada de lead pelo WhatsApp com atribuição (IMV-xxxx / #CAMPANHA / "quero vender meu...").
 *
 * - Lead novo: grava funil, 1º e último toque, interesse no(s) imóvel(is), avisa o José
 *   e devolve a mensagem de abertura (§7.4). Comprador segue para o bot de qualificação
 *   existente; proprietário vai para atendimento humano.
 * - Lead existente: atualiza só o último toque; imóvel novo → interesse + aviso "recorrente".
 * - Mensagem sem código nem pista de funil: não faz nada (o bot segue como hoje).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { extrairAtribuicao, type Funil } from './atribuicao';
import { assistenteNome, appUrl, fraseCorretorChama } from './config';
import { formatarReais, notificarLead } from './notificacao';
import { normalizePhoneBR } from '../lead-intake';
import { boasVindasListaExclusiva } from './listaComunicacao';

export interface ImovelResumo {
  id: number;
  codigo: string | null;
  titulo: string;
  cidade?: string | null;
  areaM2?: number | null;
  preco?: number | null;
  exibirPreco: boolean;
  publicSlug?: string | null;
}

export const RODAPE_LGPD = 'Seus dados são usados só para este atendimento. Se não quiser receber mensagens, responda SAIR.';

function primeiroNome(nome?: string | null): string {
  const n = (nome || '').trim().split(/\s+/)[0] || '';
  if (!n || /^cliente$/i.test(n)) return '';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

/** Preço para o cliente: respeita exibirPreco (false → "Valor sob consulta") */
export function precoPublico(imovel: Pick<ImovelResumo, 'preco' | 'exibirPreco'>): string {
  return imovel.exibirPreco && imovel.preco ? formatarReais(imovel.preco) : 'Valor sob consulta';
}

export function linkImovel(imovel: Pick<ImovelResumo, 'codigo' | 'publicSlug'>): string | null {
  if (imovel.codigo) return `${appUrl()}/i/${imovel.codigo}`;
  if (imovel.publicSlug) return `${appUrl()}/imovel/${imovel.publicSlug}`;
  return null;
}

/** Mensagem de abertura para quem chegou pelo WhatsApp (§7.4) */
export function montarAbertura(params: { funil: Funil; nome?: string | null; imovel?: ImovelResumo | null; empreendimento?: { slug: string; nome?: string | null } | null }): string {
  const fn = primeiroNome(params.nome);
  const ola = `Olá${fn ? `, ${fn}` : ''}! Aqui é ${assistenteNome()}, da Romatec Consultoria Total.`;
  // Empreendimento (ex.: Bom Jardims): confirma a lista exclusiva e segue no atendimento humano — sem as 3 perguntas do bot, sem preço
  const emp = params.empreendimento;
  if (emp) return boasVindasListaExclusiva(fn, emp.nome);
  if (params.funil === 'proprietario') {
    return [
      ola,
      '',
      `Que bom que você quer vender ou avaliar seu imóvel 🏠 ${fraseCorretorChama()}`,
      '',
      'Para adiantar: que tipo de imóvel é e onde fica?',
      '',
      RODAPE_LGPD,
    ].join('\n');
  }
  const im = params.imovel;
  if (!im) {
    return [ola, '', 'Recebi seu interesse nos nossos imóveis 🏡 Posso te fazer 3 perguntas rápidas para te mandar as melhores opções?', '', RODAPE_LGPD].join('\n');
  }
  const ficha = [
    im.cidade ? `📍 ${im.cidade}` : '',
    im.areaM2 ? `📐 ${im.areaM2.toLocaleString('pt-BR')} m²` : '',
    `💰 ${precoPublico(im)}`,
    linkImovel(im) ? `🔗 ${linkImovel(im)}` : '',
  ].filter(Boolean);
  return [
    ola,
    `Vi que você se interessou pelo *${im.titulo}*${im.codigo ? ` (${im.codigo})` : ''}. Já te passo os detalhes 🏡`,
    '',
    ...ficha,
    '',
    'Posso te fazer 3 perguntas rápidas para te mandar as melhores condições?',
    '',
    RODAPE_LGPD,
  ].join('\n');
}

export type DecisaoEntrada =
  | { acao: 'nenhuma' }
  | { acao: 'novo'; funil: Funil; canal: string }
  | { acao: 'existente'; imoveisNovos: number[]; canal: string };

/** Regra pura: o que fazer com a mensagem (testável sem banco) */
export function decidirEntrada(params: {
  temAtribuicao: boolean;
  funilSugerido: Funil | null;
  campanhaCanal?: string | null;
  leadExiste: boolean;
  imoveisDoLead: number[];
  imoveisMensagem: number[];
}): DecisaoEntrada {
  // Sem código: contato novo vira lead "WhatsApp direto" e segue com a IA (pagamento, prazo, uso);
  // quem já é lead continua a conversa normalmente
  if (!params.temAtribuicao) return params.leadExiste ? { acao: 'nenhuma' } : { acao: 'novo', funil: 'comprador', canal: 'whatsapp_direto' };
  const canal = params.campanhaCanal || 'whatsapp_direto';
  if (!params.leadExiste) return { acao: 'novo', funil: params.funilSugerido ?? 'comprador', canal };
  const novos = params.imoveisMensagem.filter(id => !params.imoveisDoLead.includes(id));
  return { acao: 'existente', imoveisNovos: novos, canal };
}

// ─── Idempotência por messageId (Z-API reenvia) ──────────────────────────────
const vistos = new Map<string, number>();
export function jaProcessada(messageId?: string | null, now = Date.now()): boolean {
  if (!messageId) return false;
  if (vistos.has(messageId)) return true;
  vistos.set(messageId, now);
  if (vistos.size > 5000) {
    for (const [k, t] of Array.from(vistos.entries())) if (now - t > 24 * 3600_000) vistos.delete(k);
  }
  return false;
}

/**
 * Idempotência no banco: vale entre reenvios da Z-API (quando a resposta demora) e entre cópias do servidor.
 * true = mensagem nova (pode processar); false = já recebida antes.
 */
let gravadas = 0;
export async function mensagemNova(messageId?: string | null): Promise<boolean> {
  if (!messageId) return true;
  const { getDb } = await import('../db');
  const { zapiMensagensVistas } = await import('../../drizzle/schema');
  const db = await getDb();
  if (!db) return !jaProcessada(messageId);
  try {
    await db.insert(zapiMensagensVistas).values({ messageId: String(messageId).slice(0, 120) });
  } catch (e: any) {
    const erro = `${e?.message ?? ''} ${e?.cause?.message ?? ''} ${e?.cause?.code ?? e?.code ?? ''}`;
    if (/Duplicate entry|ER_DUP_ENTRY|UNIQUE constraint|SQLITE_CONSTRAINT/i.test(erro)) return false;
    return !jaProcessada(messageId); // banco com problema: cai na memória deste processo
  }
  if (++gravadas % 500 === 0) {
    const { lt } = await import('drizzle-orm');
    await db.delete(zapiMensagensVistas).where(lt(zapiMensagensVistas.createdAt, new Date(Date.now() - 3 * 24 * 3600_000))).catch(() => {});
  }
  return true;
}

export type ResultadoEntrada = { acao: 'nenhuma' | 'atualizado' } | { acao: 'abertura'; mensagem: string; funil: Funil; empreendimento?: string | null };

export async function processarEntradaWhatsApp(input: { phone: string; texto: string; nome?: string | null; messageId?: string | null }): Promise<ResultadoEntrada> {
  if (jaProcessada(input.messageId)) return { acao: 'nenhuma' };
  const atrib = extrairAtribuicao(input.texto);
  const temAtribuicao = atrib.imovelCodigos.length > 0 || !!atrib.campanhaCodigo || !!atrib.funilSugerido;

  const phone = normalizePhoneBR(input.phone) || input.phone.replace(/\D/g, '');
  const { getDb } = await import('../db');
  const db = await getDb();
  if (!db) return { acao: 'nenhuma' };
  const { leadQualifications, leadCampanhas, leadInteresses, properties } = await import('../../drizzle/schema');

  const imoveis = atrib.imovelCodigos.length
    ? await db.select().from(properties).where(inArray(properties.codigo, atrib.imovelCodigos))
    : [];
  const [campanha] = atrib.campanhaCodigo
    ? await db.select().from(leadCampanhas).where(eq(leadCampanhas.codigo, atrib.campanhaCodigo)).limit(1)
    : [];
  const [lead] = await db.select().from(leadQualifications).where(eq(leadQualifications.phone, phone)).limit(1);
  if (lead?.blockedUntil && new Date(lead.blockedUntil).getTime() > Date.now()) return { acao: 'nenhuma' };

  const interessesAtuais = lead
    ? (await db.select({ propertyId: leadInteresses.propertyId }).from(leadInteresses).where(eq(leadInteresses.leadId, lead.id))).map((r: any) => r.propertyId)
    : [];
  const decisao = decidirEntrada({
    temAtribuicao,
    funilSugerido: (campanha?.funil as Funil) || atrib.funilSugerido,
    campanhaCanal: campanha?.canal,
    leadExiste: !!lead,
    imoveisDoLead: lead?.propertyId ? Array.from(new Set([lead.propertyId, ...interessesAtuais])) : interessesAtuais,
    imoveisMensagem: imoveis.map((i: any) => i.id),
  });
  if (decisao.acao === 'nenhuma') return { acao: 'nenhuma' };

  const now = new Date();
  const resumo = (p: any): ImovelResumo => ({
    id: p.id, codigo: p.codigo, titulo: p.denomination, cidade: p.city,
    areaM2: p.areaTerreno ? Number(p.areaTerreno) : null, preco: p.price ? Number(p.price) : null,
    exibirPreco: p.exibirPreco !== false && p.exibirPreco !== 0, publicSlug: p.publicSlug,
  });
  const imovelPrincipal = imoveis[0] ? resumo(imoveis[0]) : null;
  const nome = (input.nome || '').trim() || 'Cliente';
  const campanhaLabel = campanha?.codigo || atrib.campanhaCodigo || null;
  // Campanha ligada a empreendimento (ex.: BJ-IG-PAGO → Bom Jardims): atendimento humano, sem bot genérico
  const empSlug: string | null = campanha?.empreendimentoSlug || null;
  let empreendimento: { slug: string; nome: string | null } | null = null;
  if (empSlug) {
    const { nomeDoEmpreendimento } = await import('./listaComunicacao');
    empreendimento = { slug: empSlug, nome: await nomeDoEmpreendimento(empSlug) };
  }

  const gravarInteresses = async (leadId: number, ids: number[]) => {
    for (const propertyId of ids) {
      await db.insert(leadInteresses).values({ leadId, propertyId, campanhaId: campanha?.id ?? null }).catch(() => {});
    }
  };

  if (decisao.acao === 'novo') {
    const funil = decisao.funil;
    const inserted: any = await db.insert(leadQualifications).values({
      phone,
      nome,
      answers: { nome } as any,
      funil,
      origem: 'whatsapp',
      origemCanal: decisao.canal,
      origemCampanhaId: campanha?.id ?? null,
      ultimoCanal: decisao.canal,
      ultimaCampanhaId: campanha?.id ?? null,
      campanhaOrigem: campanha?.nome || campanhaLabel,
      propertyId: imovelPrincipal?.id ?? null,
      empreendimentoSlug: empSlug,
      // Comprador: bot de qualificação espera a resposta à abordagem. Proprietário e empreendimento: humano.
      stage: funil === 'proprietario' ? 'atendimento_humano' : empSlug ? 'novo_lead' : 'abordagem_enviada',
      score: 'frio',
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    } as any);
    const leadId = Number(inserted?.[0]?.insertId ?? inserted?.lastInsertRowid);
    if (leadId) await gravarInteresses(leadId, imoveis.map((i: any) => i.id));
    // Novo lead: sininho, aviso na tela e push (admin, secretária e o corretor responsável)
    const { avisarNovoLead } = await import('../notificacoes');
    avisarNovoLead({ leadId, phone });
    // Quem clicou no botão do WhatsApp da landing nos últimos 30 min vira este lead
    if (leadId) {
      const { vincularPorCliqueWhatsApp } = await import('./rastreio');
      await vincularPorCliqueWhatsApp(leadId, imoveis.map((i: any) => i.id), now).catch(() => null);
    }
    const { recalcularScoreLead } = await import('./scoreService');
    const sc = leadId ? await recalcularScoreLead(leadId, { motivo: 'lead_novo_whatsapp', leadNovo: true, notificar: false }).catch(() => null) : null;

    await notificarLead({
      tipo: 'novo_lead', leadId, nome, telefone: phone, funil, score: sc?.score ?? null, classe: sc?.classe ?? null,
      imovel: imovelPrincipal
        ? { codigo: imovelPrincipal.codigo, titulo: imovelPrincipal.titulo, preco: imovelPrincipal.exibirPreco ? imovelPrincipal.preco : null }
        : empreendimento ? { codigo: null, titulo: empreendimento.nome || empreendimento.slug, preco: null } : null,
      imovelProprietario: funil === 'proprietario' ? 'detalhes a confirmar na conversa' : null,
      origem: rotuloCanal(decisao.canal), campanhaCodigo: campanhaLabel,
      detalhes: empreendimento ? ['👤 Atendimento humano: responda você pelo WhatsApp do CRM (o bot não pergunta renda/FGTS)'] : undefined,
      empreendimento: !!empreendimento,
    }).catch(e => console.warn('[Entrada] Aviso falhou (não crítico):', e?.message));

    console.log(`[Entrada] Novo lead ${phone} funil=${funil} canal=${decisao.canal} imóveis=${atrib.imovelCodigos.join(',') || '-'} campanha=${campanhaLabel || '-'}`);
    return { acao: 'abertura', mensagem: montarAbertura({ funil, nome, imovel: imovelPrincipal, empreendimento }), funil, empreendimento: empSlug };
  }

  // Lead existente: 1º toque fica; último toque e interesses novos
  await db.update(leadQualifications).set({
    ultimoCanal: decisao.canal,
    ...(campanha ? { ultimaCampanhaId: campanha.id } : {}),
    ...(!lead.propertyId && imovelPrincipal ? { propertyId: imovelPrincipal.id } : {}),
    // Voltou por campanha de empreendimento: passa para o atendimento dele
    ...(!lead.empreendimentoSlug && empSlug ? { empreendimentoSlug: empSlug } : {}),
    updatedAt: now,
  } as any).where(and(eq(leadQualifications.id, lead.id)));

  if (decisao.imoveisNovos.length) {
    await gravarInteresses(lead.id, decisao.imoveisNovos);
    const novo = imoveis.find((i: any) => i.id === decisao.imoveisNovos[0]);
    const r = novo ? resumo(novo) : null;
    await notificarLead({
      tipo: 'recorrente', leadId: lead.id, nome: lead.nome || nome, telefone: phone,
      funil: (lead.funil as Funil) || 'comprador', score: lead.leadScore, classe: lead.score as any,
      imovel: r ? { codigo: r.codigo, titulo: r.titulo, preco: r.exibirPreco ? r.preco : null } : null,
      origem: rotuloCanal(decisao.canal), campanhaCodigo: campanhaLabel,
    }).catch(e => console.warn('[Entrada] Aviso falhou (não crítico):', e?.message));
  }
  return { acao: 'atualizado' };
}

const CANAL_LABEL: Record<string, string> = {
  meta_ctwa: 'Anúncio Click-to-WhatsApp', meta_leadads: 'Meta Lead Ads', google_ads: 'Google Ads',
  portal_olx: 'OLX', portal_zap: 'ZAP Imóveis', portal_vivareal: 'VivaReal', instagram_organico: 'Instagram orgânico',
  placa_qr: 'QR da placa', site: 'Site', busca_organica: 'Google/busca orgânica',
  facebook_organico: 'Facebook orgânico', outras_redes: 'Outras redes (YouTube, TikTok…)', indicacao: 'Indicação', wifi: 'Wi-Fi', whatsapp_direto: 'WhatsApp direto', outro: 'Outro',
};
export function rotuloCanal(canal: string): string {
  return CANAL_LABEL[canal] || canal;
}
export const CANAIS_CAMPANHA = Object.keys(CANAL_LABEL).filter(c => c !== 'whatsapp_direto');

// ─── WhatsApp direto: contato novo sem código (viu o número na placa, folder, status…) ──
// O bot de sempre responde; logo depois o lead ganha a origem "WhatsApp direto",
// o José recebe o aviso e ele passa a contar no relatório como orgânico.

/** Regra pura: o que fazer com a linha do lead depois da 1ª resposta do bot */
export function acaoWhatsappDireto(lead: { origemCanal?: string | null } | null | undefined): 'inserir' | 'marcar' | 'nada' {
  if (!lead) return 'inserir';          // o bot não gravou (banco instável): cria a linha
  if (lead.origemCanal) return 'nada';  // já tem origem (captação, formulário, Meta)
  return 'marcar';
}

/** Antes do bot: este telefone ainda não tem lead? (só contato novo vira "WhatsApp direto") */
export async function ehContatoNovo(phone: string): Promise<boolean> {
  const { getDb } = await import('../db');
  const db = await getDb();
  if (!db) return false;
  const { leadQualifications } = await import('../../drizzle/schema');
  const fones = Array.from(new Set([phone.replace(/\D/g, ''), normalizePhoneBR(phone) || ''].filter(Boolean)));
  const [lead] = await db.select({ id: leadQualifications.id }).from(leadQualifications).where(inArray(leadQualifications.phone, fones)).limit(1);
  return !lead;
}

/** Depois da 1ª resposta do bot: origem WhatsApp direto + conversa + aviso */
export async function registrarWhatsappDireto(input: { phone: string; nome?: string | null; texto: string; resposta?: string | null; modo?: 'ia' | 'bot' }): Promise<boolean> {
  const modoIa = input.modo === 'ia';
  const { getDb } = await import('../db');
  const db = await getDb();
  if (!db) return false;
  const { leadQualifications, contacts } = await import('../../drizzle/schema');
  const phone = input.phone.replace(/\D/g, '');
  const nome = (input.nome || '').trim() || 'Cliente';
  const now = new Date();
  const [lead]: any[] = await db.select().from(leadQualifications).where(eq(leadQualifications.phone, phone)).limit(1);
  const acao = acaoWhatsappDireto(lead);
  if (acao === 'nada') return false;

  // Modo IA: criado antes da 1ª resposta, a IA conduz desde o início.
  // Modo bot: o roteiro de perguntas que já começou segue até o fim (a IA não assume no meio).
  const origem = { origemCanal: 'whatsapp_direto', ultimoCanal: 'whatsapp_direto', modoQualificacao: modoIa ? 'ia' : 'bot', funil: 'comprador' };
  let leadId: number;
  if (acao === 'marcar') {
    await db.update(leadQualifications).set({ ...origem, updatedAt: now } as any).where(eq(leadQualifications.id, lead.id));
    leadId = lead.id;
  } else {
    const r: any = await db.insert(leadQualifications).values({
      phone, nome, answers: { nome } as any, origem: 'whatsapp', ...origem, stage: 'qual_etapa_1', score: 'frio',
      lastActivityAt: now, createdAt: now, updatedAt: now,
    } as any);
    leadId = Number(r?.[0]?.insertId ?? r?.lastInsertRowid ?? 0);
    const { avisarNovoLead } = await import('../notificacoes');
    avisarNovoLead({ leadId, phone });
  }

  // No modo IA a própria qualificação grava a mensagem e a resposta
  if (!modoIa) {
    try {
      const { registrarMensagemPorTelefone } = await import('./qualificacaoService');
      await registrarMensagemPorTelefone(phone, 'in', 'lead', input.texto);
      if (input.resposta) await registrarMensagemPorTelefone(phone, 'out', 'bot', input.resposta);
    } catch { /* conversa é só contexto */ }
  }

  const [contato] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.phone, phone)).limit(1).catch(() => [] as any[]);
  const primeira = input.texto.replace(/\s+/g, ' ').trim().slice(0, 120);
  await notificarLead({
    tipo: 'novo_lead', leadId, nome: lead?.nome || nome, telefone: phone, funil: 'comprador',
    origem: rotuloCanal('whatsapp_direto'),
    detalhes: [
      ...(primeira ? [`💬 1ª mensagem: "${primeira}"`] : []),
      contato ? '📇 Já estava na base de contatos' : '🆕 Contato novo (sem código de imóvel ou campanha)',
      modoIa ? '🤖 A assistente (IA) está atendendo' : '🤖 O bot de qualificação já respondeu',
    ],
  }).catch(e => console.warn('[Entrada] Aviso falhou (não crítico):', e?.message));

  console.log(`[Entrada] Novo lead ${phone} canal=whatsapp_direto (${acao === 'marcar' ? 'criado pelo bot' : 'criado aqui'})`);
  return true;
}
