/**
 * Relatório por canal e campanha (§12.4) — agregações puras (sem banco).
 * O router carrega as linhas do período e chama montarRelatorio.
 */
import type { Funil } from './atribuicao';
import { etapaDoLead } from './kanban';
import { slotsPendentes, tipoImovelDe, valoresSlots, type SlotsLead } from './slots';
import { rotuloCanal } from './inbound';
import { canalDaOrigem, type LeadOrigem } from '../lead-intake';

export type Toque = 'primeiro' | 'ultimo';

/** Data do filtro do período (input type="date"): AAAA-MM-DD */
export const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
export type TipoCanal = 'pago' | 'organico' | 'outro';

const PAGOS = ['meta_ctwa', 'meta_leadads', 'google_ads'];
const ORGANICOS = ['instagram_organico', 'placa_qr', 'site', 'indicacao', 'whatsapp_direto', 'busca_organica', 'facebook_organico', 'outras_redes'];

export function tipoDoCanal(canal: string): TipoCanal {
  if (PAGOS.includes(canal)) return 'pago';
  if (ORGANICOS.includes(canal)) return 'organico';
  return 'outro';
}

export const ROTULO_TIPO_CANAL: Record<TipoCanal, string> = { pago: 'Pago', organico: 'Orgânico', outro: 'Portais e outros' };

export interface LeadRel {
  id: number;
  funil?: string | null;
  origem?: string | null;
  origemCanal?: string | null;
  origemCampanhaId?: number | null;
  ultimoCanal?: string | null;
  ultimaCampanhaId?: number | null;
  propertyId?: number | null;
  etapa?: string | null;
  stage?: string | null;
  score?: string | null;
  slots?: SlotsLead | null;
  createdAt: Date | string;
  /** Prazo de atendimento humano (server/leads/sla.ts) */
  responsavelId?: number | null;
  aguardandoCorretorDesde?: Date | string | null;
  atendidoAt?: Date | string | null;
}

export interface CampanhaRel { id: number; codigo: string; nome: string; canal: string; gastoTotal?: string | number | null }
export interface EventoRel { tipo: string; campanhaId?: number | null; propertyId?: number | null; leadId?: number | null }
export interface MensagemRel { leadId: number; direcao: string; createdAt: Date | string }
export interface ImovelRel { id: number; codigo?: string | null; denomination: string; propertyType?: string | null }

/** Canal do lead no toque escolhido; leads anteriores à captação v1 usam a coluna origem */
export function canalDoLead(l: LeadRel, toque: Toque = 'primeiro'): string {
  const legado = l.origem ? canalDaOrigem(l.origem as LeadOrigem) : 'whatsapp_direto';
  const primeiro = l.origemCanal || legado;
  return toque === 'ultimo' ? l.ultimoCanal || primeiro : primeiro;
}

export function campanhaDoLead(l: LeadRel, toque: Toque = 'primeiro'): number | null {
  return (toque === 'ultimo' ? l.ultimaCampanhaId ?? l.origemCampanhaId : l.origemCampanhaId) ?? null;
}

export interface SinaisLead { comImovel: boolean; completa: boolean; quente: boolean; visita: boolean; visitou: boolean; proposta: boolean; fechado: boolean }

export function sinaisDoLead(l: LeadRel, comInteresse: boolean, tipoImovel?: string | null, realizouVisita = false): SinaisLead {
  const funil: Funil = l.funil === 'proprietario' ? 'proprietario' : 'comprador';
  const etapa = etapaDoLead(l);
  return {
    comImovel: !!l.propertyId || comInteresse,
    completa: slotsPendentes(funil, l.slots, { tipoImovel }).length === 0,
    quente: l.score === 'quente',
    visita: realizouVisita || ['visita_agendada', 'visitou', 'proposta', 'fechado'].includes(etapa) || valoresSlots(l.slots).quer_visita === 'sim',
    // Visita realizada: registrada na agenda, ou o lead já passou dela no funil
    visitou: realizouVisita || ['visitou', 'proposta', 'fechado'].includes(etapa),
    proposta: ['proposta', 'fechado'].includes(etapa),
    fechado: etapa === 'fechado',
  };
}

export interface Contagem {
  leads: number; comImovel: number; completa: number; quentes: number; visitas: number; visitasRealizadas: number; propostas: number; fechados: number;
  cliques: number; scans: number; views: number;
  gasto: number; custoPorQuente: number | null; custoPorVisita: number | null; custoPorVenda: number | null;
}

