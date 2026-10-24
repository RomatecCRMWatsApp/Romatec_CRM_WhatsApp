import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Download, FileText, LogOut, Share2, Video } from "lucide-react";
import { FotoUsuario } from "@/components/AppShell";
import { baixarBlob, ehImagem, ehVideo, miniatura, nomeArquivo } from "@/components/MateriaisPainel";
import { ROTULO_TIPO_MATERIAL, type TipoMaterial } from "@shared/materiais";

const STATUS_LOTE: Record<string, { rotulo: string; cor: string }> = {
  disponivel: { rotulo: "Disponíveis", cor: "text-emerald-300" },
  reservado: { rotulo: "Reservadas", cor: "text-amber-300" },
  em_negociacao: { rotulo: "Em negociação", cor: "text-sky-300" },
  vendido: { rotulo: "Vendidas", cor: "text-red-300" },
};
const ROTULO_TIPO: Record<string, string> = { pago: "Anúncios (pago)", organico: "Orgânico", outro: "Portais e outros" };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function Numero({ titulo, valor, sub }: { titulo: string; valor: string | number; sub?: string }) {
  return (
    <Card className="bg-card border-border"><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </CardContent></Card>
  );
}

/** Arte só para divulgar: ver, baixar, mandar (no celular abre WhatsApp/Instagram) e copiar link */
function Arte({ m }: { m: any }) {
  const [ocupado, setOcupado] = useState(false);
  const baixar = async () => {
    setOcupado(true);
    const blob = await baixarBlob(m);
    setOcupado(false);
    if (!blob) { window.open(m.url, "_blank", "noopener"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nomeArquivo(m); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const enviar = async () => {
    setOcupado(true);
    try {
      const blob = await baixarBlob(m);
      const arquivo = blob ? new File([blob], nomeArquivo(m), { type: blob.type || m.mime || "" }) : null;
      if (arquivo && (navigator as any).canShare?.({ files: [arquivo] })) { await navigator.share({ files: [arquivo], title: m.titulo }); return; }
      await navigator.clipboard.writeText(m.url);
      toast.success("Link copiado. No celular, este botão envia o arquivo direto para o WhatsApp ou Instagram.");
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Não foi possível compartilhar");
    } finally { setOcupado(false); }
  };
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <a href={m.url} target="_blank" rel="noreferrer" className="block bg-black/40 aspect-[4/5] relative">
        {ehImagem(m) ? <img src={miniatura(m.url)} alt={m.titulo} loading="lazy" className="w-full h-full object-contain" />
          : ehVideo(m) ? <video src={m.url} preload="metadata" muted className="w-full h-full object-contain" />
          : <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2"><FileText className="h-10 w-10" /><span className="text-xs">PDF</span></div>}
        {ehVideo(m) && <Video className="absolute top-2 left-2 h-4 w-4 text-white drop-shadow" />}
      </a>
      <div className="p-2 space-y-1.5 flex-1 flex flex-col">
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{m.titulo}</p>
        <p className="text-[10px] text-muted-foreground">{ROTULO_TIPO_MATERIAL[m.tipo as TipoMaterial] || m.tipo}</p>
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={enviar} disabled={ocupado}><Share2 className="h-3.5 w-3.5 mr-1" />Enviar</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={baixar} disabled={ocupado}><Download className="h-3.5 w-3.5 mr-1" />Baixar</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Copiar link" onClick={async () => { try { await navigator.clipboard.writeText(m.url); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar"); } }}><Copy className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

export default function Empreendedor() {
  const { user, logout } = useAuth();
  const { data: p, isLoading, error } = trpc.empreendedor.painel.useQuery();
  const { data: artes = [] } = trpc.empreendedor.materiais.useQuery();
  const [aba, setAba] = useState<"leads" | "artes">("leads");

  const serie = (p?.porDia ?? []).map(d => ({ ...d, rotulo: d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7) }));
  const ult7 = (p?.porDia ?? []).slice(-7).reduce((a, d) => a + d.leads, 0);
  const lotes = p?.lotes ? Object.entries(p.lotes) : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white">
        <div className="container py-4 flex items-center gap-3">
          <img src="/icon-192x192.png" alt="" className="h-10 w-10 rounded-xl" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{p?.empreendimento.nome || "Meu empreendimento"}</h1>
            <p className="text-xs text-white/70">Olá, {String((user as any)?.name || "").split(" ")[0] || "empreendedor"} · leads e artes para divulgar</p>
          </div>
          <FotoUsuario />
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => logout()}><LogOut className="h-4 w-4" /></Button>
        </div>
        <div className="container flex gap-1 pb-0">
          {(["leads", "artes"] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} className={`px-4 py-2 text-sm font-semibold rounded-t-lg ${aba === a ? "bg-background text-foreground" : "text-white/80 hover:bg-white/10"}`}>
              {a === "leads" ? "📊 Leads" : `🎨 Artes (${artes.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="container py-6 space-y-4">
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        {p && aba === "leads" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Numero titulo="Leads no total" valor={p.total.leads} sub={`${ult7} nos últimos 7 dias`} />
              <Numero titulo="Leads quentes" valor={p.total.quentes} sub="prontos para o corretor" />
              <Numero titulo="Querem visitar" valor={p.total.visitas} sub={`${p.total.fechados} negócio(s) fechado(s)`} />
              <Numero titulo="Interesse em chácara" valor={pct(p.total.comImovel, p.total.leads)} sub="escolheram no mapa" />
            </div>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base">Leads por dia (últimos 30 dias)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serie} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={4} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <Tooltip contentStyle={{ background: "#0b1410", border: "1px solid #1f3a2c", fontSize: 12 }} formatter={(v: any) => [v, "leads"]} labelFormatter={(l: any) => `Dia ${l}`} />
                      <Bar dataKey="leads" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-base">De onde vêm os leads</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {p.porTipo.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem leads.</p>}
                  {p.porTipo.map(t => (
                    <div key={t.tipo}>
                      <div className="flex justify-between text-sm"><span>{ROTULO_TIPO[t.tipo] || t.rotulo}</span><span className="font-semibold">{t.leads} · {pct(t.leads, p.total.leads)}</span></div>
                      <div className="h-2 rounded bg-secondary/40 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: pct(t.leads, p.total.leads) === "—" ? "0%" : pct(t.leads, p.total.leads) }} /></div>
                    </div>
                  ))}
                  <div className="pt-2 space-y-1">
                    {p.porCanal.map(c => <div key={c.canal} className="flex justify-between text-xs text-muted-foreground"><span>{c.rotulo}</span><span>{c.leads} lead(s){c.quentes ? ` · ${c.quentes} quente(s)` : ""}</span></div>)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-base">Situação das chácaras</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {lotes.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados das chácaras.</p> : (
                    <div className="grid grid-cols-2 gap-2">
                      {lotes.map(([s, n]) => <div key={s} className="rounded border border-border p-2"><p className={`text-xl font-bold ${STATUS_LOTE[s]?.cor || ""}`}>{n as number}</p><p className="text-[11px] text-muted-foreground">{STATUS_LOTE[s]?.rotulo || s}</p></div>)}
                    </div>
                  )}
                  {p.lotesMaisProcurados.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Chácaras mais procuradas</p>
                      <div className="flex flex-wrap gap-1">{p.lotesMaisProcurados.map(l => <span key={l.codigo} className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">{l.codigo} · {l.leads}</span>)}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base">Por campanha</CardTitle></CardHeader>
              <CardContent>
                {p.porCampanha.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma campanha com leads ainda.</p> : (
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground border-b border-border"><th className="px-2 py-2 text-left font-medium">Campanha</th><th className="px-2 py-2 text-right font-medium">Leads</th><th className="px-2 py-2 text-right font-medium">Quentes</th><th className="px-2 py-2 text-right font-medium">Visitas</th><th className="px-2 py-2 text-right font-medium">Cliques</th></tr></thead>
                      <tbody>
                        {p.porCampanha.map((c, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-2 py-2"><p className="font-semibold text-foreground">{c.campanhaId ? `#${c.codigo}` : c.nome}</p><p className="text-[10px] text-muted-foreground">{c.campanhaId ? c.nome : ""}</p></td>
                            <td className="px-2 py-2 text-right font-semibold">{c.leads}</td>
                            <td className="px-2 py-2 text-right text-orange-300">{c.quentes}</td>
                            <td className="px-2 py-2 text-right">{c.visitas}</td>
                            <td className="px-2 py-2 text-right">{c.cliques + c.scans}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-[11px] text-muted-foreground">Os contatos dos interessados ficam com o corretor (LGPD). Aqui você acompanha os números da divulgação.</p>
          </>
        )}

        {aba === "artes" && (
          artes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma arte liberada ainda.</p> : (
            <>
              <p className="text-xs text-muted-foreground">Toque em <b>Enviar</b> no celular para mandar direto para o WhatsApp, status ou Instagram. Nas legendas, sempre o CRECI e os contatos do corretor; não publique valores.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{artes.map((m: any) => <Arte key={m.id} m={m} />)}</div>
            </>
          )
        )}
      </div>
    </div>
  );
}
