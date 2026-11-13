/** Anúncio de imóvel para compartilhar: texto pronto (WhatsApp) e link público com a origem (UTM) */

export interface ImovelCompartilhavel {
  id: number;
  denomination: string;
  codigo?: string | null;
  publicSlug?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  price?: number | string | null;
  offerPrice?: number | string | null;
  exibirPreco?: boolean | number | null;
  finalidade?: string | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  garageSpaces?: number | null;
  areaConstruida?: number | string | null;
  areaTerreno?: number | string | null;
  images?: string[] | null;
  videoUrl?: string | null;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const m2 = (v: number | string) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

/** Página pública do imóvel com a origem do compartilhamento (UTM lida pela landing /i/:codigo) */
export function linkImovel(origem: string, p: ImovelCompartilhavel, canal: string, corretorId?: number | null): string | null {
  const base = p.codigo ? `/i/${encodeURIComponent(p.codigo)}` : p.publicSlug ? `/imovel/${encodeURIComponent(p.publicSlug)}` : null;
  if (!base) return null;
  const q = new URLSearchParams({ utm_source: canal, utm_medium: "compartilhar", utm_campaign: p.codigo || `imovel-${p.id}` });
  if (corretorId) q.set("utm_content", `corretor-${corretorId}`);
  return `${origem}${base}?${q.toString()}`;
}

/** Texto pronto do anúncio (negrito do WhatsApp com *) */
export function textoAnuncio(p: ImovelCompartilhavel, link: string | null, corretor?: string | null): string {
  const preco = Number(p.price) || 0, oferta = Number(p.offerPrice) || 0;
  const mostraPreco = p.exibirPreco !== false && p.exibirPreco !== 0 && preco > 0;
  const linhas: string[] = [];
  linhas.push(`🏡 *${p.denomination}*${p.codigo ? ` (${p.codigo})` : ""}`);
  const tipo = [p.propertyType, p.finalidade === "aluguel" ? "para alugar" : "à venda"].filter(Boolean).join(" ");
  if (tipo) linhas.push(tipo.charAt(0).toUpperCase() + tipo.slice(1));
  const local = [p.address, [p.city, p.state].filter(Boolean).join("/")].filter(Boolean).join(", ");
  if (local) linhas.push(`📍 ${local}`);
  if (mostraPreco) linhas.push(oferta > 0 && oferta < preco ? `💰 De ${brl(preco)} por *${brl(oferta)}*` : `💰 *${brl(preco)}*${p.finalidade === "aluguel" ? "/mês" : ""}`);
  else linhas.push("💰 Valor sob consulta");
  const carac = [
    p.bedrooms ? `🛏 ${p.bedrooms} quarto${p.bedrooms > 1 ? "s" : ""}` : "",
    p.bathrooms ? `🛁 ${p.bathrooms} banheiro${p.bathrooms > 1 ? "s" : ""}` : "",
    p.garageSpaces ? `🚗 ${p.garageSpaces} vaga${p.garageSpaces > 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  if (carac.length) linhas.push(carac.join(" · "));
  const areas = [p.areaConstruida ? `construída ${m2(p.areaConstruida)}` : "", p.areaTerreno ? `terreno ${m2(p.areaTerreno)}` : ""].filter(Boolean);
  if (areas.length) linhas.push(`📐 Área ${areas.join(" · ")}`);
  if (link) linhas.push("", `👉 Fotos e detalhes: ${link}`);
  if (corretor) linhas.push("", `Fale comigo: ${corretor}`);
  return linhas.join("\n");
}