const zerada = (): Contagem => ({
  leads: 0, comImovel: 0, completa: 0, quentes: 0, visitas: 0, visitasRealizadas: 0, propostas: 0, fechados: 0,
  cliques: 0, scans: 0, views: 0, gasto: 0, custoPorQuente: null, custoPorVisita: null, custoPorVenda: null,
});

function somarLead(c: Contagem, s: SinaisLead) {
  c.leads++;
  if (s.comImovel) c.comImovel++;
  if (s.completa) c.completa++;
  if (s.quente) c.quentes++;
  if (s.visita) c.visitas++;
  if (s.visitou) c.visitasRealizadas++;
  if (s.proposta) c.propostas++;
  if (s.fechado) c.fechados++;
}

function somarEvento(c: Contagem, tipo: string) {
  if (tipo === 'clique_whatsapp') c.cliques++;
  else if (tipo === 'scan_qr') c.scans++;
  else if (tipo === 'view_imovel') c.views++;
}

function fechar(c: Contagem): Contagem {
  c.gasto = Math.round(c.gasto * 100) / 100;
  const custo = (n: number) => (c.gasto > 0 && n > 0 ? Math.round((c.gasto / n) * 100) / 100 : null);
  c.custoPorQuente = custo(c.quentes);
  c.custoPorVisita = custo(c.visitasRealizadas);
  c.custoPorVenda = custo(c.fechados);
  return c;
}

/** % inteira (0 quando não há leads) */
export const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

/** Minutos entre a 1ª mensagem nossa e a 1ª resposta do lead depois dela; null sem resposta */
export function minutosAte1aResposta(msgs: MensagemRel[]): number | null {
  const ord = [...msgs].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const out = ord.find(m => m.direcao === 'out');
  if (!out) return null;
  const tOut = +new Date(out.createdAt);
  const resp = ord.find(m => m.direcao === 'in' && +new Date(m.createdAt) > tOut);
  return resp ? (+new Date(resp.createdAt) - tOut) / 60000 : null;
}

/** Percentil (0–100) por "nearest rank"; null com lista vazia */
export function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null;
  const ord = [...valores].sort((a, b) => a - b);
  return ord[Math.min(ord.length - 1, Math.max(0, Math.ceil((p / 100) * ord.length) - 1))];
}

/** Minutos que o lead esperou um corretor (alerta de 5 min); null se nunca precisou ou ainda espera */
export function minutosDeAtendimento(l: Pick<LeadRel, 'aguardandoCorretorDesde' | 'atendidoAt'>): number | null {
  if (!l.aguardandoCorretorDesde || !l.atendidoAt) return null;
  const m = (+new Date(l.atendidoAt) - +new Date(l.aguardandoCorretorDesde)) / 60000;
  return Number.isFinite(m) && m >= 0 ? Math.round(m) : null;
}

export interface LinhaCorretor {
  responsavelId: number | null; nome: string;
  leads: number; visitasRealizadas: number; fechados: number;
  atendidos: number; esperando: number; medianaMin: number | null; p90Min: number | null;
}

export interface Atendimento {
  /** Leads que pediram corretor e foram atendidos / ainda esperando */
  atendidos: number; esperando: number;
  medianaMin: number | null; p90Min: number | null;
  /** % atendidos em até 5 minutos */
  ate5min: number;
  porCorretor: LinhaCorretor[];
}

export interface LinhaCanal extends Contagem { canal: string; rotulo: string; tipo: TipoCanal }
export interface LinhaCampanha extends Contagem { campanhaId: number | null; codigo: string; nome: string; canal: string; rotuloCanal: string; tipo: TipoCanal }
export interface LinhaTipo extends Contagem { tipo: TipoCanal; rotulo: string }
export interface LinhaImovel { propertyId: number; codigo: string | null; titulo: string; leads: number; quentes: number }

export interface Relatorio {
  toque: Toque;
  total: Contagem;
  porTipo: LinhaTipo[];
  porCanal: LinhaCanal[];
  porCampanha: LinhaCampanha[];
  imoveis: LinhaImovel[];
  tempoMedioRespostaMin: number | null;
  leadsComResposta: number;
  atendimento: Atendimento;
}

