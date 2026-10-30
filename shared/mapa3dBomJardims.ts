/**
 * Campanha "Mapa 3D" do Bom Jardims (/bom-jardims/3d): mapa 3D em destaque, vídeos da galeria
 * (materiais de vídeo liberados do empreendimento) e o andamento da obra.
 */
export const ROTA_MAPA3D = '/bom-jardims/3d';
export const CAMPANHA_MAPA3D = 'BJ-MAPA3D';
export const TITULO_MAPA3D = 'Escolha sua chácara no mapa 3D — Condomínio de Chácaras Bom Jardims, Açailândia/MA';
export const DESCRICAO_MAPA3D = 'Gire, aproxime e escolha a sua chácara no mapa 3D do Bom Jardims. Veja os vídeos das obras e as chácaras disponíveis — a partir de 3.025 m², em Açailândia/MA.';

/** Vídeo da galeria pública: o que veio dos materiais (Cloudinary) ou os fixos do site */
export interface VideoGaleria { titulo: string; url: string; poster: string | null }

export const VIDEOS_FIXOS: VideoGaleria[] = [
  { titulo: 'Obras iniciadas — liberado para vendas', url: '/obras-bom-jardim/video-obras.mp4', poster: '/obras-bom-jardim/video-obras-poster.webp' },
  { titulo: 'Portal de entrada e o condomínio', url: '/bom-jardims/video.mp4', poster: '/bom-jardims/video-poster.webp' },
];

const ehVideo = (m: { tipo?: string | null; mime?: string | null; url: string }) =>
  m.tipo === 'video' || (m.mime || '').startsWith('video/') || /\.(mp4|mov|webm)(\?|$)/i.test(m.url);

/** Quadro do Cloudinary como capa do vídeo (1 s), em JPG */
export function posterCloudinary(url: string): string | null {
  if (!/res\.cloudinary\.com\/.+\/video\/upload\//.test(url)) return null;
  return url.replace('/video/upload/', '/video/upload/so_1,w_960,c_limit,q_auto/').replace(/\.(mp4|mov|webm)(\?.*)?$/i, '.jpg');
}

/** Vídeos novos primeiro (materiais do empreendimento), depois os fixos; sem repetir o mesmo arquivo */
export function videosDaGaleria(materiais: { titulo: string; tipo?: string | null; mime?: string | null; url: string; liberado?: boolean | number | null }[]): VideoGaleria[] {
  const vistos = new Set<string>();
  const out: VideoGaleria[] = [];
  for (const m of materiais) {
    if (m.liberado === false || m.liberado === 0 || !ehVideo(m) || !/^https:\/\//.test(m.url) || vistos.has(m.url)) continue;
    vistos.add(m.url);
    out.push({ titulo: m.titulo, url: m.url, poster: posterCloudinary(m.url) });
  }
  for (const v of VIDEOS_FIXOS) if (!vistos.has(v.url)) out.push(v);
  return out;
}
