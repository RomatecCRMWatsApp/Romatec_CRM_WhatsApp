import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, BookOpen, ChevronRight, FileText, IdCard, Loader2, Lock, ZoomIn, ZoomOut } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts, ContatosBotoes } from "@/components/bom-jardims/marca";
import { CarteirinhaFrente, CarteirinhaVerso, Cracha } from "@/components/contratos/ModelosCarteirinha";
import { DOCUMENTOS_CLIENTE, documentoCliente, empDocsValido, type DocumentoCliente } from "@shared/documentosCliente";

/**
 * Documentos do Bom Jardims para o cliente — /documentos/:emp (lista) e /documentos/:emp/:doc (leitura).
 * Apresentação no padrão da landing e, embaixo, o documento como imagens (server/documentosCliente.ts):
 * sem seleção de texto, sem menu de salvar, sem download. ?c= de quem compartilhou → contato desse corretor.
 */

const LOGO = "/bom-jardims/logo-520.webp";
const comRef = (caminho: string) => {
  const c = new URLSearchParams(window.location.search).get("c");
  return c && /^[A-Za-z0-9_-]{9,16}$/.test(c) ? `${caminho}?c=${c}` : caminho;
};
/** Bloqueia salvar, arrastar e copiar dentro do leitor */
const bloquear = { onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(), onDragStart: (e: React.SyntheticEvent) => e.preventDefault(), onCopy: (e: React.SyntheticEvent) => e.preventDefault() };

function useNoIndex(titulo: string) {
  useEffect(() => {
    document.title = titulo;
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex, nofollow";
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, [titulo]);
}

function Topo({ titulo, subtitulo, voltar }: { titulo: string; subtitulo: string; voltar?: string }) {
  return (
    <header style={{ background: `linear-gradient(160deg, ${C.verde} 0%, #08261A 100%)`, color: C.creme }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 36px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 22 }}>
          <img src={LOGO} alt="Condomínio de Chácaras Bom Jardims" width={520} height={293} style={{ width: "min(170px, 42vw)", height: "auto" }} />
          {voltar && (
            <Link href={voltar} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.dourado, fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
              <ArrowLeft size={16} /> Todos os documentos
            </Link>
          )}
        </div>
        <p style={{ color: C.dourado, letterSpacing: "0.18em", fontSize: 12, fontWeight: 700, margin: "0 0 8px" }}>DOCUMENTOS DO EMPREENDIMENTO</p>
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 5vw, 42px)", lineHeight: 1.15, margin: "0 0 10px" }}>{titulo}</h1>
        <p style={{ margin: 0, opacity: 0.88, maxWidth: 720, lineHeight: 1.5 }}>{subtitulo}</p>
      </div>
    </header>
  );
}

function Rodape() {
  return (
    <footer style={{ background: "#08261A", color: C.creme, padding: "28px 16px", fontSize: 13 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", lineHeight: 1.6, opacity: 0.85 }}>
        <p style={{ margin: 0 }}>Condomínio de Chácaras Bom Jardims · Açailândia/MA</p>
        <p style={{ margin: 0 }}>Romatec Consultoria Total · CRECI/MA 4.705 · Documentos para leitura — a versão válida é a assinada no seu contrato.</p>
      </div>
    </footer>
  );
}

function Destaques({ d }: { d: DocumentoCliente }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #E2D9BF", borderRadius: 16, padding: "20px 20px 8px" }}>
      <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 22, margin: "0 0 12px" }}>Principais pontos</h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {d.destaques.map(t => (
          <li key={t} style={{ display: "flex", gap: 10, marginBottom: 12, lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 99, background: C.dourado, marginTop: 8 }} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Páginas do PDF como imagens, uma embaixo da outra */
function LeitorPdf({ emp, doc }: { emp: string; doc: string }) {
  const [paginas, setPaginas] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O app trava o zoom de pinça (index.html): o leitor tem o próprio zoom, com rolagem lateral
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let vivo = true;
    setPaginas(null); setErro(null);
    fetch(`/api/public/documentos/${emp}/${doc}`).then(r => r.json()).then(j => {
      if (!vivo) return;
      if (j?.ok) setPaginas(j.paginas); else setErro(j?.error || "Documento indisponível");
    }).catch(() => vivo && setErro("Não foi possível abrir o documento. Verifique a internet e tente de novo."));
    return () => { vivo = false; };
  }, [emp, doc]);

  if (erro) return <p style={{ padding: 24, textAlign: "center", color: "#8A2D2D" }}>{erro}</p>;
  if (paginas == null) return (
    <div style={{ padding: 40, textAlign: "center", color: C.suave }}>
      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Preparando o documento para leitura…
    </div>
  );
  const botao: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1px solid #E2D9BF", background: "#fff", color: C.verde, fontWeight: 700, fontSize: 13, cursor: "pointer" };
  return (
    <>
    <div style={{ position: "sticky", top: 8, zIndex: 2, display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
      <button type="button" style={botao} disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))} aria-label="Diminuir"><ZoomOut size={16} /></button>
      <span style={{ ...botao, cursor: "default" }}>{Math.round(zoom * 100)}%</span>
      <button type="button" style={botao} disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.5))} aria-label="Ampliar"><ZoomIn size={16} /></button>
    </div>
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
    <div {...bloquear} style={{ display: "grid", gap: 14, width: `${zoom * 100}%`, userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}>
      {Array.from({ length: paginas }, (_, i) => (
        <div key={i} style={{ position: "relative", background: "#fff", borderRadius: 6, boxShadow: "0 4px 18px rgba(12,51,32,0.14)", overflow: "hidden" }}>
          <img src={`/api/public/documentos/${emp}/${doc}/${i + 1}.webp`} alt={`Página ${i + 1} de ${paginas}`} loading={i < 2 ? "eager" : "lazy"} draggable={false}
            style={{ display: "block", width: "100%", height: "auto", pointerEvents: "none" }} />
          {/* Camada por cima: toque longo e "salvar imagem" pegam ela, não a página */}
          <div style={{ position: "absolute", inset: 0 }} />
          <span style={{ position: "absolute", right: 8, bottom: 6, fontSize: 11, color: C.suave }}>{i + 1}/{paginas}</span>
        </div>
      ))}
    </div>
    </div>
    </>
  );
}

