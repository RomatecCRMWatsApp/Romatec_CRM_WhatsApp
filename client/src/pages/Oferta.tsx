import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { FileImage, Flame, MessageCircle } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts } from "@/components/bom-jardims/marca";
import { FotoCorretor } from "@/lib/cartaoVendas";
import { brl, simular, type CondicoesPagamento } from "@shared/simulador";
import type { CartaoVendas } from "@shared/cartaoVendas";

type Dados = {
  empreendimento: { slug: string; nome: string };
  nome: string | null;
  condicoes: CondicoesPagamento;
  entradaParcelas: number;
  validade: string;
  aviso: string;
  disponiveis: number;
  lotes: { codigo: string; areaM2: number; preco: number }[];
  sugerida: string | null;
  contato: CartaoVendas;
  whatsapp: string;
  imagem: string | null;
};

const m2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const logoDe = (slug: string) => (slug === "bom-jardims" ? "/bom-jardims/logo.webp" : null);
const cartao: React.CSSProperties = { background: "#fff", borderRadius: 20, padding: 20, border: "1px solid #E2D9BF" };

/**
 * Página de oferta (pública): o link que o robô manda no WhatsApp. Simulador por chácara livre (mesmos números do
 * sistema), contagem de disponíveis ao vivo, o corretor do lead e o botão "Quero esta chácara" no WhatsApp.
 */
