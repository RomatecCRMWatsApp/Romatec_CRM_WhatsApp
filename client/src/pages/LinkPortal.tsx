import { MapPin, MessageCircle, Building2, ExternalLink, ChevronRight, Image as ImageIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { especialistas } from "@/lib/especialistas";
import type { Property } from "../../../drizzle/schema";
import LeadForm, { readUtm, type Utm } from "@/components/LeadForm";

/**
 * Portal de links para a bio do Instagram (estilo Linktree), público em /links.
 * Cada conta do Instagram usa seu próprio link para o CRM saber a origem do lead:
 *   romateccrm.com/links?ig=avalieimob
 *   romateccrm.com/links?ig=romatecimoveis
 */

// Links extras do portal — edite aqui para adicionar/remover botões
const EXTRA_LINKS = [
  { label: "AvalieImob — Software de PTAM e Laudos", href: "https://www.romatecavalieimob.com.br/cadastro" },
];

function formatCurrency(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function portalUtm(): Utm {
  const ig = new URLSearchParams(window.location.search).get("ig")?.replace(/[^\w.]/g, "").slice(0, 60);
  return readUtm() ?? { source: "instagram", medium: "bio", campaign: ig || "bio" };
}

function withUtm(path: string, utm: Utm) {
  const q = new URLSearchParams();
  if (utm.source) q.set("utm_source", utm.source);
  if (utm.medium) q.set("utm_medium", utm.medium);
  if (utm.campaign) q.set("utm_campaign", utm.campaign);
  return `${path}?${q.toString()}`;
}

export default function LinkPortal() {
  const utm = portalUtm();
  const { data, isLoading } = trpc.properties.list.useQuery();
  const properties = (data ?? []) as Property[];
  const disponiveis = properties.filter(p => p.status === "available" && p.finalidade !== "aluguel" && p.publicSlug);

  const esp = especialistas[0];
  const whatsappLink = `https://wa.me/${esp.telefone}?text=${encodeURIComponent(
    "Olá! Vim pelo Instagram e quero saber mais sobre os lotes e chácaras disponíveis 😊"
  )}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-8">

        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-800/30 border-2 border-emerald-500/50 flex items-center justify-center mb-3">
            <Building2 className="h-9 w-9 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Romatec Imóveis</h1>
          <p className="text-sm text-muted-foreground mt-1">Lotes, chácaras e imóveis em Açailândia - MA</p>
        </div>

        {/* Botões principais */}
        <div className="flex flex-col gap-3 mb-8">
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
            className="btn-premium py-4 rounded-2xl flex items-center justify-center gap-2 text-base font-semibold no-underline">
            <MessageCircle className="h-5 w-5" /> Falar agora no WhatsApp
          </a>
          <a href={withUtm("/imoveis", utm)}
            className="py-4 rounded-2xl flex items-center justify-center gap-2 text-base font-semibold no-underline border border-border/50 bg-secondary/30 text-foreground hover:border-emerald/50 transition-colors">
            <Building2 className="h-5 w-5 text-emerald" /> Ver todos os imóveis
          </a>
        </div>

        {/* Lotes e chácaras */}
        <h2 className="text-lg font-bold text-foreground mb-3">🏡 Disponíveis agora</h2>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 border-4 border-emerald/30 border-t-emerald rounded-full animate-spin" />
          </div>
        ) : disponiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-8">Novas unidades em breve. Fale com a gente no WhatsApp!</p>
        ) : (
          <div className="flex flex-col gap-3 mb-8">
            {disponiveis.map(p => {
              const img = (p.images as string[] | null)?.[0];
              const price = p.offerPrice || p.price;
              return (
                <a key={p.id} href={withUtm(`/imovel/${p.publicSlug}`, utm)}
                  className="glass-card rounded-2xl overflow-hidden flex items-stretch no-underline hover:border-emerald/50 transition-colors">
                  <div className="w-28 flex-shrink-0 bg-secondary/40 flex items-center justify-center">
                    {img
                      ? <img src={img} alt={p.denomination} loading="lazy" className="w-full h-full object-cover" />
                      : <ImageIcon className="h-8 w-8 text-muted-foreground/30" />}
                  </div>
                  <div className="flex-1 min-w-0 p-3">
                    <p className="font-semibold text-foreground leading-tight break-words">{p.denomination}</p>
                    {p.city && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-emerald flex-shrink-0" /> {p.city}{p.state ? ` - ${p.state}` : ""}
                      </p>
                    )}
                    {price && <p className="text-emerald font-bold mt-1">R$ {formatCurrency(price)}</p>}
                  </div>
                  <div className="flex items-center pr-3">
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {/* Captação */}
        <LeadForm utm={utm} title="📩 Quer receber valores e condições?" />

        {/* Links extras */}
        {EXTRA_LINKS.length > 0 && (
          <div className="flex flex-col gap-3 mb-8">
            {EXTRA_LINKS.map(l => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                className="py-3.5 px-4 rounded-2xl flex items-center justify-between gap-2 text-sm font-medium no-underline border border-border/50 bg-secondary/20 text-foreground hover:border-emerald/50 transition-colors">
                <span>{l.label}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Rodapé */}
        <div className="text-center text-xs text-muted-foreground">
          <p>Romatec Consultoria Imobiliária</p>
          <p>Rua São Raimundo, 10 - Centro, Açailândia - MA</p>
        </div>
      </div>
    </div>
  );
}
