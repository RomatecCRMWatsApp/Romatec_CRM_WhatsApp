import { toast } from "sonner";
import { CalendarCheck, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { comRef, useCartaoVendas } from "@/lib/cartaoVendas";

/** Link de agendamento do empreendimento com a referência de quem compartilha (lead e pedido caem com essa pessoa) */
export function linkAgendamento(slug: string, ref: string | null | undefined, origem = window.location.origin) {
  return comRef(`${origem}/agendar/${slug}`, ref);
}

export default function LinkAgendamento({ slug, nome, compacto }: { slug: string; nome?: string; compacto?: boolean }) {
  const { ref } = useCartaoVendas();
  const link = linkAgendamento(slug, ref);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); toast.success("Link de agendamento copiado"); }
    catch { window.prompt("Copie o link:", link); }
  };
  const compartilhar = async () => {
    const texto = `Agende seu atendimento${nome ? ` no ${nome}` : ""}: preencha o formulário e eu confirmo o dia e o horário com você.`;
    if (navigator.share) { try { await navigator.share({ title: nome ? `Agendamento — ${nome}` : "Agendamento", text: texto, url: link }); return; } catch { /* cancelado */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${link}`)}`, "_blank", "noopener");
  };
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compacto ? "" : "rounded-lg border border-border p-2.5"}`}>
      {!compacto && <p className="flex w-full items-center gap-1.5 text-xs text-muted-foreground"><CalendarCheck className="h-3.5 w-3.5" /> Link de agendamento (formulário que vira lead e pedido na sua agenda)</p>}
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={copiar}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar link de agendamento</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs border-[#25d366]/40 text-[#1fa855] hover:text-[#1fa855]" onClick={compartilhar}><Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar</Button>
    </div>
  );
}
