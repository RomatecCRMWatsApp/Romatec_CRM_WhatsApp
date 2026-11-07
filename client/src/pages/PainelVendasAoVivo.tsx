import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Maximize2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import LoteMap, { STATUS_COR, type LoteInfo } from "@/components/bom-jardims/LoteMap";
import { C, SERIF, SANS, useBrandFonts } from "@/components/bom-jardims/marca";
import { LINHA_PUBLICIDADE } from "@shared/escritorio";

/** Atualiza a cada 5 s: as chácaras mudam de cor na TV logo depois da reserva */
const ATUALIZA_MS = 5000;
const AVISO_MS = 12_000;
const LINK_PAGINA = "/bom-jardims?utm_source=evento&utm_medium=tv&utm_campaign=lancamento";

type Aviso = { codigo: string; texto: string; em: number };
const VENDEU = new Set<LoteInfo["status"]>(["reservado", "em_negociacao", "vendido"]);
const TEXTO_STATUS: Partial<Record<LoteInfo["status"], string>> = { reservado: "acabou de ser reservada", em_negociacao: "entrou em negociação", vendido: "foi vendida" };

/** Mapa de vendas ao vivo para a TV do lançamento (público, sem preço: só a situação de cada chácara) */
export default function PainelVendasAoVivo() {
  useBrandFonts();
  const { data: emp, dataUpdatedAt, isError } = trpc.empreendimentos.publicBySlug.useQuery({ slug: "bom-jardims" }, { refetchInterval: ATUALIZA_MS, refetchIntervalInBackground: true });
  const anterior = useRef<Map<string, LoteInfo["status"]> | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => { document.title = "Bom Jardims · mapa de vendas ao vivo"; }, []);
  useEffect(() => { QRCode.toDataURL(`${window.location.origin}${LINK_PAGINA}`, { width: 360, margin: 1 }).then(setQr).catch(() => setQr(null)); }, []);
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Compara com a leitura anterior: chácara que saiu de "disponível" vira aviso na tela
  useEffect(() => {
    if (!emp?.lotes) return;
    const atual = new Map((emp.lotes as LoteInfo[]).map(l => [l.codigo, l.status]));
    const antes = anterior.current;
    anterior.current = atual;
    if (!antes) return;
    const novos: Aviso[] = [];
    atual.forEach((st, codigo) => {
      if (antes.get(codigo) !== st && VENDEU.has(st) && TEXTO_STATUS[st]) novos.push({ codigo, texto: TEXTO_STATUS[st]!, em: Date.now() });
    });
    if (novos.length) setAvisos(a => [...novos, ...a].slice(0, 6));
  }, [emp, dataUpdatedAt]);

  const recentes = avisos.filter(a => agora - a.em < AVISO_MS);
  const destaque = recentes[0]?.codigo;
  const r = emp?.resumo;
  const vendidas = (r?.vendido ?? 0) + (r?.reservado ?? 0) + (r?.em_negociacao ?? 0);
  const contadores: { rotulo: string; n: number; cor: string }[] = r ? [
    { rotulo: "Disponíveis", n: r.disponivel, cor: STATUS_COR.disponivel },
    { rotulo: "Reservadas", n: r.reservado + r.em_negociacao, cor: STATUS_COR.reservado },
    { rotulo: "Vendidas", n: r.vendido, cor: STATUS_COR.vendido },
  ] : [];
  const telaCheia = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };

  return (
    <main className="tv-painel" style={{ minHeight: "100vh", background: C.verde, color: "var(--c-ffffff)", fontFamily: SANS, display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", overflowX: "clip" }}>
      <style>{`
        .tv-painel .tv-corpo { display: grid; grid-template-columns: minmax(0, 1fr) clamp(240px, 24vw, 380px); gap: clamp(12px, 2vw, 28px); padding: 0 clamp(12px, 2.5vw, 40px); min-height: 0; }
        .tv-painel .tv-mapa { background: ${C.creme}; border-radius: 18px; padding: 10px; min-height: 0; overflow: hidden; }
        .tv-painel .tv-mapa svg[role="img"] { width: auto !important; max-width: 100%; max-height: calc(100vh - clamp(230px, 27vh, 300px)); margin: 0 auto; }
        .tv-painel .tv-mapa > div > :not(:first-child) { display: none; }
        .tv-painel .tv-aviso { animation: tvEntra .45s ease-out both; }
        @keyframes tvEntra { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .tv-painel .tv-aviso { animation: none; } }
        @media (max-width: 860px) { .tv-painel .tv-corpo { grid-template-columns: minmax(0, 1fr); } }
        .tv-painel button:focus-visible { outline: 3px solid ${C.destaque}; outline-offset: 2px; }
      `}</style>

      <header style={{ display: "flex", alignItems: "center", gap: 20, padding: "clamp(12px, 2vw, 24px) clamp(12px, 2.5vw, 40px)" }}>
        <img src="/bom-jardims/logo-520.webp" alt="Bom Jardims" width={520} height={293} style={{ width: "clamp(120px, 12vw, 200px)", height: "auto" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 3.4vw, 56px)", margin: 0, lineHeight: 1.05 }}>Mapa de vendas ao vivo</h1>
          <p style={{ margin: "6px 0 0", fontSize: "clamp(14px, 1.4vw, 22px)", color: C.destaque }}>
            {r ? `${vendidas} ${vendidas === 1 ? "chácara já tem dono" : "chácaras já têm dono"} · ${r.disponivel} disponíveis` : "Carregando…"}
          </p>
        </div>
        <button type="button" onClick={telaCheia} title="Tela cheia" aria-label="Tela cheia"
          style={{ background: "transparent", border: `1px solid ${C.dourado}`, color: C.destaque, borderRadius: 10, padding: 10, cursor: "pointer" }}>
          <Maximize2 size={22} />
        </button>
      </header>

      <div className="tv-corpo">
        <div className="tv-mapa">
          {emp ? <LoteMap lotes={emp.lotes as LoteInfo[]} selected={destaque} onSelect={() => {}} destaque />
            : <p style={{ color: C.texto, padding: 24 }}>{isError ? "Sem conexão com o sistema. Tentando de novo…" : "Carregando o mapa…"}</p>}
        </div>

        <aside style={{ display: "grid", alignContent: "start", gap: 14 }}>
          {contadores.map(c => (
            <div key={c.rotulo} style={{ display: "flex", alignItems: "center", gap: 14, background: "color-mix(in srgb, var(--c-ffffff) 8%, transparent)", borderRadius: 14, padding: "12px 16px" }}>
              <span aria-hidden style={{ width: 22, height: 22, borderRadius: 6, background: c.cor, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: "clamp(16px, 1.5vw, 24px)" }}>{c.rotulo}</span>
              <b style={{ fontFamily: SERIF, fontSize: "clamp(30px, 3vw, 52px)", lineHeight: 1 }}>{c.n}</b>
            </div>
          ))}

          <div aria-live="polite" style={{ display: "grid", gap: 10 }}>
            {recentes.map(a => (
              <div key={`${a.codigo}-${a.em}`} className="tv-aviso" style={{ background: C.destaque, color: C.verde, borderRadius: 14, padding: "14px 16px", fontWeight: 800, fontSize: "clamp(18px, 1.7vw, 28px)", lineHeight: 1.2 }}>
                Chácara {a.codigo} {a.texto}!
              </div>
            ))}
          </div>

          {qr && (
            <div style={{ display: "flex", gap: 14, alignItems: "center", background: "var(--c-ffffff)", color: C.texto, borderRadius: 14, padding: 12 }}>
              <img src={qr} alt="QR code para escolher a chácara pelo celular" width={120} height={120} style={{ width: "clamp(90px, 8vw, 140px)", height: "auto" }} />
              <p style={{ margin: 0, fontSize: "clamp(14px, 1.2vw, 19px)", fontWeight: 700 }}>Aponte a câmera e escolha a sua chácara pelo celular</p>
            </div>
          )}
        </aside>
      </div>

      <footer style={{ padding: "12px clamp(12px, 2.5vw, 40px)", fontSize: "clamp(16px, 1.3vw, 22px)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <b>{LINHA_PUBLICIDADE}</b>
        <span style={{ opacity: 0.85 }}>Corretor responsável: José Romário · CRECI/MA F-4.705</span>
      </footer>
    </main>
  );
}
