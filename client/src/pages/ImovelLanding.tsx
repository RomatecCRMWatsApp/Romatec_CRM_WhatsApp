import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BedDouble, Bath, Car, ChevronLeft, ChevronRight, ImageIcon, MapPin, MessageCircle, Ruler, FileImage, CheckCircle2 } from "lucide-react";
import { campanhaDaVisita, enviarEvento, gravarConsentimento, lerConsentimento, utmsDaVisita, visitanteId, type Consentimento } from "@/lib/rastreio";

const TEMPO_PASSO_S = 15;
const TEMPO_MAX_S = 300;

function reais(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : null;
}

function BannerCookies({ onEscolha }: { onEscolha: (v: "sim" | "nao") => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3">
      <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-card/95 backdrop-blur p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-foreground flex-1">
          Usamos cookies próprios para melhorar o atendimento. Nada é compartilhado com terceiros.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => onEscolha("nao")}>Recusar</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onEscolha("sim")}>Aceitar</Button>
        </div>
      </div>
    </div>
  );
}

export default function ImovelLanding() {
  const [, params] = useRoute("/i/:codigo");
  const codigo = (params?.codigo || "").toUpperCase();
  const valido = /^IMV-\d{4}$/.test(codigo);
  const { data: imovel, isLoading } = trpc.properties.byCodigo.useQuery({ codigo }, { enabled: valido, retry: false });

  const [consent, setConsent] = useState<Consentimento>(() => lerConsentimento());
  const [foto, setFoto] = useState(0);
  const [form, setForm] = useState({ nome: "", phone: "", consent: false, website: "" });
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");
  const vistos = useRef(new Set<string>());

  const uma = (tipo: Parameters<typeof enviarEvento>[0]) => {
    if (vistos.current.has(tipo)) return;
    vistos.current.add(tipo);
    enviarEvento(tipo, { codigo });
  };

  // view_imovel ao carregar (com consentimento) e tempo na página a cada 15 s, até 5 min
  useEffect(() => {
    if (!imovel || consent !== "sim") return;
    uma("view_imovel");
    let segundos = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      segundos += TEMPO_PASSO_S;
      enviarEvento("tempo_pagina", { codigo, segundos });
      if (segundos >= TEMPO_MAX_S) clearInterval(t);
    }, TEMPO_PASSO_S * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imovel, consent]);

  useEffect(() => {
    if (imovel) document.title = `${imovel.denomination} — Romatec Imóveis`;
  }, [imovel]);

  const imagens: string[] = useMemo(() => (Array.isArray(imovel?.images) ? imovel!.images.filter(Boolean) : []), [imovel]);
  const preco = imovel ? reais(imovel.offerPrice) || reais(imovel.price) : null;
  const camp = campanhaDaVisita();
  const msgWhats = `Olá! Tenho interesse no imóvel ${codigo}${camp ? ` (#${camp})` : ""}. Pode me passar mais informações?`;
  const linkWhats = imovel ? `https://wa.me/${imovel.whatsappNumero}?text=${encodeURIComponent(msgWhats)}` : "#";
  const mapa = imovel ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([imovel.address, imovel.city, imovel.state].filter(Boolean).join(", "))}` : "#";
  const area = imovel ? Number(imovel.areaTerreno) || Number(imovel.areaConstruida) || 0 : 0;

  const escolherCookies = (v: "sim" | "nao") => {
    gravarConsentimento(v);
    setConsent(v);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!form.consent) { setErro("Marque a autorização de contato para continuar."); return; }
    setEnviando(true);
    try {
      const utm = utmsDaVisita();
      const r = await fetch("/api/public/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome, phone: form.phone, propertyId: imovel?.id, consent: true, website: form.website,
          vid: visitanteId() ?? undefined,
          utm: { source: utm.utm_source, medium: utm.utm_medium, campaign: utm.utm_campaign, content: utm.utm_content },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível enviar. Fale pelo WhatsApp.");
      uma("submit_form");
      setEnviado(true);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (!valido || (!isLoading && !imovel)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Imóvel não encontrado</h1>
          <p className="text-muted-foreground mt-2">Confira o código do anúncio ou veja nossos imóveis disponíveis.</p>
          <a href="/imoveis" className="inline-block mt-6 text-emerald-400 underline">Ver imóveis da Romatec</a>
        </div>
      </div>
    );
  }
  if (isLoading || !imovel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Galeria */}
      <div className="relative w-full h-[52vh] sm:h-[62vh] bg-black">
        {imagens.length ? (
          <>
            <img src={imagens[foto]} alt={imovel.denomination} className="w-full h-full object-contain" />
            {imagens.length > 1 && (
              <>
                <button aria-label="Foto anterior" onClick={() => { uma("view_galeria"); setFoto(i => (i - 1 + imagens.length) % imagens.length); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white"><ChevronLeft className="h-5 w-5" /></button>
                <button aria-label="Próxima foto" onClick={() => { uma("view_galeria"); setFoto(i => (i + 1) % imagens.length); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white"><ChevronRight className="h-5 w-5" /></button>
                <span className="absolute bottom-3 right-3 text-xs text-white bg-black/60 px-2 py-0.5 rounded-full">{foto + 1}/{imagens.length}</span>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-16 w-16 text-white/20" /></div>
        )}
        <span className="absolute top-3 left-3 text-xs font-mono font-bold text-white bg-emerald-700/90 px-2 py-1 rounded-md">{imovel.codigo}</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-5 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-400 font-semibold">{imovel.propertyType || "Imóvel"} · {imovel.finalidade === "aluguel" ? "Aluguel" : "Venda"}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{imovel.denomination}</h1>
          <p className="flex items-start gap-1 text-sm text-muted-foreground mt-1">
            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
            {[imovel.address, imovel.city, imovel.state].filter(Boolean).join(", ")}
          </p>
          <p className="text-2xl font-bold text-emerald-300 mt-3">{preco ?? "Valor sob consulta"}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {area > 0 && <div className="glass-card p-3 text-center"><Ruler className="h-4 w-4 mx-auto text-emerald-400" /><p className="text-sm font-semibold mt-1">{area.toLocaleString("pt-BR")} m²</p></div>}
          {!!imovel.bedrooms && <div className="glass-card p-3 text-center"><BedDouble className="h-4 w-4 mx-auto text-emerald-400" /><p className="text-sm font-semibold mt-1">{imovel.bedrooms} quarto(s)</p></div>}
          {!!imovel.bathrooms && <div className="glass-card p-3 text-center"><Bath className="h-4 w-4 mx-auto text-emerald-400" /><p className="text-sm font-semibold mt-1">{imovel.bathrooms} banheiro(s)</p></div>}
          {!!imovel.garageSpaces && <div className="glass-card p-3 text-center"><Car className="h-4 w-4 mx-auto text-emerald-400" /><p className="text-sm font-semibold mt-1">{imovel.garageSpaces} vaga(s)</p></div>}
        </div>

        {imovel.description && <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{imovel.description}</p>}

        {imovel.videoUrl && (
          /\.(mp4|webm|mov)(\?|$)/i.test(imovel.videoUrl) ? (
            <video src={imovel.videoUrl} controls playsInline className="w-full rounded-xl bg-black" onPlay={() => uma("play_video")} />
          ) : (
            <a href={imovel.videoUrl} target="_blank" rel="noreferrer" onClick={() => uma("play_video")} className="block text-sm text-emerald-400 underline">▶ Ver vídeo do imóvel</a>
          )
        )}

        <div className="flex flex-wrap gap-2">
          {imovel.plantaBaixaUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={imovel.plantaBaixaUrl} target="_blank" rel="noreferrer" onClick={() => uma("view_planta")}><FileImage className="mr-1.5 h-4 w-4" /> Ver planta</a>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <a href={mapa} target="_blank" rel="noreferrer" onClick={() => uma("view_mapa")}><MapPin className="mr-1.5 h-4 w-4" /> Ver no mapa</a>
          </Button>
        </div>

        {/* Formulário curto */}
        <div className="glass-card p-4 sm:p-5 rounded-2xl">
          {enviado ? (
            <div className="text-center py-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
              <p className="font-semibold text-foreground mt-2">Recebemos seu contato!</p>
              <p className="text-sm text-muted-foreground">Em instantes você recebe as informações no WhatsApp.</p>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-3">
              <p className="font-semibold text-foreground">Quero receber mais informações</p>
              <Input required minLength={2} placeholder="Seu nome" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              <Input required inputMode="tel" placeholder="WhatsApp com DDD" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              {/* Honeypot: invisível para pessoas */}
              <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="hidden" aria-hidden="true" />
              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={form.consent} onChange={e => setForm(f => ({ ...f, consent: e.target.checked }))} />
                Autorizo a Romatec Consultoria Total a entrar em contato comigo por WhatsApp sobre este imóvel (Lei 13.709/2018). Posso cancelar a qualquer momento.
              </label>
              {erro && <p className="text-sm text-red-400">{erro}</p>}
              <Button type="submit" disabled={enviando} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">{enviando ? "Enviando..." : "Enviar"}</Button>
            </form>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center">Romatec Consultoria Total · José Romário — CRECI/MA 4.705 · Açailândia/MA</p>
      </div>

      {/* Botão fixo de WhatsApp */}
      <div className={`fixed inset-x-0 ${consent === null ? "bottom-24 sm:bottom-20" : "bottom-0"} z-40 p-3`}>
        <a href={linkWhats} target="_blank" rel="noreferrer" onClick={() => enviarEvento("clique_whatsapp", { codigo })}
          className="max-w-3xl mx-auto flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-white font-bold py-3.5 shadow-xl">
          <MessageCircle className="h-5 w-5" /> Falar no WhatsApp
        </a>
      </div>

      {consent === null && <BannerCookies onEscolha={escolherCookies} />}
    </div>
  );
}
