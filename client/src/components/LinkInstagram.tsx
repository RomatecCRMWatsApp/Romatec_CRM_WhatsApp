import { toast } from "sonner";
import { Copy, ExternalLink, Instagram, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartaoVendas } from "@/lib/cartaoVendas";
import { linkInstagram } from "@shared/cartaoVendas";

/** Instagram de quem divulga (o do cadastro; sem ele, o institucional @avalieimob): abrir, copiar e compartilhar o perfil */
export default function LinkInstagram() {
  const { instagram } = useCartaoVendas();
  const link = linkInstagram(instagram);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); toast.success("Link do Instagram copiado"); }
    catch { window.prompt("Copie o link:", link); }
  };
  const compartilhar = async () => {
    const texto = `Siga no Instagram @${instagram} — fotos, vídeos e novidades das chácaras.`;
    if (navigator.share) { try { await navigator.share({ title: `Instagram @${instagram}`, text: texto, url: link }); return; } catch { /* cancelado */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${link}`)}`, "_blank", "noopener");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-2.5">
      <p className="flex w-full items-center gap-1.5 text-xs text-muted-foreground"><Instagram className="h-3.5 w-3.5" /> Instagram para as peças: <b className="text-foreground">@{instagram}</b></p>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => window.open(link, "_blank", "noopener")}><ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir perfil</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={copiar}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar link</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs border-[#DD2A7B]/40 text-[#DD2A7B] hover:text-[#DD2A7B]" onClick={compartilhar}><Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar</Button>
    </div>
  );
}
