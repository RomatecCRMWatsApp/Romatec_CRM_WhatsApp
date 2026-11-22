import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Car, CheckCircle2, Instagram, Loader2, MessageCircle, PhoneCall } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts, waLink } from "@/components/bom-jardims/marca";
import { FotoCorretor } from "@/lib/cartaoVendas";
import { HORA_MAX, HORA_MIN, TIPOS_RETORNO, ULTIMA_BUSCA, type TipoRetorno } from "@shared/retorno";
import { linkInstagram, type CartaoVendas } from "@shared/cartaoVendas";

type Dados = { empreendimento: { slug: string; nome: string; municipio: string | null; uf: string | null }; contato: CartaoVendas };

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const logoDe = (slug: string) => (slug === "bom-jardims" ? "/bom-jardims/logo.webp" : null);
const campo: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: "1px solid #D8CFB4", background: "#fff", fontSize: 16, fontFamily: SANS, color: C.texto };
const rotulo: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 700, color: C.verde, marginBottom: 6 };
const ICONE: Record<TipoRetorno, typeof PhoneCall> = { ligacao: PhoneCall, visita_busca: Car };

/**
 * Link de retorno (público): o cliente que não pode falar agora escolhe o dia, a hora e o tipo de retorno —
 * ligação ou visita com busca no endereço dele. Vira lead + pedido de retorno, e o responsável é avisado na hora.
 */
