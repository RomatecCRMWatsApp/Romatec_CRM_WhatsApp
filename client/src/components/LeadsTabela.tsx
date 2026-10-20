import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FileDown, Send, Users } from "lucide-react";
import { normalizePhoneBR, mascaraTelefoneBR, exibirTelefoneBR } from "@shared/telefone";

type Situacao = "ativos" | "descartados" | "todos";

/** Baixa o PDF que veio em base64 do servidor */
function baixarPdf(base64: string, nomeArquivo: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const btn = (cor: string, bg: string, borda: string) => ({
  padding: "7px 14px", borderRadius: "8px", background: bg, border: `1px solid ${borda}`, color: cor,
  fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
});

/** Tabela Nome / Telefone / E-mail / Origem da aba Leads, com PDF e envio da lista pelo WhatsApp (para um número interno) */
export default function LeadsTabela({ situacao, search }: { situacao: Situacao; search?: string }) {
  const [origem, setOrigem] = useState("");
  const filtro = { situacao, origem: origem || undefined, search: search || undefined };
  const { data, isLoading } = trpc.leads.lista.useQuery(filtro);

  // Número de destino digitado na hora (José, colaborador, corretor); o do José é só sugestão
  const [enviar, setEnviar] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [formato, setFormato] = useState<"pdf" | "texto">("pdf");
  const destino = normalizePhoneBR(telefone);
  const sugestao = data?.telefonePadrao || "";

  const pdf = trpc.leads.listaPdf.useMutation({
    onSuccess: r => { baixarPdf(r.base64, r.nomeArquivo); toast.success(`PDF gerado com ${r.total} leads`); },
    onError: e => toast.error(`Erro ao gerar o PDF: ${e.message}`),
  });
  const envio = trpc.leads.enviarListaWhatsApp.useMutation({
    onSuccess: r => { toast.success(`Lista (${r.total} leads, ${r.formato === "pdf" ? "PDF" : "texto"}) enviada para ${exibirTelefoneBR(r.telefone)}`); setEnviar(false); },
    onError: e => toast.error(e.message),
  });

  const linhas = data?.linhas || [];
  const th = { textAlign: "left" as const, padding: "9px 12px", fontSize: "10px", color: "#3a6a45", textTransform: "uppercase" as const, letterSpacing: "0.06em", fontWeight: 700, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" as const };
  const td = { padding: "8px 12px", fontSize: "12px", color: "#c8e6c9", borderBottom: "1px solid var(--border)", verticalAlign: "top" as const };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <select value={origem} onChange={e => setOrigem(e.target.value)} style={{
          padding: "7px 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px",
          color: "#c8f0d0", fontSize: "12px", maxWidth: "100%",
        }}>
          <option value="">Todas as origens</option>
          {(data?.origens || []).map(o => <option key={o.origem} value={o.origem}>{o.origem} ({o.total})</option>)}
        </select>
        <span style={{ fontSize: "11px", color: "#4a7a55" }}>{isLoading ? "Carregando..." : `${linhas.length} ${linhas.length === 1 ? "lead" : "leads"}`}</span>
        <div style={{ flex: 1 }} />
        <button disabled={pdf.isPending || !linhas.length} onClick={() => pdf.mutate(filtro)}
          style={{ ...btn("#38bdf8", "rgba(14,165,233,0.1)", "rgba(14,165,233,0.25)"), opacity: pdf.isPending || !linhas.length ? 0.5 : 1 }}>
          <FileDown size={13} /> {pdf.isPending ? "Gerando..." : "Salvar em PDF"}
        </button>
        <button disabled={!linhas.length} onClick={() => setEnviar(true)}
          style={{ ...btn("#25d366", "rgba(37,211,102,0.1)", "rgba(37,211,102,0.25)"), opacity: !linhas.length ? 0.5 : 1 }}>
          <Send size={13} /> Enviar no WhatsApp
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#3a6a45" }}>Carregando leads...</div>
      ) : !linhas.length ? (
        <div className="ld-card" style={{ textAlign: "center", padding: "40px" }}>
          <Users size={32} style={{ color: "#1a3520", margin: "0 auto 12px" }} />
          <p style={{ color: "#3a5a40", fontSize: "14px" }}>Nenhum lead encontrado</p>
        </div>
      ) : (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
            <thead>
              <tr>
                <th style={th}>#</th><th style={th}>Nome</th><th style={th}>Telefone</th><th style={th}>E-mail</th><th style={th}>Origem</th><th style={th}>Entrada</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.id}>
                  <td style={{ ...td, color: "#4a7a55" }}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600, color: "#d8f0dc" }}>{l.nome}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{l.telefone}</td>
                  <td style={td}>{l.email || <span style={{ color: "#3a5a40" }}>—</span>}</td>
                  <td style={td}>{l.origem}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: "#4a7a55" }}>{l.entrada ? new Date(l.entrada).toLocaleDateString("pt-BR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {enviar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
          onClick={e => { if (e.target === e.currentTarget) setEnviar(false); }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "440px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#d8f0dc", margin: "0 0 4px" }}>Enviar a lista no WhatsApp</h3>
            <p style={{ fontSize: "11px", color: "#3a6a45", margin: "0 0 14px" }}>
              Vai só para o número que você digitar: o seu, de um colaborador ou de um corretor ({linhas.length} {linhas.length === 1 ? "lead" : "leads"} do filtro atual). Nenhuma mensagem é enviada aos leads.
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
              <label htmlFor="lista-destino" style={{ fontSize: "10px", color: "#3a6a45", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Número de destino (WhatsApp, com DDD)</label>
              {sugestao && (
                <button type="button" onClick={() => setTelefone(mascaraTelefoneBR(sugestao))} style={{ background: "none", border: "none", color: "#3ec87a", fontSize: "11px", fontWeight: 600, cursor: "pointer", padding: 0 }}>
                  Usar o número do José
                </button>
              )}
            </div>
            <input id="lista-destino" autoFocus type="tel" inputMode="tel" autoComplete="off" value={telefone}
              onChange={e => setTelefone(mascaraTelefoneBR(e.target.value))}
              onKeyDown={e => { if (e.key === "Enter" && destino && !envio.isPending) envio.mutate({ ...filtro, telefone: destino, formato }); }}
              placeholder={sugestao ? `Ex.: ${mascaraTelefoneBR(sugestao.slice(2))}` : "(99) 99999-9999"}
              style={{
                width: "100%", padding: "9px 12px", margin: "4px 0 4px", background: "var(--background)",
                border: `1px solid ${telefone && !destino ? "rgba(239,68,68,0.5)" : "var(--border)"}`,
                borderRadius: "8px", color: "#c8f0d0", fontSize: "14px", outline: "none", boxSizing: "border-box", letterSpacing: "0.02em",
              }} />
            <p style={{ fontSize: "11px", margin: "0 0 12px", minHeight: "16px", color: destino ? "#3ec87a" : "#e07070" }}>
              {destino ? `✓ Vai para ${exibirTelefoneBR(destino)}` : telefone ? "Número incompleto ou inválido — celular com DDD (o +55 é opcional)" : ""}
            </p>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              {(["pdf", "texto"] as const).map(f => (
                <button key={f} onClick={() => setFormato(f)} style={{
                  ...btn(formato === f ? "#3ec87a" : "#4a7a55", formato === f ? "rgba(62,200,122,0.15)" : "rgba(255,255,255,0.04)", formato === f ? "rgba(62,200,122,0.35)" : "rgba(255,255,255,0.08)"),
                }}>
                  {f === "pdf" ? "📄 Documento PDF" : "💬 Texto resumido"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setEnviar(false)} style={{ padding: "8px 16px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#6a8a70", cursor: "pointer" }}>
                Cancelar
              </button>
              <button disabled={!destino || envio.isPending} onClick={() => destino && envio.mutate({ ...filtro, telefone: destino, formato })} style={{
                ...btn("#25d366", "rgba(37,211,102,0.15)", "rgba(37,211,102,0.3)"), padding: "8px 20px",
                opacity: !destino || envio.isPending ? 0.5 : 1,
              }}>
                <Send size={13} /> {envio.isPending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
