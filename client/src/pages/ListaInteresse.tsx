import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { ClipboardList, Download } from "lucide-react";

const data = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—");
const cel = (v: unknown) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Lista de interesse do lançamento: quem pediu informação do empreendimento (sem reserva) */
export default function ListaInteresse() {
  const [, navigate] = useLocation();
  const { data: r, isLoading, error } = trpc.crm.listaInteresse.useQuery({ slug: "bom-jardims" });

  const exportar = () => {
    if (!r) return;
    const cab = ["Nome", "Telefone", "Cidade", "Chácara clicada", "Prazo", "Pagamento", "Canal", "Campanha", "Classe", "Base legal", "Pediu para sair", "Entrou em"];
    const linhas = r.pessoas.map(p => [p.nome, p.phone, p.cidade, p.chacara, p.prazo, p.pagamento, p.canal, p.campanha, p.classe, p.base, p.saiu ? "sim" : "não", data(p.entrouEm)]);
    const csv = "﻿" + [cab, ...linhas].map(l => l.map(cel).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "lista-interesse-bom-jardims.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div>
      <PageHeader
        icone={ClipboardList}
        titulo="Lista de interesse — Bom Jardims"
        subtitulo="Quem pediu informação do lançamento. Só interesse: sem reserva nem sinal até o registro do condomínio."
        acoes={<Button onClick={exportar} disabled={!r?.total} className="bg-primary hover:bg-primary/90 text-primary-foreground"><Download className="mr-1.5 h-4 w-4" /> Exportar CSV</Button>}
      />
      <div className="px-4 md:px-6 pb-8 max-w-[1500px] mx-auto space-y-4">
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {r && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-card border border-border/60 p-4"><p className="text-xs text-muted-foreground">Na lista</p><p className="text-3xl font-bold">{r.total}</p></div>
              <div className="rounded-2xl bg-card border border-border/60 p-4"><p className="text-xs text-muted-foreground">Podem receber o convite</p><p className="text-3xl font-bold text-primary">{r.ativos}</p></div>
              <div className="rounded-2xl bg-card border border-border/60 p-4 col-span-2 md:col-span-1"><p className="text-xs text-muted-foreground">Pediram para sair</p><p className="text-3xl font-bold">{r.total - r.ativos}</p></div>
            </div>
            <div className="rounded-2xl bg-card border border-border/60 overflow-x-auto">
              {r.pessoas.length === 0 ? <p className="p-6 text-sm text-muted-foreground text-center">Ninguém na lista ainda. Os cadastros da página do Bom Jardims e das campanhas ligadas a ele aparecem aqui.</p> : (
                <table className="w-full min-w-[760px] text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b border-border">
                    {["Nome", "Cidade", "Chácara", "Prazo", "Canal", "Base legal", "Entrou"].map(h => <th key={h} className="text-left font-medium px-3 py-2.5">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {r.pessoas.map(p => (
                      <tr key={p.id} onClick={() => navigate(`/leads/lead/${p.id}`)} className={`border-b border-border/50 cursor-pointer hover:bg-white/5 ${p.saiu ? "opacity-50" : ""}`}>
                        <td className="px-3 py-2.5"><p className="font-semibold">{p.nome}</p><p className="text-[11px] text-muted-foreground">+{p.phone}{p.saiu ? " · pediu para sair" : ""}</p></td>
                        <td className="px-3 py-2.5">{p.cidade || "—"}</td>
                        <td className="px-3 py-2.5">{p.chacara || "—"}</td>
                        <td className="px-3 py-2.5">{p.prazo || "—"}</td>
                        <td className="px-3 py-2.5"><p>{p.canal}</p>{p.campanha && <p className="text-[11px] text-muted-foreground">#{p.campanha}</p>}</td>
                        <td className="px-3 py-2.5 text-xs">{p.base}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{data(p.entrouEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">Use a lista para convidar para o evento de lançamento e a visita guiada. Não ofereça reserva, número de chácara nem sinal antes de confirmar o registro do condomínio (Lei 6.766/79).</p>
          </>
        )}
      </div>
    </div>
  );
}
