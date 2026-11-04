/**
 * Compartilhar arquivo pelo menu do celular (WhatsApp, Instagram…). O iPhone só abre o menu se o toque for
 * recente: quando o arquivo demora a ficar pronto (PDF gerado no servidor), o pedido é negado
 * (NotAllowedError). Aí a tela mostra "Enviar agora" para um toque novo. Navegador sem suporte
 * (ex.: o navegador interno do Instagram) cai no plano B: baixa o arquivo e abre o WhatsApp com o texto.
 */
export type ResultadoCompartilhar = "ok" | "cancelado" | "precisa_toque" | "sem_suporte";

export async function compartilharArquivo(arquivo: File, o: { title?: string; text?: string } = {}): Promise<ResultadoCompartilhar> {
  const nav = navigator as any;
  if (!nav.share || !nav.canShare?.({ files: [arquivo] })) return "sem_suporte";
  try {
    await nav.share({ files: [arquivo], title: o.title, text: o.text });
    return "ok";
  } catch (e: any) {
    if (e?.name === "AbortError") return "cancelado";
    if (e?.name === "NotAllowedError") return "precisa_toque";
    return "sem_suporte";
  }
}

export function baixarArquivo(arquivo: Blob, nome: string) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Plano B: baixa o arquivo e abre o WhatsApp com o texto (o arquivo é anexado à mão) */
export function planoBWhatsApp(arquivo: File, texto: string) {
  baixarArquivo(arquivo, arquivo.name);
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
}
