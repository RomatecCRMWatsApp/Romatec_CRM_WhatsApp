/**
 * Lê só a DateTimeOriginal (0x9003) do EXIF de um JPEG. Não lê GPS (privacidade: localização só com consentimento
 * explícito na tela). Devolve null se não houver ou se o arquivo não tiver EXIF legível.
 */
export function dataOriginalExif(exif: Buffer | null | undefined): Date | null {
  if (!exif || exif.length < 14) return null;
  try {
    let base = 0;
    if (exif.toString('latin1', 0, 4) === 'Exif') base = 6; // bloco APP1 começa com "Exif\0\0"
    const le = exif.toString('latin1', base, base + 2) === 'II';
    const u16 = (o: number) => (le ? exif.readUInt16LE(base + o) : exif.readUInt16BE(base + o));
    const u32 = (o: number) => (le ? exif.readUInt32LE(base + o) : exif.readUInt32BE(base + o));
    const tag = (ifd: number, alvo: number): number | null => {
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (u16(e) === alvo) return e;
      }
      return null;
    };
    const ifd0 = u32(4);
    const pExif = tag(ifd0, 0x8769);
    if (pExif == null) return null;
    const exifIfd = u32(pExif + 8);
    const e = tag(exifIfd, 0x9003) ?? tag(exifIfd, 0x9004);
    if (e == null) return null;
    const off = u32(e + 8);
    const s = exif.toString('latin1', base + off, base + off + 19); // "AAAA:MM:DD HH:MM:SS"
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-03:00`);
    return Number.isNaN(d.getTime()) || d.getFullYear() < 1990 ? null : d;
  } catch { return null; }
}
