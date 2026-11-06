/**
 * Materiais de divulgação (artes, vídeos, folder, mapa de vendas) — regras puras.
 * Os arquivos ficam no Cloudinary (pasta romatec_materiais); a tabela materiais
 * liga cada um a um imóvel (propertyId) ou empreendimento (empreendimentoSlug).
 */

export const TIPOS_MATERIAL = ['feed', 'status', 'card', 'video', 'folder', 'mapa', 'render', 'outro'] as const;
export type TipoMaterial = typeof TIPOS_MATERIAL[number];

export const ROTULO_TIPO_MATERIAL: Record<TipoMaterial, string> = {
  feed: 'Feed (1080×1350)', status: 'Status / Stories (1080×1920)', card: 'Card', video: 'Vídeo',
  folder: 'Folder', mapa: 'Mapa de vendas / implantação', render: 'Render e marca', outro: 'Outro',
};

/** Tipo sugerido pelo nome do arquivo (o corretor pode trocar depois) */
export function tipoPorNome(nome: string, mime = ''): TipoMaterial {
  const n = nome.toLowerCase();
  if (mime.startsWith('video/') || /\.(mp4|mov|webm)$/.test(n)) return 'video';
  if (/folder/.test(n)) return 'folder';
  if (/mapa|implanta/.test(n)) return 'mapa';
  if (/status|story|stories|1080x1920/.test(n)) return 'status';
  if (/feed|1080x1350/.test(n)) return 'feed';
  if (/card/.test(n)) return 'card';
  if (/render|portal|stand|logo|perspectiva|aerea/.test(n)) return 'render';
  return 'outro';
}

/** "Feed_01_Em_Breve.png" → "Feed 01 Em Breve" */
export function tituloPorNome(nome: string): string {
  const base = nome.split(/[\\/]/).pop() || nome;
  return base.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Material';
}

/** Peças com condições/preço/tabela no nome entram bloqueadas ("não divulgar") até alguém liberar */
export function bloqueadaPorNome(nome: string): boolean {
  return /condic|pre[cç]o|tabela|parcela|financiamento/i.test(nome);
}

/** Abas da tela de materiais: o arquivo cai na aba pelo tipo (não depende do que o corretor escolheu no select) */
export const CATEGORIAS_ARQUIVO = ['imagem', 'video', 'pdf'] as const;
export type CategoriaArquivo = typeof CATEGORIAS_ARQUIVO[number];

export const ABA_ARQUIVO: Record<CategoriaArquivo, { rotulo: string; aceita: string; botao: string }> = {
  imagem: { rotulo: 'Imagens', aceita: 'image/jpeg,image/png,image/webp,image/gif', botao: 'Enviar imagens' },
  video: { rotulo: 'Vídeos', aceita: 'video/mp4,video/webm,video/quicktime', botao: 'Enviar vídeos' },
  pdf: { rotulo: 'PDFs', aceita: 'application/pdf', botao: 'Enviar PDF' },
};

export function categoriaDoArquivo(mime: string | null | undefined, url = ''): CategoriaArquivo {
  const m = (mime || '').toLowerCase();
  const u = url.split('?')[0].toLowerCase();
  if (m.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/.test(u) || u.includes('/video/upload/')) return 'video';
  if (m === 'application/pdf' || /\.pdf$/.test(u)) return 'pdf';
  return 'imagem';
}

export type ResourceType = 'image' | 'video' | 'raw';

