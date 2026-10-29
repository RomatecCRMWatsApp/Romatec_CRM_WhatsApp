import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Copy, ExternalLink, Link2, Loader2, MessageCircle, Pencil, Plus, QrCode, Share2, Star, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useCartaoVendas } from "@/lib/cartaoVendas";
import { comAssinatura } from "@shared/cartaoVendas";
import { MARCA_LINK, montarLink, textoComLink, type DadosLink, type LinkDivulgacao } from "@shared/linksDivulgacao";

const copiar = async (texto: string, rotulo: string) => {
  try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiado`); } catch { window.prompt("Copie:", texto); }
};

type Item = LinkDivulgacao & { id: number | null; ativo: boolean };

function QrDoLink({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => { QRCode.toString(url, { type: "svg", margin: 1, width: 220 }).then(setSvg).catch(() => setSvg("")); }, [url]);
  const baixar = async () => {
    const png = await QRCode.toDataURL(url, { margin: 2, width: 800 });
    const a = document.createElement("a");
    a.href = png; a.download = "qr-divulgacao.png"; a.click();
  };
  if (!svg) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="h-28 w-28 shrink-0 rounded-lg bg-white p-1.5 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <Button size="sm" variant="outline" onClick={baixar}><QrCode className="mr-1.5 h-3.5 w-3.5" /> Baixar QR (PNG)</Button>
    </div>
  );
}

function CardLink({ l, cartao, podeEditar, onEditar }: { l: Item; cartao: ReturnType<typeof useCartaoVendas>; podeEditar: boolean; onEditar: (l: Item) => void }) {
  const utils = trpc.useUtils();
  const excluir = trpc.linksDivulgacao.excluir.useMutation({ onSuccess: () => { toast.success("Link excluído"); utils.linksDivulgacao.invalidate(); }, onError: e => toast.error(e.message) });
  const [verQr, setVerQr] = useState(false);
  const link = montarLink(window.location.origin, l, cartao.ref);
  // Texto + assinatura de quem divulga (nome, CRECI, WhatsApp, Instagram)
  const texto = comAssinatura(textoComLink(l.textoWhatsapp, link), cartao);
  const compartilhar = async () => {
    if ((navigator as any).share) { try { await navigator.share({ text: texto }); return; } catch { /* cancelou */ return; } }
    copiar(texto, "Texto");
  };
  return (
    <Card className={`bg-card ${l.destaque ? "border-amber-300/50" : "border-border"} ${l.ativo ? "" : "opacity-60"}`}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              {l.destaque && <Star className="h-4 w-4 shrink-0 fill-amber-300 text-amber-300" />}{l.titulo}
              {!l.ativo && <span className="rounded border border-border px-1.5 text-[10px] uppercase text-muted-foreground">pausado</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {[l.empreendimento, l.utmCampaign ? `campanha ${l.utmCampaign}` : null, l.fixo ? "link do sistema" : null].filter(Boolean).join(" · ")}
            </p>
            {l.descricao && <p className="mt-1 text-sm text-muted-foreground">{l.descricao}</p>}
          </div>
          {podeEditar && !l.fixo && l.id && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onEditar(l)}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="text-red-300" disabled={excluir.isPending} onClick={() => { if (confirm(`Excluir o link "${l.titulo}"?`)) excluir.mutate({ id: l.id! }); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="block break-all rounded-md border border-border bg-secondary/30 px-2 py-1.5 font-mono text-xs text-emerald-300">{link}</a>
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Texto para o WhatsApp</p>
          <p className="whitespace-pre-wrap text-sm">{texto}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Enviar no WhatsApp</a>
          </Button>
          <Button size="sm" variant="outline" onClick={() => copiar(texto, "Texto com o link")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar texto</Button>
          <Button size="sm" variant="outline" onClick={() => copiar(link, "Link")}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Copiar link</Button>
          <Button size="sm" variant="outline" onClick={compartilhar}><Share2 className="mr-1.5 h-3.5 w-3.5" /> Compartilhar</Button>
          <Button size="sm" variant="ghost" onClick={() => setVerQr(v => !v)}><QrCode className="mr-1.5 h-3.5 w-3.5" /> QR</Button>
          <Button size="sm" variant="ghost" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir</a></Button>
        </div>
        {verQr && <QrDoLink url={link} />}
      </CardContent>
    </Card>
  );
}

const VAZIO: DadosLink = { titulo: "", descricao: null, url: "", utmSource: "instagram", utmCampaign: "", textoWhatsapp: `\n\n${MARCA_LINK}`, empreendimento: "Bom Jardims", destaque: false, ativo: true };

function FormLink({ inicial, onFechar }: { inicial: (DadosLink & { id?: number }) | null; onFechar: () => void }) {
  const [f, setF] = useState<DadosLink>(inicial ?? VAZIO);
  const utils = trpc.useUtils();
  const ok = () => { toast.success("Link salvo"); utils.linksDivulgacao.invalidate(); onFechar(); };
  const criar = trpc.linksDivulgacao.criar.useMutation({ onSuccess: ok, onError: e => toast.error(e.message) });
  const editar = trpc.linksDivulgacao.editar.useMutation({ onSuccess: ok, onError: e => toast.error(e.message) });
  const ocupado = criar.isPending || editar.isPending;
  const set = (k: keyof DadosLink) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (inicial?.id) editar.mutate({ ...f, id: inicial.id }); else criar.mutate(f);
  };
  return (
    <Card className="border-emerald-500/40 bg-card">
      <CardContent className="py-4">
        <form onSubmit={salvar} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Título</span>
            <Input required value={f.titulo} onChange={set("titulo")} placeholder="Stories do lançamento — 14/11" /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Link (caminho do site ou https://)</span>
            <Input required value={f.url} onChange={set("url")} placeholder="/obras-bom-jardim" /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">utm_source (de onde vem)</span>
            <Input value={f.utmSource ?? ""} onChange={set("utmSource")} placeholder="instagram" /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">utm_campaign (código da campanha)</span>
            <Input value={f.utmCampaign ?? ""} onChange={e => setF(x => ({ ...x, utmCampaign: e.target.value.toUpperCase() }))} placeholder="IG-OBRAS-NOV26" /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Empreendimento</span>
            <Input value={f.empreendimento ?? ""} onChange={set("empreendimento")} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Descrição (só para a equipe)</span>
            <Input value={f.descricao ?? ""} onChange={set("descricao")} /></label>
          <label className="space-y-1 text-sm md:col-span-2"><span className="text-muted-foreground">Texto do WhatsApp — escreva <b>{MARCA_LINK}</b> onde o link deve entrar (sem isso, vai no fim)</span>
            <Textarea required rows={6} value={f.textoWhatsapp} onChange={set("textoWhatsapp")} /></label>
          <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.destaque} onChange={e => setF(x => ({ ...x, destaque: e.target.checked }))} /> Destaque (vai para o topo)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.ativo} onChange={e => setF(x => ({ ...x, ativo: e.target.checked }))} /> Visível para a equipe</label>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
              <Button type="submit" disabled={ocupado} className="bg-emerald-600 text-white hover:bg-emerald-700">{ocupado && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar link</Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Links de divulgação com o texto pronto do WhatsApp. Cada link sai com o ?c= de quem está logado:
 * o cliente que chega por ele cai com esse corretor (e a UTM marca a campanha).
 */
export default function LinksDivulgacao() {
  const { data, isLoading, error } = trpc.linksDivulgacao.listar.useQuery();
  const cartao = useCartaoVendas();
  const [form, setForm] = useState<(DadosLink & { id?: number }) | null | "novo">(null);
  const [busca, setBusca] = useState("");
  const links = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const l = data?.links ?? [];
    return t ? l.filter(x => `${x.titulo} ${x.descricao ?? ""} ${x.empreendimento ?? ""} ${x.utmCampaign ?? ""}`.toLowerCase().includes(t)) : l;
  }, [data, busca]);
  const editar = (l: Item) => setForm({ id: l.id!, titulo: l.titulo, descricao: l.descricao, url: l.url, utmSource: l.utmSource, utmCampaign: l.utmCampaign, textoWhatsapp: l.textoWhatsapp, empreendimento: l.empreendimento, destaque: l.destaque, ativo: l.ativo });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          Tudo sai com os seus dados{cartao.ref ? "" : " (carregando…)"}: o link leva o seu código (quem se cadastra cai com <b className="text-foreground">{cartao.nome}</b>) e o texto termina com o seu nome, {cartao.creci ?? "CRECI"} e WhatsApp.
          {!cartao.creci && <> <a href="/meu-cadastro" className="text-amber-300 underline">Cadastre o seu CRECI</a> para ele aparecer.</>}
        </p>
        <Input className="h-9 w-full sm:w-56" placeholder="Buscar link…" value={busca} onChange={e => setBusca(e.target.value)} />
        {data?.podeEditar && form === null && <Button onClick={() => setForm("novo")} className="bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="mr-1.5 h-4 w-4" /> Novo link</Button>}
      </div>
      {form !== null && <FormLink inicial={form === "novo" ? null : form} onFechar={() => setForm(null)} />}
      {error && <p className="text-sm text-red-400">{error.message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {data && links.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum link encontrado.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {links.map(l => <CardLink key={l.chave} l={l} cartao={cartao} podeEditar={!!data?.podeEditar} onEditar={editar} />)}
      </div>
    </div>
  );
}
