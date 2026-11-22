import { toast } from "sonner";
import { Car, Check, Copy, PhoneCall, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { comRef, useCartaoVendas } from "@/lib/cartaoVendas";

/** Link de retorno do empreendimento (cliente marca dia/hora para ligação ou visita com busca) */
export function linkRetorno(slug: string, ref: string | null | undefined, origem = window.location.origin) {
  return comRef(`${origem}/retorno/${slug}`, ref);
}

export function textoRetorno(link: string, nome?: string, instagram?: string | null) {
  return [
    `Olá! Obrigado pelo contato${nome ? ` e pelo interesse no ${nome}` : ""}. Agora estou em atendimento e não consigo responder na hora, mas quero te atender bem.`,
    "",
    "Funciona assim:",
    "💬 *Dúvidas pelo WhatsApp* — localização, documentação, prazo das obras, o que está incluso, valores, entrada e parcelas. Também te envio o mapa interativo, os vídeos, a simulação e a minuta do contrato. Se preferir, marco uma ligação.",
    "🚗 *Visita para escolher e fechar* — o condomínio fica a 17 km do centro. Buscamos você de carro quando já tiver decidido pela compra, para escolher a posição da chácara e assinar o contrato.",
    "",
    "Escolha aqui o que prefere e o melhor dia e horário:",
    link,
    ...(instagram ? ["", `📸 Siga também o nosso Instagram e acompanhe as obras: https://www.instagram.com/${instagram}`] : []),
  ].join("\n");
}

export function LinkRetorno({ slug, nome }: { slug: string; nome?: string }) {
  const { ref, instagram } = useCartaoVendas();
  const link = linkRetorno(slug, ref);
  const copiar = async (t: string, oque: string) => {
    try { await navigator.clipboard.writeText(t); toast.success(`${oque} copiado`); } catch { window.prompt("Copie:", t); }
  };
  const compartilhar = async () => {
    const texto = textoRetorno(link, nome, instagram);
    if (navigator.share) { try { await navigator.share({ title: "Marque seu retorno", text: texto }); return; } catch { /* cancelado */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-2.5">
      <p className="flex w-full items-center gap-1.5 text-xs text-muted-foreground"><PhoneCall className="h-3.5 w-3.5" /> Link de retorno (quando você está ocupado: o cliente marca o horário da ligação ou da visita com busca)</p>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => copiar(link, "Link de retorno")}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar link de retorno</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => copiar(textoRetorno(link, nome, instagram), "Mensagem")}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar mensagem pronta</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={compartilhar}><Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar</Button>
    </div>
  );
}

const quandoFmt = (d: string | Date) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Retornos marcados pelo link: pendentes primeiro, com "feito" e "cancelar" */
export function ListaRetornos() {
  const utils = trpc.useUtils();
  const { data } = trpc.crm.retornos.useQuery();
  const marcar = trpc.crm.marcarRetorno.useMutation({ onSuccess: () => utils.crm.retornos.invalidate(), onError: e => toast.error(e.message) });
  const pendentes = (data ?? []).filter(r => r.status === "pendente");
  if (!pendentes.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-warn-300">Retornos marcados pelo link ({pendentes.length})</h2>
      {pendentes.map(r => (
        <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {r.tipo === "visita_busca" ? <Car className="h-4 w-4 text-primary" aria-hidden="true" /> : <PhoneCall className="h-4 w-4 text-primary" aria-hidden="true" />}
            <span className="font-mono text-sm font-semibold">{quandoFmt(r.quando)}</span>
            <a href={`/leads/lead/${r.leadId}`} className="font-semibold hover:underline">{r.nome}</a>
            <span className="text-xs text-muted-foreground">{r.tipo === "visita_busca" ? `Visita com busca${r.pessoas ? ` · ${r.pessoas} pessoa(s)` : ""}` : "Ligação"}</span>
            {r.avisado && <span className="text-[11px] text-ok-300">aviso enviado</span>}
            {r.responsavel && <span className="ml-auto text-xs text-muted-foreground">{r.responsavel}</span>}
          </div>
          {r.enderecoBusca && <p className="text-xs">Buscar em: {r.enderecoBusca}</p>}
          {r.observacao && <p className="text-xs text-muted-foreground">{r.observacao}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {r.telefone && <a href={`tel:+${r.telefone.replace(/\D/g, "")}`} className="text-xs text-primary hover:underline">Ligar</a>}
            {r.telefone && <a href={`https://wa.me/${r.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-xs text-ok-300 hover:underline">WhatsApp</a>}
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={marcar.isPending} onClick={() => marcar.mutate({ id: r.id, status: "feito" })}><Check className="mr-1 h-3.5 w-3.5" /> Feito</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={marcar.isPending} onClick={() => marcar.mutate({ id: r.id, status: "cancelado" })}><X className="mr-1 h-3.5 w-3.5" /> Cancelar</Button>
          </div>
        </div>
      ))}
    </section>
  );
}
