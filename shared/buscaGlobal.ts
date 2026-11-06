/**
 * Busca única (lupa no topo / Ctrl+K): uma caixa para achar lead, comprador, contrato, chácara, imóvel, corretor,
 * material ou tela do sistema. Regras puras: normalizar o termo e ordenar os resultados pela qualidade do acerto.
 */

export const TIPOS_BUSCA = ['lead', 'cliente', 'contrato', 'chacara', 'imovel', 'equipe', 'material'] as const;
export type TipoBusca = typeof TIPOS_BUSCA[number];

export const ROTULO_TIPO_BUSCA: Record<TipoBusca, string> = {
  lead: 'Leads',
  cliente: 'Compradores',
  contrato: 'Contratos',
  chacara: 'Chácaras',
  imovel: 'Imóveis',
  equipe: 'Equipe',
  material: 'Materiais',
};

export interface ResultadoBusca {
  tipo: TipoBusca;
  id: string;
  titulo: string;
  detalhe: string | null;
  url: string;
  /** Maior = melhor acerto (ordenação dentro do grupo) */
  pontos: number;
}

export const MIN_CARACTERES_BUSCA = 2;
export const MAX_POR_TIPO = 6;

/** "José Romário" → "jose romario" (sem acento, minúsculo, espaços simples) */
export function normalizar(t: string | null | undefined): string {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const soDigitos = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '');

/** O que a pessoa digitou, pronto para comparar: texto normalizado e, se tiver número, os dígitos */
export function prepararTermo(entrada: string): { texto: string; digitos: string; valido: boolean } {
  const texto = normalizar(entrada);
  const digitos = soDigitos(entrada);
  return { texto, digitos, valido: texto.length >= MIN_CARACTERES_BUSCA };
}

/**
 * Pontos do acerto de um termo num campo: igual (100), começa com (80), alguma palavra começa com (60), contém (40).
 * Para telefone/CPF/CRECI compara só os dígitos (mínimo 4) e pontua igual se terminar com o que foi digitado.
 */
export function pontuar(campo: string | null | undefined, termo: { texto: string; digitos: string }, modo: 'texto' | 'numero' = 'texto'): number {
  if (modo === 'numero') {
    const d = soDigitos(campo);
    if (!d || termo.digitos.length < 4) return 0;
    if (d === termo.digitos) return 100;
    if (d.endsWith(termo.digitos)) return 85;
    return d.includes(termo.digitos) ? 50 : 0;
  }
  const c = normalizar(campo);
  if (!c || !termo.texto) return 0;
  if (c === termo.texto) return 100;
  if (c.startsWith(termo.texto)) return 80;
  if (c.split(/[\s\-/·,.()]+/).some(p => p.startsWith(termo.texto))) return 60;
  // Várias palavras ("joao silva"): todas precisam aparecer
  const partes = termo.texto.split(' ').filter(Boolean);
  if (partes.length > 1 && partes.every(p => c.includes(p))) return 50;
  return c.includes(termo.texto) ? 40 : 0;
}

/** Melhor acerto entre vários campos */
export function melhorPontuacao(campos: { valor: string | null | undefined; modo?: 'texto' | 'numero' }[], termo: { texto: string; digitos: string }): number {
  return campos.reduce((m, c) => Math.max(m, pontuar(c.valor, termo, c.modo ?? 'texto')), 0);
}

/** Agrupa por tipo (na ordem de TIPOS_BUSCA), o melhor acerto primeiro, no máximo MAX_POR_TIPO por grupo */
export function agruparResultados(lista: ResultadoBusca[], max = MAX_POR_TIPO): { tipo: TipoBusca; rotulo: string; itens: ResultadoBusca[] }[] {
  return TIPOS_BUSCA
    .map(tipo => ({
      tipo,
      rotulo: ROTULO_TIPO_BUSCA[tipo],
      itens: lista.filter(r => r.tipo === tipo && r.pontos > 0).sort((a, b) => b.pontos - a.pontos || a.titulo.localeCompare(b.titulo, 'pt-BR')).slice(0, max),
    }))
    .filter(g => g.itens.length > 0);
}
