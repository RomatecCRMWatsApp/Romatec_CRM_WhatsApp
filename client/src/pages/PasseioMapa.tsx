import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { ChevronLeft, ChevronRight, Hand, Loader2, MapPin, MessageCircle, Moon, Pause, Play, Sun, Sunrise, Sunset } from "lucide-react";
import { COR_PASSEIO, type Camera, type LotePasseio } from "@/components/passeio/MapaPasseio";
import { webglDisponivel } from "@/components/bom-jardims/Mapa3D";
import { fraseDoSol, hhmm, hojeLocal, instanteLocal, nascerEPor, posicaoSol } from "@shared/sol";

const MapaPasseio = lazy(() => import("@/components/passeio/MapaPasseio"));

/**
 * Passeio no Mapa (/p/:token): o cliente abre no celular, sem login, e passa por 6 passos com a câmera voando sobre o
 * relevo: chegada, entorno, sol e relevo, lotes, "Quero este lote" e contato. Eventos vão para o CRM do corretor.
 */
type Pt = [number, number];
type Dados = {
  ok: true;
  empreendimento: { nome: string; slug: string; municipio: string | null; uf: string | null; lat: number | null; lon: number | null; perimetro: Pt[] | null; areaHa: number | null; abertura: { video: string; poster: string } | null };
  lotes: LotePasseio[]; loteDestaqueId: number | null;
  entrada: { lon: number; lat: number; rotulo: string } | null;
  rota: { origem: string; linha: Pt[]; km: number | null; minutos: number | null; pontos?: { n: number; titulo: string; texto: string; lon: number | null; lat: number | null }[] } | null;
  sol: { fuso: string; exagero: number };
  contato: { nome: string; whatsapp: string | null; foto: string | null; creci: string | null };
  empresa: { nome: string; whatsapp: string | null };
  mostrarPreco: boolean;
};
type Erro = { ok: false; motivo: "invalido" | "expirado" | "desativado"; empresa: { nome: string; whatsapp: string | null } };

