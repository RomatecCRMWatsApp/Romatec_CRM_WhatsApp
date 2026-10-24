/**
 * Portal de permissões (regras puras, servidor e navegador).
 *
 * - admin: tudo, sem consulta a tabela nenhuma.
 * - equipe (corretor): herda o pacote base do perfil (permissoesPerfil) e o admin liga/desliga
 *   módulos por corretor (permissoesUsuario, que prevalece sobre o pacote base).
 * - Escopo: dentro dos módulos liberados, o corretor só abre os empreendimentos/imóveis que o admin
 *   habilitou para ele (acessosCorretor). Os demais podem aparecer na lista, sem acesso.
 * - Comissão: o corretor só vê a dele; breakdown interno e comissão de terceiros, só o admin.
 *
 * Módulo novo = uma entrada em MODULOS (com o padrão do pacote base) — a migration semeia sozinha.
 */
import type { Perfil } from './equipe';
import { comissao, type Comissao, type CondicoesPagamento } from './simulador';

export interface Modulo {
  chave: string;
  rotulo: string;
  /** Procedimentos tRPC do módulo (prefixo "x." ou nome exato) */
  procedimentos: string[];
  /** Ligado no pacote base de cada perfil da equipe (matriz aprovada em 23/10/2026) */
  padrao: { corretor: boolean; secretario: boolean };
}

const AMBOS = { corretor: true, secretario: true };

export const MODULOS: Modulo[] = [
  { chave: 'empreendimentos', rotulo: 'Empreendimentos (mapa, lotes, documentos)', procedimentos: ['empreendimentosAdmin.'], padrao: AMBOS },
  { chave: 'simulador', rotulo: 'Simulador de financiamento', procedimentos: ['simulador.'], padrao: AMBOS },
  { chave: 'financeiro', rotulo: 'Financeiro (vendas, sem comissão de terceiros)', procedimentos: ['financeiro.'], padrao: AMBOS },
  { chave: 'contratos', rotulo: 'Contratos (minuta; o corretor só dos leads dele)', procedimentos: ['contratos.'], padrao: AMBOS },
  { chave: 'materiais', rotulo: 'Materiais e links de divulgação', procedimentos: ['materiais.'], padrao: AMBOS },
  { chave: 'imoveis', rotulo: 'Imóveis (cadastro e divulgação)', procedimentos: ['properties.'], padrao: AMBOS },
  { chave: 'leads', rotulo: 'Leads e funil', procedimentos: ['crm.', 'leadCampanhas.'], padrao: AMBOS },
  { chave: 'contatos', rotulo: 'Contatos', procedimentos: ['contacts.'], padrao: AMBOS },
  { chave: 'campanhas', rotulo: 'Campanhas de WhatsApp', procedimentos: ['campaigns.', 'scheduler.'], padrao: AMBOS },
  { chave: 'desempenho', rotulo: 'Desempenho', procedimentos: ['performance.'], padrao: { corretor: false, secretario: false } },
];

export type ChaveModulo = string;
export type Permissoes = Record<ChaveModulo, boolean>;

const casa = (p: string, caminho: string) => (p.endsWith('.') ? caminho.startsWith(p) : caminho === p);

/** Módulo dono do procedimento tRPC (null = não pertence a módulo controlado) */
export function moduloDoCaminho(caminho: string): Modulo | null {
  return MODULOS.find(m => m.procedimentos.some(p => casa(p, caminho))) ?? null;
}

export type PerfilEquipe = 'corretor' | 'secretario';

/** Pacote base (linhas de permissoesPerfil; módulo sem linha = padrão do código) + ajustes da pessoa */
export function permissoesEfetivas(
  base: { modulo: string; permitido: boolean | number }[],
  ajustes: { modulo: string; permitido: boolean | number }[],
  perfil: PerfilEquipe = 'corretor',
): Permissoes {
  const out: Permissoes = Object.fromEntries(MODULOS.map(m => [m.chave, m.padrao[perfil]]));
  for (const b of base) if (b.modulo in out) out[b.modulo] = !!b.permitido;
  for (const a of ajustes) if (a.modulo in out) out[a.modulo] = !!a.permitido;
  return out;
}

