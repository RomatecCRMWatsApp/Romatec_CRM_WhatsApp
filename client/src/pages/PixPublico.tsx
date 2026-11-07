/**
 * /pix/:token — página do Pix de uma parcela, aberta pelo botão "TOQUE AQUI PARA COPIAR O PIX" do boleto/carnê em PDF.
 * No celular a câmera não lê o QR do próprio PDF: aqui um toque copia o código para colar no app do banco.
 */
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import QRCode from "qrcode";
import { CheckCircle2, ClipboardCopy, FileText, Loader2 } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts } from "@/components/bom-jardims/marca";

type Pagina = {
  nome: string; empreendimento: string; lote: string; parcela: string; valor: number; vencimento: string; boletoUrl: string | null;
  situacao: "aberta" | "paga" | "cancelada" | "sem_pix"; pagoEm?: string | null; pix: string | null; qrBase64: string | null;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.split("-").reverse().join("/");

export default function PixPublico() {
  useBrandFonts();
  const [, params] = useRoute("/pix/:token");
  const token = params?.token ?? "";
  const [p, setP] = useState<Pagina | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    // Fora das buscas, como o link do boleto
    const meta = document.createElement("meta"); meta.name = "robots"; meta.content = "noindex, nofollow"; document.head.appendChild(meta);
    document.title = "Pagar com Pix";
    fetch(`/api/public/pix/${encodeURIComponent(token)}`).then(r => r.json())
      .then(j => (j.ok ? setP(j) : setErro(j.error || "Link inválido"))).catch(() => setErro("Sem conexão. Tente de novo."));
    return () => { meta.remove(); };
  }, [token]);
  useEffect(() => {
    if (!p?.pix) return;
    if (p.qrBase64) setQr(`data:image/png;base64,${p.qrBase64}`);
    else QRCode.toDataURL(p.pix, { width: 360, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [p]);

  const copiar = async () => {
    if (!p?.pix) return;
    try { await navigator.clipboard.writeText(p.pix); }
    catch {
      // Navegador sem acesso à área de transferência: seleciona o texto para copiar à mão
      const el = document.getElementById("codigo-pix") as HTMLTextAreaElement | null;
      el?.focus(); el?.select(); document.execCommand?.("copy");
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 6000);
  };

  const fundo: React.CSSProperties = { minHeight: "100vh", background: C.creme, fontFamily: SANS, color: C.texto, padding: "20px 16px 32px" };
  if (erro) return <div style={fundo}><p style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>{erro}</p></div>;
  if (!p) return <div style={{ ...fundo, display: "grid", placeItems: "center" }}><Loader2 className="animate-spin" /></div>;
  return (
    <div style={fundo}>
      <main style={{ maxWidth: 480, margin: "0 auto" }}>
        <header style={{ background: C.verde, color: "var(--c-ffffff)", borderRadius: "18px 18px 0 0", padding: "18px 20px", borderBottom: `4px solid ${C.dourado}` }}>
          <p style={{ margin: 0, fontSize: 13, color: C.destaque }}>{p.empreendimento} · Chácara {p.lote}</p>
          <h1 style={{ fontFamily: SERIF, margin: "6px 0 0", fontSize: 24 }}>Olá, {p.nome}!</h1>
        </header>
        <section style={{ background: "var(--c-ffffff)", borderRadius: "0 0 18px 18px", padding: 20, boxShadow: "0 6px 24px color-mix(in srgb, var(--c-0c3320) 8%, transparent)" }}>
          <p style={{ margin: 0, fontSize: 15 }}>{p.parcela} · vence em <b>{br(p.vencimento)}</b></p>
          <p style={{ margin: "4px 0 16px", fontSize: 30, fontWeight: 800, color: C.verde }}>{brl(p.valor)}</p>

          {p.situacao === "paga" && <p style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, color: "var(--c-1f8a4c)" }}><CheckCircle2 /> Este boleto já foi pago{p.pagoEm ? ` em ${br(p.pagoEm)}` : ""}. Obrigado!</p>}
          {p.situacao === "cancelada" && <p style={{ fontWeight: 700, color: "var(--c-b23a3a)" }}>Este boleto foi cancelado. Fale com o escritório para receber o boleto atualizado.</p>}
          {p.situacao === "sem_pix" && <p>O Pix desta parcela não está disponível agora. Use o boleto abaixo ou fale com o escritório.</p>}

          {p.situacao === "aberta" && p.pix && (
            <>
              <button type="button" onClick={copiar}
                style={{ width: "100%", padding: "18px 16px", borderRadius: 14, border: "none", background: copiado ? "var(--c-1f8a4c)" : C.verde, color: "var(--c-ffffff)", fontSize: 19, fontWeight: 800, cursor: "pointer", display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
                {copiado ? <CheckCircle2 /> : <ClipboardCopy />} {copiado ? "Código Pix copiado!" : "Copiar código Pix"}
              </button>
              <p role="status" aria-live="polite" style={{ minHeight: 40, margin: "10px 0", fontSize: 14, color: "var(--c-1f8a4c)", fontWeight: 600 }}>
                {copiado ? "Agora abra o app do seu banco e cole em Pix › Pix Copia e Cola." : ""}
              </p>
              <ol style={{ margin: "0 0 14px", paddingLeft: 22, fontSize: 14, lineHeight: 1.6, listStyle: "decimal" }}>
                <li>Toque em <b>Copiar código Pix</b>.</li>
                <li>Abra o app do seu banco e entre em <b>Pix › Pix Copia e Cola</b>.</li>
                <li>Cole o código, confira o valor e confirme. Compensa na hora.</li>
              </ol>
              <label style={{ fontSize: 12, color: C.suave }}>Código Pix (para copiar à mão)
                <textarea id="codigo-pix" readOnly value={p.pix} rows={4}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: 10, borderRadius: 10, border: "1px solid var(--c-d8cfb4)", fontFamily: "monospace", fontSize: 12, color: C.texto, background: "var(--c-ffffff)" }} />
              </label>
              {qr && (
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <img src={qr} alt="QR Code do Pix" width={220} height={220} style={{ width: 220, height: 220, display: "block", margin: "0 auto 6px" }} />
                  <p style={{ margin: 0, fontSize: 12, color: C.suave }}>Pagando por outro aparelho? Leia este QR Code no app do banco.</p>
                </div>
              )}
            </>
          )}
          {p.boletoUrl && p.situacao !== "paga" && (
            <a href={p.boletoUrl} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 16, color: C.verde, fontWeight: 700 }}>
              <FileText size={18} /> Abrir o boleto em PDF
            </a>
          )}
        </section>
        <p style={{ textAlign: "center", fontSize: 12, color: C.suave, marginTop: 14 }}>Pague somente por este Pix ou boleto, nunca em dinheiro a terceiros.<br />Romatec Consultoria Total · CRECI J-1234</p>
      </main>
    </div>
  );
}
