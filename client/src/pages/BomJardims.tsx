import { useEffect, useRef, useState } from "react";
import { MessageCircle, MapPin, Droplets, Trees, ShieldCheck, Route, FileCheck2, Handshake, Navigation, Play, Globe2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { readUtm } from "@/components/LeadForm";
import { origemDaVisita } from "@/lib/origemVisita";
import { FAQ_BOM_JARDIMS } from "@shared/bomJardimsSeo";
import LoteMap, { formatArea, STATUS_LABEL, type LoteInfo } from "@/components/bom-jardims/LoteMap";
import { C, SERIF, SANS, GALERIA, VIDEO, waLink, useBrandFonts, ContatosBotoes, GaleriaProjeto, useContatos } from "@/components/bom-jardims/marca";
import { codigoChacaraValido, rotaAteEntrada } from "@shared/chacaraLink";

/**
 * Landing do Condomínio de Chácaras Bom Jardims — /bom-jardims
 * Regras do pacote (README §0): NÃO mostrar preço, CRECI e os dois contatos
 * com o mesmo destaque, 82 chácaras, sem promessas de escritura/valorização.
 */

const CONSENT_TEXT =
  "Autorizo a Romatec Consultoria Total e o Condomínio de Chácaras Bom Jardims a usar meus dados para contato por WhatsApp, telefone e e-mail sobre este empreendimento, nos termos da Lei n.º 13.709/2018. Posso cancelar a qualquer momento.";


const DIFERENCIAIS = [
  { icon: ShieldCheck, titulo: "Portal com guarita", texto: "Portal em tijolo aparente e troncos, portão de correr estilo fazenda e controle de acesso." },
  { icon: Trees, titulo: "Área de vivência exclusiva", texto: "Às margens do córrego: trilha, pontos de banho, quiosques, vestiário e churrasqueira. Flora e fauna preservadas." },
  { icon: Droplets, titulo: "Água encanada", texto: "Poço artesiano do condomínio, reservatório elevado de 50 m³ e hidrômetro individual." },
  { icon: Route, titulo: "Ruas internas de 12 m", texto: "8 ruas internas com sarjeta e passeio — 9 m de rolamento e 1,50 m de calçada de cada lado." },
  { icon: FileCheck2, titulo: "Documentação técnica", texto: "Área georreferenciada e certificada no SIGEF/INCRA, Licença de Operação da SEMMA e memorial descritivo de cada chácara." },
  { icon: Handshake, titulo: "Pagamento direto", texto: "Financiamento direto com o empreendimento, sem banco. Condições apresentadas pelo corretor no atendimento." },
];

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #CFC6AD", background: "#fff",
  color: C.texto, fontSize: 16, fontFamily: SANS, boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 700, color: C.verde, marginBottom: 6 };

