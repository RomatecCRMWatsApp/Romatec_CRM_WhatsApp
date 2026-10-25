import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Copy, Download, Loader2, Share2, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { sel } from "@/components/cadastro/campos";

/**
 * Ficha de credenciamento do corretor no empreendimento (PDF com Cartão CRECI, Certidão e CNH anexados):
 * para mandar ao cliente que pergunta se o corretor é credenciado. Só sai com o cadastro completo.
 */
export default function FichaCredenciamento({ uid }: { uid: number }) {
  const { data: emps } = trpc.empreendimentosAdmin.lista.useQuery();
  const lista = (emps ?? []).filter(e => e.acesso);
  const [slug, setSlug] = useState("");
  useEffect(() => { if (!slug && lista.length) setSlug(lista[0].slug); }, [lista.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: sit, isFetching } = trpc.cadastro.credenciamento.useQuery({ id: uid, slug }, { enabled: !!slug });
  const [gerando, setGerando] = useState<"baixar" | "enviar" | null>(null);
  const nomeEmp = lista.find(e => e.slug === slug)?.nome ?? "";

  const pdf = async (): Promise<File> => {
    const r = await fetch(`/api/usuarios/${uid}/credenciamento.pdf?emp=${encodeURIComponent(slug)}`, { credentials: "include" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.pendencias?.length ? `Falta: ${j.pendencias.join(", ")}` : j.error || "Falha ao gerar a ficha");
    }
    const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "FICHA-CREDENCIAMENTO.pdf";
    return new File([await r.blob()], nome, { type: "application/pdf" });
  };
  const baixar = async () => {
    setGerando("baixar");
    try {
      const f = await pdf();
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url; a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) { toast.error(e.message); } finally { setGerando(null); }
  };
  // No celular manda o PDF direto para o WhatsApp; no computador abre o WhatsApp com o link de verificação
  const enviar = async () => {
    setGerando("enviar");
    try {
      const texto = `Sou corretor(a) credenciado(a) no ${nomeEmp}. Confira minha ficha e a situação do meu CRECI: ${sit?.link ?? ""}`;
      const f = await pdf();
      if ((navigator as any).canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: "Ficha de credenciamento", text: texto }); return; }
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    } catch (e: any) { if (e?.name !== "AbortError") toast.error(e.message); } finally { setGerando(null); }
  };
  const copiar = async () => {
    if (!sit?.link) return;
    try { await navigator.clipboard.writeText(sit.link); toast.success("Link de verificação copiado"); } catch { window.prompt("Copie o link:", sit.link); }
  };

  if (!lista.length) return null;
  return (
    <div className="min-w-[260px] flex-1 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <BadgeCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Ficha de credenciamento</span>
        {lista.length > 1 && (
          <select value={slug} onChange={e => setSlug(e.target.value)} className={`${sel} ml-auto h-8 w-auto text-xs`}>
            {lista.map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
          </select>
        )}
      </div>
      {isFetching && !sit ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo o cadastro…</p>
        : sit && !sit.apto ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">
            <p className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-3.5 w-3.5" /> Para gerar a ficha, falta:</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">{sit.pendencias.map(p => <li key={p}>{p}</li>)}</ul>
          </div>
        ) : sit?.apto ? (
          <>
            <p className="text-xs text-muted-foreground">Dados do empreendimento e seus dados, com o Cartão CRECI, a Certidão e a CNH anexados e um QR para o cliente conferir.</p>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!!gerando} onClick={baixar}>
                {gerando === "baixar" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />} Baixar PDF
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs border-[#25d366]/40 text-[#1fa855] hover:text-[#1fa855]" disabled={!!gerando} onClick={enviar}>
                {gerando === "enviar" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-1 h-3.5 w-3.5" />} Enviar pelo WhatsApp
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={copiar}><Copy className="mr-1 h-3.5 w-3.5" /> Link de verificação</Button>
            </div>
          </>
        ) : null}
    </div>
  );
}
