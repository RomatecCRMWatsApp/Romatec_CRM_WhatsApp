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
