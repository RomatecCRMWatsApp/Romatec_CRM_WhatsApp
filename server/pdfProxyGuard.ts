/**
 * /api/pdf-proxy só busca PDFs do Cloudinary da Romatec:
 * https://res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/...
 * Qualquer outro endereço é recusado (o servidor não vira proxy aberto e a
 * credencial do Cloudinary nunca vai para outro site).
 */
export function urlPdfPermitida(bruto: unknown, cloudName: string | undefined | null): string | null {
  if (typeof bruto !== 'string' || !bruto || !cloudName) return null;
  let u: URL;
  try { u = new URL(bruto); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com' || u.port || u.username || u.password) return null;
  if (!u.pathname.startsWith(`/${cloudName}/`)) return null;
  return u.toString();
}
