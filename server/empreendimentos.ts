/**
 * Empreendimentos (loteamentos / condomínios de chácaras) — leitura pública.
 *
 * REGRA: preço só sai daqui se empreendimentos.precosPublicos = true.
 * Enquanto a trava estiver ligada, nenhum campo de valor chega ao navegador.
 */

import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { empreendimentos, lotes, type Empreendimento, type Lote } from '../drizzle/schema';

export type LoteStatusPublico = 'disponivel' | 'reservado' | 'em_negociacao' | 'vendido' | 'nao_comercializavel';

export interface LotePublico {
  codigo: string;
  quadra: string | null;
  numero: number | null;
  areaM2: number | null;
  status: LoteStatusPublico;
  precoAvista?: number;
  precoFinanciado?: number;
}

export interface EmpreendimentoPublico {
  slug: string;
  nome: string;
  fase: string;
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  lat: number | null;
  lon: number | null;
  areaHa: number | null;
  totalLotes: number | null;
  lotesComercializaveis: number | null;
  precosPublicos: boolean;
  lotes: LotePublico[];
  resumo: Record<LoteStatusPublico, number>;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/** Reserva vencida volta a aparecer como disponível (a regra de expiração completa fica na Etapa D) */
export function statusEfetivo(lote: Pick<Lote, 'status' | 'reservadoAte' | 'comercializavel'>, now: Date): LoteStatusPublico {
  if (!lote.comercializavel) return 'nao_comercializavel';
  if (lote.status === 'reservado' && lote.reservadoAte && new Date(lote.reservadoAte).getTime() < now.getTime()) {
    return 'disponivel';
  }
  return lote.status as LoteStatusPublico;
}

export function toLotePublico(lote: Lote, precosPublicos: boolean, now: Date): LotePublico {
  const out: LotePublico = {
    codigo: lote.codigo,
    quadra: lote.quadra,
    numero: lote.numero,
    areaM2: num(lote.areaM2),
    status: statusEfetivo(lote, now),
  };
  if (precosPublicos && out.status !== 'nao_comercializavel') {
    const avista = num(lote.precoAvistaRef);
    const financiado = num(lote.precoFinanciadoRef);
    if (avista) out.precoAvista = avista;
    if (financiado) out.precoFinanciado = financiado;
  }
  return out;
}

export function toEmpreendimentoPublico(emp: Empreendimento, rows: Lote[], now: Date = new Date()): EmpreendimentoPublico {
  const precosPublicos = !!emp.precosPublicos;
  const lotesPublicos = rows
    .map(l => toLotePublico(l, precosPublicos, now))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const resumo: Record<LoteStatusPublico, number> = {
    disponivel: 0, reservado: 0, em_negociacao: 0, vendido: 0, nao_comercializavel: 0,
  };
  for (const l of lotesPublicos) resumo[l.status]++;
  return {
    slug: emp.slug,
    nome: emp.nome,
    fase: emp.fase,
    municipio: emp.municipio,
    uf: emp.uf,
    endereco: emp.endereco,
    lat: num(emp.lat),
    lon: num(emp.lon),
    areaHa: num(emp.areaHa),
    totalLotes: emp.totalLotes,
    lotesComercializaveis: emp.lotesComercializaveis,
    precosPublicos,
    lotes: lotesPublicos,
    resumo,
  };
}

export async function getEmpreendimentoPublico(slug: string): Promise<EmpreendimentoPublico | null> {
  const db = await getDb();
  if (!db) return null;
  const [emp] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) return null;
  const rows = await db.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  return toEmpreendimentoPublico(emp, rows);
}

/** Lote existe e pode ser vendido? (usado para validar a chácara escolhida no formulário) */
export async function loteComercializavel(slug: string, codigo: string): Promise<boolean> {
  const emp = await getEmpreendimentoPublico(slug);
  const lote = emp?.lotes.find(l => l.codigo === codigo);
  return !!lote && lote.status !== 'nao_comercializavel';
}