/**
 * Corretor NOVO: ajuste explícito de todos os módulos — só o que o admin marcou fica liberado
 * (não herda o pacote base). Módulo desconhecido é ignorado.
 */
export function ajustesNovoCorretor(escolhidos: string[]): { modulo: string; permitido: boolean }[] {
  const marcados = new Set(escolhidos);
  return MODULOS.map(m => ({ modulo: m.chave, permitido: marcados.has(m.chave) }));
}

/** O perfil pode chamar o procedimento, dado o pacote efetivo (admin sempre; fora de módulo, segue shared/equipe) */
export function moduloLiberado(perfil: Perfil | null, permissoes: Permissoes | null, caminho: string): boolean {
  if (perfil === 'admin') return true;
  const m = moduloDoCaminho(caminho);
  if (!m) return true;
  return !!permissoes?.[m.chave];
}

export const TIPOS_ACESSO = ['empreendimento', 'imovel'] as const;
export type TipoAcesso = typeof TIPOS_ACESSO[number];
export interface AcessoCorretor { tipo: TipoAcesso; refId: number; comissaoPct?: number | string | null }

/** Habilitado para o empreendimento/imóvel: admin e secretário sempre; corretor só os habilitados */
export function temAcesso(perfil: Perfil | null, acessos: AcessoCorretor[], tipo: TipoAcesso, refId: number): boolean {
  if (perfil === 'admin' || perfil === 'secretario') return true;
  if (perfil !== 'corretor') return false;
  return acessos.some(a => a.tipo === tipo && a.refId === refId);
}

/**
 * Lead que o usuário pode ver/mexer: admin e secretário, todos; corretor só aqueles em que é o
 * responsável (lead sem responsável não aparece para corretor). Empreendedor: nenhum.
 */
export function leadVisivel(perfil: Perfil | null, usuarioId: number, lead: { responsavelId?: number | null }): boolean {
  if (perfil === 'admin' || perfil === 'secretario') return true;
  return perfil === 'corretor' && lead.responsavelId === usuarioId;
}

/** Distribuição/roteamento de leads (trocar o responsável): só o admin */
export const podeDistribuirLeads = (perfil: Perfil | null) => perfil === 'admin';

/** Lista com marcação de acesso: os não habilitados aparecem, mas sem acesso */
export function marcarAcesso<T extends { id: number }>(perfil: Perfil | null, acessos: AcessoCorretor[], tipo: TipoAcesso, itens: T[]): (T & { acesso: boolean })[] {
  return itens.map(i => ({ ...i, acesso: temAcesso(perfil, acessos, tipo, i.id) }));
}

// ─── Comissão do corretor ────────────────────────────────────────────────────

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export interface ComissaoPropria {
  pct: number;
  valor: number;
  /** Venda parcelada: 50% na 1ª parcela do sinal e 50% na 2ª; à vista: 100% no ato */
  parcelada: boolean;
  pagamentos: { quando: string; valor: number }[];
  regra: string;
}

/**
 * Comissão que o corretor recebe numa venda — só a dele (nunca a da empresa nem a de outro corretor).
 * pct = percentual do corretor sobre o valor da venda (do vínculo dele ou das condições do empreendimento).
 */
export function comissaoPropria(valorVenda: number, pct: number, parcelada: boolean): ComissaoPropria {
  const valor = r2(valorVenda * pct);
  const metade = r2(valor / 2);
  const pagamentos = parcelada
    ? [{ quando: '1ª parcela do sinal', valor: metade }, { quando: '2ª parcela do sinal', valor: r2(valor - metade) }]
    : [{ quando: 'No pagamento do sinal (à vista)', valor }];
  const regra = parcelada
    ? 'Venda parcelada: 50% na 1ª parcela do sinal e 50% na 2ª parcela do financiamento do sinal.'
    : 'Sinal à vista: 100% da comissão no pagamento do sinal.';
  return { pct, valor, parcelada, pagamentos, regra };
}