export interface EntradaRelatorio {
  leads: LeadRel[];
  campanhas: CampanhaRel[];
  /** leadId → propertyIds de leadInteresses */
  interesses: Map<number, number[]>;
  eventos: EventoRel[];
  mensagens: MensagemRel[];
  imoveis: ImovelRel[];
  toque?: Toque;
  /** Leads com visita marcada como realizada na agenda */
  visitasRealizadas?: Set<number>;
  /** users.id → nome (por corretor) */
  responsaveis?: Map<number, string>;
}

export function montarRelatorio(e: EntradaRelatorio): Relatorio {
  const toque = e.toque ?? 'primeiro';
  const campPorId = new Map(e.campanhas.map(c => [c.id, c]));
  const imovelPorId = new Map(e.imoveis.map(i => [i.id, i]));
  const total = zerada();
  const porTipo = new Map<TipoCanal, Contagem>();
  const porCanal = new Map<string, Contagem>();
  // Lead/evento sem campanha fica numa linha "sem código" por canal
  const porCamp = new Map<string, { id: number | null; c: Contagem; canal: string }>();
  const porImovel = new Map<number, { leads: number; quentes: number }>();
  const porCorretor = new Map<number | null, { leads: number; visitasRealizadas: number; fechados: number; tempos: number[]; esperando: number }>();
  const pega = <K,>(m: Map<K, Contagem>, k: K) => { let c = m.get(k); if (!c) { c = zerada(); m.set(k, c); } return c; };
  const pegaCamp = (id: number | null, canal: string) => {
    const k = id != null ? `c${id}` : `s:${canal}`;
    let x = porCamp.get(k);
    if (!x) { x = { id, c: zerada(), canal }; porCamp.set(k, x); }
    return x.c;
  };

  for (const l of e.leads) {
    const camp = campanhaDoLead(l, toque);
    const campanha = camp != null ? campPorId.get(camp) : undefined;
    const canal = canalDoLead(l, toque);
    const interesses = e.interesses.get(l.id) ?? [];
    const imovelId = l.propertyId ?? interesses[0] ?? null;
    const s = sinaisDoLead(l, interesses.length > 0, tipoImovelDe(imovelId ? imovelPorId.get(imovelId)?.propertyType : null), !!e.visitasRealizadas?.has(l.id));
    somarLead(total, s);
    const rid = l.responsavelId ?? null;
    const cor = porCorretor.get(rid) ?? { leads: 0, visitasRealizadas: 0, fechados: 0, tempos: [] as number[], esperando: 0 };
    cor.leads++;
    if (s.visitou) cor.visitasRealizadas++;
    if (s.fechado) cor.fechados++;
    const espera = minutosDeAtendimento(l);
    if (espera != null) cor.tempos.push(espera);
    else if (l.aguardandoCorretorDesde && !l.atendidoAt) cor.esperando++;
    porCorretor.set(rid, cor);
    somarLead(pega(porTipo, tipoDoCanal(canal)), s);
    somarLead(pega(porCanal, canal), s);
    somarLead(pegaCamp(campanha ? campanha.id : null, campanha?.canal ?? canal), s);
    for (const pid of Array.from(new Set([...(l.propertyId ? [l.propertyId] : []), ...interesses]))) {
      const r = porImovel.get(pid) ?? { leads: 0, quentes: 0 };
      r.leads++; if (s.quente) r.quentes++;
      porImovel.set(pid, r);
    }
  }

  // Cliques, QR e visitas à landing contam por campanha (inclusive de quem não virou lead)
  for (const ev of e.eventos) {
    const campanha = ev.campanhaId != null ? campPorId.get(ev.campanhaId) : undefined;
    const canal = campanha?.canal ?? (ev.tipo === 'scan_qr' ? 'placa_qr' : 'site');
    for (const c of [total, pega(porTipo, tipoDoCanal(canal)), pega(porCanal, canal), pegaCamp(campanha ? campanha.id : null, canal)]) somarEvento(c, ev.tipo);
  }

  // Gasto: total cadastrado de cada campanha (vale para a campanha toda, não só o período)
  for (const c of e.campanhas) {
    const g = Number(c.gastoTotal) || 0;
    if (!g) continue;
    total.gasto += g;
    pega(porTipo, tipoDoCanal(c.canal)).gasto += g;
    pega(porCanal, c.canal).gasto += g;
    pegaCamp(c.id, c.canal).gasto += g;
  }

  // Tempo até a 1ª resposta, entre os leads do período
  const idsPeriodo = new Set(e.leads.map(l => l.id));
  const msgsPorLead = new Map<number, MensagemRel[]>();
  for (const m of e.mensagens) {
    if (!idsPeriodo.has(m.leadId)) continue;
    const arr = msgsPorLead.get(m.leadId) ?? [];
    arr.push(m); msgsPorLead.set(m.leadId, arr);
  }
  const tempos = Array.from(msgsPorLead.values()).map(minutosAte1aResposta).filter((t): t is number => t != null);

  const ordem = (a: Contagem, b: Contagem) => b.quentes - a.quentes || b.leads - a.leads || b.cliques - a.cliques;
  return {
    toque,
    total: fechar(total),
    porTipo: Array.from(porTipo, ([tipo, c]) => ({ tipo, rotulo: ROTULO_TIPO_CANAL[tipo], ...fechar(c) })).sort(ordem),
    porCanal: Array.from(porCanal, ([canal, c]) => ({ canal, rotulo: rotuloCanal(canal), tipo: tipoDoCanal(canal), ...fechar(c) })).sort(ordem),
    porCampanha: Array.from(porCamp.values(), ({ id, c, canal }) => {
      const camp = id != null ? campPorId.get(id) : undefined;
      return {
        campanhaId: id, codigo: camp?.codigo ?? '—', nome: camp?.nome ?? `Sem código — ${rotuloCanal(canal)}`,
        canal, rotuloCanal: rotuloCanal(canal), tipo: tipoDoCanal(canal), ...fechar(c),
      };
    }).filter(r => r.leads || r.cliques || r.scans || r.views || r.gasto).sort(ordem),
    imoveis: Array.from(porImovel, ([pid, r]) => {
      const p = imovelPorId.get(pid);
      return { propertyId: pid, codigo: p?.codigo ?? null, titulo: p?.denomination ?? `Imóvel ${pid}`, ...r };
    }).sort((a, b) => b.quentes - a.quentes || b.leads - a.leads),
    tempoMedioRespostaMin: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
    leadsComResposta: tempos.length,
    atendimento: (() => {
      const todos = Array.from(porCorretor.values()).flatMap(c => c.tempos);
      return {
        atendidos: todos.length,
        esperando: Array.from(porCorretor.values()).reduce((a, c) => a + c.esperando, 0),
        medianaMin: percentil(todos, 50), p90Min: percentil(todos, 90),
        ate5min: pct(todos.filter(t => t <= 5).length, todos.length),
        porCorretor: Array.from(porCorretor, ([rid, c]) => ({
          responsavelId: rid, nome: rid != null ? e.responsaveis?.get(rid) ?? `Usuário ${rid}` : 'Sem responsável',
          leads: c.leads, visitasRealizadas: c.visitasRealizadas, fechados: c.fechados,
          atendidos: c.tempos.length, esperando: c.esperando, medianaMin: percentil(c.tempos, 50), p90Min: percentil(c.tempos, 90),
        })).sort((a, b) => b.leads - a.leads),
      };
    })(),
  };
}

