/**
 * Kanban por funil (§12.1) — regras puras (sem banco).
 * A coluna fica em leadQualifications.etapa; enquanto ninguém mover o card,
 * ela é deduzida do stage do bot de qualificação.
 */
import type { Funil } from './atribuicao';
import { tipoImovelDe, valoresSlots, type SlotsLead } from './slots';

export const ETAPAS: Record<Funil, readonly string[]> = {
  comprador: ['novo', 'qualificando', 'qualificado', 'visita_agendada', 'visitou', 'proposta', 'fechado', 'perdido'],
  proprietario: ['novo', 'qualificando', 'avaliacao', 'exclusividade', 'captado', 'perdido'],
};

export const ROTULO_ETAPA: Record<string, string> = {
  novo: 'Novo', qualificando: 'Qualificando', qualificado: 'Qualificado', visita_agendada: 'Visita agendada',
  visitou: 'Visitou', proposta: 'Proposta', fechado: 'Fechado', perdido: 'Perdido',
  avaliacao: 'Avaliação', exclusividade: 'Exclusividade', captado: 'Captado',
};

export const MOTIVOS_PERDA = ['sem_credito', 'comprou_outro', 'preco', 'sem_resposta', 'curioso', 'outro'] as const;
export const ROTULO_MOTIVO: Record<string, string> = {
  sem_credito: 'Sem crédito', comprou_outro: 'Comprou outro', preco: 'Preço', sem_resposta: 'Sem resposta', curioso: 'Curioso', outro: 'Outro',
};

/** Etapa do kanban: a escolhida no painel ou a deduzida do stage do bot */
export function etapaDoLead(lead: { etapa?: string | null; stage?: string | null; funil?: string | null }): string {
  const funil: Funil = lead.funil === 'proprietario' ? 'proprietario' : 'comprador';
  if (lead.etapa && ETAPAS[funil].includes(lead.etapa)) return lead.etapa;
  const s = String(lead.stage || '');
  if (s === 'descartado' || s === 'sem_interesse') return 'perdido';
  if (funil === 'proprietario') return s === 'atendimento_humano' || !s || s === 'nao_iniciado' ? 'novo' : 'qualificando';
  if (s.startsWith('qual_etapa') || s === 'atendimento_humano') return 'qualificando';
  if (s === 'qualificado' || s === 'proposta_enviada') return 'qualificado';
  if (s === 'visita_agendada') return 'visita_agendada';
  if (s === 'concluido') return 'fechado';
  return 'novo';
}

export type MovimentoInvalido = { ok: false; erro: string };
export function validarMovimento(funil: Funil, etapa: string, motivoPerda?: string | null): { ok: true } | MovimentoInvalido {
  if (!ETAPAS[funil].includes(etapa)) return { ok: false, erro: `Etapa "${etapa}" não existe no funil ${funil}` };
  if (etapa === 'perdido') {
    if (!motivoPerda) return { ok: false, erro: 'Informe o motivo da perda' };
    const base = motivoPerda.split(':')[0];
    if (!(MOTIVOS_PERDA as readonly string[]).includes(base)) return { ok: false, erro: 'Motivo de perda inválido' };
  }
  return { ok: true };
}

export interface ImovelCarteira {
  id: number;
  codigo: string | null;
  denomination: string;
  propertyType?: string | null;
  price?: number | string | null;
  status?: string | null;
}

/** Imóvel similar da carteira: mesmo tipo e preço ±20% (o mais próximo), fora os já enviados */
export function escolherSimilar(base: ImovelCarteira, carteira: ImovelCarteira[], jaEnviados: number[] = []): ImovelCarteira | null {
  const tipo = tipoImovelDe(base.propertyType);
  const preco = Number(base.price) || 0;
  const candidatos = carteira.filter(p =>
    p.id !== base.id && !jaEnviados.includes(p.id) && (p.status ?? 'available') === 'available' &&
    (!tipo || tipoImovelDe(p.propertyType) === tipo) &&
    (!preco || (Number(p.price) >= preco * 0.8 && Number(p.price) <= preco * 1.2)),
  );
  candidatos.sort((a, b) => Math.abs(Number(a.price) - preco) - Math.abs(Number(b.price) - preco));
  return candidatos[0] ?? null;
}

const ROTULO_TIPO: Record<string, string> = {
  lote_urbano: 'Lote', casa: 'Casa', chacara: 'Chácara', condominio: 'Condomínio', rural: 'Fazenda/Área rural', comercial: 'Comercial', galpao: 'Galpão',
};

/** Proprietário captado → dados para o cadastro do imóvel (sem preço público até o José definir) */
export function imovelDoProprietario(lead: { nome?: string | null; slots?: SlotsLead | null }) {
  const s = valoresSlots(lead.slots);
  const tipo = ROTULO_TIPO[s.tipo_imovel] || 'Imóvel';
  const local = s.localizacao || 'Localização a confirmar';
  return {
    denomination: `${tipo} — ${local}`.slice(0, 255),
    address: local,
    propertyType: tipo,
    price: s.valor_pretendido ? String(Number(s.valor_pretendido)) : '0',
    description: [
      `Captado de ${lead.nome || 'proprietário'} pelo CRM.`,
      s.area ? `Área: ${s.area}.` : '',
      s.documentacao ? `Documentação: ${s.documentacao.replace(/_/g, ' ')}.` : '',
    ].filter(Boolean).join(' '),
    exibirPreco: false,
    status: 'inactive' as const, // entra inativo: o José revisa fotos e preço antes de publicar
  };
}

/** Resumo do imóvel do proprietário para o card e o aviso */
export function resumoProprietario(slots: SlotsLead | null | undefined): string | null {
  const s = valoresSlots(slots);
  const partes = [ROTULO_TIPO[s.tipo_imovel], s.localizacao, s.area, s.documentacao ? `Doc: ${s.documentacao.replace(/_/g, ' ')}` : ''].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}
