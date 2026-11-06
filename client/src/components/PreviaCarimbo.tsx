import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export interface LinhasPrevia { nome: string; detalhe: string; email: string | null }

const VERDE = "#0C3320", DOURADO = "#C9A84C", CREME = "#F3EEDF";
const W = 1080, H = 192;

/** Tamanho de letra que cabe na largura (mesma regra da faixa gerada no servidor: server/materialFormatado.ts) */
function fonte(ctx: CanvasRenderingContext2D, texto: string, peso: string, base: number, largura: number) {
  let t = base;
  do { ctx.font = `${peso} ${t}px "Liberation Sans", Arial, sans-serif`; t -= 1; } while (ctx.measureText(texto).width > largura && t > 10);
}

/**
 * Prévia da faixa do carimbo, igual à que sai embaixo das artes e vídeos: "FALE COM O SEU CORRETOR",
 * nome · CRECI, WhatsApp · Instagram, e-mail e o QR do link de quem divulga. Atualiza enquanto digita.
 */
export default function PreviaCarimbo({ linhas, link }: { linhas: LinhasPrevia; link: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let vivo = true;
    (async () => {
      const ctx = cv.getContext("2d")!;
      const pad = Math.round(H * 0.12), qrLado = H - pad * 2, larg = W - pad * 3 - qrLado;
      ctx.fillStyle = VERDE; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = DOURADO; ctx.fillRect(0, 0, W, Math.max(3, Math.round(H * 0.03)));
      const k = linhas.email ? 0.86 : 1;
      const yy = linhas.email ? [0.13, 0.36, 0.54, 0.7] : [0.17, 0.45, 0.68, 0];
      const t1 = "FALE COM O SEU CORRETOR";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = DOURADO; fonte(ctx, t1, "700", Math.round(H * 0.13 * k), larg); ctx.fillText(t1, pad, pad + H * yy[0]);
      ctx.fillStyle = "#fff"; fonte(ctx, linhas.nome || "Seu nome", "700", Math.round(H * 0.22 * k), larg); ctx.fillText(linhas.nome || "Seu nome", pad, pad + H * yy[1]);
      ctx.fillStyle = CREME;
      if (linhas.detalhe) { fonte(ctx, linhas.detalhe, "400", Math.round(H * 0.16 * k), larg); ctx.fillText(linhas.detalhe, pad, pad + H * yy[2]); }
      if (linhas.email) { fonte(ctx, linhas.email, "400", Math.round(H * 0.13), larg); ctx.fillText(linhas.email, pad, pad + H * yy[3]); }
      ctx.fillStyle = "#fff"; ctx.fillRect(W - pad - qrLado - 4, pad - 4, qrLado + 8, qrLado + 8);
      try {
        const img = new Image();
        img.src = await QRCode.toDataURL(link, { margin: 1, width: qrLado, errorCorrectionLevel: "M" });
        await img.decode();
        if (vivo) ctx.drawImage(img, W - pad - qrLado, pad, qrLado, qrLado);
      } catch { /* sem QR na prévia: o arquivo final gera no servidor */ }
    })();
    return () => { vivo = false; };
  }, [linhas.nome, linhas.detalhe, linhas.email, link]);
  return (
    <figure className="space-y-1">
      <figcaption className="text-[11px] font-semibold text-warn-400">Prévia do carimbo</figcaption>
      <canvas ref={ref} width={W} height={H} className="block w-full rounded-md border border-warn-500/40 shadow" aria-label={`Prévia do carimbo: ${linhas.nome}. ${linhas.detalhe}. ${linhas.email ?? ""}`} />
      <p className="text-[10px] text-muted-foreground">Assim sai embaixo de cada arte e vídeo. O QR leva para o seu link.</p>
    </figure>
  );
}