const OURO = "#E8B54A";
const ROTULO_SIT: Record<LotePasseio["situacao"], string> = { disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido", indisponivel: "Fora de venda" };
const br = (n: number, casas = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const area = (m2: number | null) => (m2 == null ? "—" : m2 >= 10_000 ? `${br(m2 / 10_000, 2)} ha` : `${br(m2, 2)} m²`);
const wa = (numero: string | null, texto: string) => (numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`);

function sessaoAnonima(): string {
  try {
    const k = "romatec.passeio.sessao";
    const v = sessionStorage.getItem(k);
    if (v) return v;
    const n = (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(k, n);
    return n;
  } catch { return Math.random().toString(36).slice(2); }
}

export default function PasseioMapa() {
  const { token } = useParams<{ token: string }>();
  const [dados, setDados] = useState<Dados | Erro | null>(null);
  const sessao = useMemo(sessaoAnonima, []);
  const evento = (tipo: string, extra: { passo?: number; loteId?: number } = {}) => {
    try {
      fetch(`/api/public/tour/${encodeURIComponent(token)}/evento`, {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ tipo, sessao, ...extra }),
      }).catch(() => { /* métrica nunca trava o passeio */ });
    } catch { /* idem */ }
  };

  useEffect(() => {
    let vivo = true;
    fetch(`/api/public/tour/${encodeURIComponent(token)}`).then(r => r.json()).then(j => { if (vivo) setDados(j?.ok === false || j?.ok === true ? j : { ok: false, motivo: "invalido", empresa: { nome: "Romatec", whatsapp: null } }); })
      .catch(() => vivo && setDados({ ok: false, motivo: "invalido", empresa: { nome: "Romatec", whatsapp: null } }));
    return () => { vivo = false; };
  }, [token]);

  useEffect(() => {
    if (dados?.ok) { evento("open"); document.title = `Passeio · ${dados.empreendimento.nome}`; }
  }, [dados?.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dados) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#0f1a12] text-white"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!dados.ok) return <Indisponivel e={dados} />;
  return <Passeio d={dados} evento={evento} url={typeof window !== "undefined" ? window.location.href : ""} />;
}

function Indisponivel({ e }: { e: Erro }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#0f1a12] px-6 text-center text-white">
      <MapPin className="h-10 w-10" style={{ color: OURO }} />
      <h1 className="font-serif text-2xl">Este link não está mais disponível</h1>
      <p className="max-w-sm text-sm text-white/70">{e.motivo === "expirado" ? "O prazo deste passeio terminou." : e.motivo === "desativado" ? "Este passeio foi encerrado." : "Confira se o endereço está completo."} Fale com a {e.empresa.nome} para receber um novo.</p>
      <a href={wa(e.empresa.whatsapp, "Olá! Quero receber o passeio no mapa do loteamento.")} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#25D366] px-5 font-semibold text-[#06281a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        <MessageCircle className="h-5 w-5" /> Falar no WhatsApp
      </a>
    </main>
  );
}

type Passo = { n: 1 | 2 | 3 | 4 | 5 | 6; legenda: string };

function Passeio({ d, evento, url }: { d: Dados; evento: (t: string, x?: { passo?: number; loteId?: number }) => void; url: string }) {
  const e = d.empreendimento;
  const webgl = useMemo(webglDisponivel, []);
  const passos: Passo[] = useMemo(() => [
    { n: 1, legenda: "Seu passeio pelo loteamento" },
    ...(d.rota || d.entrada ? [{ n: 2 as const, legenda: "Onde fica e como chegar" }] : []),
    { n: 4, legenda: "O sol e o relevo de cada lote" },
    { n: 5, legenda: "Toque no lote: área e situação" },
    { n: 6, legenda: "Gostou? Fale com a gente" },
  ], [d.rota, d.entrada]);
  const [i, setI] = useState(0);
  const passo = passos[i];
  const lotesOrd = useMemo(() => {
    const ordem: Record<LotePasseio["situacao"], number> = { disponivel: 0, reservado: 1, indisponivel: 2, vendido: 3 };
    return [...d.lotes].sort((a, b) => (a.id === d.loteDestaqueId ? -1 : b.id === d.loteDestaqueId ? 1 : ordem[a.situacao] - ordem[b.situacao] || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })));
  }, [d.lotes, d.loteDestaqueId]);
  const [sel, setSel] = useState<number | null>(d.loteDestaqueId ?? lotesOrd.find(l => l.situacao === "disponivel")?.id ?? null);
  const [livre, setLivre] = useState(false);
  const [intro, setIntro] = useState(!!e.abertura);
  const [legenda, setLegenda] = useState(true);
  const [rotaFrac, setRotaFrac] = useState(0);
  const lote = d.lotes.find(l => l.id === sel) ?? null;

  // Sol: hoje, no fuso do local; slider do nascente ao poente
  const lat = e.lat ?? lotesOrd[0]?.poligono[0]?.[1] ?? -4.93, lon = e.lon ?? lotesOrd[0]?.poligono[0]?.[0] ?? -47.38;
  const dia = useMemo(() => hojeLocal(), []);
  const np = useMemo(() => nascerEPor(dia, lat, lon) ?? { nascer: 360, por: 1080 }, [dia, lat, lon]);
  const [min, setMin] = useState(np.nascer + 30);
  const [tocandoSol, setTocandoSol] = useState(false);
  const pos = useMemo(() => posicaoSol(instanteLocal(dia, min), lat, lon), [dia, min, lat, lon]);

  useEffect(() => {
    setLegenda(true);
    const t = setTimeout(() => setLegenda(false), 3000);
    evento("step_view", { passo: passo.n });
    if (passo.n === 2) {
      // Rota desenhada aos poucos (~5 s); com movimento reduzido, de uma vez
      const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduzir) setRotaFrac(1);
      else {
        setRotaFrac(0);
        const t0 = performance.now();
        let raf = 0;
        const quadro = (agora: number) => { const f = Math.min(1, (agora - t0) / 5000); setRotaFrac(f); if (f < 1) raf = requestAnimationFrame(quadro); };
        raf = requestAnimationFrame(quadro);
        return () => { clearTimeout(t); cancelAnimationFrame(raf); };
      }
    }
    if (passo.n === 4) { setMin(np.nascer + 10); setTocandoSol(true); }
    else setTocandoSol(false);
    return () => clearTimeout(t);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sol andando sozinho do nascente ao poente (~8 s)
  useEffect(() => {
    if (!tocandoSol) return;
    const id = setInterval(() => setMin(m => { const n = m + (np.por - np.nascer) / 80; if (n >= np.por - 5) { setTocandoSol(false); return np.por - 5; } return n; }), 100);
    return () => clearInterval(id);
  }, [tocandoSol, np.nascer, np.por]);

  const ir = (k: number) => setI(Math.max(0, Math.min(passos.length - 1, k)));
  const escolher = (id: number) => { setSel(id); evento("lote_view", { loteId: id }); if (passo.n !== 5) { const k = passos.findIndex(p => p.n === 5); if (k >= 0) setI(k); } };
  const quero = (l: LotePasseio) => {
    evento("cta_click", { loteId: l.id });
    const texto = `Olá! Vi o passeio do ${e.nome} e tenho interesse no lote ${l.codigo}${l.quadra ? ` (Quadra ${l.quadra})` : ""}. Link: ${url}`;
    window.open(wa(d.contato.whatsapp ?? d.empresa.whatsapp, texto), "_blank", "noopener");
  };

  const camera: Camera = passo.n === 2 ? { tipo: "rota" } : passo.n === 5 && sel ? { tipo: "lote", loteId: sel } : passo.n === 6 ? { tipo: "final" } : { tipo: "visao" };
  const kmAgora = d.rota?.km != null ? d.rota.km * rotaFrac : null;
  const minAgora = d.rota?.minutos != null ? Math.round(d.rota.minutos * rotaFrac) : null;

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0f1a12] text-white" style={{ height: "100dvh" }}>
      {webgl ? (
        <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
          <MapaPasseio pontos={d.rota?.pontos ?? []} perimetro={e.perimetro} lotes={d.lotes} entrada={d.entrada} rota={d.rota?.linha ?? null} exagero={d.sol.exagero}
            camera={camera} selecionado={passo.n === 5 || passo.n === 6 ? sel : null} esmaecer={passo.n === 5} livre={livre}
            sol={passo.n === 4 ? pos : null} desenharRota={passo.n === 2 ? rotaFrac : passo.n === 1 ? 0 : 1} onLote={escolher} />
        </Suspense>
      ) : <ListaSimples d={d} onQuero={quero} />}

      {/* Abertura: planeta → satélite → condomínio; some ao terminar e o mapa assume */}
      {intro && e.abertura && passo.n === 1 && (
        <video src={e.abertura.video} poster={e.abertura.poster} autoPlay muted playsInline onEnded={() => setIntro(false)} onError={() => setIntro(false)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700" aria-label="Abertura do passeio" />
      )}

      {/* Topo: nome e progresso */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-[max(12px,env(safe-area-inset-top))]">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: OURO }}>Passeio no mapa</p>
        <p className="truncate font-serif text-lg leading-tight">{e.nome}</p>
      </header>

      {/* Legenda grande no centro (some em ~3 s) */}
      <div aria-live="polite" className={`pointer-events-none absolute inset-x-4 top-[22%] z-10 text-center transition-opacity duration-700 ${legenda && !(intro && passo.n === 1) ? "opacity-100" : "opacity-0"}`}>
        <p className="font-serif text-[28px] font-bold leading-tight text-white" style={{ textShadow: `0 0 2px #000, 0 2px 10px rgba(0,0,0,.8)`, WebkitTextStroke: `0.6px ${OURO}` }}>{passo.legenda}</p>
      </div>

      {livre && (
        <button type="button" onClick={() => setLivre(false)} className="absolute left-3 top-[max(76px,calc(env(safe-area-inset-top)+64px))] z-20 min-h-[44px] rounded-full bg-black/70 px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          Voltar ao passeio
        </button>
      )}

      {/* Painel inferior (até ~40% da tela) */}
      {!livre && (
        <section className="absolute inset-x-0 bottom-0 z-20 max-h-[44dvh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#0d150f]/85 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <div className="mb-2 flex items-center gap-2 text-xs text-white/70">
            <span>{i + 1} de {passos.length}</span>
            <div className="flex flex-1 gap-1" aria-hidden="true">{passos.map((_, k) => <span key={k} className="h-1 flex-1 rounded-full" style={{ background: k <= i ? OURO : "rgba(255,255,255,.2)" }} />)}</div>
          </div>

          {passo.n === 1 && (
            <div className="space-y-2">
              <h1 className="font-serif text-xl leading-snug">{e.nome}</h1>
              <p className="text-sm text-white/75">{[e.municipio, e.uf].filter(Boolean).join(" / ")}{e.areaHa ? ` · ${br(e.areaHa, 1)} ha` : ""} · {d.lotes.length} lotes</p>
              <p className="text-sm text-white/75">Toque em <b>Próximo</b> e veja, passo a passo, como chegar, o sol em cada lote e as condições de cada um.</p>
            </div>
          )}

          {passo.n === 2 && (
            <div className="space-y-2">
              <h2 className="font-serif text-xl leading-snug">Onde fica e como chegar</h2>
              {d.rota?.km != null ? (
                <p className="flex items-baseline gap-2"><span className="text-3xl font-bold tabular-nums" style={{ color: OURO }}>{br(kmAgora ?? 0, 1)}</span><span className="text-sm">km</span>
                  <span className="text-3xl font-bold tabular-nums" style={{ color: OURO }}>{minAgora ?? 0}</span><span className="text-sm">min aprox. saindo do {d.rota.origem}</span></p>
              ) : <p className="text-sm text-white/75">A entrada está marcada no mapa em laranja.</p>}
              {!!d.rota?.pontos?.length && (
                <ol className="space-y-1 text-sm">
                  {d.rota.pontos.map(p => (
                    <li key={p.n} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#1b1300]" style={{ background: OURO }}>{p.n}</span><span className="text-white/85"><b className="text-white">{p.titulo}</b> · {p.texto}</span></li>
                  ))}
                </ol>
              )}
              <p className="text-xs text-white/60">Distância e tempo estimados pelas estradas; confirme na visita.</p>
            </div>
          )}

          {passo.n === 4 && (
            <div className="space-y-2">
              <h2 className="font-serif text-xl leading-snug">Relevo e sol: arraste a hora</h2>
              <p className="flex items-baseline gap-2"><span className="text-3xl font-bold tabular-nums" style={{ color: OURO }}>{hhmm(min)}</span><span className="text-sm text-white/80">{fraseDoSol(min, np.nascer, np.por, pos.altura)}</span></p>
              <input type="range" min={np.nascer} max={np.por} value={min} onChange={ev => { setTocandoSol(false); setMin(Number(ev.target.value)); }}
                aria-label="Hora do dia" className="h-11 w-full accent-[#E8B54A]" />
              <div className="flex flex-wrap gap-2">
                <BotaoPilula onClick={() => { setTocandoSol(t => !t); evento("sun_play"); }}>{tocandoSol ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {tocandoSol ? "Pausar" : "Ver o dia"}</BotaoPilula>
                <BotaoPilula onClick={() => { setTocandoSol(false); setMin(np.nascer + 5); }}><Sunrise className="h-4 w-4" /> Nascente</BotaoPilula>
                <BotaoPilula onClick={() => { setTocandoSol(false); setMin(Math.round((np.nascer + np.por) / 2)); }}><Sun className="h-4 w-4" /> Meio-dia</BotaoPilula>
                <BotaoPilula onClick={() => { setTocandoSol(false); setMin(np.por - 5); }}><Sunset className="h-4 w-4" /> Poente</BotaoPilula>
              </div>
              <p className="text-xs text-white/60">Hoje, no horário do local: nascer {hhmm(np.nascer)}, pôr {hhmm(np.por)}. Cálculo estimado com base no relevo. Confirme na visita.</p>
              <button type="button" onClick={() => { setLivre(true); evento("free_explore"); }} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" style={{ color: OURO }}>
                <Hand className="h-4 w-4" /> Explorar o mapa livremente
              </button>
            </div>
          )}

          {passo.n === 5 && (
            <div className="space-y-2">
              <h2 className="font-serif text-xl leading-snug">Escolha um lote</h2>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {lotesOrd.slice(0, 40).map(l => (
                  <button key={l.id} type="button" onClick={() => escolher(l.id)} aria-pressed={l.id === sel}
                    className="min-h-[44px] shrink-0 rounded-xl border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                    style={l.id === sel ? { background: OURO, color: "#1b1300", borderColor: OURO } : { borderColor: "rgba(255,255,255,.25)", color: "#fff" }}>
                    {l.codigo}<span className="ml-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COR_PASSEIO[l.situacao] }} />
                  </button>
                ))}
              </div>
              {lote && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-serif text-lg">Lote {lote.codigo}{lote.quadra ? ` · Quadra ${lote.quadra}` : ""}</p>
                    <span className="rounded-full px-2 py-0.5 text-xs font-bold text-[#10170f]" style={{ background: COR_PASSEIO[lote.situacao] }}>{ROTULO_SIT[lote.situacao]}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Dado valor={area(lote.areaM2)} rotulo="área" />
                    <Dado valor={lote.perimetroM ? `${br(lote.perimetroM, 0)} m` : "—"} rotulo="perímetro" />
                    <Dado valor={lote.preco != null && d.mostrarPreco ? reais(lote.preco) : "—"} rotulo={lote.preco != null && d.mostrarPreco ? "à vista" : "preço com o corretor"} />
                  </div>
                  {lote.situacao === "disponivel" ? (
                    <button type="button" onClick={() => quero(lote)} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl font-bold text-[#1b1300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" style={{ background: OURO }}>
                      <MessageCircle className="h-5 w-5" /> Quero este lote
                    </button>
                  ) : <p className="text-center text-sm text-white/70">{lote.situacao === "vendido" ? "Este lote já foi vendido." : "Este lote não está disponível agora."} Escolha outro na lista.</p>}
                </div>
              )}
            </div>
          )}

          {passo.n === 6 && (
            <div className="space-y-3">
              <h2 className="font-serif text-xl leading-snug">Gostou? Fale com a gente</h2>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-serif text-xl text-[#1b1300]" style={{ background: OURO }}>{d.contato.nome.trim().charAt(0).toUpperCase()}</span>
                <div className="min-w-0"><p className="truncate font-semibold">{d.contato.nome}</p><p className="text-xs text-white/60">{d.contato.creci ? `CRECI ${d.contato.creci} · ` : ""}{d.empresa.nome}</p></div>
              </div>
              <a href={wa(d.contato.whatsapp ?? d.empresa.whatsapp, `Olá! Vi o passeio do ${e.nome} e quero saber mais. Link: ${url}`)} target="_blank" rel="noopener noreferrer"
                onClick={() => evento("cta_click")}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-[#06281a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                <MessageCircle className="h-5 w-5" /> Chamar no WhatsApp
              </a>
              <button type="button" onClick={() => { const k = passos.findIndex(p => p.n === 5); if (k >= 0) setI(k); }} className="min-h-[44px] w-full rounded-xl border border-white/25 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Ver outros lotes</button>
              <p className="text-[11px] text-white/50">Medimos as aberturas deste link para o corretor saber que você viu. Nenhum dado pessoal é coletado aqui.</p>
            </div>
          )}

          <nav className="mt-3 flex gap-2">
            <button type="button" onClick={() => ir(i - 1)} disabled={i === 0} className="flex min-h-[48px] items-center gap-1 rounded-xl border border-white/20 px-4 text-sm font-semibold disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              <ChevronLeft className="h-4 w-4" /> Voltar
            </button>
            {i < passos.length - 1 && (
              <button type="button" onClick={() => { setIntro(false); ir(i + 1); }} className="flex min-h-[48px] flex-1 items-center justify-center gap-1 rounded-xl text-base font-bold text-[#1b1300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" style={{ background: OURO }}>
                {i === 0 ? "Começar" : "Próximo"} <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </nav>
        </section>
      )}
    </main>
  );
}

function BotaoPilula({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/25 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{children}</button>;
}

function Dado({ valor, rotulo }: { valor: string; rotulo: string }) {
  return <div className="min-w-0"><p className="truncate text-base font-bold" style={{ color: OURO }}>{valor}</p><p className="text-[11px] text-white/60">{rotulo}</p></div>;
}

/** Sem WebGL: lista dos lotes com o botão do WhatsApp */
function ListaSimples({ d, onQuero }: { d: Dados; onQuero: (l: LotePasseio) => void }) {
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pb-[46dvh] pt-24">
      <p className="mb-3 flex items-center gap-2 text-sm text-white/70"><Moon className="h-4 w-4" /> Seu aparelho não abriu o mapa 3D. Veja os lotes abaixo.</p>
      <ul className="space-y-2">
        {d.lotes.map(l => (
          <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="min-w-0"><p className="font-semibold">Lote {l.codigo}</p><p className="text-xs text-white/60">{area(l.areaM2)} · {ROTULO_SIT[l.situacao]}</p></div>
            {l.situacao === "disponivel" && <button type="button" onClick={() => onQuero(l)} className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-bold text-[#1b1300]" style={{ background: OURO }}>Quero</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
