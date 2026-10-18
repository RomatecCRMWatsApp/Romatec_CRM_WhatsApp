import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, ExternalLink, Link2, Megaphone, Plus, Trash2 } from "lucide-react";

const CANAL_LABEL: Record<string, string> = {
  meta_ctwa: "Anúncio Click-to-WhatsApp", meta_leadads: "Meta Lead Ads", google_ads: "Google Ads",
  portal_olx: "OLX", portal_zap: "ZAP Imóveis", portal_vivareal: "VivaReal", instagram_organico: "Instagram orgânico",
  placa_qr: "QR da placa", site: "Site", indicacao: "Indicação", wifi: "Wi-Fi", outro: "Outro",
};

const vazio = { codigo: "", nome: "", canal: "meta_ctwa", funil: "comprador" as "comprador" | "proprietario", propertyId: "", metaFormId: "", gastoTotal: "" };

function LinkGerado({ propertyId, campanhaId, funil }: { propertyId?: number; campanhaId?: number; funil?: "comprador" | "proprietario" }) {
  const { data, isLoading } = trpc.leadCampanhas.linkWhatsApp.useQuery({ propertyId, campanhaId, funil });
  if (isLoading || !data) return <p className="text-xs text-muted-foreground">Gerando link...</p>;
  const copiar = async (texto: string, rotulo: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiado`); } catch { toast.error("Não foi possível copiar"); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
      <p className="text-xs text-muted-foreground">Mensagem que o cliente vai mandar:</p>
      <p className="text-sm text-foreground">{data.mensagem}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => copiar(data.url, "Link")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link wa.me</Button>
        <Button size="sm" variant="outline" onClick={() => copiar(data.mensagem, "Mensagem")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar mensagem</Button>
        <Button size="sm" variant="ghost" asChild><a href={data.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Testar</a></Button>
      </div>
    </div>
  );
}

export default function LeadCampanhas() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: campanhas = [], isLoading } = trpc.leadCampanhas.list.useQuery();
  const { data: imoveis = [] } = trpc.properties.list.useQuery();
  const [form, setForm] = useState(vazio);
  const [abrirForm, setAbrirForm] = useState(false);
  const [linkAberto, setLinkAberto] = useState<number | null>(null);

  const criar = trpc.leadCampanhas.create.useMutation({
    onSuccess: (r) => {
      toast.success(`Campanha #${r.codigo} criada`);
      setForm(vazio); setAbrirForm(false);
      utils.leadCampanhas.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const alternar = trpc.leadCampanhas.update.useMutation({ onSuccess: () => utils.leadCampanhas.list.invalidate() });
  const excluir = trpc.leadCampanhas.delete.useMutation({
    onSuccess: () => { toast.success("Campanha excluída"); utils.leadCampanhas.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const imovelPorId = useMemo(() => new Map((imoveis as any[]).map(i => [i.id, i])), [imoveis]);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    criar.mutate({
      codigo: form.codigo,
      nome: form.nome,
      canal: form.canal,
      funil: form.funil,
      propertyId: form.propertyId ? Number(form.propertyId) : null,
      metaFormId: form.metaFormId || null,
      gastoTotal: form.gastoTotal ? Number(form.gastoTotal.replace(",", ".")) : 0,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white">
        <div className="container py-4 flex items-center gap-3">
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => navigate("/leads")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Campanhas de captação</h1>
            <p className="text-xs text-white/70">Código da campanha + código do imóvel na mensagem do WhatsApp = origem de cada lead</p>
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setAbrirForm(v => !v)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="mr-1.5 h-4 w-4" /> Nova campanha
          </Button>
        </div>

        {abrirForm && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-base">Nova campanha</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Código (vai na mensagem como #CÓDIGO)</span>
                  <Input required value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} placeholder="IG-OUT26-CHAC" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Nome</span>
                  <Input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Instagram outubro — chácaras" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Canal</span>
                  <select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm">
                    {Object.entries(CANAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Funil</span>
                  <select value={form.funil} onChange={e => setForm(f => ({ ...f, funil: e.target.value as any }))} className="w-full h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm">
                    <option value="comprador">Comprador</option>
                    <option value="proprietario">Proprietário (captação de imóvel)</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Imóvel (opcional)</span>
                  <select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm">
                    <option value="">— vários / nenhum —</option>
                    {(imoveis as any[]).map(i => <option key={i.id} value={i.id}>{i.codigo ? `${i.codigo} — ` : ""}{i.denomination}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">ID do formulário Meta Lead Ads (opcional)</span>
                  <Input value={form.metaFormId} onChange={e => setForm(f => ({ ...f, metaFormId: e.target.value }))} placeholder="1234567890" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Gasto total (R$)</span>
                  <Input inputMode="decimal" value={form.gastoTotal} onChange={e => setForm(f => ({ ...f, gastoTotal: e.target.value }))} placeholder="0" />
                </label>
                <div className="flex items-end gap-2">
                  <Button type="submit" disabled={criar.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">{criar.isPending ? "Salvando..." : "Salvar"}</Button>
                  <Button type="button" variant="ghost" onClick={() => setAbrirForm(false)}>Cancelar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : campanhas.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-10 text-center space-y-2">
              <Megaphone className="h-8 w-8 mx-auto text-emerald-400" />
              <p className="text-sm text-foreground">Nenhuma campanha ainda.</p>
              <p className="text-xs text-muted-foreground">Crie uma campanha para cada anúncio, placa ou portal. O link de WhatsApp gerado já leva o código do imóvel e da campanha.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(campanhas as any[]).map(c => {
              const imovel = c.propertyId ? imovelPorId.get(c.propertyId) : null;
              return (
                <Card key={c.id} className={`bg-card border-border ${c.ativa ? "" : "opacity-60"}`}>
                  <CardContent className="py-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-emerald-300">#{c.codigo}</span>
                          <span className="text-sm text-foreground">{c.nome}</span>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-border text-muted-foreground">{c.funil === "proprietario" ? "Proprietário" : "Comprador"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {CANAL_LABEL[c.canal] || c.canal}
                          {imovel ? ` · ${imovel.codigo || ""} ${imovel.denomination}` : ""}
                          {c.metaFormId ? ` · formulário ${c.metaFormId}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-4 text-center text-xs">
                        <div><p className="text-lg font-bold text-foreground">{c.leadsPrimeiroToque}</p><p className="text-muted-foreground">leads (1º toque)</p></div>
                        <div><p className="text-lg font-bold text-foreground">{c.leadsUltimoToque}</p><p className="text-muted-foreground">último toque</p></div>
                        <div><p className="text-lg font-bold text-foreground">{c.gastoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p><p className="text-muted-foreground">gasto</p></div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setLinkAberto(linkAberto === c.id ? null : c.id)}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Link</Button>
                        <Button size="sm" variant="ghost" onClick={() => alternar.mutate({ id: c.id, ativa: !c.ativa })}>{c.ativa ? "Pausar" : "Ativar"}</Button>
                        <Button size="sm" variant="ghost" className="text-red-300" onClick={() => { if (confirm(`Excluir a campanha #${c.codigo}?`)) excluir.mutate({ id: c.id }); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    {linkAberto === c.id && <LinkGerado campanhaId={c.id} />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