/**
 * Comissão no simulador: admin recebe o breakdown (com corretor e venda direta); corretor recebe só
 * a dele (% dele sobre o preço, 50/50 quando a entrada é parcelada) — nunca valores da empresa.
 * À vista total (valorAvistaTotal): mesmo % sobre o valor à vista, 100% no ato.
 */
export function comissaoNaSimulacao(
  perfil: Perfil | null, preco: number, entradaParcelas: number, c: CondicoesPagamento, pctCorretor: number, valorAvistaTotal: number,
): {
  comissao: { comCorretor: Comissao; vendaDireta: Comissao } | null; minhaComissao: ComissaoPropria | null;
  comissaoAvistaTotal: { comCorretor: Comissao; vendaDireta: Comissao } | null; minhaComissaoAvistaTotal: ComissaoPropria | null;
} {
  if (perfil === 'admin') {
    return {
      comissao: { comCorretor: comissao(preco, true, entradaParcelas === 1, c), vendaDireta: comissao(preco, false, entradaParcelas === 1, c) }, minhaComissao: null,
      comissaoAvistaTotal: { comCorretor: comissao(valorAvistaTotal, true, true, c), vendaDireta: comissao(valorAvistaTotal, false, true, c) }, minhaComissaoAvistaTotal: null,
    };
  }
  // Só o corretor tem comissão própria; secretário e demais não veem comissão nenhuma
  const corretor = perfil === 'corretor';
  return {
    comissao: null, minhaComissao: corretor ? comissaoPropria(preco, pctCorretor, entradaParcelas > 1) : null,
    comissaoAvistaTotal: null,
    minhaComissaoAvistaTotal: corretor
      ? (k => ({ ...k, pagamentos: [{ quando: 'No pagamento à vista', valor: k.valor }], regra: 'À vista total: 100% da comissão no ato, sobre o valor à vista.' }))(comissaoPropria(valorAvistaTotal, pctCorretor, false))
      : null,
  };
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

/** Situações do lote que entram no financeiro (venda com sinal ou concluída) */
export const SITUACOES_VENDA = ['entrada', 'vendido_parcelado', 'vendido_avista', 'quitado'] as const;
/** "Venda parcelada" para a regra da comissão: vendido parcelado ou com sinal */
export const vendaParcelada = (situacao: string | null | undefined) => situacao === 'vendido_parcelado' || situacao === 'entrada';

export interface VendaFinanceiro {
  loteId: number; codigo: string; situacao: string; corretorId: number | null; valorVenda: number | null;
  [campo: string]: unknown;
}

/**
 * Linha do financeiro para quem está vendo: tudo da venda; comissão só como cada perfil pode ver —
 * admin: breakdown completo; corretor: só a dele, e só nas vendas dele (as dos outros saem sem comissão).
 */
export function linhaFinanceira<T extends VendaFinanceiro>(
  perfil: Perfil | null, usuarioId: number, venda: T, c: CondicoesPagamento | null, pctCorretor: number,
): T & { comissao: Comissao | null; minhaComissao: ComissaoPropria | null; parcelada: boolean } {
  const parcelada = vendaParcelada(venda.situacao);
  if (perfil === 'admin') {
    const k = c && venda.valorVenda ? comissao(Number(venda.valorVenda), !!venda.corretorId, !parcelada, c) : null;
    return { ...venda, parcelada, comissao: k, minhaComissao: null };
  }
  return { ...venda, parcelada, comissao: null, minhaComissao: perfil === 'corretor' ? minhaComissaoNaVenda(usuarioId, venda, pctCorretor, parcelada) : null };
}

/** Comissão de uma venda para quem está vendo: corretor só a dele (venda de outro = null) */
export function minhaComissaoNaVenda(
  usuarioId: number, venda: { corretorId?: number | null; valorVenda?: number | null }, pct: number, parcelada: boolean,
): ComissaoPropria | null {
  if (!venda.corretorId || venda.corretorId !== usuarioId || !venda.valorVenda) return null;
  return comissaoPropria(Number(venda.valorVenda), pct, parcelada);
}
