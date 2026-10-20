import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FileDown, Send, Users } from "lucide-react";
import { exibirTelefoneBR } from "@shared/telefone";
import EnviarWhatsAppModal, { btnWhats as btn } from "@/components/EnviarWhatsAppModal";

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

/** Tabela Nome / Telefone / E-mail / Origem da aba Leads, com PDF e envio da lista pelo WhatsApp (para um número interno) */
export default function LeadsTabela({ situacao, search }: { situacao: Situacao; search?: string }) {
  const [origem, setOrigem] = useState("");
  const filtro = { situacao, origem: origem || undefined, search: search || undefined };
  const { data, isLoading } = trpc.leads.lista.useQuery(filtro);

  // Envio pelo WhatsApp: o número de destino é digitado no modal (o do José é só sugestão)
  const [enviar, setEnviar] = useState(false);
  const [formato, setFormato] = useState<"pdf" | "texto">("pdf");

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
        <EnviarWhatsAppModal
          titulo="Enviar a lista no WhatsApp"
          descricao={`Vai só para o número que você digitar: o seu, de um colaborador ou de um corretor (${linhas.length} ${linhas.length === 1 ? "lead" : "leads"} do filtro atual). Nenhuma mensagem é enviada aos leads.`}
          sugestao={data?.telefonePadrao}
          enviando={envio.isPending}
          onFechar={() => setEnviar(false)}
          onEnviar={destino => envio.mutate({ ...filtro, telefone: destino, formato })}
        >
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {(["pdf", "texto"] as const).map(f => (
              <button key={f} onClick={() => setFormato(f)} style={{
                ...btn(formato === f ? "#3ec87a" : "#4a7a55", formato === f ? "rgba(62,200,122,0.15)" : "rgba(255,255,255,0.04)", formato === f ? "rgba(62,200,122,0.35)" : "rgba(255,255,255,0.08)"),
              }}>
                {f === "pdf" ? "📄 Documento PDF" : "💬 Texto resumido"}
              </button>
            ))}
          </div>
        </EnviarWhatsAppModal>
      )}
    </div>
  );
}
