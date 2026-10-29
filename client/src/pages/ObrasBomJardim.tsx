import { useEffect, useRef, useState } from "react";
import { CalendarCheck, CheckCircle2, FileCheck2, Loader2, MessageCircle, Ruler, Trees, Volume2, VolumeX } from "lucide-react";
import { readUtm } from "@/components/LeadForm";
import { origemDaVisita } from "@/lib/origemVisita";
import { C, SERIF, SANS, useBrandFonts, BotaoInstagram, useCorretorDoLink, rotuloCorretor } from "@/components/bom-jardims/marca";
import { EVENTOS } from "@shared/rastreamento";
import { registrarEvento } from "@/lib/rastreamento";
import { FINALIDADES_OBRAS, LANCAMENTO_OBRAS, PAGAMENTOS_OBRAS, PRAZOS_OBRAS, fichaObrasSchema, msgValorComFicha, utmObras } from "@shared/obrasBomJardim";

/**
 * Campanha das obras — /obras-bom-jardim (CCBJ · Condomínio de Chácaras Bom Jardim).
 * Vídeo das obras no topo, ficha completa (lead "Instagram/Obras" com todos os dados), "Agendar visita" e
 * "Quero saber o valor" — este só abre o WhatsApp do corretor depois da ficha enviada (server/obrasBomJardim.ts).
 * Sem preço na página.
 */

const VIDEO = { src: "/obras-bom-jardim/video-obras.mp4", poster: "/obras-bom-jardim/video-obras-poster.webp" };
const WHATS_PADRAO = "5599991811246";
const CONSENT =
  "Autorizo a Romatec Consultoria Total e o Condomínio de Chácaras Bom Jardim a usar meus dados para contato por WhatsApp, telefone e e-mail sobre este empreendimento (Lei n.º 13.709/2018). Posso cancelar a qualquer momento.";

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

const utmAtual = () => utmObras(readUtm());

/** ?c= de quem compartilhou o link (guardado na sessão, como nas outras páginas públicas): o lead vai para ele */
function refDoLink(): string | undefined {
  let ref: string | null = null;
  try {
    ref = new URLSearchParams(window.location.search).get("c");
    if (ref) sessionStorage.setItem("romatec-ref", ref); else ref = sessionStorage.getItem("romatec-ref");
  } catch { /* sem sessionStorage */ }
  return ref && /^[A-Za-z0-9_-]{9,16}$/.test(ref) ? ref : undefined;
}

/** Agendamento com o corretor do link ou o da vez (rodízio) */
async function linkDeVisita(): Promise<string> {
  try {
    const r = await fetch("/api/public/obras-bom-jardim/corretor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "visita", utm: utmAtual(), ref: refDoLink() }) });
    const j = await r.json();
    if (j?.ok && j.url) return j.url;
  } catch { /* sem rede: cai no padrão */ }
  return "/agendar/bom-jardims";
}

const btn = (fundo: string, cor: string, borda?: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 20px", borderRadius: 14, border: borda ? `1.5px solid ${borda}` : "none",
  background: fundo, color: cor, fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: SANS, textDecoration: "none", flex: "1 1 220px",
});
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12, border: "1px solid #CFC6AD", background: "#fff", color: C.texto, fontSize: 16, fontFamily: SANS, boxSizing: "border-box",
};

