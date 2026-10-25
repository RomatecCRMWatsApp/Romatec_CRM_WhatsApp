import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { CalendarCheck, CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts, waLink } from "@/components/bom-jardims/marca";
import { FotoCorretor } from "@/lib/cartaoVendas";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import { FORMAS_PAGAMENTO, HORARIOS } from "@shared/agendamento";
import { brl } from "@shared/simulador";
import type { CartaoVendas } from "@shared/cartaoVendas";
import { EVENTOS } from "@shared/rastreamento";
import { registrarEvento } from "@/lib/rastreamento";

type Dados = {
  empreendimento: { slug: string; nome: string; municipio: string | null; uf: string | null; areaHa: string | null };
  condicoes: null | { areaMin: number; entradaPct: number; entradaMaxParcelas: number; descontoEntradaPct: number; prazoMax: number; descontoAvistaTotal: number; jurosAa: number; parcelaMin: number };
  licenca: { texto: string; orgao: string | null } | null;
  sigef: boolean;
  disponiveis: string[];
  contato: CartaoVendas;
  mapa: {
    lotes: { id: number; codigo: string; quadra: string | null; situacao: "disponivel" | "reservado"; poligono: [number, number][] | null }[];
    ruas: { nome: string; lon: number; lat: number; angulo: number }[];
    perimetro: [number, number][] | null;
  };
};

