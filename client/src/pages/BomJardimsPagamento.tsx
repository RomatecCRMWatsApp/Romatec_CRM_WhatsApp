import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Flame, MessageCircle } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts } from "@/components/bom-jardims/marca";
import { FotoCorretor, refDaSessao } from "@/lib/cartaoVendas";
import { brl, type CondicoesPagamento } from "@shared/simulador";
import {
  CONDICOES, ROTULO_CONDICAO, desembolsoPorAno, planoCondicao, prazosDaCondicao, textoCondicao, type CondicaoPagamento, type PlanoCondicao,
} from "@shared/condicoesLancamento";
import { AGENDAR_BOM_JARDIMS } from "@shared/bomJardimsSeo";
import { TITULO_PAGAMENTO } from "@shared/pagamentoBomJardims";
import { registrarEvento } from "@/lib/rastreamento";
import type { CartaoVendas } from "@shared/cartaoVendas";

/**
 * Folder interativo das formas de pagamento — /bom-jardims/formas-de-pagamento
 * O cliente escolhe a chácara, a forma (entrada 30%, Plano A, B ou C) e o prazo, e vê o que paga no ato, por mês,
 * por ano e no total — mesmos números do simulador do sistema (shared/condicoesLancamento.ts). O botão leva a
 * escolha para o WhatsApp de quem divulgou o link (?c=).
 */

type Dados = {
  empreendimento: { slug: string; nome: string };
  condicoes: CondicoesPagamento;
  aviso: string;
  disponiveis: number;
  lotes: { codigo: string; areaM2: number; preco: number }[];
  sugerida: string | null;
  contato: CartaoVendas;
  whatsapp: string;
  doCorretor?: boolean;
};

