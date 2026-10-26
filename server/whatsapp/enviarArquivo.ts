/**
 * Enviar arquivo pelo WhatsApp do CRM (Z-API) — só o administrador (Configurações → "Enviar arquivo pelo WhatsApp").
 * PDF, imagem, Word ou Excel, com legenda. Cada envio fica no log do servidor (sem o conteúdo).
 */
import { detectarMime } from '../../shared/cadastro';

export class EnvioArquivoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'EnvioArquivoErro'; } }

export const MAX_ARQUIVO_WHATSAPP = 15 * 1024 * 1024;

const OFFICE: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const EXT_IMAGEM: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Tipo e extensão pelo conteúdo (PDF/imagem) ou, para Word/Excel (ZIP), pelo nome do arquivo */
export function tipoDoArquivo(buf: Buffer, nome: string): { extensao: string; mime: string } {
  if (!buf?.length) throw new EnvioArquivoErro('Arquivo vazio');
  if (buf.length > MAX_ARQUIVO_WHATSAPP) throw new EnvioArquivoErro('Arquivo acima de 15 MB', 413);
  const mime = detectarMime(buf);
  if (mime) return { extensao: EXT_IMAGEM[mime], mime };
  const ext = String(nome).toLowerCase().split('.').pop() ?? '';
  if (buf.subarray(0, 2).toString() === 'PK' && OFFICE[ext]) return { extensao: ext, mime: OFFICE[ext] };
  throw new EnvioArquivoErro('Formato não aceito: envie PDF, imagem (JPG/PNG/WEBP), Word (.docx) ou Excel (.xlsx)', 415);
}

/** WhatsApp com DDD (10/11 dígitos) ou já com 55 → 55DDNNNNNNNNN */
export function foneWhatsapp(telefone: string): string {
  const d = String(telefone ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  throw new EnvioArquivoErro('Informe o WhatsApp com DDD');
}

/** Envio trocável nos testes */
export const envio = {
  documento: async (fone: string, doc: { base64: string; extensao: string; mime: string; nomeArquivo: string; legenda?: string }) => {
    const { enviarDocumento } = await import('../leads/zapiClient');
    return enviarDocumento(fone, doc);
  },
  disponivel: () => !!(process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN),
};

export async function enviarArquivoWhatsapp(p: { telefone: string; buf: Buffer; nome: string; legenda?: string | null; autorId: number }) {
  if (!envio.disponivel()) throw new EnvioArquivoErro('WhatsApp do sistema (Z-API) não está configurado no servidor', 412);
  const fone = foneWhatsapp(p.telefone);
  const { extensao, mime } = tipoDoArquivo(p.buf, p.nome);
  const base = String(p.nome || 'arquivo').replace(/[\\/:*?"<>|]+/g, '-').replace(/\.[^.]+$/, '').slice(0, 80) || 'arquivo';
  const nomeArquivo = `${base}.${extensao}`;
  const legenda = String(p.legenda ?? '').trim().slice(0, 1000) || undefined;
  try {
    const messageId = await envio.documento(fone, { base64: p.buf.toString('base64'), extensao, mime, nomeArquivo, legenda });
    console.log(`[WhatsApp] arquivo "${nomeArquivo}" (${Math.round(p.buf.length / 1024)} KB) enviado para ${fone.slice(0, 4)}****${fone.slice(-4)} por usuário ${p.autorId}`);
    return { ok: true as const, messageId, nomeArquivo };
  } catch (e: any) {
    throw new EnvioArquivoErro(`O WhatsApp do sistema não conseguiu enviar: ${e?.message || 'erro'}`, 502);
  }
}
