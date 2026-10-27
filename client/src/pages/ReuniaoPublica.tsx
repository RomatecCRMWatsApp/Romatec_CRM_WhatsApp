import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { CalendarDays, CheckCircle2, FileText, Loader2, MapPin, Video, XCircle } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts } from "@/components/bom-jardims/marca";

type Pagina = {
  titulo: string; empreendimento: string | null; quandoTexto: string; local: string | null; linkVideo: string | null; descricao: string | null;
  folder: { mime: string; nome: string; url: string } | null; cancelada: boolean; encerrada: boolean;
  geral: boolean; convidado: { nome: string; status: "pendente" | "confirmado" | "recusado" } | null;
};

const campo: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: "1px solid #D8CFB4", background: "#fff", fontSize: 16, fontFamily: SANS, color: C.texto };
const botao = (cor: string, cheio: boolean): React.CSSProperties => ({
  flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 12, border: `2px solid ${cor}`, background: cheio ? cor : "#fff", color: cheio ? "#fff" : cor,
  fontSize: 16, fontWeight: 700, fontFamily: SANS, cursor: "pointer",
});

/** Convite de reunião (público): mostra a reunião e registra "Confirmar presença" / "Não poderei" */
export default function ReuniaoPublica() {
  useBrandFonts();
  const [, params] = useRoute("/reuniao/:token");
  const token = params?.token ?? "";
  const [p, setP] = useState<Pagina | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [f, setF] = useState({ nome: "", telefone: "", website: "" });
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<{ status: string; nome: string } | null>(null);

  useEffect(() => {
    fetch(`/api/public/reuniao/${encodeURIComponent(token)}`).then(r => r.json())
      .then(j => (j.ok ? setP(j) : setErroCarga(j.error || "Convite não encontrado"))).catch(() => setErroCarga("Não foi possível carregar o convite."));
  }, [token]);
  useEffect(() => { if (p) document.title = `${p.titulo} — confirmação de presença`; }, [p]);

  const responder = async (r: "confirmado" | "recusado") => {
    setErro(null);
    if (p?.geral && (f.nome.trim().length < 2 || f.telefone.replace(/\D/g, "").length < 10)) { setErro("Informe seu nome e seu WhatsApp com DDD."); return; }
    setEnviando(r);
    try {
      const j = await fetch(`/api/public/reuniao/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resposta: r, ...(p?.geral ? f : {}) }),
      }).then(x => x.json());
      if (!j.ok) setErro(j.error || "Não foi possível registrar.");
      else setResposta({ status: j.status, nome: j.nome ?? p?.convidado?.nome ?? f.nome });
    } catch { setErro("Sem conexão. Tente de novo."); } finally { setEnviando(null); }
  };

  const fundo: React.CSSProperties = { minHeight: "100vh", background: C.creme, fontFamily: SANS, color: C.texto, padding: "24px 16px" };
  if (erroCarga) return <div style={fundo}><div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center" }}><h1 style={{ fontFamily: SERIF, color: C.verde }}>Convite</h1><p>{erroCarga}</p></div></div>;
  if (!p) return <div style={{ ...fundo, display: "grid", placeItems: "center" }}><Loader2 className="animate-spin" /></div>;

  const atual = resposta?.status ?? p.convidado?.status ?? "pendente";
  const fechado = p.cancelada || p.encerrada;
  const imagem = p.folder && p.folder.mime.startsWith("image/");
  return (
    <div style={fundo}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ background: C.verde, color: "#fff", borderRadius: "18px 18px 0 0", padding: "22px 22px 18px", borderBottom: `4px solid ${C.dourado}` }}>
          <div style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: C.destaque }}>Convite para reunião{p.empreendimento ? ` · ${p.empreendimento}` : ""}</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 26, margin: "8px 0 0", lineHeight: 1.2 }}>{p.titulo}</h1>
        </div>
        <div style={{ background: "#fff", borderRadius: "0 0 18px 18px", padding: 22, boxShadow: "0 6px 24px rgba(12,51,32,.08)" }}>
          {p.convidado && <p style={{ marginTop: 0, fontSize: 17 }}>Olá, <b>{p.convidado.nome.split(" ")[0]}</b>!</p>}
          <p style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "10px 0", fontSize: 16 }}><CalendarDays size={20} color={C.verde} style={{ flexShrink: 0 }} /> <span style={{ textTransform: "capitalize" }}>{p.quandoTexto}</span></p>
          {p.local && <p style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "10px 0", fontSize: 16 }}><MapPin size={20} color={C.verde} style={{ flexShrink: 0 }} /> {p.local}</p>}
          {p.linkVideo && <p style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "10px 0", fontSize: 16 }}><Video size={20} color={C.verde} style={{ flexShrink: 0 }} /> <a href={p.linkVideo} target="_blank" rel="noreferrer" style={{ color: C.verde, fontWeight: 700, wordBreak: "break-all" }}>Entrar na videochamada</a></p>}
          {p.descricao && <p style={{ whiteSpace: "pre-wrap", color: C.suave, lineHeight: 1.5 }}>{p.descricao}</p>}
          {p.folder && (imagem
            ? <a href={p.folder.url} target="_blank" rel="noreferrer"><img src={p.folder.url} alt="Folder da reunião" style={{ width: "100%", borderRadius: 12, margin: "8px 0", border: "1px solid #E6DEC6" }} /></a>
            : <a href={p.folder.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 8, alignItems: "center", color: C.verde, fontWeight: 700, margin: "12px 0" }}><FileText size={20} /> Ver o folder da reunião (PDF)</a>)}

          <div style={{ borderTop: "1px solid #EEE6CF", marginTop: 16, paddingTop: 16 }}>
            {p.cancelada ? <p style={{ fontWeight: 700, color: "#B23A3A" }}>Esta reunião foi cancelada.</p>
              : p.encerrada ? <p style={{ fontWeight: 700, color: C.suave }}>O prazo para responder a este convite já terminou.</p>
              : resposta ? (
                <div style={{ textAlign: "center", padding: "6px 0" }}>
                  {resposta.status === "confirmado" ? <CheckCircle2 size={44} color="#1F8A4C" /> : <XCircle size={44} color="#B23A3A" />}
                  <p style={{ fontSize: 18, fontWeight: 700, margin: "8px 0 4px" }}>{resposta.status === "confirmado" ? "Presença confirmada!" : "Resposta registrada."}</p>
                  <p style={{ color: C.suave, margin: 0 }}>{resposta.status === "confirmado" ? "Obrigado. Esperamos você." : "Obrigado por avisar."} Se mudar de ideia, abra este link de novo.</p>
                </div>
              ) : (
                <>
                  {p.convidado && atual !== "pendente" && <p style={{ color: C.suave, marginTop: 0 }}>Sua resposta atual: <b>{atual === "confirmado" ? "vou participar" : "não poderei ir"}</b>. Você pode mudar abaixo.</p>}
                  {p.geral && (
                    <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                      <input style={campo} placeholder="Seu nome" autoComplete="name" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} aria-label="Seu nome" />
                      <input style={campo} placeholder="Seu WhatsApp com DDD" inputMode="tel" autoComplete="tel" value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} aria-label="Seu WhatsApp" />
                      <input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} style={{ position: "absolute", left: -9999 }} aria-hidden="true" />
                    </div>
                  )}
                  {erro && <p role="alert" style={{ color: "#B23A3A", fontWeight: 700 }}>{erro}</p>}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" disabled={!!enviando || fechado} onClick={() => responder("confirmado")} style={botao("#1F8A4C", true)}>
                      {enviando === "confirmado" ? "Enviando…" : "Confirmar presença"}
                    </button>
                    <button type="button" disabled={!!enviando || fechado} onClick={() => responder("recusado")} style={botao("#B23A3A", false)}>
                      {enviando === "recusado" ? "Enviando…" : "Não poderei"}
                    </button>
                  </div>
                </>
              )}
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: 12, color: C.suave, marginTop: 16 }}>Romatec Consultoria Total · Açailândia/MA</p>
      </div>
    </div>
  );
}