const m2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mil = (v: number) => `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;

const DIDATICA: Record<CondicaoPagamento, { selo?: string; como: string[] }> = {
  padrao: { como: ["Entrada de 30% à vista (com desconto) ou em até 6× sem juros", "O restante em parcelas fixas", "Para quem já tem a entrada guardada: paga menos no total"] },
  A: { selo: "MAIS ESCOLHIDO", como: ["Só R$ 10 mil de entrada", "A mesma parcela da condição de 30%", "Um reforço por ano, no mês do 13º salário"] },
  B: { como: ["Só R$ 10 mil de entrada", "Sem reforço: só a parcela todo mês", "Prazo de até 15 anos para a parcela caber"] },
  C: { como: ["Só R$ 10 mil de entrada", "O resto da entrada em até 36× sem juros, junto com a parcela", "Depois dos 3 primeiros anos, só a parcela"] },
};

export default function BomJardimsPagamento() {
  useBrandFonts();
  const ref = useMemo(() => refDaSessao() ?? "", []);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [cond, setCond] = useState<CondicaoPagamento>("A");
  const [prazo, setPrazo] = useState(120);

  useEffect(() => { document.title = TITULO_PAGAMENTO; }, []);
  useEffect(() => {
    fetch(`/api/public/oferta/bom-jardims${ref ? `?c=${encodeURIComponent(ref)}` : ""}`)
      .then(r => r.json()).then(j => {
        if (!j.ok) { setErro(j.error || "Página indisponível no momento."); return; }
        setDados(j);
        const base = j.lotes.find((l: any) => l.codigo === j.sugerida) ?? [...j.lotes].sort((a: any, b: any) => a.preco - b.preco)[0];
        setCodigo(base?.codigo ?? "");
      }).catch(() => setErro("Não foi possível carregar a página."));
  }, [ref]);

  const c = dados?.condicoes;
  const lote = dados?.lotes.find(l => l.codigo === codigo) ?? null;
  const prazos = c ? prazosDaCondicao(cond, c) : [];
  useEffect(() => { if (prazos.length && !prazos.includes(prazo)) setPrazo(prazos.includes(120) ? 120 : prazos[prazos.length - 1]); }, [cond, prazos.join(","), prazo]);

  const plano: PlanoCondicao | null = useMemo(() => {
    if (!c || !lote || !prazosDaCondicao(cond, c).includes(prazo)) return null;
    try { return planoCondicao(lote.preco, cond, prazo, c, 1); } catch { return null; }
  }, [c, lote, cond, prazo]);
  // Comparativo das quatro formas no prazo de 120× (ou o maior disponível)
  const comparativo = useMemo(() => !c || !lote ? [] : CONDICOES.map(k => {
    const ps = prazosDaCondicao(k, c); const n = k === "B" ? Math.max(...ps) : ps.includes(120) ? 120 : Math.max(...ps);
    return planoCondicao(lote.preco, k, n, c, 1);
  }), [c, lote]);
  const anos = plano ? desembolsoPorAno(plano) : [];
  const maxAno = Math.max(1, ...anos);

  if (erro) return <div style={{ padding: 32, fontFamily: SANS, color: C.texto }}>{erro}</div>;
  if (!dados || !c) return <div style={{ padding: 32, fontFamily: SANS, color: C.suave }}>Carregando…</div>;

  // Plano B vai direto para 180× (o prazo longo é o que faz a parcela caber); os demais, 120×
  const escolher = (k: CondicaoPagamento) => { setCond(k); setPrazo(k === "B" ? 180 : 120); registrarEvento("forma_pagamento", { empreendimento: "bom-jardims", condicao: k }); };
  const textoZap = plano && lote
    ? `Olá${dados.doCorretor ? `, ${dados.contato.nome.split(" ")[0]}` : ""}! Quero a chácara ${lote.codigo} (${m2(lote.areaM2)} m²) do Bom Jardims no *${ROTULO_CONDICAO[cond].titulo}*: ${textoCondicao(plano)}. Pode me ajudar?`
    : "Quero saber das formas de pagamento do Bom Jardims";
  const zap = `https://wa.me/${dados.whatsapp}?text=${encodeURIComponent(textoZap)}`;
  const sec: React.CSSProperties = { maxWidth: 820, margin: "0 auto", padding: "0 16px" };
  const card: React.CSSProperties = { background: "#fff", borderRadius: 20, padding: 18, border: "1px solid #E2D9BF" };
  const h2: React.CSSProperties = { fontFamily: SERIF, color: C.verde, fontSize: 24, margin: "0 0 10px" };

  return (
    <div style={{ background: C.creme, minHeight: "100vh", fontFamily: SANS, color: C.texto }}>
      <header style={{ background: C.verde, color: "#fff", padding: "22px 0 26px", borderBottom: `4px solid ${C.dourado}` }}>
        <div style={{ ...sec, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <img src="/bom-jardims/logo-520.webp" alt="Condomínio de Chácaras Bom Jardims" width={520} height={293} style={{ height: 64, width: "auto" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: 0, color: C.dourado, fontWeight: 800, letterSpacing: 1, fontSize: 13 }}>CONDIÇÃO DE LANÇAMENTO</p>
            <h1 style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: "clamp(26px, 6vw, 36px)", lineHeight: 1.1 }}>Formas de pagamento</h1>
            <p style={{ margin: "6px 0 0", color: C.destaque, fontWeight: 700 }}>Entrada a partir de R$ 10 mil · escolha a que cabe no seu bolso</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(242,192,75,0.15)", border: `1px solid ${C.destaque}`, borderRadius: 999, padding: "8px 14px" }}>
            <Flame size={18} color={C.destaque} /><span style={{ fontWeight: 700 }}>Restam {dados.disponiveis} chácaras</span>
          </div>
        </div>
      </header>

      <main style={{ ...sec, padding: "18px 16px 40px", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        {/* 1. Chácara */}
        <section style={card}>
          <h2 style={h2}>1. Escolha a chácara</h2>
          <select value={codigo} onChange={e => setCodigo(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #D8CFB4", fontSize: 16, background: "#fff" }}>
            {dados.lotes.map(l => <option key={l.codigo} value={l.codigo}>Chácara {l.codigo} · {m2(l.areaM2)} m² · {brl(l.preco)}</option>)}
          </select>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: C.suave }}>O preço é o mesmo em todas as formas de pagamento. Muda só como você paga.</p>
        </section>

        {/* 2. Forma */}
        <section>
          <h2 style={{ ...h2, padding: "0 4px" }}>2. Escolha a forma de pagamento</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 10 }}>
            {CONDICOES.map(k => {
              const on = k === cond; const ex = comparativo.find(p => p.condicao === k);
              return (
                <button key={k} type="button" onClick={() => escolher(k)} aria-pressed={on}
                  style={{ position: "relative", textAlign: "left", cursor: "pointer", borderRadius: 18, padding: "16px 16px 14px", fontFamily: SANS, color: on ? "#fff" : C.texto,
                    background: on ? C.verde : "#fff", border: `2px solid ${on ? C.dourado : "#E2D9BF"}`, boxShadow: on ? "0 10px 26px rgba(12,51,32,.25)" : "none" }}>
                  {DIDATICA[k].selo && <span style={{ position: "absolute", top: -10, right: 12, background: C.dourado, color: C.verde, fontWeight: 900, fontSize: 11, padding: "3px 10px", borderRadius: 999 }}>{DIDATICA[k].selo}</span>}
                  <b style={{ display: "block", fontSize: 18, color: on ? C.destaque : C.verde }}>{ROTULO_CONDICAO[k].titulo}</b>
                  {ex && <span style={{ display: "block", margin: "6px 0 8px", fontSize: 14 }}>Entrada <b>{brl(ex.entradaAto)}</b>{k === "padrao" ? " à vista" : ""} · {ex.prazo}× <b>{brl(ex.parcela)}</b></span>}
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.45, opacity: on ? 0.95 : 0.85 }}>
                    {DIDATICA[k].como.map(t => <li key={t}>{t}</li>)}
                  </ul>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Prazo + resultado */}
        <section style={{ ...card, border: `2px solid ${C.dourado}` }}>
          <h2 style={h2}>3. Escolha o prazo</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
            {prazos.map(n => (
              <button key={n} type="button" onClick={() => setPrazo(n)}
                style={{ padding: "10px 6px", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700, border: `2px solid ${n === prazo ? C.verde : "#E2D9BF"}`, background: n === prazo ? "#EAF5EC" : "#fff", color: C.texto }}>
                {n}× <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: C.suave }}>{n >= 12 ? `${n / 12} ano${n > 12 ? "s" : ""}` : `${n} meses`}</span>
              </button>
            ))}
          </div>

          {plano && lote && (
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div style={{ background: C.verde, color: "#fff", borderRadius: 18, padding: 18 }}>
                <p style={{ margin: 0, color: C.dourado, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>{ROTULO_CONDICAO[cond].titulo.toUpperCase()} · CHÁCARA {lote.codigo}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 12, marginTop: 10 }}>
                  <div><span style={{ fontSize: 13, opacity: .85 }}>Hoje (entrada)</span><b style={{ display: "block", fontFamily: SERIF, fontSize: "clamp(20px, 5.6vw, 26px)", color: C.destaque, whiteSpace: "nowrap" }}>{brl(plano.entradaAto)}</b>{plano.parcelasEntrada.length > 1 && <span style={{ fontSize: 12 }}>em {plano.parcelasEntrada.length}×</span>}</div>
                  <div><span style={{ fontSize: 13, opacity: .85 }}>Por mês</span><b style={{ display: "block", fontFamily: SERIF, fontSize: "clamp(20px, 5.6vw, 26px)", color: C.destaque, whiteSpace: "nowrap" }}>{brl(plano.parcela)}</b><span style={{ fontSize: 12 }}>{plano.prazo} parcelas fixas</span></div>
                  {plano.reforco && <div><span style={{ fontSize: 13, opacity: .85 }}>Reforço anual (13º)</span><b style={{ display: "block", fontFamily: SERIF, fontSize: "clamp(20px, 5.6vw, 26px)", color: C.destaque, whiteSpace: "nowrap" }}>{brl(plano.reforco.valor)}</b><span style={{ fontSize: 12 }}>{plano.reforco.qtd}× · uma vez por ano</span></div>}
                  {plano.complemento && <div><span style={{ fontSize: 13, opacity: .85 }}>Resto da entrada</span><b style={{ display: "block", fontFamily: SERIF, fontSize: "clamp(20px, 5.6vw, 26px)", color: C.destaque, whiteSpace: "nowrap" }}>{brl(plano.complemento.parcela)}</b><span style={{ fontSize: 12 }}>{plano.complemento.qtd}× sem juros, junto com a parcela</span></div>}
                </div>
                {plano.complemento && <p style={{ margin: "10px 0 0", fontSize: 14 }}>Nos {plano.complemento.qtd} primeiros meses você paga <b style={{ color: C.destaque }}>{brl(plano.mensalInicial)}</b> por mês; depois, só {brl(plano.parcela)}.</p>}
                <p style={{ margin: "10px 0 0", fontSize: 14 }}>Total a pagar: <b>{brl(plano.totalPago)}</b> · preço da chácara {brl(plano.preco)}</p>
              </div>

              {/* Desembolso por ano */}
              <div>
                <p style={{ margin: "0 0 6px", fontWeight: 700, color: C.verde }}>Quanto você paga em cada ano</p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, padding: "0 2px" }}>
                  {anos.map((v, k) => (
                    <div key={k} title={`${k + 1}º ano: ${brl(v)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ width: "100%", height: Math.max(4, (v / maxAno) * 96), background: k === 0 ? C.dourado : C.verde, borderRadius: "5px 5px 2px 2px" }} />
                      <span style={{ fontSize: 10, color: C.suave }}>{k + 1}º</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: C.suave }}>1º ano (com a entrada): <b style={{ color: C.texto }}>{mil(anos[0] ?? 0)}</b>{anos.length > 1 && <> · 2º ano: <b style={{ color: C.texto }}>{mil(anos[1])}</b></>}</p>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 16 }}>
            <a href={zap} target="_blank" rel="noopener noreferrer" onClick={() => registrarEvento("forma_pagamento_whatsapp", { condicao: cond, prazo, chacara: codigo }, "whatsapp")}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 18px", borderRadius: 14, background: "#1F8A4C", color: "#fff", fontSize: 17, fontWeight: 800, textDecoration: "none", textAlign: "center" }}>
              <MessageCircle size={22} /> Quero esta condição
            </a>
            <a href={`${AGENDAR_BOM_JARDIMS}${ref ? `?c=${encodeURIComponent(ref)}` : ""}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 18px", borderRadius: 14, border: `2px solid ${C.verde}`, color: C.verde, fontSize: 16, fontWeight: 700, textDecoration: "none" }}>
              <CalendarCheck size={20} /> Agendar visita
            </a>
          </div>
        </section>

        {/* Comparativo */}
        {lote && comparativo.length > 0 && (
          <section style={card}>
            <h2 style={h2}>Compare as quatro formas</h2>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: C.suave }}>Chácara {lote.codigo} · {brl(lote.preco)}</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
                <thead><tr style={{ background: C.verde, color: "#fff" }}>
                  {["Forma", "Entrada", "Por mês", "Extra", "Total"].map(h => <th key={h} style={{ padding: "9px 8px", textAlign: h === "Forma" ? "left" : "right" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {comparativo.map(p => (
                    <tr key={p.condicao} onClick={() => escolher(p.condicao)} style={{ cursor: "pointer", background: p.condicao === cond ? "#F7F1DD" : "#fff", borderBottom: "1px solid #E2D9BF" }}>
                      <td style={{ padding: "9px 8px", fontWeight: 700, color: C.verde }}>{ROTULO_CONDICAO[p.condicao].curto}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>{brl(p.entradaAto)}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>{p.prazo}× {brl(p.parcela)}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>{p.reforco ? `${brl(p.reforco.valor)}/ano` : p.complemento ? `${p.complemento.qtd}× ${brl(p.complemento.parcela)}` : "—"}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>{brl(p.totalPago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section style={{ display: "flex", alignItems: "center", gap: 14, background: C.verde, color: "#fff", borderRadius: 20, padding: 16 }}>
          <FotoCorretor cartao={dados.contato} tamanho={64} />
          <div style={{ lineHeight: 1.35 }}>
            <p style={{ margin: 0, fontSize: 12, color: C.dourado, fontWeight: 700, textTransform: "uppercase" }}>Seu atendimento</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{dados.contato.nome}</p>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{[dados.contato.creci, dados.contato.telefones[0]].filter(Boolean).join(" · ")}</p>
          </div>
        </section>

        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: C.suave, fontStyle: "italic" }}>
          Juros de {(c.jurosAaEfetivo * 100).toLocaleString("pt-BR")}% ao ano efetivos sobre o valor financiado (Tabela Price, parcelas fixas, sem correção). No Plano C o resto da entrada é sem juros. {dados.aviso}
        </p>
        <p style={{ textAlign: "center", fontSize: 12, color: C.suave, margin: 0 }}>Romatec Consultoria Total · CNPJ 17.261.987/0001-09 · José Romário, Corretor CRECI/MA 4.705</p>
      </main>
    </div>
  );
}
