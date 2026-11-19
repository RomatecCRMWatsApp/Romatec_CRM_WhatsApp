import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, ExternalLink, Images, Instagram, Link2, Loader2, Mail, MessageCircle, QrCode, Send, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";

import { linkImovel, textoAnuncio, textoDivulgacaoImovel, textoSeguirInstagramImovel, type ImovelCompartilhavel } from "@shared/anuncioImovel";
import { VERSICULOS_AGRADECIMENTO } from "@shared/linksDivulgacao";
import { linkInstagram } from "@shared/cartaoVendas";
import { comRef, useCartaoVendas } from "@/lib/cartaoVendas";

export type { ImovelCompartilhavel };
type Canal = "whatsapp" | "instagram" | "facebook" | "telegram" | "email" | "link" | "nativo";
const MAX_FOTOS_ENVIO = 6;
const linkPublico = (p: ImovelCompartilhavel, canal: Canal, corretorId?: number | null) => linkImovel(window.location.origin, p, canal, corretorId);

const nomeArquivo = (p: ImovelCompartilhavel, i: number, tipo: string) =>
  `${(p.codigo || `imovel-${p.id}`).replace(/[^\w-]+/g, "_")}-foto-${String(i + 1).padStart(2, "0")}.${tipo.includes("png") ? "png" : tipo.includes("webp") ? "webp" : "jpg"}`;

async function baixarFotos(p: ImovelCompartilhavel, limite: number): Promise<File[]> {
  const fotos = (p.images ?? []).slice(0, limite);
  const arquivos: File[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const url = fotos[i];
    try {
      const r = await fetch(url, { mode: "cors" });
      if (!r.ok) continue;
      const b = await r.blob();
      arquivos.push(new File([b], nomeArquivo(p, i, b.type || "image/jpeg"), { type: b.type || "image/jpeg" }));
    } catch { /* foto de outro domínio sem CORS: pula */ }
  }
  return arquivos;
}

