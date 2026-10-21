import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, ExternalLink, Globe2, Link2, Megaphone, Plus, Trash2 } from "lucide-react";
import { SLUG_BOM_JARDIMS, linkEmpreendimento, linkKml } from "@shared/chacaraLink";
import PageHeader from "@/components/PageHeader";

const CANAL_LABEL: Record<string, string> = {
  meta_ctwa: "Anúncio Click-to-WhatsApp", meta_leadads: "Meta Lead Ads", google_ads: "Google Ads",
  portal_olx: "OLX", portal_zap: "ZAP Imóveis", portal_vivareal: "VivaReal", instagram_organico: "Instagram orgânico",
  placa_qr: "QR da placa", site: "Site", indicacao: "Indicação", wifi: "Wi-Fi", outro: "Outro",
};

const vazio = { codigo: "", nome: "", canal: "meta_ctwa", funil: "comprador" as "comprador" | "proprietario", propertyId: "", empreendimentoSlug: "", metaFormId: "", gastoTotal: "" };
/** "1.500,50" → 1500.5; "300.00" e "300" também valem */
const reais = (v: string) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) || 0;

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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="bg-white rounded-lg p-2 w-32 h-32 shrink-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: data.qrSvg }} />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>QR do link do WhatsApp (para criativo/post).</p>
          {data.landing && <p>Página do imóvel com a campanha: <a className="text-emerald-300 underline break-all" href={data.landing} target="_blank" rel="noreferrer">{data.landing}</a></p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.landing && <Button size="sm" variant="outline" onClick={() => copiar(data.landing!, "Link da página")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link da página</Button>}
        <Button size="sm" variant="outline" onClick={() => copiar(data.url, "Link")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link wa.me</Button>
        <Button size="sm" variant="outline" onClick={() => copiar(data.mensagem, "Mensagem")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar mensagem</Button>
        <Button size="sm" variant="ghost" asChild><a href={data.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Testar</a></Button>
      </div>
    </div>
  );
}

/** Campanha do Bom Jardims: link da página do empreendimento (poligonal geral) + KML para o Google Earth */
function LinkEmpreendimento({ codigoCampanha }: { codigoCampanha: string }) {
  const pagina = linkEmpreendimento(window.location.origin, codigoCampanha);
  const kml = linkKml(window.location.origin);
  const copiar = async (texto: string, rotulo: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiado`); } catch { toast.error("Não foi possível copiar"); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <p className="text-xs font-semibold text-emerald-300">Link do empreendimento (Condomínio de Chácaras Bom Jardims)</p>
      <p className="text-xs text-muted-foreground">
        Página pública com fotos, vídeo e o mapa com a poligonal geral; os cadastros por este link entram nesta campanha.
        O KML traz a poligonal geral e todas as chácaras demarcadas (uma por uma, com o código oficial) para o Google Earth e apps de mapas.
      </p>
      <a className="block text-xs text-emerald-300 underline break-all" href={pagina} target="_blank" rel="noreferrer">{pagina}</a>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => copiar(pagina, "Link do empreendimento")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link do empreendimento</Button>
        <Button size="sm" variant="outline" onClick={() => copiar(kml, "Link do KML")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link do KML</Button>
        <Button size="sm" variant="ghost" asChild><a href={kml} download><Globe2 className="mr-1.5 h-3.5 w-3.5" /> Baixar KML</a></Button>
        <Button size="sm" variant="ghost" asChild><a href={pagina} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir página</a></Button>
      </div>
    </div>
  );
}

export default function LeadCampanhas() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: campanhas = [], isLoading } = trpc.leadCampanhas.list.useQuery();
  const { data: imoveis = [] } = trpc.properties.list.useQuery();
  const { data: emps = [] } = trpc.leadCampanhas.empreendimentos.useQuery();
  const salvarCampo = trpc.leadCampanhas.update.useMutation({
    onSuccess: () => { toast.success("Campanha atualizada"); utils.leadCampanhas.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
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
      empreendimentoSlug: form.empreendimentoSlug || null,
      metaFormId: form.metaFormId || null,
      gastoTotal: form.gastoTotal ? reais(form.gastoTotal) : 0,
    });
  };

  return (
    <div>
      <PageHeader icone={Megaphone} titulo="Campanhas de captação" subtitulo="Código da campanha + código do imóvel na mensagem do WhatsApp = origem de cada lead" />

      <div className="px-4 md:px-6 pb-6 max-w-[1500px] mx-auto space-y-4">
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
                  <span className="text-muted-foreground">Empreendimento (opcional)</span>
                  <select value={form.empreendimentoSlug} onChange={e => setForm(f => ({ ...f, empreendimentoSlug: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm">
                    <option value="">— nenhum —</option>
                    {(emps as any[]).map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
                  </select>
                  <span className="text-[11px] text-muted-foreground block">Lead desta campanha vai para o atendimento do empreendimento (sem o bot genérico)</span>
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
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <label className="flex items-center gap-2">
                        Empreendimento
                        <select
                          value={c.empreendimentoSlug || ""}
                          onChange={e => salvarCampo.mutate({ id: c.id, empreendimentoSlug: e.target.value || null })}
                          className="h-8 px-2 rounded-md border border-border bg-secondary/30 text-foreground text-xs"
                        >
                          <option value="">— nenhum —</option>
                          {(emps as any[]).map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-2">
                        Gasto (R$)
                        <Input
                          key={`gasto-${c.id}-${c.gastoTotal}`}
                          inputMode="decimal"
                          defaultValue={c.gastoTotal ? String(c.gastoTotal).replace(".", ",") : ""}
                          placeholder="0"
                          className="h-8 w-28 text-xs"
                          onBlur={e => { const v = reais(e.target.value); if (v !== c.gastoTotal) salvarCampo.mutate({ id: c.id, gastoTotal: v }); }}
                        />
                      </label>
                    </div>
                    {linkAberto === c.id && c.empreendimentoSlug === SLUG_BOM_JARDIMS && <LinkEmpreendimento codigoCampanha={c.codigo} />}
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