export default function Oferta() {
  useBrandFonts();
  const [, params] = useRoute("/o/:slug");
  const slug = params?.slug ?? "bom-jardims";
  const token = useMemo(() => new URLSearchParams(window.location.search).get("l") ?? "", []);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [livres, setLivres] = useState<string[] | null>(null);
  const [codigo, setCodigo] = useState("");
  const [entrada, setEntrada] = useState(1);
  const [prazo, setPrazo] = useState(0);

  useEffect(() => {
    fetch(`/api/public/oferta/${encodeURIComponent(slug)}${token ? `?l=${encodeURIComponent(token)}` : ""}`)
      .then(r => r.json()).then(j => {
        if (!j.ok) { setErro(j.error || "Página não encontrada"); return; }
        setDados(j);
        setCodigo(j.sugerida ?? j.lotes[0]?.codigo ?? "");
        setEntrada(j.entradaParcelas);
        setPrazo(Math.max(...j.condicoes.prazos));
        document.title = `Sua oferta — ${j.empreendimento.nome}`;
      }).catch(() => setErro("Não foi possível carregar a página."));
  }, [slug, token]);

  // Disponíveis ao vivo (de minuto em minuto)
  useEffect(() => {
    const ver = () => fetch(`/api/public/oferta/${encodeURIComponent(slug)}/disponiveis`).then(r => r.json()).then(j => j.ok && setLivres(j.livres)).catch(() => {});
    const t = setInterval(ver, 60_000);
    return () => clearInterval(t);
  }, [slug]);

  if (erro) return <div style={{ padding: 32, fontFamily: SANS, color: C.texto }}>{erro}</div>;
  if (!dados) return <div style={{ padding: 32, fontFamily: SANS, color: C.suave }}>Carregando…</div>;

  const c = dados.condicoes;
  const disponiveis = livres?.length ?? dados.disponiveis;
  const saiu = !!livres && !!codigo && !livres.includes(codigo);
  const lote = dados.lotes.find(l => l.codigo === codigo) ?? null;
  const sim = lote ? simular(lote.areaM2, entrada, c, lote.preco) : null;
  const plano = sim?.planos.find(p => p.prazo === prazo) ?? sim?.planos.at(-1) ?? null;
  const zap = `https://wa.me/${dados.whatsapp}?text=${encodeURIComponent(lote ? `Quero a chácara ${lote.codigo}${plano ? ` em ${plano.prazo}×` : ""}` : `Tenho interesse no ${dados.empreendimento.nome}`)}`;
  const logo = logoDe(dados.empreendimento.slug);
  const secao: React.CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "0 16px" };

  return (
    <div style={{ background: C.creme, minHeight: "100vh", fontFamily: SANS, color: C.texto }}>
      <header style={{ background: C.verde, color: "#fff", padding: "24px 0 28px", borderBottom: `4px solid ${C.dourado}` }}>
        <div style={{ ...secao, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {logo && <img src={logo} alt={dados.empreendimento.nome} style={{ height: 70, width: "auto" }} />}
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: 0, color: C.dourado, fontWeight: 700, letterSpacing: 1, fontSize: 13, textTransform: "uppercase" }}>{dados.nome ? `${dados.nome}, esta é a sua oferta` : "Condição de lançamento"}</p>
            <h1 style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: 30, lineHeight: 1.15 }}>{dados.empreendimento.nome}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(242,192,75,0.15)", border: `1px solid ${C.destaque}`, borderRadius: 999, padding: "8px 14px" }}>
            <Flame size={18} color={C.destaque} />
            <span style={{ fontWeight: 700 }}>Restam {disponiveis} chácaras</span>
          </div>
        </div>
      </header>

      <main style={{ ...secao, padding: "20px 16px 40px", display: "grid", gap: 18 }}>
        {dados.imagem && <img src={dados.imagem} alt="Oferta" style={{ width: "100%", height: "auto", borderRadius: 20, display: "block" }} />}

        <section style={{ ...cartao, border: `2px solid ${C.dourado}` }}>
          <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 24, margin: "0 0 12px" }}>Simule a sua chácara</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.verde, marginBottom: 6 }}>Chácara (livres agora)</span>
              <select value={codigo} onChange={e => setCodigo(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #D8CFB4", fontSize: 16, background: "#fff" }}>
                {dados.lotes.filter(l => !livres || livres.includes(l.codigo) || l.codigo === codigo).map(l => <option key={l.codigo} value={l.codigo}>{l.codigo} · {m2(l.areaM2)} m²</option>)}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.verde, marginBottom: 6 }}>Entrada em {entrada}× sem juros</span>
              <input type="range" min={1} max={c.entradaMaxParcelas} value={entrada} onChange={e => setEntrada(Number(e.target.value))} style={{ width: "100%" }} />
            </label>
          </div>
          {saiu && <p role="status" style={{ margin: "10px 0 0", color: "#B54708", fontWeight: 700 }}>A chácara {codigo} acabou de sair. Escolha outra da lista.</p>}

          {sim && (
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 15 }}>
                <span>Preço de tabela <b>{brl(sim.preco)}</b></span>
                <span>À vista <b style={{ color: C.verde }}>{brl(sim.avistaTotal.valor)}</b> ({brl(sim.avistaTotal.desconto)} de desconto)</span>
              </div>
              <div style={{ background: C.verde, color: "#fff", borderRadius: 16, padding: 16, textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 14, color: C.dourado, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Parcelado direto com a empreendedora</p>
                <p style={{ margin: "6px 0 0", fontFamily: SERIF, fontSize: 26, fontWeight: 700 }}>{entrada}× {brl(sim.parcelasEntrada[0] ?? sim.entrada30)} de entrada</p>
                {plano && <p style={{ margin: "4px 0 0", fontSize: 18, color: C.destaque }}>+ {plano.prazo}× fixas de {brl(plano.parcela)}</p>}
                <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.85 }}>ou entrada à vista de {brl(sim.entradaAvista)} (economia de {brl(sim.descontoAvista)})</p>
              </div>
              <div>
                <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: C.verde }}>Saldo de {brl(sim.saldo)} — escolha o prazo</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                  {sim.planos.map(p => (
                    <button key={p.prazo} type="button" onClick={() => setPrazo(p.prazo)}
                      style={{ padding: "10px 8px", borderRadius: 12, cursor: "pointer", fontSize: 15, border: `2px solid ${p.prazo === plano?.prazo ? C.verde : "#E2D9BF"}`, background: p.prazo === plano?.prazo ? "#EAF5EC" : "#fff", color: C.texto }}>
                      <b>{p.prazo}×</b> {brl(p.parcela)}
                    </button>
                  ))}
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: C.suave }}>Juros de {(c.jurosAaEfetivo * 100).toLocaleString("pt-BR")}% ao ano no saldo (Tabela Price, parcelas fixas). Condição {dados.validade}.</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 16 }}>
            <a href={zap} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 18px", borderRadius: 14, background: "#1F8A4C", color: "#fff", fontSize: 18, fontWeight: 700, textDecoration: "none" }}>
              <MessageCircle size={22} /> {lote ? `Quero a chácara ${lote.codigo}` : "Falar no WhatsApp"}
            </a>
            {lote && !saiu && (
              <a href={`/api/public/oferta/${encodeURIComponent(dados.empreendimento.slug)}/chacara/${lote.codigo}.png`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 18px", borderRadius: 14, border: `2px solid ${C.verde}`, color: C.verde, fontSize: 16, fontWeight: 700, textDecoration: "none" }}>
                <FileImage size={20} /> Folder da chácara {lote.codigo}
              </a>
            )}
          </div>
        </section>

        <section style={{ display: "flex", alignItems: "center", gap: 14, background: C.verde, color: "#fff", borderRadius: 20, padding: 16 }}>
          <FotoCorretor cartao={dados.contato} tamanho={64} />
          <div style={{ lineHeight: 1.35 }}>
            <p style={{ margin: 0, fontSize: 12, color: C.dourado, fontWeight: 700, textTransform: "uppercase" }}>Seu atendimento</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{dados.contato.nome}</p>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{[dados.contato.creci, dados.contato.telefones[0]].filter(Boolean).join(" · ")}</p>
          </div>
        </section>

        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: C.suave, fontStyle: "italic" }}>{dados.aviso}</p>
        <p style={{ textAlign: "center", fontSize: 12, color: C.suave, margin: 0 }}>Romatec Consultoria Total · gestão e administração de vendas · CNPJ 17.261.987/0001-09</p>
      </main>
    </div>
  );
}