export default function Retorno() {
  useBrandFonts();
  const [, params] = useRoute("/retorno/:slug");
  const slug = params?.slug ?? "bom-jardims";
  const ref = useMemo(() => new URLSearchParams(window.location.search).get("c") ?? "", []);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [f, setF] = useState({ nome: "", telefone: "", tipo: "ligacao" as TipoRetorno, dia: "", hora: "", enderecoBusca: "", pessoas: "2", observacao: "", consentimento: false, decidido: false, website: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null | undefined>(undefined);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF(x => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  useEffect(() => {
    fetch(`/api/public/retorno/${encodeURIComponent(slug)}${ref ? `?c=${encodeURIComponent(ref)}` : ""}`)
      .then(r => r.json()).then(j => (j.ok ? setDados(j) : setErroCarga(j.error || "Página não encontrada"))).catch(() => setErroCarga("Não foi possível carregar a página."));
  }, [slug, ref]);
  // Horários livres do dia (só aparecem os que têm alguém da equipe disponível)
  const [horarios, setHorarios] = useState<string[] | null>(null);
  useEffect(() => {
    if (!f.dia) { setHorarios(null); return; }
    let vivo = true;
    setHorarios(null);
    fetch(`/api/public/retorno/${encodeURIComponent(slug)}/horarios?dia=${f.dia}&tipo=${f.tipo}${ref ? `&c=${encodeURIComponent(ref)}` : ""}`)
      .then(r => r.json()).then(j => { if (vivo) setHorarios(j.ok ? j.horarios : []); }).catch(() => vivo && setHorarios([]));
    return () => { vivo = false; };
  }, [slug, ref, f.dia, f.tipo]);
  useEffect(() => { if (horarios && f.hora && !horarios.includes(f.hora)) setF(x => ({ ...x, hora: "" })); }, [horarios]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (dados) document.title = `Marque seu retorno — ${dados.empreendimento.nome}`; }, [dados]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const body = { ...f, decidido: f.tipo === "visita_busca" ? f.decidido : undefined, pessoas: f.tipo === "visita_busca" ? Number(f.pessoas) || 1 : undefined, enderecoBusca: f.tipo === "visita_busca" ? f.enderecoBusca : "", ref };
      const r = await fetch(`/api/public/retorno/${encodeURIComponent(slug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ ok: false }));
      if (!j.ok) { if (r.status === 409) setF(x => ({ ...x, hora: "" })); throw new Error(j.error || "Não foi possível enviar agora."); }
      setConfirmacao(j.confirmacao ?? null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) { setErro(err?.message || "Não foi possível enviar agora."); } finally { setEnviando(false); }
  };

  if (erroCarga) return <div style={{ padding: 32, fontFamily: SANS, color: C.texto }}>{erroCarga}</div>;
  if (!dados) return <div style={{ padding: 32, fontFamily: SANS, color: C.suave }}>Carregando…</div>;
  const { empreendimento: emp, contato } = dados;
  const logo = logoDe(emp.slug);
  const zap = contato.whatsapp ? waLink(contato.whatsapp) : null;
  const insta = contato.instagram ? (
    <a href={linkInstagram(contato.instagram)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 999, border: `2px solid ${C.dourado}`, background: "var(--c-ffffff)", color: C.verde, fontWeight: 700, textDecoration: "none" }}>
      <Instagram size={20} aria-hidden="true" /> Siga @{contato.instagram} no Instagram
    </a>
  ) : null;
  const secao: React.CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "0 16px" };
  const busca = f.tipo === "visita_busca";

  return (
    <div style={{ background: C.creme, minHeight: "100vh", fontFamily: SANS, color: C.texto }}>
      <header style={{ background: C.verde, color: "var(--c-ffffff)", padding: "24px 0 28px", borderBottom: `4px solid ${C.dourado}` }}>
        <div style={{ ...secao, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {logo && <img src={logo} alt={emp.nome} width={64} height={64} style={{ height: 64, width: "auto" }} />}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ margin: 0, color: C.dourado, fontWeight: 700, fontSize: 14 }}>Marque um horário para eu te retornar</p>
            <h1 style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: 28, lineHeight: 1.15 }}>{emp.nome}</h1>
          </div>
        </div>
      </header>

      {confirmacao !== undefined ? (
        <main style={{ ...secao, padding: "36px 16px" }}>
          <div style={{ background: "var(--c-ffffff)", borderRadius: 20, padding: 26, border: `2px solid ${C.dourado}`, textAlign: "center" }}>
            <CheckCircle2 size={56} color="#1F8A4C" />
            <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 25, margin: "12px 0 8px" }}>Horário recebido!</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5 }}>Obrigado, {f.nome.split(" ")[0]}! {contato.nome.split(" ")[0]} já foi avisado e retorna no horário que você marcou.</p>
            {confirmacao && <div style={{ marginTop: 18, textAlign: "left", whiteSpace: "pre-wrap", background: "var(--c-e7f6ec)", border: "1px solid var(--c-bfe3cb)", borderRadius: 14, padding: 16, fontSize: 15, lineHeight: 1.5 }}>{confirmacao}</div>}
            {insta && <div style={{ marginTop: 20 }}><p style={{ margin: "0 0 8px", fontSize: 15 }}>Enquanto isso, acompanhe as novidades e as obras pelo Instagram:</p>{insta}</div>}
            {zap && <a href={zap} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, padding: "12px 20px", borderRadius: 999, background: "var(--c-1f8a4c)", color: "var(--c-ffffff)", fontWeight: 700, textDecoration: "none" }}><MessageCircle size={20} /> Falar no WhatsApp</a>}
          </div>
        </main>
      ) : (
        <main style={{ ...secao, padding: "22px 16px 40px", display: "grid", gap: 18 }}>
          <section style={{ display: "flex", alignItems: "center", gap: 14, background: C.verde, color: "var(--c-ffffff)", borderRadius: 20, padding: 16 }}>
            <FotoCorretor cartao={contato} tamanho={60} />
            <div style={{ lineHeight: 1.35 }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{contato.nome}</p>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{[contato.creci, contato.telefones[0]].filter(Boolean).join(" · ")}</p>
              <p style={{ margin: "4px 0 0", fontSize: 14, color: C.dourado }}>Agora estou em atendimento. Escolha o melhor horário e eu te retorno.</p>
            </div>
          </section>

          <section style={{ background: "var(--c-ffffff)", borderRadius: 20, padding: 22, border: "1px solid var(--c-e2d9bf)", fontSize: 16, lineHeight: 1.55 }}>
            <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 22, margin: "0 0 10px" }}>Como funciona o atendimento</h2>
            <p style={{ margin: "0 0 10px" }}>Obrigado pelo interesse! Para cuidar bem do seu tempo, o atendimento acontece em duas etapas:</p>
            {emp.slug === "bom-jardims" && (
              <div style={{ margin: "0 0 14px", padding: 12, borderRadius: 14, background: "var(--c-eaf5ec)", border: "1px solid var(--c-bfe3cb)" }}>
                <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: C.verde }}>🔊 Ouça como funciona (1 min e meio)</p>
                <audio controls preload="none" src="/bom-jardims/audio-como-funciona-visita.mp3" style={{ width: "100%" }}>Seu navegador não toca áudio.</audio>
              </div>
            )}
            <p style={{ margin: "0 0 10px", display: "flex", gap: 10 }}><PhoneCall size={22} color={C.verde} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span><b>1. Ligação para tirar todas as dúvidas.</b> Por telefone eu explico localização, situação registral, prazo das obras, o que está incluso e o que não está, valor, entrada e parcelas do financiamento, e envio o material completo: mapa interativo, vídeos, simulação e a minuta do contrato.</span></p>
            <p style={{ margin: 0, display: "flex", gap: 10 }}><Car size={22} color={C.verde} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span><b>2. Visita para escolher e fechar.</b> O condomínio fica a 17 km do centro de Açailândia. Buscamos você de carro e levamos até lá quando já tiver decidido pela compra, para escolher a posição da chácara e assinar o contrato.</span></p>
            <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: "var(--c-fff7e0)", border: `2px solid ${C.dourado}` }}>
              <p style={{ margin: "0 0 8px", fontWeight: 700, color: C.verde }}>Importante sobre a visita ao condomínio</p>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55, fontSize: 15, listStyle: "disc" }}>
                <li>A visita é um deslocamento de 17 km com o nosso veículo, feito com hora marcada.</li>
                <li>Ela é agendada <b>somente depois</b> que todas as dúvidas foram esclarecidas por telefone e você já decidiu pela compra.</li>
                <li>O objetivo da visita é <b>escolher a posição da chácara e assinar o contrato</b>.</li>
                <li>Leve RG ou CNH e CPF (e os do cônjuge, se for casado) e um comprovante de endereço.</li>
              </ul>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 14, color: C.suave }}>Ainda tem alguma dúvida? Escolha a ligação: é rápido e sem compromisso. Assim que tudo estiver claro, marcamos a visita.</p>
            {insta && <div style={{ marginTop: 14 }}>{insta}</div>}
          </section>

          <form onSubmit={enviar} style={{ background: "var(--c-ffffff)", borderRadius: 20, padding: 22, border: `2px solid ${C.dourado}`, display: "grid", gap: 16 }}>
            <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
              <legend style={{ ...rotulo, marginBottom: 10 }}>Como você quer o retorno? *</legend>
              <div style={{ display: "grid", gap: 10 }}>
                {TIPOS_RETORNO.map(([v, t, desc]) => {
                  const Icone = ICONE[v];
                  const ativo = f.tipo === v;
                  return (
                    <label key={v} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, cursor: "pointer", border: `2px solid ${ativo ? C.verde : "#D8CFB4"}`, background: ativo ? "var(--c-eaf5ec)" : "#fff" }}>
                      <input type="radio" name="tipo" value={v} checked={ativo} onChange={() => setF(x => ({ ...x, tipo: v }))} style={{ width: 20, height: 20, accentColor: C.verde }} />
                      <Icone size={24} color={C.verde} aria-hidden="true" />
                      <span><b style={{ display: "block", fontSize: 16 }}>{t}</b><span style={{ fontSize: 14, color: C.suave }}>{desc}</span></span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div><label style={rotulo} htmlFor="nome">Nome completo *</label><input id="nome" style={campo} required minLength={3} maxLength={120} autoComplete="name" value={f.nome} onChange={set("nome")} /></div>
            <div><label style={rotulo} htmlFor="tel">WhatsApp *</label><input id="tel" style={campo} required inputMode="tel" autoComplete="tel" placeholder="(99) 9 9999-9999" value={f.telefone} onChange={set("telefone")} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              <div><label style={rotulo} htmlFor="dia">Dia *</label><input id="dia" type="date" style={campo} required min={hoje()} value={f.dia} onChange={set("dia")} /></div>
              <div><label style={rotulo} htmlFor="hora">Horário *</label>
                <select id="hora" style={campo} required disabled={!f.dia || horarios === null} value={f.hora} onChange={e => setF(x => ({ ...x, hora: e.target.value }))}>
                  <option value="">{!f.dia ? "Escolha o dia primeiro" : horarios === null ? "Carregando…" : horarios.length ? "Escolha…" : "Sem horário livre neste dia"}</option>
                  {(horarios ?? []).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <p style={{ margin: "-6px 0 0", fontSize: 13, color: C.suave }}>Aparecem só os horários livres. {busca ? `Saídas para a visita das ${HORA_MIN}h às ${ULTIMA_BUSCA}h.` : `Ligações das ${HORA_MIN}h às ${HORA_MAX}h.`}</p>
            {busca && (
              <>
                <div>
                  <label style={rotulo} htmlFor="end">Endereço para buscarmos vocês *</label>
                  <textarea id="end" style={{ ...campo, minHeight: 80, resize: "vertical" }} required minLength={8} maxLength={300} autoComplete="street-address" placeholder="Rua, número, bairro, cidade e um ponto de referência" value={f.enderecoBusca} onChange={set("enderecoBusca")} />
                </div>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15, lineHeight: 1.4, padding: 12, borderRadius: 12, background: "var(--c-fff7e0)", border: `1px solid ${C.dourado}` }}>
                  <input type="checkbox" required checked={f.decidido} onChange={set("decidido")} style={{ width: 20, height: 20, marginTop: 2, accentColor: C.verde }} />
                  Já tirei minhas dúvidas e quero ir ao condomínio para escolher a chácara e fechar a compra.
                </label>
                <div><label style={rotulo} htmlFor="pessoas">Quantas pessoas vão? *</label><input id="pessoas" type="number" min={1} max={10} style={campo} required value={f.pessoas} onChange={set("pessoas")} /></div>
              </>
            )}
            <div><label style={rotulo} htmlFor="obs">Algum recado? (opcional)</label><input id="obs" style={campo} maxLength={300} value={f.observacao} onChange={set("observacao")} /></div>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.4 }}>
              <input type="checkbox" required checked={f.consentimento} onChange={set("consentimento")} style={{ width: 20, height: 20, marginTop: 2, accentColor: C.verde }} />
              Aceito ser contatado(a) por WhatsApp e ligação no horário que escolhi. Meus dados são usados só para este atendimento.
            </label>
            {erro && <p role="alert" style={{ margin: 0, color: "var(--c-b42318)", fontWeight: 700 }}>{erro}</p>}
            <button type="submit" disabled={enviando} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 20px", borderRadius: 14, border: "none", background: C.verde, color: "var(--c-ffffff)", fontSize: 18, fontWeight: 700, cursor: "pointer", opacity: enviando ? 0.7 : 1 }}>
              {enviando ? <Loader2 size={20} className="animate-spin" /> : busca ? <Car size={20} /> : <PhoneCall size={20} />} {enviando ? "Enviando…" : "Confirmar horário"}
            </button>
          </form>
          <p style={{ textAlign: "center", fontSize: 12, color: C.suave, margin: 0 }}>Romatec Consultoria Total, CRECI J-1234</p>
        </main>
      )}
    </div>
  );
}