/** PDF vai como raw (o Cloudinary bloqueia a entrega de PDF como imagem em contas novas) */
export function resourceTypeDe(mime: string): ResourceType {
  if (mime === 'application/pdf') return 'raw';
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

const MB = 1024 * 1024;
export const TIPOS_ARQUIVO_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf'];

/** Erro de validação do arquivo (null = ok). Limites do plano do Cloudinary: imagem e PDF 10 MB, vídeo 100 MB */
export function problemaArquivo(mime: string, tamanho: number): string | null {
  if (!TIPOS_ARQUIVO_ACEITOS.includes(mime)) return 'Tipo não aceito. Use JPG, PNG, WEBP, GIF, MP4, MOV, WEBM ou PDF.';
  if (!tamanho) return 'Arquivo vazio.';
  const limite = mime.startsWith('video/') ? 100 * MB : 10 * MB;
  if (tamanho > limite) return `Arquivo muito grande (máximo ${limite / MB} MB para ${mime.startsWith('video/') ? 'vídeo' : 'imagem e PDF'}).`;
  return null;
}

export interface MaterialLinha {
  id: number;
  propertyId: number | null;
  empreendimentoSlug: string | null;
  tipo: string;
  ordem: number;
  titulo: string;
}

export interface GrupoMateriais<T extends MaterialLinha> {
  chave: string;
  nome: string;
  propertyId: number | null;
  empreendimentoSlug: string | null;
  itens: T[];
}

/** Agrupa por empreendimento/imóvel, empreendimentos primeiro; dentro do grupo por tipo, ordem e título */
export function agruparMateriais<T extends MaterialLinha>(
  linhas: T[],
  nomes: { imoveis: Map<number, string>; empreendimentos: Map<string, string> },
): GrupoMateriais<T>[] {
  const grupos = new Map<string, GrupoMateriais<T>>();
  for (const m of linhas) {
    const chave = m.empreendimentoSlug ? `e:${m.empreendimentoSlug}` : m.propertyId ? `p:${m.propertyId}` : 'geral';
    let g = grupos.get(chave);
    if (!g) {
      const nome = m.empreendimentoSlug ? nomes.empreendimentos.get(m.empreendimentoSlug) ?? m.empreendimentoSlug
        : m.propertyId ? nomes.imoveis.get(m.propertyId) ?? `Imóvel ${m.propertyId}` : 'Romatec (geral)';
      g = { chave, nome, propertyId: m.empreendimentoSlug ? null : m.propertyId, empreendimentoSlug: m.empreendimentoSlug, itens: [] };
      grupos.set(chave, g);
    }
    g.itens.push(m);
  }
  const ordemTipo = (t: string) => { const i = (TIPOS_MATERIAL as readonly string[]).indexOf(t); return i < 0 ? 99 : i; };
  const peso = (g: GrupoMateriais<T>) => (g.empreendimentoSlug ? 0 : g.propertyId ? 1 : 2);
  return Array.from(grupos.values())
    .map(g => ({ ...g, itens: [...g.itens].sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, 'pt-BR')) }))
    .sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ─── Organizar a lista (botão "Organizar" em Materiais) ───────────
export const ORDENS_MATERIAL = ['recentes', 'antigos', 'nome', 'tipo'] as const;
export type OrdemMaterial = typeof ORDENS_MATERIAL[number];
export const ROTULO_ORDEM_MATERIAL: Record<OrdemMaterial, string> = {
  recentes: 'Mais recentes primeiro',
  antigos: 'Mais antigos primeiro',
  nome: 'Nome (A a Z)',
  tipo: 'Tipo de peça',
};

const quando = (m: { createdAt?: unknown }) => { const t = m.createdAt ? new Date(m.createdAt as any).getTime() : 0; return Number.isFinite(t) ? t : 0; };

/** Ordena as peças de um grupo. Padrão: data de envio, as mais novas primeiro (o corretor acha o material novo logo de cara). */
export function ordenarMateriais<T extends MaterialLinha & { id?: number; createdAt?: unknown }>(itens: T[], ordem: OrdemMaterial = 'recentes'): T[] {
  const nome = (a: T, b: T) => a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true });
  const desempate = (a: T, b: T) => (b.id ?? 0) - (a.id ?? 0);
  const ordemTipo = (t: string) => { const i = (TIPOS_MATERIAL as readonly string[]).indexOf(t); return i < 0 ? 99 : i; };
  const cmp: Record<OrdemMaterial, (a: T, b: T) => number> = {
    recentes: (a, b) => quando(b) - quando(a) || desempate(a, b),
    antigos: (a, b) => quando(a) - quando(b) || -desempate(a, b),
    nome: (a, b) => nome(a, b) || desempate(a, b),
    tipo: (a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || a.ordem - b.ordem || nome(a, b),
  };
  return [...itens].sort(cmp[ordem] ?? cmp.recentes);
}