const cel = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const brl = (n: number | null) => (n == null ? '' : n.toFixed(2).replace('.', ','));

/** CSV (separador ;, padrão do Excel em pt-BR) da tabela por campanha */
export function relatorioCsv(r: Relatorio): string {
  const cab = ['Campanha', 'Nome', 'Canal', 'Tipo', 'Leads', '% com imóvel', '% qualificação completa', 'Quentes', 'Pediram/agendaram visita', 'Visitas realizadas', 'Propostas', 'Vendas', 'Cliques WhatsApp', 'Scans QR', 'Visitas à página', 'Gasto (R$)', 'Custo por lead quente (R$)', 'Custo por visita realizada (R$)', 'Custo por venda (R$)'];
  const linhas = r.porCampanha.map(c => [
    c.codigo, c.nome, c.rotuloCanal, ROTULO_TIPO_CANAL[c.tipo], c.leads, pct(c.comImovel, c.leads), pct(c.completa, c.leads),
    c.quentes, c.visitas, c.visitasRealizadas, c.propostas, c.fechados, c.cliques, c.scans, c.views, brl(c.gasto), brl(c.custoPorQuente), brl(c.custoPorVisita), brl(c.custoPorVenda),
  ]);
  return '﻿' + [cab, ...linhas].map(l => l.map(cel).join(';')).join('\r\n');
}