const pct = (v: number, d = 0) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: 2 })}%`;
const m2 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const logoDe = (slug: string) => (slug === "bom-jardims" ? "/bom-jardims/logo.webp" : null);

const campo: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: "1px solid #D8CFB4", background: "#fff", fontSize: 16, fontFamily: SANS, color: C.texto };
const rotulo: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 700, color: C.verde, marginBottom: 6 };

/**
 * Link de agendamento do empreendimento (público): condições, o contato de quem compartilhou (?c=…) e o
 * formulário que vira lead + pedido de agendamento no CRM.
 */
export default function Agendar() {
  useBrandFonts();
  const [, params] = useRoute("/agendar/:slug");
  const slug = params?.slug ?? "bom-jardims";
  const ref = useMemo(() => new URLSearchParams(window.location.search).get("c") ?? "", []);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [f, setF] = useState({ nome: "", telefone: "", cidade: "", unidade: "", dia: "", horario: "", pagamento: "", pessoas: "1", consentimento: false, website: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  // Unidade escolhida no mapa (id do lote) e aviso de lote indisponível
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [avisoMapa, setAvisoMapa] = useState<string | null>(null);
  const [digitar, setDigitar] = useState(false);
  const escolher = (id: number) => {
    const l = dados?.mapa.lotes.find(x => x.id === id);
    if (!l) return;
    if (l.situacao !== "disponivel") { setAvisoMapa(`A chácara ${l.codigo} não está disponível. Escolha uma das chácaras coloridas.`); return; }
    setAvisoMapa(null);
    setSelecionado(id);
    registrarEvento(EVENTOS.mapa, { empreendimento: slug, chacara: l.codigo });
    setF(x => ({ ...x, unidade: l.codigo }));
  };
  const loteEscolhido = dados?.mapa.lotes.find(x => x.id === selecionado) ?? null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(x => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  useEffect(() => {
    fetch(`/api/public/agendamento/${encodeURIComponent(slug)}${ref ? `?c=${encodeURIComponent(ref)}` : ""}`)
      .then(r => r.json()).then(j => (j.ok ? setDados(j) : setErroCarga(j.error || "Página não encontrada"))).catch(() => setErroCarga("Não foi possível carregar a página."));
  }, [slug, ref]);
  useEffect(() => { if (dados) document.title = `Agende sua visita — ${dados.empreendimento.nome}`; }, [dados]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(`/api/public/agendamento/${encodeURIComponent(slug)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, pessoas: Number(f.pessoas) || 1, ref }),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (!j.ok) throw new Error(j.error || "Não foi possível enviar agora.");
      setEnviado(true);
      registrarEvento(EVENTOS.agendamento, { formulario: "agendamento", empreendimento: slug }, "agendamento");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) { setErro(err?.message || "Não foi possível enviar agora."); } finally { setEnviando(false); }
  };

  if (erroCarga) return <div style={{ padding: 32, fontFamily: SANS, color: C.texto }}>{erroCarga}</div>;
  if (!dados) return <div style={{ padding: 32, fontFamily: SANS, color: C.suave }}>Carregando…</div>;
  const { empreendimento: emp, condicoes: c, contato } = dados;
  const logo = logoDe(emp.slug);
  const zap = contato.whatsapp ? waLink(contato.whatsapp) : null;
  const secao: React.CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "0 16px" };

  return (
    <div style={{ background: C.creme, minHeight: "100vh", fontFamily: SANS, color: C.texto }}>
      <header style={{ background: C.verde, color: "#fff", padding: "28px 0 32px", borderBottom: `4px solid ${C.dourado}` }}>
        <div style={{ ...secao, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {logo && <img src={logo} alt={emp.nome} style={{ height: 76, width: "auto" }} />}
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: 0, color: C.dourado, fontWeight: 700, letterSpacing: 1, fontSize: 13, textTransform: "uppercase" }}>Agende seu atendimento</p>
            <h1 style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: 30, lineHeight: 1.15 }}>{emp.nome}</h1>
            {(emp.municipio || emp.uf) && <p style={{ margin: "4px 0 0", opacity: 0.85 }}>{[emp.municipio, emp.uf].filter(Boolean).join("/")}</p>}
          </div>
        </div>
      </header>

      {enviado ? (
        <main style={{ ...secao, padding: "40px 16px" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, border: `2px solid ${C.dourado}`, textAlign: "center" }}>
            <CheckCircle2 size={56} color="#1F8A4C" />
            <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 26, margin: "12px 0 8px" }}>Pedido de agendamento recebido!</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5 }}>
              Obrigado, {f.nome.split(" ")[0]}! {contato.nome.split(" ")[0]} vai falar com você no WhatsApp {f.telefone} para confirmar o dia e o horário.
            </p>
            {zap && <a href={zap} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, padding: "12px 20px", borderRadius: 999, background: "#1F8A4C", color: "#fff", fontWeight: 700, textDecoration: "none" }}><MessageCircle size={20} /> Falar agora no WhatsApp</a>}
          </div>
        </main>
      ) : (
        <main style={{ ...secao, padding: "24px 16px 40px", display: "grid", gap: 20 }}>
          <section style={{ background: "#fff", borderRadius: 20, padding: 22, border: "1px solid #E2D9BF" }}>
            <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 24, margin: "0 0 10px" }}>Sua chácara com segurança e condições facilitadas</h2>
            <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.7, fontSize: 16, listStyle: "disc" }}>
              {c && <li>Chácaras a partir de <b>{m2(c.areaMin)} m²</b>{emp.areaHa ? ` num condomínio de ${emp.areaHa} ha` : ""}</li>}
              {c && <li>Entrada de <b>{pct(c.entradaPct)}</b> em até <b>{c.entradaMaxParcelas}× sem juros</b>, ou <b>{pct(c.descontoEntradaPct, 2)} de desconto</b> na entrada integral</li>}
              {c && <li>Saldo em até <b>{c.prazoMax}×</b> direto com o empreendedor, sem banco — parcelas a partir de <b>{brl(c.parcelaMin)}</b></li>}
              {c && c.descontoAvistaTotal > 0 && <li><b>{brl(c.descontoAvistaTotal)} de desconto</b> no pagamento à vista</li>}
              <li>Infraestrutura com ruas, área de vivência e recreação, portal de entrada e área escriturada</li>
              {dados.licenca && <li>{dados.licenca.texto}{dados.licenca.orgao ? ` (${dados.licenca.orgao.match(/—\s*([A-Z]{3,})\s*$/)?.[1] ?? dados.licenca.orgao})` : ""}</li>}
              {dados.sigef && <li>Georreferenciamento certificado no SIGEF/INCRA</li>}
            </ul>
            <p style={{ margin: "12px 0 0", fontSize: 13, color: C.suave }}>Valores sujeitos à disponibilidade e às condições vigentes{c ? `; juros de ${pct(c.jurosAa, 0)} ao ano no saldo (Tabela Price, parcelas fixas)` : ""}.</p>
          </section>

          <section style={{ display: "flex", alignItems: "center", gap: 14, background: C.verde, color: "#fff", borderRadius: 20, padding: 16 }}>
            <FotoCorretor cartao={contato} tamanho={64} />
            <div style={{ lineHeight: 1.35 }}>
              <p style={{ margin: 0, fontSize: 12, color: C.dourado, fontWeight: 700, textTransform: "uppercase" }}>Seu atendimento</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{contato.nome}</p>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{[contato.creci, contato.telefones[0]].filter(Boolean).join(" · ")}</p>
            </div>
          </section>

          <form onSubmit={enviar} style={{ background: "#fff", borderRadius: 20, padding: 22, border: `2px solid ${C.dourado}`, display: "grid", gap: 16 }}>
            <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 24, margin: 0, display: "flex", alignItems: "center", gap: 8 }}><CalendarCheck size={26} /> Agende seu atendimento</h2>
            <div><label style={rotulo} htmlFor="nome">Nome completo *</label><input id="nome" style={campo} required minLength={3} maxLength={120} autoComplete="name" value={f.nome} onChange={set("nome")} /></div>
            <div><label style={rotulo} htmlFor="tel">Telefone / WhatsApp *</label><input id="tel" style={campo} required inputMode="tel" autoComplete="tel" placeholder="(99) 9 9999-9999" value={f.telefone} onChange={set("telefone")} /></div>
            <div><label style={rotulo} htmlFor="cidade">Cidade</label><input id="cidade" style={campo} maxLength={80} autoComplete="address-level2" value={f.cidade} onChange={set("cidade")} /></div>
            <div>
              <span style={rotulo}>Unidade ou quadra de interesse (se souber)</span>
              {dados.mapa.lotes.length > 0 && (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: 14, color: C.suave }}>Toque na chácara que você quer conhecer. Use + e − (ou dois dedos) para aproximar.</p>
                  <div style={{ borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                    <MapaTematico slug={emp.slug} lotes={dados.mapa.lotes.map(l => ({ id: l.id, codigo: l.codigo, situacao: l.situacao, poligono: l.poligono }))}
                      ruas={dados.mapa.ruas} perimetro={dados.mapa.perimetro} selecionado={selecionado} onSelecionar={escolher} destacar={["disponivel"]} />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: C.suave }}>Coloridas: disponíveis · cinza: indisponíveis</p>
                </>
              )}
              {avisoMapa && <p role="status" style={{ margin: "8px 0 0", color: "#B54708", fontWeight: 700, fontSize: 14 }}>{avisoMapa}</p>}
              {loteEscolhido ? (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, background: "#EAF5EC", border: "2px solid #1F8A4C" }}>
                  <span style={{ fontSize: 16 }}>Chácara escolhida: <b>{loteEscolhido.codigo}{loteEscolhido.quadra ? ` · Quadra ${loteEscolhido.quadra}` : ""}</b></span>
                  <button type="button" onClick={() => { setSelecionado(null); setF(x => ({ ...x, unidade: "" })); }} style={{ marginLeft: "auto", background: "none", border: "none", color: C.verde, textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>Limpar</button>
                </div>
              ) : (digitar || dados.mapa.lotes.length === 0) ? (
                <div style={{ marginTop: 10 }}>
                  <input id="unidade" style={campo} maxLength={60} list="disponiveis" placeholder="Ex.: A05 ou Quadra B" value={f.unidade}
                    onChange={e => { setSelecionado(null); set("unidade")(e); }} aria-label="Unidade ou quadra de interesse" />
                  <datalist id="disponiveis">{dados.disponiveis.map(cod => <option key={cod} value={cod} />)}</datalist>
                </div>
              ) : (
                <button type="button" onClick={() => setDigitar(true)} style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: C.verde, textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>Prefiro digitar a unidade ou a quadra</button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <div><label style={rotulo} htmlFor="dia">Melhor dia para atendimento *</label><input id="dia" type="date" style={campo} required min={hoje()} value={f.dia} onChange={set("dia")} /></div>
              <div><label style={rotulo} htmlFor="hora">Melhor horário *</label>
                <select id="hora" style={campo} required value={f.horario} onChange={set("horario")}>
                  <option value="">Escolha…</option>{HORARIOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <div><label style={rotulo} htmlFor="pag">Forma de pagamento *</label>
                <select id="pag" style={campo} required value={f.pagamento} onChange={set("pagamento")}>
                  <option value="">Escolha…</option>{FORMAS_PAGAMENTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <div><label style={rotulo} htmlFor="pessoas">Pessoas no atendimento *</label><input id="pessoas" type="number" min={1} max={20} style={campo} required value={f.pessoas} onChange={set("pessoas")} /></div>
            </div>
            {/* Honeypot: invisível para pessoas */}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.4 }}>
              <input type="checkbox" required checked={f.consentimento} onChange={set("consentimento")} style={{ width: 20, height: 20, marginTop: 2 }} />
              Aceito ser contatado(a) por WhatsApp sobre este agendamento e o empreendimento. Meus dados são usados só para este atendimento.
            </label>
            {erro && <p role="alert" style={{ margin: 0, color: "#B42318", fontWeight: 700 }}>{erro}</p>}
            <button type="submit" disabled={enviando} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 20px", borderRadius: 14, border: "none", background: C.verde, color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", opacity: enviando ? 0.7 : 1 }}>
              {enviando ? <Loader2 size={20} className="animate-spin" /> : <CalendarCheck size={20} />} {enviando ? "Enviando…" : "Quero agendar meu atendimento"}
            </button>
          </form>
          <p style={{ textAlign: "center", fontSize: 12, color: C.suave, margin: 0 }}>Romatec Consultoria Total · gestão e administração de vendas · CNPJ 17.261.987/0001-09</p>
        </main>
      )}
    </div>
  );
}
