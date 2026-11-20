/**
 * Tipo REAL do arquivo pelos primeiros bytes (assinatura), sem confiar no cabeçalho enviado pelo navegador.
 * Usado para recusar arquivo disfarçado (ex.: SVG/HTML com tipo "image/…") e para decidir o que pode abrir inline.
 */
export type MimeSeguro = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/heic' | 'image/avif' | 'application/pdf' | 'video/mp4' | 'video/quicktime' | 'video/webm';

export function mimePelosBytes(buf: Uint8Array | null | undefined): MimeSeguro | null {
  if (!buf || buf.length < 12) return null;
  const hex = (a: number, b: number) => Array.from(buf.subarray(a, b)).map(x => x.toString(16).padStart(2, '0')).join('');
  const txt = (a: number, b: number) => String.fromCharCode(...Array.from(buf.subarray(a, b)));
  if (hex(0, 4) === '25504446') return 'application/pdf';
  if (hex(0, 8) === '89504e470d0a1a0a') return 'image/png';
  if (hex(0, 3) === 'ffd8ff') return 'image/jpeg';
  if (txt(0, 6) === 'GIF87a' || txt(0, 6) === 'GIF89a') return 'image/gif';
  if (txt(0, 4) === 'RIFF' && txt(8, 12) === 'WEBP') return 'image/webp';
  if (hex(0, 4) === '1a45dfa3') return 'video/webm';
  if (txt(4, 8) === 'ftyp') {
    const marca = txt(8, 12);
    // Fotos do iPhone (HEIC/HEIF) e AVIF também usam o contêiner ISO "ftyp"
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(marca)) return 'image/heic';
    if (marca === 'avif' || marca === 'avis') return 'image/avif';
    return marca.startsWith('qt') ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}

/** O conteúdo é do mesmo grupo (imagem / vídeo / pdf) que o tipo declarado? Devolve o tipo real ou null */
export function conferirTipo(declarado: string, buf: Uint8Array | null | undefined): MimeSeguro | null {
  const real = mimePelosBytes(buf);
  if (!real) return null;
  const grupo = (m: string) => (m === 'application/pdf' ? 'pdf' : m.split('/')[0]);
  return grupo(String(declarado ?? '').toLowerCase()) === grupo(real) ? real : null;
}

/** Pode abrir no navegador (inline) sem risco de executar script? Só PDF e imagem rasterizada conferidos pelos bytes */
export const podeAbrirInline = (buf: Uint8Array | null | undefined): boolean => {
  const m = mimePelosBytes(buf);
  return !!m && (m === 'application/pdf' || (m.startsWith('image/') && m !== 'image/heic' && m !== 'image/avif'));
};