function VideoObras() {
  const ref = useRef<HTMLVideoElement>(null);
  const [mudo, setMudo] = useState(true);
  useEffect(() => { ref.current?.play().catch(() => { /* autoplay bloqueado: fica o poster com o play */ }); }, []);
  const alternarSom = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMudo(v.muted);
    if (!v.muted) { v.play().catch(() => {}); registrarEvento("video_som", { pagina: "obras-bom-jardim" }); }
  };
  return (
    <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "#000", boxShadow: "0 18px 40px rgba(0,0,0,0.35)", aspectRatio: "16 / 9" }}>
      <video ref={ref} src={VIDEO.src} poster={VIDEO.poster} autoPlay muted loop playsInline preload="metadata" controls={!mudo}
        aria-label="Vídeo das obras do Condomínio de Chácaras Bom Jardim"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <button type="button" onClick={alternarSom} aria-label={mudo ? "Ativar o som do vídeo" : "Desativar o som do vídeo"}
        style={{ position: "absolute", right: 12, bottom: mudo ? 12 : 56, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 999, border: "none",
          background: "rgba(12,51,32,0.88)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: SANS }}>
        {mudo ? <><VolumeX size={18} /> Ativar som</> : <><Volume2 size={18} /> Som ligado</>}
      </button>
      <span style={{ position: "absolute", top: 12, left: 12, padding: "4px 10px", borderRadius: 999, background: "rgba(12,51,32,0.8)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
        IMAGENS REAIS · INÍCIO DAS OBRAS
      </span>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 700, color: C.verde, marginBottom: 6 };

function Opcoes({ nome, valor, opcoes, onChange }: { nome: string; valor: string; opcoes: readonly (readonly [string, string])[]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={nome} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {opcoes.map(([v, r]) => {
        const on = valor === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            style={{ padding: "9px 14px", borderRadius: 999, fontSize: 14, fontFamily: SANS, cursor: "pointer", border: `1.5px solid ${on ? C.verde : "#CFC6AD"}`, background: on ? C.verde : "#fff", color: on ? "#fff" : C.texto }}>
            {r}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ficha completa (shared/obrasBomJardim.ts): nome completo, WhatsApp, e-mail, cidade, finalidade, pagamento e prazo.
 * Só depois dela o cliente vai ao WhatsApp do corretor — e o lead já está no CRM com todos os dados.
 * Veio do "Quero saber o valor": ao enviar, abre o WhatsApp direto.
 */
function Ficha({ querValor, aoEnviar }: { querValor: boolean; aoEnviar?: () => void }) {
  const [f, setF] = useState({ nome: "", phone: "", email: "", cidade: "", finalidade: "", pagamento: "", prazo: "" });
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [erro, setErro] = useState("");
  const [res, setRes] = useState<{ corretor: { nome: string; creci: string | null } | null; whatsappUrl: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = fichaObrasSchema.safeParse({ ...f, consent: consent || undefined });
    if (!v.success) { setStatus("error"); setErro(v.error.issues[0]?.message || "Preencha todos os campos."); return; }
    setStatus("sending"); setErro("");
    try {
      const r = await fetch("/api/public/obras-bom-jardim/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v.data, utm: utmAtual(), origemVisita: origemDaVisita(), ref: refDoLink(), website }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível enviar.");
      const url = j.whatsappUrl || `https://wa.me/${WHATS_PADRAO}?text=${encodeURIComponent(msgValorComFicha(v.data))}`;
      setRes({ corretor: j.corretor ?? null, whatsappUrl: url });
      setStatus("done");
      aoEnviar?.();
      registrarEvento(EVENTOS.agendamento, { formulario: querValor ? "obras_valor" : "obras_bom_jardim", empreendimento: "bom-jardims" }, "agendamento");
      if (querValor) { registrarEvento(EVENTOS.whatsapp, { origem: "obras_bom_jardim", empreendimento: "bom-jardims" }, "whatsapp"); window.location.href = url; }
    } catch (err: any) {
      setStatus("error"); setErro(err?.message || "Não foi possível enviar. Tente de novo.");
    }
  };

  if (status === "done" && res) {
    return (
      <div style={{ padding: 26, borderRadius: 20, background: "#fff", textAlign: "center", border: `2px solid ${C.dourado}` }}>
        <CheckCircle2 size={44} color={C.verde} />
        <h3 style={{ fontFamily: SERIF, color: C.verde, fontSize: 24, margin: "8px 0" }}>Cadastro completo!</h3>
        <p style={{ margin: "0 0 14px" }}>
          {res.corretor ? <>Seu atendimento é com <b>{res.corretor.nome}</b>{res.corretor.creci ? ` (CRECI ${res.corretor.creci})` : ""}. </> : null}
          Toque abaixo para receber os valores e as condições no WhatsApp.
        </p>
        <a href={res.whatsappUrl} target="_blank" rel="noopener noreferrer" style={btn("#25D366", "#fff")}><MessageCircle size={20} /> Receber os valores no WhatsApp</a>
      </div>
    );
  }

  return (
    <form id="ficha" onSubmit={enviar} noValidate style={{ padding: "22px 18px", borderRadius: 20, background: "#fff", border: `${querValor ? 2 : 1}px solid ${querValor ? C.dourado : "#E2D9BF"}`, display: "grid", gap: 14, scrollMarginTop: 16 }}>
      <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 24, margin: 0 }}>{querValor ? "Receba os valores no WhatsApp" : "Garanta prioridade no lançamento"}</h2>
      <p style={{ margin: 0, color: C.suave }}>
        {querValor ? "Preencha a ficha completa: assim que enviar, o WhatsApp do corretor abre para você receber a tabela e as condições."
          : "Preencha a ficha completa: o corretor fala com você com os valores e as condições antes do lançamento oficial."}
      </p>
      <div>
        <label htmlFor="ob-nome" style={labelStyle}>Nome completo *</label>
        <input id="ob-nome" required maxLength={120} autoComplete="name" value={f.nome} onChange={e => set("nome")(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <div>
          <label htmlFor="ob-fone" style={labelStyle}>WhatsApp *</label>
          <input id="ob-fone" required inputMode="tel" autoComplete="tel" placeholder="(99) 9 9999-9999" value={f.phone} onChange={e => set("phone")(maskPhone(e.target.value))} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="ob-email" style={labelStyle}>E-mail *</label>
          <input id="ob-email" required type="email" maxLength={160} autoComplete="email" value={f.email} onChange={e => set("email")(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label htmlFor="ob-cidade" style={labelStyle}>Cidade onde mora *</label>
        <input id="ob-cidade" required maxLength={80} autoComplete="address-level2" value={f.cidade} onChange={e => set("cidade")(e.target.value)} style={inputStyle} />
      </div>
      <div><span style={labelStyle}>A chácara é para *</span><Opcoes nome="Finalidade" valor={f.finalidade} opcoes={FINALIDADES_OBRAS} onChange={set("finalidade")} /></div>
      <div><span style={labelStyle}>Forma de pagamento *</span><Opcoes nome="Forma de pagamento" valor={f.pagamento} opcoes={PAGAMENTOS_OBRAS} onChange={set("pagamento")} /></div>
      <div><span style={labelStyle}>Quando pretende comprar *</span><Opcoes nome="Prazo" valor={f.prazo} opcoes={PRAZOS_OBRAS} onChange={set("prazo")} /></div>
      {/* Honeypot */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: C.suave, lineHeight: 1.45 }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, width: 18, height: 18 }} /> {CONSENT}
      </label>
      {status === "error" && <p role="alert" style={{ margin: 0, color: "#A12A2A", fontSize: 14, fontWeight: 700 }}>{erro}</p>}
      <button type="submit" disabled={status === "sending"} style={{ ...btn(querValor ? "#25D366" : C.verde, "#fff"), flex: "none", width: "100%", opacity: status === "sending" ? 0.7 : 1 }}>
        {status === "sending" ? <><Loader2 size={18} className="animate-spin" /> Enviando…</> : querValor ? <><MessageCircle size={20} /> Enviar e receber os valores no WhatsApp</> : "Quero ser atendido"}
      </button>
    </form>
  );
}

export default function ObrasBomJardim() {
  useBrandFonts();
  const corretor = useCorretorDoLink();
  const [abrindo, setAbrindo] = useState<"visita" | null>(null);

  const agendar = async () => {
    setAbrindo("visita");
    registrarEvento(EVENTOS.agendamento, { formulario: "obras_agendar_clique", empreendimento: "bom-jardims" });
    window.location.href = await linkDeVisita();
  };
  // "Quero saber o valor": sem atalho para o WhatsApp — leva à ficha completa (o WhatsApp abre depois de enviada)
  const [querValor, setQuerValor] = useState(false);
  const saberValor = () => {
    setQuerValor(true);
    registrarEvento("obras_quero_valor", { empreendimento: "bom-jardims" });
    setTimeout(() => {
      document.getElementById("ficha")?.scrollIntoView({ behavior: "smooth", block: "start" });
      (document.getElementById("ob-nome") as HTMLInputElement | null)?.focus({ preventScroll: true });
    }, 50);
  };

  const DESTAQUES = [
    { icon: Trees, n: "82", t: "chácaras — só isso" },
    { icon: Ruler, n: "3.025 m²", t: "a partir de" },
    { icon: FileCheck2, n: "100%", t: "documentado" },
    { icon: CalendarCheck, n: "14/11", t: "lançamento oficial" },
  ];

  return (
    <div style={{ background: C.creme, color: C.texto, fontFamily: SANS, minHeight: "100vh" }}>
      <header style={{ background: `radial-gradient(120% 80% at 50% 0%, #17502f 0%, ${C.verde} 70%)`, padding: "22px 16px 34px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <img src="/bom-jardims/logo-520.webp" alt="CCBJ — Condomínio de Chácaras Bom Jardim" width={520} height={293} decoding="async" style={{ width: "min(190px, 46vw)", height: "auto" }} />
            <span style={{ padding: "7px 13px", borderRadius: 999, background: "#C0392B", color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: 0.6 }}>🚧 OBRAS INICIADAS</span>
          </div>
          <VideoObras />
          <div>
            <span style={{ display: "inline-block", padding: "6px 12px", borderRadius: 999, background: C.dourado, color: C.verde, fontWeight: 800, fontSize: 13, letterSpacing: 0.5 }}>
              LANÇAMENTO OFICIAL · {LANCAMENTO_OBRAS.toUpperCase()}
            </span>
            <h1 style={{ margin: "14px 0 8px" }}>
              <span style={{ display: "block", fontFamily: SERIF, color: "#fff", fontSize: "clamp(30px, 6.5vw, 54px)", lineHeight: 1.08 }}>As obras começaram. As melhores chácaras saem primeiro.</span>
              <span style={{ display: "block", color: C.destaque, fontSize: "clamp(16px, 2.8vw, 21px)", fontWeight: 700, marginTop: 10 }}>
                CCBJ · Condomínio de Chácaras Bom Jardim · Açailândia/MA
              </span>
            </h1>
            <p style={{ color: C.creme, fontSize: "clamp(16px, 2.5vw, 19px)", margin: "0 0 20px", maxWidth: 720, lineHeight: 1.5 }}>
              Só <b>82 chácaras</b>, a partir de <b>3.025 m²</b>. <b>100% documentado</b> — escritura, licença ambiental e georreferenciamento INCRA/SIGEF — e <b>liberado para vendas</b>.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button type="button" onClick={saberValor} style={btn("#25D366", "#fff")}>
                <MessageCircle size={20} /> Quero saber o valor
              </button>
              <button type="button" onClick={agendar} disabled={abrindo === "visita"} style={btn(C.dourado, C.verde)}>
                {abrindo === "visita" ? <Loader2 size={20} className="animate-spin" /> : <CalendarCheck size={20} />} Agendar visita
              </button>
            </div>
            {corretor.doLink && (
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "rgba(243,238,223,0.08)", border: "1px solid rgba(201,168,76,0.45)" }}>
                {corretor.fotoUrl
                  ? <img src={corretor.fotoUrl} alt={corretor.nome} style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.dourado}`, flexShrink: 0 }} />
                  : <div style={{ width: 54, height: 54, borderRadius: "50%", background: C.dourado, color: C.verde, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, flexShrink: 0 }}>{corretor.nome.charAt(0)}</div>}
                <div style={{ minWidth: 0, color: "#fff", lineHeight: 1.35 }}>
                  <p style={{ margin: 0, fontSize: 12, color: C.destaque, fontWeight: 700, letterSpacing: 0.4 }}>SEU CORRETOR</p>
                  <p style={{ margin: 0, fontWeight: 700 }}>{corretor.nome}</p>
                  <p style={{ margin: 0, fontSize: 13, color: C.creme }}>{[corretor.creci, corretor.telefones[0]].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <section style={{ background: C.verde, borderTop: "1px solid rgba(201,168,76,0.35)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, textAlign: "center" }}>
          {DESTAQUES.map(({ icon: Icon, n, t }) => (
            <div key={t}>
              <Icon size={22} color={C.dourado} />
              <p style={{ fontFamily: SERIF, color: C.destaque, fontSize: "clamp(26px, 5.5vw, 36px)", margin: "2px 0 0", fontWeight: 700 }}>{n}</p>
              <p style={{ color: C.creme, margin: 0, fontSize: 14 }}>{t}</p>
            </div>
          ))}
        </div>
      </section>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 16px 40px", display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
        <Ficha querValor={querValor} />
        <div style={{ display: "grid", gap: 14 }}>
          <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 26, margin: 0 }}>Por que agora?</h2>
          {[
            ["Obras em andamento", "Máquinas no terreno: abertura das ruas internas de 12 m, todas empiçarradas."],
            ["Estoque limitado", "São só 82 chácaras. Quem chega antes do lançamento escolhe primeiro."],
            ["Documentação em ordem", "Escritura, licença ambiental e área certificada no INCRA/SIGEF."],
            ["Atendimento na hora", "Corretores de plantão: valores, condições e visita guiada pelo WhatsApp."],
          ].map(([t, d]) => (
            <div key={t} style={{ padding: 16, borderRadius: 16, background: "#fff", border: "1px solid #E2D9BF" }}>
              <h3 style={{ margin: "0 0 4px", color: C.verde, fontSize: 18 }}>{t}</h3>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{d}</p>
            </div>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a href="/bom-jardims" style={{ ...btn("transparent", C.verde, C.verde), flex: "1 1 200px", fontSize: 15 }}>Ver o mapa das chácaras</a>
            <BotaoInstagram usuario={corretor.instagram || "avalieimob"} />
          </div>
        </div>
      </main>

      <footer style={{ background: C.verde, color: C.creme, padding: "24px 16px", textAlign: "center", fontSize: 13, lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>CCBJ — Condomínio de Chácaras Bom Jardim · Estrada do Piquiá dos Baianos, km 15 da BR-222 · Açailândia/MA</p>
        {corretor.doLink && <p style={{ margin: "6px 0 0", fontWeight: 700 }}>Atendimento: {rotuloCorretor(corretor)}{corretor.telefones[0] ? ` · ${corretor.telefones[0]}` : ""}</p>}
        <p style={{ margin: "6px 0 0", opacity: 0.85 }}>Romatec Consultoria Total · Responsável: José Romário — CRECI/MA 4.705{corretor.doLink ? "" : " · (99) 9 9181-1246"}</p>
        <p style={{ margin: "6px 0 0", opacity: 0.7 }}>Imagens reais do início das obras. Valores e condições informados pelo corretor no atendimento.</p>
      </footer>
    </div>
  );
}