function LeitorCartao({ doc }: { doc: string }) {
  if (doc === "carteirinha") return (
    <div {...bloquear} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 20, userSelect: "none" }}>
      <div><p style={{ fontWeight: 700, color: C.verde, margin: "0 0 8px" }}>Frente</p><CarteirinhaFrente nome="Nome do Titular" vinculo="Titular" unidade="Chácara A01 · Quadra A" foto={null} /></div>
      <div><p style={{ fontWeight: 700, color: C.verde, margin: "0 0 8px" }}>Verso</p><CarteirinhaVerso /></div>
    </div>
  );
  return (
    <div {...bloquear} style={{ maxWidth: 280, margin: "0 auto", userSelect: "none" }}>
      <Cracha nome="Nome do Visitante" tipo="Visitante" evento="Visita à chácara" numero="001" foto={null} />
    </div>
  );
}

function Indice({ emp }: { emp: string }) {
  useNoIndex("Documentos — Condomínio de Chácaras Bom Jardims");
  return (
    <>
      <Topo titulo="Contrato, Estatuto e modelos" subtitulo="Leia aqui os documentos do Condomínio de Chácaras Bom Jardims: o contrato de compra e venda, o Estatuto da associação, as regras de uso e os modelos de carteirinha e crachá." />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14 }}>
          {DOCUMENTOS_CLIENTE.map(d => (
            <Link key={d.slug} href={comRef(`/documentos/${emp}/${d.slug}`)}
              style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 18, borderRadius: 16, background: "#fff", border: "1px solid #E2D9BF", color: C.texto, textDecoration: "none" }}>
              <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12, background: C.verde, color: C.dourado, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {d.forma === "cartao" ? <IdCard size={22} /> : <FileText size={22} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: SERIF, fontSize: 18, color: C.verde, fontWeight: 700 }}>{d.titulo}</span>
                <span style={{ display: "block", fontSize: 13, color: C.suave, lineHeight: 1.45, marginTop: 4 }}>{d.subtitulo}</span>
              </span>
              <ChevronRight size={20} color={C.dourado} style={{ flexShrink: 0, marginTop: 10 }} />
            </Link>
          ))}
        </div>
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 22, margin: "0 0 12px" }}>Dúvidas? Fale com o corretor</h2>
          <ContatosBotoes />
        </section>
      </main>
    </>
  );
}

function Documento({ emp, d }: { emp: string; d: DocumentoCliente }) {
  useNoIndex(`${d.titulo} — Bom Jardims`);
  return (
    <>
      <Topo titulo={d.titulo} subtitulo={d.subtitulo} voltar={comRef(`/documentos/${emp}`)} />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 40px", display: "grid", gap: 24 }}>
        <Destaques d={d} />
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", color: C.verde }}>
            <BookOpen size={20} />
            <h2 style={{ fontFamily: SERIF, fontSize: 22, margin: 0 }}>{d.forma === "cartao" ? "Modelo" : "Documento completo"}</h2>
          </div>
          <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.suave, margin: "0 0 14px" }}>
            <Lock size={14} /> Somente leitura{d.forma === "pdf" ? " — role para ver todas as páginas" : " — dados ilustrativos"}
          </p>
          {d.forma === "pdf" ? <LeitorPdf emp={emp} doc={d.slug} /> : <LeitorCartao doc={d.slug} />}
        </section>
        <section>
          <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 22, margin: "0 0 12px" }}>Dúvidas? Fale com o corretor</h2>
          <ContatosBotoes />
        </section>
      </main>
    </>
  );
}

export default function DocumentosPublicos() {
  useBrandFonts();
  const { emp = "", doc } = useParams<{ emp: string; doc?: string }>();
  const d = doc ? documentoCliente(doc) : null;
  const valido = empDocsValido(emp) && (!doc || d);
  return (
    <div style={{ minHeight: "100vh", background: C.creme, color: C.texto, fontFamily: SANS }}>
      {!valido ? (
        <>
          <Topo titulo="Documento não encontrado" subtitulo="Confira o link recebido ou fale com o seu corretor." />
          <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px" }}><ContatosBotoes /></main>
        </>
      ) : d ? <Documento emp={emp} d={d} /> : <Indice emp={emp} />}
      <Rodape />
    </div>
  );
}