function Opcao({ icone: Icone, rotulo, sub, onClick, destaque, ocupado, desabilitado }: {
  icone: React.ComponentType<{ className?: string }>; rotulo: string; sub?: string; onClick: () => void; destaque?: string; ocupado?: boolean; desabilitado?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={ocupado || desabilitado}
      className={`flex min-h-[58px] items-center gap-2 rounded-xl border border-border/50 bg-secondary/30 p-2 text-left transition hover:border-emerald/50 hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald disabled:opacity-50 ${destaque ?? ""}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/30">
        {ocupado ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icone className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{rotulo}</span>
        {sub && <span className="block text-[11px] leading-tight text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}

/** Folha de compartilhamento de um imóvel: WhatsApp com a ficha, fotos, redes, link rastreado, QR e página pública */
export function CompartilharImovel({ imovel, aberto, onFechar, onQr, focoInstagram }: { imovel: ImovelCompartilhavel | null; aberto: boolean; onFechar: () => void; onQr?: () => void; focoInstagram?: boolean }) {
  const { user } = useAuth();
  const cartao = useCartaoVendas();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [versiculo, setVersiculo] = useState(0);
  const secaoIg = useRef<HTMLElement | null>(null);
  // Aberto pelo botão "Siga meu Instagram" do cartão: vai direto para a peça
  useEffect(() => {
    if (!aberto || !focoInstagram) return;
    const t = setTimeout(() => secaoIg.current?.scrollIntoView({ block: "start" }), 120);
    return () => clearTimeout(t);
  }, [aberto, focoInstagram]);
  if (!imovel) return null;
  const corretorId = (user as any)?.id ?? null;
  const assinatura = [cartao.nome, cartao.telefones[0]].filter(Boolean).join(" · ") || null;
  // ?c= de quem compartilha: na página do imóvel o WhatsApp e o lead do formulário vão para essa pessoa
  const link = (c: Canal) => { const l = linkPublico(imovel, c, corretorId); return l ? comRef(l, cartao.ref) : l; };
  const nVideos = Array.isArray((imovel as any).videos) ? (imovel as any).videos.length : (imovel as any).videoUrl ? 1 : 0;
  const texto = (c: Canal) => textoDivulgacaoImovel(imovel, link(c), cartao, nVideos);
  const semLink = !link("link");
  const usuarioIg = cartao.instagramProprio ?? cartao.instagram;
  const textoSeguir = textoSeguirInstagramImovel(imovel, link("whatsapp"), usuarioIg, cartao, versiculo);
  const nFotos = imovel.images?.length ?? 0;
  const abrir = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const copiar = async (t: string, msg: string) => {
    try { await navigator.clipboard.writeText(t); toast.success(msg); } catch { toast.error("Não foi possível copiar: selecione e copie manualmente"); }
  };

  const enviarComFotos = async () => {
    if (!nFotos) return toast.error("Este imóvel ainda não tem fotos");
    setOcupado("fotos");
    try {
      const arquivos = await baixarFotos(imovel, MAX_FOTOS_ENVIO);
      const dados = { files: arquivos, text: texto("whatsapp"), title: imovel.denomination };
      if (arquivos.length && (navigator as any).canShare?.(dados)) {
        await navigator.share(dados);
        return;
      }
      toast.info("Este aparelho não envia fotos direto. Enviei o texto pelo WhatsApp — anexe as fotos baixadas.");
      abrir(`https://wa.me/?text=${encodeURIComponent(texto("whatsapp"))}`);
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Não foi possível compartilhar as fotos");
    } finally { setOcupado(null); }
  };

  const nativo = async () => {
    const url = link("nativo");
    if (navigator.share) {
      try { await navigator.share({ title: imovel.denomination, text: textoAnuncio(imovel, null, assinatura), url: url ?? undefined }); } catch { /* cancelado */ }
    } else copiar(texto("link"), "Anúncio copiado");
  };

  const salvarFotos = async () => {
    if (!nFotos) return toast.error("Este imóvel ainda não tem fotos");
    setOcupado("baixar");
    try {
      const arquivos = await baixarFotos(imovel, nFotos);
      if (!arquivos.length) {
        (imovel.images ?? []).forEach(u => abrir(u));
        toast.info("As fotos abriram em novas abas: toque e segure para salvar");
        return;
      }
      for (const f of arquivos) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      toast.success(`${arquivos.length} foto(s) baixada(s) — prontas para o Instagram e o Status`);
    } finally { setOcupado(null); }
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="h-5 w-5 text-emerald" /> Compartilhar imóvel</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/20 p-2">
          {imovel.images?.[0]
            ? <img src={imovel.images[0]} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
            : <div className="h-14 w-20 shrink-0 rounded-lg bg-secondary/50" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{imovel.codigo && <span className="mr-1.5 font-mono text-xs text-ok-300">{imovel.codigo}</span>}{imovel.denomination}</p>
            <p className="truncate text-xs text-muted-foreground">{[imovel.address, imovel.city].filter(Boolean).join(", ")}</p>
          </div>
        </div>
        {semLink && (
          <p className="rounded-lg border border-warn-500/30 bg-warn-500/10 p-2 text-xs text-warn-300">
            Este imóvel ainda não tem página pública. Dá para enviar o texto e as fotos; para ter o link, edite o imóvel e gere o código ou a página.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Opcao icone={MessageCircle} rotulo="WhatsApp" sub="Ficha completa com o link" destaque="text-emerald"
            onClick={() => abrir(`https://wa.me/?text=${encodeURIComponent(texto("whatsapp"))}`)} />
          <Opcao icone={Images} rotulo="Enviar com fotos" sub={`Texto + até ${Math.min(MAX_FOTOS_ENVIO, nFotos) || MAX_FOTOS_ENVIO} fotos (celular)`}
            onClick={enviarComFotos} ocupado={ocupado === "fotos"} desabilitado={!nFotos} />
          <Opcao icone={Share2} rotulo="Mais apps" sub="Instagram Direct, Messenger, SMS…" onClick={nativo} />
          <Opcao icone={Link2} rotulo="Copiar link" sub="Rastreia de onde veio o cliente" desabilitado={semLink}
            onClick={() => { const l = link("link"); if (l) copiar(l, "Link copiado"); }} />
          <Opcao icone={Copy} rotulo="Copiar anúncio" sub="Texto pronto para colar" onClick={() => copiar(texto("link"), "Anúncio copiado")} />
          <Opcao icone={Download} rotulo="Baixar fotos" sub={nFotos ? `${nFotos} foto(s) para Instagram e Status` : "Sem fotos"}
            onClick={salvarFotos} ocupado={ocupado === "baixar"} desabilitado={!nFotos} />
          <Opcao icone={Send} rotulo="Facebook" sub="Publicar o link" desabilitado={semLink}
            onClick={() => { const l = link("facebook"); if (l) abrir(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(l)}`); }} />
          <Opcao icone={Send} rotulo="Telegram" desabilitado={semLink}
            onClick={() => { const l = link("telegram"); if (l) abrir(`https://t.me/share/url?url=${encodeURIComponent(l)}&text=${encodeURIComponent(textoAnuncio(imovel, null, assinatura))}`); }} />
          <Opcao icone={Mail} rotulo="E-mail"
            onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(`Imóvel: ${imovel.denomination}`)}&body=${encodeURIComponent(texto("email").replace(/\*/g, ""))}`; }} />
          {onQr && imovel.codigo && <Opcao icone={QrCode} rotulo="QR da placa" sub="PNG/SVG para placa e panfleto" onClick={onQr} />}
          {!semLink && <Opcao icone={ExternalLink} rotulo="Ver página pública" sub="Como o cliente vê" onClick={() => { const l = link("link"); if (l) abrir(l); }} />}
        </div>
        <section ref={secaoIg} className="space-y-2 rounded-xl border border-[color:var(--c-dd2a7b)]/50 bg-gradient-to-br from-[color:var(--c-dd2a7b)]/10 via-card to-card p-3" aria-label="Siga meu Instagram">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Instagram className="h-4 w-4 text-[color:var(--c-dd2a7b)]" /> Siga meu Instagram, com este imóvel</p>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Versículo
              <select value={versiculo} onChange={e => setVersiculo(Number(e.target.value))} className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground">
                {VERSICULOS_AGRADECIMENTO.map((v, i) => <option key={v.ref} value={i}>{v.ref}</option>)}
              </select>
            </label>
          </div>
          {!cartao.instagramProprio && <p className="text-[11px] text-warn-300">Sem Instagram no seu cadastro: vai o institucional @{cartao.instagram}. <a href="/meu-cadastro" className="underline">Cadastre o seu</a>.</p>}
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/20 p-2 font-sans text-xs text-foreground/80 [overflow-wrap:anywhere]">{textoSeguir}</pre>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => abrir(`https://wa.me/?text=${encodeURIComponent(textoSeguir)}`)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-ok-600 px-3 text-sm font-semibold text-white hover:bg-ok-700"><MessageCircle className="h-4 w-4" /> Enviar no WhatsApp</button>
            <button type="button" onClick={() => copiar(textoSeguir, "Texto copiado")}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-secondary/50"><Copy className="h-4 w-4" /> Copiar texto</button>
            <button type="button" onClick={async () => { if ((navigator as any).share) { try { await navigator.share({ text: textoSeguir }); } catch { /* cancelado */ } } else copiar(textoSeguir, "Texto copiado"); }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-secondary/50"><Share2 className="h-4 w-4" /> Compartilhar</button>
            <a href={linkInstagram(usuarioIg)} target="_blank" rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-secondary/50"><ExternalLink className="h-4 w-4" /> Abrir perfil</a>
          </div>
        </section>
        <details className="rounded-xl border border-border/50 bg-secondary/20 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-foreground">Prévia do anúncio</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-foreground/80">{texto("whatsapp")}</pre>
        </details>
      </DialogContent>
    </Dialog>
  );
}
