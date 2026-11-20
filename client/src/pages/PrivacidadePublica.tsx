/**
 * /privacidade — canal do titular (LGPD art. 18): qualquer pessoa, com ou sem conta no CRM, faz o pedido, recebe um
 * protocolo e acompanha a situação. Publicação controlada por PRIVACIDADE_CANAL_ATIVO (desligado em produção até a
 * aprovação). Termos/Aviso só aparecem com PRIVACIDADE_MINUTAS_ATIVAS.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { STATUS_PEDIDO, TIPOS_PEDIDO, type TipoPedido } from "@shared/privacidade";
import { C, SERIF, SANS, useBrandFonts } from "@/components/bom-jardims/marca";

const campo: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.suave}55`, fontSize: 15, fontFamily: SANS, background: "#fff", color: C.texto, boxSizing: "border-box" };
const botao: React.CSSProperties = { padding: "11px 18px", borderRadius: 10, border: "none", background: C.verde, color: C.creme, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: SANS };
const data = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString("pt-BR") : "—");

function Documento({ doc }: { doc: "termos" | "privacidade" }) {
  const q = trpc.privacidade.documento.useQuery({ doc });
  if (!q.data) return null;
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{q.data.titulo} ({q.data.versao})</summary>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: SANS, fontSize: 13, lineHeight: 1.6, background: "#fff", padding: 12, borderRadius: 10 }}>{q.data.texto}</pre>
    </details>
  );
}

export default function PrivacidadePublica() {
  useBrandFonts();
  const cfg = trpc.privacidade.config.useQuery();
  const [form, setForm] = useState({ tipo: "acesso" as TipoPedido, nome: "", contato: "", descricao: "", website: "" });
  const [enviado, setEnviado] = useState<{ protocolo: string; codigoEnviado: boolean } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [verificado, setVerificado] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [buscar, setBuscar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const criar = trpc.privacidade.criarPedido.useMutation({ onSuccess: r => { setEnviado(r); setErro(null); }, onError: e => setErro(e.message) });
  const verificar = trpc.privacidade.verificarCodigo.useMutation({ onSuccess: () => { setVerificado(true); setErro(null); }, onError: e => setErro(e.message) });
  const situacao = trpc.privacidade.consultarPedido.useQuery({ protocolo: buscar ?? "" }, { enabled: !!buscar, retry: false });

  useEffect(() => {
    document.title = "Seus dados pessoais — Romatec";
    const meta = document.createElement("meta"); meta.name = "robots"; meta.content = "noindex"; document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  const pagina: React.CSSProperties = { minHeight: "100vh", background: C.creme, color: C.texto, fontFamily: SANS, padding: "24px 16px" };
  if (cfg.isLoading) return <main style={pagina} />;
  if (!cfg.data?.canalAtivo) {
    return (
      <main style={pagina}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontFamily: SERIF, color: C.verde }}>Seus dados pessoais</h1>
          <p>O formulário de pedidos de privacidade está em preparação. Enquanto isso, fale com a Romatec pelos canais de atendimento.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pagina}>
      <div style={{ maxWidth: 620, margin: "0 auto", display: "grid", gap: 18 }}>
        <header>
          <h1 style={{ fontFamily: SERIF, color: C.verde, margin: "0 0 6px" }}>Seus dados pessoais</h1>
          <p style={{ margin: 0, color: C.suave }}>
            Peça acesso, correção, eliminação ou outras informações sobre os seus dados no CRM da Romatec (Lei n.º 13.709/2018). Não é preciso ter conta.
            Você recebe um protocolo; o prazo interno de resposta é de {cfg.data.prazoDias} dias após a confirmação do contato.
          </p>
        </header>

        {erro && <p role="alert" style={{ background: "#fde8e6", color: "#8a1c12", padding: 10, borderRadius: 10, margin: 0 }}>{erro}</p>}

        {!enviado ? (
          <form onSubmit={e => { e.preventDefault(); criar.mutate(form); }} style={{ display: "grid", gap: 10, background: "#ffffffaa", padding: 16, borderRadius: 14 }}>
            <label>O que você precisa?
              <select style={campo} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoPedido }))}>
                {Object.entries(TIPOS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Nome completo<input style={campo} required minLength={3} maxLength={160} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} autoComplete="name" /></label>
            <label>Celular (com DDD) ou e-mail que você usou com a Romatec
              <input style={campo} required maxLength={160} value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} />
            </label>
            <label>Detalhes (opcional — não envie documentos aqui)
              <textarea style={{ ...campo, minHeight: 90 }} maxLength={2000} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </label>
            {/* Campo oculto contra robôs */}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999 }} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
            <p style={{ fontSize: 12, color: C.suave, margin: 0 }}>Usamos o nome e o contato só para identificar você e responder este pedido.</p>
            <button type="submit" style={botao} disabled={criar.isPending}>{criar.isPending ? "Enviando…" : "Enviar pedido"}</button>
          </form>
        ) : (
          <section style={{ background: "#ffffffaa", padding: 16, borderRadius: 14, display: "grid", gap: 10 }}>
            <p style={{ margin: 0 }}>Protocolo: <strong style={{ fontSize: 18 }}>{enviado.protocolo}</strong> — guarde este número.</p>
            {verificado ? (
              <p style={{ margin: 0 }}>Contato confirmado. O prazo de resposta começou a contar.</p>
            ) : enviado.codigoEnviado ? (
              <form onSubmit={e => { e.preventDefault(); verificar.mutate({ protocolo: enviado.protocolo, codigo }); }} style={{ display: "grid", gap: 8 }}>
                <label>Digite o código de 6 dígitos que enviamos para o contato informado
                  <input style={campo} inputMode="numeric" maxLength={6} value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ""))} />
                </label>
                <button type="submit" style={botao} disabled={verificar.isPending}>Confirmar</button>
              </form>
            ) : (
              <p style={{ margin: 0 }}>A equipe da Romatec vai confirmar a sua identidade pelo contato informado antes de atender o pedido.</p>
            )}
          </section>
        )}

        <section style={{ display: "grid", gap: 8 }}>
          <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 20, margin: 0 }}>Acompanhar um pedido</h2>
          <form onSubmit={e => { e.preventDefault(); setBuscar(consulta.trim()); }} style={{ display: "flex", gap: 8 }}>
            <input style={campo} placeholder="LGPD-2026-XXXXXXXX" maxLength={30} value={consulta} onChange={e => setConsulta(e.target.value.toUpperCase())} />
            <button type="submit" style={botao}>Consultar</button>
          </form>
          {buscar && situacao.data === null && <p style={{ margin: 0 }}>Protocolo não encontrado.</p>}
          {situacao.data && (
            <p style={{ margin: 0 }}>
              {TIPOS_PEDIDO[situacao.data.tipo]} — <strong>{STATUS_PEDIDO[situacao.data.status]}</strong> · aberto em {data(situacao.data.criadoEm)}
              {situacao.data.prazoEm ? ` · prazo ${data(situacao.data.prazoEm)}` : ""}{situacao.data.concluidoEm ? ` · concluído em ${data(situacao.data.concluidoEm)}` : ""}
            </p>
          )}
        </section>

        {cfg.data.minutasAtivas && (
          <section>
            <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 20, margin: 0 }}>Documentos</h2>
            <Documento doc="privacidade" />
            <Documento doc="termos" />
          </section>
        )}
      </div>
    </main>
  );
}