function Opcoes<T extends string>({ name, value, onChange, options }: {
  name: string; value?: T; onChange: (v: T) => void; options: { v: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={name} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map(o => {
        const on = value === o.v;
        return (
          <button key={o.v} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.v)}
            style={{
              padding: "9px 14px", borderRadius: 999, fontSize: 14, fontFamily: SANS, cursor: "pointer",
              border: `1.5px solid ${on ? C.verde : "#CFC6AD"}`, background: on ? C.verde : "#fff", color: on ? "#fff" : C.texto,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Formulario({ loteCodigo, onClearLote, lotes }: { loteCodigo?: string; onClearLote: () => void; lotes: LoteInfo[] }) {
  const [f, setF] = useState({ nome: "", phone: "", email: "", cidade: "" });
  const [finalidade, setFinalidade] = useState<"morar" | "lazer" | "investimento">();
  const [prazo, setPrazo] = useState<"imediato" | "3m" | "12m" | "pesquisando">();
  const [pagamento, setPagamento] = useState<"avista" | "parcelado">();
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const lote = lotes.find(l => l.codigo === loteCodigo);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) { setStatus("error"); setError("Marque a autorização de contato para continuar."); return; }
    setStatus("sending"); setError("");
    try {
      const res = await fetch("/api/public/lead/bom-jardims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f, finalidade, prazo, pagamento, loteCodigo: lote?.status === "disponivel" ? loteCodigo : undefined,
          consent, utm: readUtm(), origemVisita: origemDaVisita(), website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível enviar.");
      setStatus("done");
    } catch (err: any) {
      setStatus("error"); setError(err?.message || "Não foi possível enviar. Fale pelo WhatsApp.");
    }
  };

  if (status === "done") {
    return (
      <div style={{ padding: 28, borderRadius: 20, background: "#fff", textAlign: "center", border: `2px solid ${C.dourado}` }}>
        <p style={{ fontSize: 40, margin: 0 }}>✅</p>
        <h3 style={{ fontFamily: SERIF, color: C.verde, fontSize: 24, margin: "8px 0" }}>Cadastro recebido!</h3>
        <p style={{ color: C.texto, margin: 0 }}>Em instantes você recebe uma mensagem no WhatsApp. O corretor José Romário (CRECI/MA 4.705) vai falar com você.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ padding: "24px 20px", borderRadius: 20, background: "#fff", border: `1px solid #E2D9BF`, display: "grid", gap: 16 }}>
      {lote && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: "#F7F1DD", border: `1px solid ${C.dourado}` }}>
          <span style={{ color: C.verde }}>
            Chácara <b>{lote.codigo}</b> · {formatArea(lote.areaM2)}
            {lote.status !== "disponivel" && <> · <b>{STATUS_LABEL[lote.status]}</b> (escolha uma disponível)</>}
          </span>
          <button type="button" onClick={onClearLote} style={{ border: "none", background: "transparent", color: C.suave, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>remover</button>
        </div>
      )}
      <div>
        <label style={labelStyle} htmlFor="bj-nome">Nome *</label>
        <input id="bj-nome" required maxLength={120} autoComplete="name" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle} htmlFor="bj-phone">WhatsApp *</label>
        <input id="bj-phone" required inputMode="tel" autoComplete="tel" placeholder="(99) 9 9999-9999" value={f.phone}
          onChange={e => setF({ ...f, phone: maskPhone(e.target.value) })} style={inputStyle} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="bj-email">E-mail</label>
          <input id="bj-email" type="email" maxLength={160} autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="bj-cidade">Cidade onde mora</label>
          <input id="bj-cidade" maxLength={80} autoComplete="address-level2" value={f.cidade} onChange={e => setF({ ...f, cidade: e.target.value })} style={inputStyle} />
        </div>
      </div>
      <div>
        <span style={labelStyle}>Você procura a chácara para:</span>
        <Opcoes name="Finalidade" value={finalidade} onChange={setFinalidade}
          options={[{ v: "morar", label: "Morar" }, { v: "lazer", label: "Lazer de fim de semana" }, { v: "investimento", label: "Investimento" }]} />
      </div>
      <div>
        <span style={labelStyle}>Quando pretende comprar?</span>
        <Opcoes name="Prazo" value={prazo} onChange={setPrazo}
          options={[{ v: "imediato", label: "Imediato" }, { v: "3m", label: "Até 3 meses" }, { v: "12m", label: "Até 12 meses" }, { v: "pesquisando", label: "Só pesquisando" }]} />
      </div>
      <div>
        <span style={labelStyle}>Forma de pagamento pretendida:</span>
        <Opcoes name="Pagamento" value={pagamento} onChange={setPagamento}
          options={[{ v: "avista", label: "À vista" }, { v: "parcelado", label: "Parcelado direto" }]} />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website}
        onChange={e => setWebsite(e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: C.texto, cursor: "pointer", lineHeight: 1.45 }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: C.verde, flexShrink: 0 }} />
        <span>{CONSENT_TEXT}</span>
      </label>
      {status === "error" && <p role="alert" style={{ color: "#B3261E", margin: 0 }}>{error}</p>}
      <button type="submit" disabled={status === "sending"}
        style={{ padding: "16px", borderRadius: 14, border: "none", background: C.dourado, color: C.verde, fontWeight: 700, fontSize: 17, fontFamily: SANS, cursor: "pointer", opacity: status === "sending" ? 0.6 : 1 }}>
        {status === "sending" ? "Enviando…" : "Quero receber o mapa de vendas"}
      </button>
    </form>
  );
}

