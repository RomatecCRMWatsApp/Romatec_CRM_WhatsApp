/**
 * Envio de material direto para o Cloudinary, em partes de 20 MB (upload "chunked"), com os parâmetros assinados
 * pelo servidor (/api/materiais/assinatura). O arquivo não passa pelo servidor do CRM.
 */
import { TIPOS_ARQUIVO_ACEITOS } from "@shared/materiais";

const POR_EXTENSAO: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf",
};

/** Tipo do arquivo (alguns celulares mandam vazio ou genérico: deduz pela extensão) */
export function mimeDoArquivo(f: File): string {
  if (TIPOS_ARQUIVO_ACEITOS.includes(f.type)) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return POR_EXTENSAO[ext] ?? f.type;
}

/** Mensagem clara para o erro do Cloudinary */
function traduzir(msg: string, limiteMB: number): string {
  if (/file size too large|too large|exceeds/i.test(msg)) return `Arquivo acima do limite do plano de armazenamento (${limiteMB} MB).`;
  if (/invalid api_?key|unknown api_?key|invalid cloud_?name/i.test(msg)) return "O armazenamento de arquivos está com a credencial inválida no servidor. Avise o administrador.";
  if (/invalid signature|stale request/i.test(msg)) return "A autorização do envio expirou. Tente de novo.";
  if (/unsupported|invalid (image|video) file/i.test(msg)) return "Formato de arquivo não suportado ou arquivo corrompido.";
  return msg || "Falha no envio para o armazenamento.";
}

export interface ResultadoUpload { url: string; mime: string; tamanhoBytes: number }

export async function enviarParaCloudinary(f: File, onProgresso?: (pct: number) => void): Promise<ResultadoUpload> {
  const mime = mimeDoArquivo(f);
  const r = await fetch("/api/materiais/assinatura", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: f.name, mime, tamanho: f.size }),
  });
  const a = await r.json().catch(() => ({ success: false, error: `Erro ${r.status}` }));
  if (!a.success) throw new Error(a.error || "Não foi possível preparar o envio");
  const limiteMB = Math.floor(a.limite / 1048576);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const total = f.size;
  let resposta: any = null;
  for (let ini = 0; ini < total; ini += a.parteBytes) {
    const fim = Math.min(ini + a.parteBytes, total) - 1;
    const fd = new FormData();
    for (const [k, v] of Object.entries(a.campos)) fd.append(k, String(v));
    fd.append("file", f.slice(ini, fim + 1), f.name);
    let tentativa = 0;
    for (;;) {
      try {
        const resp = await fetch(a.url, { method: "POST", body: fd, headers: { "X-Unique-Upload-Id": id, "Content-Range": `bytes ${ini}-${fim}/${total}` } });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || j.error) throw Object.assign(new Error(traduzir(j?.error?.message ?? `HTTP ${resp.status}`, limiteMB)), { definitivo: resp.status >= 400 && resp.status < 500 });
        resposta = j;
        break;
      } catch (e: any) {
        // Queda de rede numa parte: tenta de novo a mesma parte (até 3×); erro do Cloudinary (4xx) não repete
        if (e?.definitivo || ++tentativa >= 3) throw e;
        await new Promise(res => setTimeout(res, 1500 * tentativa));
      }
    }
    onProgresso?.(Math.round(((fim + 1) / total) * 100));
  }
  if (!resposta?.secure_url) throw new Error("O armazenamento não devolveu o link do arquivo");
  return { url: resposta.secure_url, mime, tamanhoBytes: total };
}