// ─── Download no formato da rede (feed, stories/reels, quadrado, WhatsApp) com os dados do corretor ───────────
/**
 * O arquivo baixado pelo corretor sai SEM o contato do escritório que vem gravado na arte (rodapé com telefone,
 * CRECI e Instagram da Romatec): o servidor corta a faixa de baixo (recorteRodapePct) e, no vídeo, o cartão
 * final (corteFinalMs), e coloca no lugar a faixa e o cartão final de quem baixa (server/materialFormatado.ts).
 */
export const FORMATOS_DOWNLOAD = ['original', 'feed', 'stories', 'quadrado', 'whatsapp'] as const;
export type FormatoDownload = typeof FORMATOS_DOWNLOAD[number];

export const ROTULO_FORMATO: Record<FormatoDownload, { rotulo: string; dica: string }> = {
  original: { rotulo: 'Original', dica: 'Mesmo tamanho da peça, com a sua faixa' },
  feed: { rotulo: 'Feed 4:5', dica: 'Instagram e Facebook · 1080×1350' },
  stories: { rotulo: 'Stories / Reels 9:16', dica: 'Stories, Reels, TikTok e status · 1080×1920' },
  quadrado: { rotulo: 'Quadrado 1:1', dica: 'Feed quadrado e anúncios · 1080×1080' },
  whatsapp: { rotulo: 'WhatsApp (leve)', dica: 'Arquivo menor para mandar no WhatsApp' },
};

/** Tamanho final; null = segue a largura da peça (original e WhatsApp de imagem) */
export const DIMENSAO_FORMATO: Record<FormatoDownload, { w: number; h: number } | null> = {
  original: null, feed: { w: 1080, h: 1350 }, stories: { w: 1080, h: 1920 }, quadrado: { w: 1080, h: 1080 }, whatsapp: null,
};

/** Faixa do escritório gravada na arte (% da altura, de baixo para cima). null = padrão pelo tipo */
export const OPCOES_RECORTE_RODAPE = [0, 6, 10, 14, 18, 22, 26] as const;
export const OPCOES_CORTE_FINAL_S = [0, 2, 3, 4, 5, 6, 7, 8, 10, 12] as const;
export function recorteRodapeEfetivo(m: { recorteRodapePct?: number | null; tipo?: string | null; mime?: string | null; url?: string }): number {
  if (m.recorteRodapePct != null) return Math.max(0, Math.min(40, Number(m.recorteRodapePct)));
  if (categoriaDoArquivo(m.mime, m.url) !== 'imagem') return 0;
  // Artes de divulgação da Romatec levam o contato no rodapé; render, mapa e outros não
  return ['feed', 'status', 'card', 'folder'].includes(String(m.tipo)) ? 14 : 0;
}

export interface LayoutFormato { w: number; h: number; areaH: number; faixaH: number }

/** Onde vai a peça e onde vai a faixa do corretor no quadro final (dimensões pares, como o vídeo exige) */
export function layoutFormato(formato: FormatoDownload, largura: number, alturaUtil: number): LayoutFormato {
  const par = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const dim = DIMENSAO_FORMATO[formato];
  if (dim) {
    const faixaH = par(dim.h * (formato === 'stories' ? 0.1 : 0.12));
    return { w: dim.w, h: dim.h, areaH: dim.h - faixaH, faixaH };
  }
  const escala = formato === 'whatsapp' && largura > 1080 ? 1080 / largura : 1;
  const w = par(largura * escala), areaH = par(alturaUtil * escala);
  const faixaH = par(Math.max(130, Math.min(w * 0.17, 320)));
  return { w, h: areaH + faixaH, areaH, faixaH };
}