export default function BomJardims() {
  useBrandFonts();
  const contatos = useContatos();
  const { data: emp, isFetched } = trpc.empreendimentos.publicBySlug.useQuery({ slug: "bom-jardims" });
  const [fallbackLotes, setFallbackLotes] = useState<LoteInfo[]>([]);
  // ?chacara=C05 (vindo do link da chácara): já chega com ela escolhida no formulário
  const [selected, setSelected] = useState<string | undefined>(() => {
    const c = new URLSearchParams(window.location.search).get("chacara")?.toUpperCase();
    return codigoChacaraValido(c) ? c : undefined;
  });
  const formRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected && window.location.hash === "#cadastro") setTimeout(() => formRef.current?.scrollIntoView({ block: "start" }), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Sem a API (fora do ar), usa a geometria pública e avisa que a situação não foi confirmada
  const semSituacao = isFetched && !emp;
  const lotes = (emp?.lotes ?? (semSituacao ? fallbackLotes : [])) as LoteInfo[];
  const disponiveis = emp?.resumo.disponivel;

  useEffect(() => {
    document.title = "Condomínio de Chácaras Bom Jardims — Açailândia/MA";
  }, []);

  const goForm = () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const selLote = lotes.find(l => l.codigo === selected);

  const section: React.CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: "56px 16px" };
  const h2: React.CSSProperties = { fontFamily: SERIF, color: C.verde, fontSize: "clamp(26px, 5vw, 36px)", margin: "0 0 8px", lineHeight: 1.15 };

  return (
    <div style={{ background: C.creme, color: C.texto, fontFamily: SANS, minHeight: "100vh" }}>
      {/* 1. Hero */}
      <header style={{ position: "relative", minHeight: "88vh", display: "flex", alignItems: "flex-end", overflow: "hidden", background: C.verde }}>
        <img src="/bom-jardims/portal-dia.webp" alt="Portal de entrada do Bom Jardims (perspectiva ilustrativa)"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(12,51,32,0.15) 0%, rgba(12,51,32,0.55) 45%, rgba(12,51,32,0.95) 100%)" }} />
        <div style={{ position: "relative", maxWidth: 1080, margin: "0 auto", padding: "32px 16px 40px", width: "100%", boxSizing: "border-box" }}>
          <img src="/bom-jardims/logo.webp" alt="Condomínio de chácara Bom Jardims" style={{ width: "min(260px, 60vw)", height: "auto", display: "block", marginBottom: 16 }} />
          <span style={{ display: "inline-block", padding: "6px 12px", borderRadius: 999, background: C.dourado, color: C.verde, fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>
            PRÉ-LANÇAMENTO · AÇAILÂNDIA/MA
          </span>
          <h1 style={{ fontFamily: SERIF, color: "#fff", fontSize: "clamp(34px, 7vw, 60px)", lineHeight: 1.05, margin: "14px 0 10px", maxWidth: 760 }}>
            Seu pedaço de natureza em Açailândia
          </h1>
          <p style={{ color: "#F3EEDF", fontSize: "clamp(16px, 2.6vw, 20px)", margin: "0 0 24px", maxWidth: 640 }}>
            Condomínio fechado de chácaras a partir de 3.025 m², com portal, água encanada e área de vivência às margens do córrego.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button onClick={goForm} style={{ padding: "15px 22px", borderRadius: 14, border: "none", background: C.dourado, color: C.verde, fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: SANS }}>
              Quero receber o mapa de vendas
            </button>
            <a href="#mapa" style={{ padding: "15px 22px", borderRadius: 14, border: "1.5px solid #fff", color: "#fff", fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
              Ver as chácaras no mapa
            </a>
          </div>
          <p style={{ color: "#D9D3BF", fontSize: 13, marginTop: 18 }}>Corretor José Romário · CRECI/MA 4.705</p>
        </div>
      </header>

      {/* 2. Números */}
      <section style={{ background: C.verde }}>
        <div style={{ ...section, padding: "28px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, textAlign: "center" }}>
          {[["82", "chácaras à venda"], ["3.025 m²", "a partir de"], ["12 m", "ruas internas"], ["41 ha", "de área total"]].map(([n, l]) => (
            <div key={l}>
              <p style={{ fontFamily: SERIF, color: C.destaque, fontSize: "clamp(28px, 6vw, 40px)", margin: 0, fontWeight: 700 }}>{n}</p>
              <p style={{ color: C.creme, margin: 0, fontSize: 14 }}>{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Diferenciais */}
      <section style={section}>
        <h2 style={h2}>Perto da cidade, longe da correria</h2>
        <p style={{ color: C.suave, margin: "0 0 28px", maxWidth: 720 }}>
          Na Estrada do Piquiá dos Baianos, altura do km 15 da BR-222. Espaço de sobra para viver do seu jeito.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {DIFERENCIAIS.map(({ icon: Icon, titulo, texto }) => (
            <div key={titulo} style={{ padding: 20, borderRadius: 18, background: "#fff", border: "1px solid #E2D9BF" }}>
              <Icon size={28} color={C.dourado} />
              <h3 style={{ fontFamily: SERIF, color: C.verde, fontSize: 20, margin: "10px 0 6px" }}>{titulo}</h3>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Mapa de vendas */}
      <section id="mapa" style={{ ...section, paddingTop: 0 }}>
        <h2 style={h2}>Escolha a sua chácara no mapa</h2>
        <p style={{ color: C.suave, margin: "0 0 20px" }}>
          Toque numa chácara para ver a área e a situação.
          {disponiveis !== undefined && <> Hoje são <b style={{ color: C.verde }}>{disponiveis} chácaras disponíveis</b>.</>}
        </p>
        <LoteMap lotes={lotes} selected={selected} onSelect={setSelected} onMapLoaded={setFallbackLotes} />
        {semSituacao && (
          <p style={{ fontSize: 13, color: "#8A5A00", marginTop: 8 }}>Não foi possível confirmar a situação das chácaras agora. Fale com o corretor para confirmar a disponibilidade.</p>
        )}
        {selLote?.status === "disponivel" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
            <button onClick={goForm} style={{ padding: "13px 18px", borderRadius: 12, border: "none", background: C.verde, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: SANS }}>
              Tenho interesse na {selLote.codigo}
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          <a href="/bom-jardims.kml" download style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12, border: `1.5px solid ${C.verde}`, color: C.verde, fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
            <Globe2 size={17} /> Baixar KML do empreendimento (Google Earth)
          </a>
          {selLote && selLote.status !== "nao_comercializavel" && (
            <a href={`/bom-jardims/chacara/${selLote.codigo}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12, background: C.dourado, color: C.verde, fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
              <MapPin size={17} /> Localização exata da {selLote.codigo}
            </a>
          )}
        </div>
        <p style={{ fontSize: 12, color: C.suave, marginTop: 12 }}>
          Mapa ilustrativo a partir do levantamento georreferenciado (SIRGAS 2000). A03 é área técnica (poço e reservatório) e B14 abriga o stand de vendas e a administração.
          O KML traz a poligonal do empreendimento e todas as chácaras demarcadas — abre no Google Earth e em apps de mapas e GIS.
        </p>
      </section>

      {/* 5. Galeria */}
      <section style={{ ...section, paddingTop: 0 }}>
        <h2 style={h2}>Chegar em casa já é um passeio</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 20 }}>
          <figure style={{ margin: 0, gridRow: "span 2", borderRadius: 18, overflow: "hidden", background: "#000", position: "relative" }}>
            <video src={VIDEO.src} poster={VIDEO.poster} controls playsInline preload="none"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", maxHeight: 640 }} />
            <figcaption style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(12,51,32,0.8)", color: "#fff", fontSize: 12 }}>
              <Play size={12} /> Vídeo
            </figcaption>
          </figure>
          {GALERIA.map(g => (
            <figure key={g.src} style={{ margin: 0, borderRadius: 18, overflow: "hidden", background: "#DDD5BD" }}>
              <img src={g.src} alt={g.alt} loading="lazy" style={{ width: "100%", height: "100%", aspectRatio: "16 / 10", objectFit: "cover", display: "block" }} />
            </figure>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.suave, marginTop: 10 }}>Imagens em perspectiva, de caráter ilustrativo.</p>
        <GaleriaProjeto />
      </section>

      {/* Perguntas frequentes (também vão para o Google como FAQ — server/seo.ts) */}
      <section style={{ ...section, paddingTop: 0 }}>
        <h2 style={h2}>Perguntas frequentes sobre as Chácaras Bom Jardims</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {FAQ_BOM_JARDIMS.map(f => (
            <details key={f.pergunta} style={{ padding: "14px 18px", borderRadius: 14, background: "#fff", border: "1px solid #E2D9BF" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, color: C.verde }}>{f.pergunta}</summary>
              <p style={{ margin: "10px 0 0", lineHeight: 1.55 }}>{f.resposta}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 6. Localização */}
      <section style={{ ...section, paddingTop: 0 }}>
        <h2 style={h2}>Localização</h2>
        <div style={{ padding: 20, borderRadius: 18, background: "#fff", border: "1px solid #E2D9BF", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", maxWidth: 640 }}>
            <MapPin size={26} color={C.dourado} style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              <b style={{ color: C.verde }}>Estrada do Piquiá dos Baianos, altura do km 15 da BR-222</b><br />
              Açailândia/MA · a área tem 41,1 ha, com a área de vivência às margens do córrego.
            </p>
          </div>
          <a href={rotaAteEntrada()} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: 12, background: C.verde, color: "#fff", fontWeight: 700, textDecoration: "none" }}>
            <Navigation size={18} /> Como chegar ao portal
          </a>
        </div>
      </section>

      {/* 7. Formulário */}
      <section ref={formRef} id="cadastro" style={{ background: C.verde }}>
        <div style={{ ...section, maxWidth: 720 }}>
          <h2 style={{ ...h2, color: "#fff" }}>Receba o mapa pelo WhatsApp</h2>
          <p style={{ color: C.creme, margin: "0 0 24px" }}>
            Estamos em pré-lançamento. Deixe seu contato e receba o mapa das chácaras pelo WhatsApp, com as informações do condomínio.
          </p>
          <Formulario loteCodigo={selected} onClearLote={() => setSelected(undefined)} lotes={lotes} />
          <p style={{ color: C.creme, margin: "24px 0 12px", fontWeight: 700 }}>Prefere conversar agora?</p>
          <ContatosBotoes codigo={selLote?.status === "disponivel" ? selLote.codigo : undefined} />
        </div>
      </section>

      {/* 8. Rodapé */}
      <footer style={{ background: "#08261A", color: C.creme }}>
        <div style={{ ...section, padding: "32px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
          {contatos.map(c => (
            <div key={c.whatsapp}>
              <p style={{ margin: 0, fontSize: 13, color: C.dourado, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.papel}</p>
              <p style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: 20 }}>{c.nome}</p>
              <a href={waLink(c.whatsapp)} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontSize: 18, fontWeight: 700, textDecoration: "none" }}>{c.telefone}</a>
            </div>
          ))}
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "#BFC9B9" }}>
            <p style={{ margin: 0 }}>Romatec Consultoria Total · CNPJ 17.261.987/0001-09</p>
            <p style={{ margin: 0 }}>Rua São Raimundo, n.º 10, Centro, Açailândia/MA</p>
            <p style={{ margin: 0 }}>José Romário Pinto Bezerra — Corretor CRECI/MA 4.705</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
