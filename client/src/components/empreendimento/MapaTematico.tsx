import { useEffect, useMemo, useState } from "react";
import { COR_SITUACAO, ROTULO_SITUACAO, SITUACOES_LOTE, type SituacaoLote } from "@shared/lotes";

/**
 * Mapa temático dos lotes (SVG a partir das coordenadas). O desenho dos lotes vem do banco
 * (importado do DXF); traçado das ruas, perímetro e pontos de referência vêm do /<slug>/mapa.json.
 * Ruas em asfalto com meio-fio e faixa central; nomes oficiais (do DXF) na posição do projeto;
 * lotes com cerca.
 */
type Pt = [number, number]; // [lon, lat]
export type LoteMapa = { id: number; codigo: string; situacao: SituacaoLote; poligono: Pt[] | null };
export type RuaRotulo = { nome: string; lon: number; lat: number; angulo: number };
export type Contexto = {
  lotes: { codigo: string; poly: Pt[] }[];
  ruas: { nome: string; line: Pt[] }[];
  perimetro: Pt[];
  pontos?: { nome: string; pt: Pt }[];
  /** Rio/córrego (eixo), traçado da planta oficial */
  rio?: { nome: string; line: Pt[]; rotulo?: Pt };
  /** Áreas de uso comum (ex.: área de vivência e recreação) */
  areas?: { nome: string; detalhe?: string; poly: Pt[]; rotulo?: Pt }[];
  /** APP — faixa de preservação ao longo do rio */
  app?: { nome: string; detalhe?: string; poly: Pt[] };
  /** Trilha ecológica (núcleo de apoio → pontos de banho) */
  trilha?: { nome: string; line: Pt[]; rotulo?: Pt };
};
const valido = (p: Pt | null | undefined): p is Pt => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

const W = 1000, PAD = 24;
const caminho = (pts: [number, number][], fechar = true) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + (fechar ? "Z" : "");
const centro = (pts: [number, number][]) => {
  const anel = pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts;
  return [anel.reduce((s, p) => s + p[0], 0) / anel.length, anel.reduce((s, p) => s + p[1], 0) / anel.length] as [number, number];
};
/** Inclinação do texto na tela, sempre legível (nunca de cabeça para baixo) */
const inclinacao = (anguloDxf: number) => { let a = -anguloDxf; while (a <= -90) a += 180; while (a > 90) a -= 180; return a; };

export default function MapaTematico({ slug, lotes, ruas, perimetro, selecionado, onSelecionar, destacar, realce, compacto, semLegenda, contexto }: {
  slug: string;
  /** Dados do /<slug>/mapa.json já carregados (testes); sem isso, busca no servidor */
  contexto?: Contexto | null;
  /** Perímetro oficial (DXF) — prevalece sobre o do mapa.json */
  perimetro?: Pt[] | null;
  /** Só estes lotes (códigos) ficam coloridos — ex.: folder de um lote */
  realce?: string[];
  lotes: LoteMapa[];
  ruas?: RuaRotulo[];
  selecionado?: number | null;
  onSelecionar?: (id: number) => void;
  /** Só estas situações ficam coloridas (as outras em cinza claro) — ex.: mapa dos disponíveis */
  destacar?: SituacaoLote[];
  compacto?: boolean;
  semLegenda?: boolean;
}) {
  const [ctx, setCtx] = useState<Contexto | null>(contexto ?? null);
  useEffect(() => {
    if (contexto) return;
    fetch(`/${slug}/mapa.json`).then(r => (r.ok ? r.json() : null)).then(d => d && setCtx(d)).catch(() => {});
  }, [slug, contexto]);

  const desenho = useMemo(() => {
    const doContexto = new Map((ctx?.lotes ?? []).map(l => [l.codigo, l.poly]));
    const itens = lotes.map(l => ({ ...l, poly: (l.poligono?.length ? l.poligono : doContexto.get(l.codigo)) ?? null })).filter(l => l.poly && l.poly.length >= 3) as (LoteMapa & { poly: Pt[] })[];
    const contorno = perimetro?.length ? perimetro : ctx?.perimetro ?? [];
    // Enquadra a propriedade inteira: lotes, perímetro, portal e pontos, rio e área de vivência
    const todos = [
      ...itens.flatMap(l => l.poly), ...contorno, ...(ctx?.perimetro ?? []), ...(ctx?.pontos ?? []).map(p => p.pt),
      ...(ctx?.rio?.line ?? []), ...(ctx?.areas ?? []).flatMap(a => a.poly), ...(ctx?.app?.poly ?? []), ...(ctx?.trilha?.line ?? []),
    ].filter(valido);
    if (!todos.length) return null;
    const lons = todos.map(p => p[0]), lats = todos.map(p => p[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const escala = (W - 2 * PAD) / ((maxLon - minLon) * k || 1);
    const H = Math.round((maxLat - minLat) * escala + 2 * PAD);
    const proj = ([lon, lat]: Pt): [number, number] => [PAD + (lon - minLon) * k * escala, PAD + (maxLat - lat) * escala];
    // Largura da rua (≈ 12 m) em pixels
    const metro = escala / 111320;
    // Centro dos lotes: os rótulos do portal e do rio vão para fora, longe das quadras
    const centrosLotes = itens.map(l => proj(centro(l.poly) as Pt));
    const meio: [number, number] = centrosLotes.length
      ? [centrosLotes.reduce((s, p) => s + p[0], 0) / centrosLotes.length, centrosLotes.reduce((s, p) => s + p[1], 0) / centrosLotes.length]
      : [W / 2, H / 2];
    return { itens, proj, H, larguraRua: Math.max(6, 12 * metro), larguraRio: Math.max(5, 9 * metro), contorno, meio };
  }, [lotes, ctx, perimetro]);

  if (!desenho) return <p className="text-sm text-muted-foreground">Sem desenho dos lotes ainda. Envie o DXF do projeto na aba Arquivos e importe.</p>;
  const { itens, proj, H, larguraRua, larguraRio, contorno, meio } = desenho;
  const fonte = compacto ? 9 : 11;
  // Inclinação média das ruas (rótulos do projeto) para alinhar os blocos
  const anguloRuas = ruas?.length ? inclinacao(ruas.reduce((s, r) => s + (((r.angulo % 180) + 180) % 180 > 90 ? (((r.angulo % 180) + 180) % 180) - 180 : ((r.angulo % 180) + 180) % 180), 0) / ruas.length) : -32;

  return (
    <div>
      <div className="rounded-xl border border-border overflow-hidden shadow-inner">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa temático dos lotes" className="block w-full h-auto">
          <defs>
            <pattern id="grama" width="14" height="14" patternUnits="userSpaceOnUse">
              <rect width="14" height="14" fill="#D9E6C3" />
              <path d="M2 12 l2 -4 M8 6 l1.5 -3 M11 13 l2 -3" stroke="#C3D6A6" strokeWidth="1" />
            </pattern>
            <pattern id="vivencia" width="18" height="18" patternUnits="userSpaceOnUse">
              <rect width="18" height="18" fill="#C7DFA8" />
              <circle cx="5" cy="5" r="2.6" fill="#8DBF6A" />
              <circle cx="14" cy="13" r="2.2" fill="#9CC97B" />
            </pattern>
            <filter id="sombra" x="-5%" y="-5%" width="110%" height="110%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#000" floodOpacity="0.25" />
            </filter>
            {/* Calçamento em bloquete: fiadas desencontradas de blocos de concreto, alinhadas com as ruas */}
            <pattern id="bloquete" width="4" height="2.6" patternUnits="userSpaceOnUse" patternTransform={`rotate(${anguloRuas})`}>
              <rect width="4" height="2.6" fill="#6F685C" />
              <rect x="0.2" y="0.2" width="1.6" height="0.9" fill="#C2B9A9" />
              <rect x="2.2" y="0.2" width="1.6" height="0.9" fill="#B3AA99" />
              <rect x="-0.8" y="1.5" width="1.6" height="0.9" fill="#B3AA99" />
              <rect x="1.2" y="1.5" width="1.6" height="0.9" fill="#C6BDAD" />
              <rect x="3.2" y="1.5" width="1.6" height="0.9" fill="#B3AA99" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="#E9EFDD" />
          {/* Área total da propriedade (inclui área de vivência) em gramado; perímetro oficial tracejado */}
          {ctx?.perimetro?.length ? <path d={caminho(ctx.perimetro.map(proj))} fill="url(#grama)" stroke="#5B4A2F" strokeWidth={1.5} strokeDasharray="2 5" strokeLinecap="round" /> : null}
          {contorno.length && contorno !== ctx?.perimetro ? <path d={caminho(contorno.map(proj))} fill="url(#grama)" stroke="#5B4A2F" strokeWidth={2.5} strokeDasharray="2 5" strokeLinecap="round" /> : null}

          {/* Área de vivência e recreação (na frente, junto ao rio) */}
          {ctx?.areas?.map(a => (
            <path key={a.nome} d={caminho(a.poly.filter(valido).map(proj))} fill="url(#vivencia)" stroke="#2F7D3A" strokeWidth={1.5} strokeDasharray="6 4" pointerEvents="none" />
          ))}

          {/* APP (30 m): faixa de preservação ao longo do rio, discreta */}
          {ctx?.app?.poly?.length ? (
            <path d={caminho(ctx.app.poly.filter(valido).map(proj))} fill="#3F7A3A" fillOpacity={0.28} stroke="#2F6A2C" strokeOpacity={0.55} strokeWidth={1} pointerEvents="none">
              <title>{[ctx.app.nome, ctx.app.detalhe].filter(Boolean).join(" — ")}</title>
            </path>
          ) : null}

          {/* Rio (curso d'água) com mata ciliar */}
          {ctx?.rio?.line?.length ? (() => {
            const d = caminho(ctx.rio.line.filter(valido).map(proj), false);
            return (
              <g pointerEvents="none">
                <path d={d} fill="none" stroke="#5E9E4E" strokeOpacity={0.45} strokeWidth={larguraRio * 3.2} strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="#2C7FB8" strokeWidth={larguraRio + 2} strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="#7CC4EA" strokeWidth={larguraRio * 0.55} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })() : null}

          {/* Estrada de acesso e eixos (fora das quadras) */}
          {ctx?.ruas?.filter(r => r.line.filter(valido).length > 1).map(r => {
            const d = caminho(r.line.filter(valido).map(proj), false);
            return (
              <g key={r.nome}>
                <path d={d} fill="none" stroke="#E2DDD2" strokeWidth={larguraRua + 4} strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="url(#bloquete)" strokeWidth={larguraRua} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}

          {/* Ruas entre as quadras: faixa de 6 m em volta de cada lote (meio-fio + asfalto). Onde dois
              lotes ficam frente a frente as faixas se juntam e formam a rua inteira. */}
          <g pointerEvents="none">
            {itens.map(l => <path key={`mf${l.id}`} d={caminho(l.poly.map(proj))} fill="none" stroke="#E2DDD2" strokeWidth={larguraRua + 4} strokeLinejoin="round" />)}
            {itens.map(l => <path key={`as${l.id}`} d={caminho(l.poly.map(proj))} fill="none" stroke="url(#bloquete)" strokeWidth={larguraRua} strokeLinejoin="round" />)}
          </g>

          {/* Lotes com cerca */}
          {itens.map(l => {
            const pts = l.poly.map(proj);
            const [cx, cy] = centro(pts);
            const apagado = (destacar && !destacar.includes(l.situacao)) || (realce && !realce.includes(l.codigo));
            const sel = selecionado === l.id;
            const d = caminho(pts);
            return (
              <g key={l.id} onClick={() => onSelecionar?.(l.id)} style={{ cursor: onSelecionar ? "pointer" : "default" }}
                role={onSelecionar ? "button" : undefined} aria-label={`${l.codigo} — ${ROTULO_SITUACAO[l.situacao]}`} filter={sel ? "url(#sombra)" : undefined}>
                <path d={d} fill={apagado ? "#EEF1F3" : COR_SITUACAO[l.situacao]} fillOpacity={apagado ? 1 : 0.92} />
                <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeOpacity={0.9} />
                <path d={d} fill="none" stroke="#6B4F2A" strokeWidth={1.3} strokeDasharray="0.1 4" strokeLinecap="round" />
                {sel && <path d={d} fill="none" stroke="#0C3320" strokeWidth={3.5} />}
                <text x={cx} y={cy + fonte / 3} textAnchor="middle" fontSize={fonte} fontWeight={800} fill={apagado ? "#9AA3AB" : "#0C3320"}
                  stroke="#FFFFFF" strokeWidth={2.5} paintOrder="stroke" pointerEvents="none">{l.codigo}</text>
                <title>{`${l.codigo} — ${ROTULO_SITUACAO[l.situacao]}`}</title>
              </g>
            );
          })}

          {/* Nomes das ruas (posição e inclinação do projeto) */}
          {(ruas ?? []).map((r, i) => {
            const [x, y] = proj([r.lon, r.lat]);
            return (
              <text key={i} x={x} y={y} transform={`rotate(${inclinacao(r.angulo)} ${x} ${y})`} textAnchor="middle" dominantBaseline="middle"
                fontSize={compacto ? 8 : 10} fontWeight={700} letterSpacing={0.5} fill="#FFFFFF" stroke="#2B2E33" strokeWidth={2.5} paintOrder="stroke" pointerEvents="none">
                {r.nome.toUpperCase()}
              </text>
            );
          })}

          {/* Trilha ecológica: tracejado claro do núcleo de apoio aos pontos de banho */}
          {ctx?.trilha?.line?.length ? (() => {
            const pts = ctx.trilha.line.filter(valido).map(proj);
            const d = caminho(pts, false);
            const r = valido(ctx.trilha.rotulo) ? proj(ctx.trilha.rotulo) : null;
            return (
              <g pointerEvents="none">
                <path d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.8} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="#7A5530" strokeWidth={1.8} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
                {r && (
                  <text x={r[0]} y={r[1] + (compacto ? 24 : 28)} textAnchor="middle" fontSize={compacto ? 8 : 10} fontWeight={700} fontStyle="italic"
                    fill="#6A4626" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">{ctx.trilha.nome}</text>
                )}
                <title>{ctx.trilha.nome}</title>
              </g>
            );
          })() : null}

          {/* Nomes da área de vivência e do rio */}
          {ctx?.areas?.map(a => {
            if (!valido(a.rotulo)) return null;
            const [x, y] = proj(a.rotulo);
            const fs = compacto ? 10 : 12;
            return (
              <g key={`r${a.nome}`} pointerEvents="none">
                <text x={x} y={y} textAnchor="middle" fontSize={fs} fontWeight={800} fill="#1F5A2A" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">
                  <tspan x={x} dy={0}>{a.nome.split(" e ")[0].toUpperCase()}</tspan>
                  {a.nome.includes(" e ") && <tspan x={x} dy={fs + 2}>{`E ${a.nome.split(" e ").slice(1).join(" e ").toUpperCase()}`}</tspan>}
                  {a.detalhe && <tspan x={x} dy={fs + 1} fontSize={fs - 2} fontWeight={600}>{a.detalhe}</tspan>}
                </text>
                <title>{[a.nome, a.detalhe].filter(Boolean).join(" — ")}</title>
              </g>
            );
          })}
          {valido(ctx?.rio?.rotulo) && (() => {
            const [x, y] = proj(ctx!.rio!.rotulo!);
            return (
              <text x={x} y={y} textAnchor="middle" fontSize={compacto ? 10 : 12} fontWeight={800} fontStyle="italic" fill="#1D5F8C" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke" pointerEvents="none"
                transform={`rotate(-78 ${x} ${y})`}>
                {ctx!.rio!.nome.split(" (")[0].toUpperCase()}
              </text>
            );
          })()}

          {/* Pontos de referência: portal desenhado (com chamada para fora das quadras, como na planta oficial) e os demais com nome */}
          {ctx?.pontos?.filter(p => valido(p.pt)).map(p => {
            const [x, y] = proj(p.pt);
            const portal = /portal/i.test(p.nome);
            const rotulo = p.nome.replace(/\s*\(.*\)\s*/, "").replace(/ \/ .*/, "").replace(/ — .*/, "");
            const fs = compacto ? 8 : 10;
            if (portal) {
              // Chamada na direção oposta ao centro dos lotes (portal fica na cabeceira da via de acesso)
              const vx = x - meio[0], vy = y - meio[1], n = Math.hypot(vx, vy) || 1;
              const lx = x + (vx / n) * 34, ly = y + (vy / n) * 34 - 10;
              const esquerda = vx < 0;
              return (
                <g key={p.nome} pointerEvents="none">
                  <line x1={x} y1={y - 8} x2={lx} y2={ly + 4} stroke="#0C3320" strokeWidth={1.5} />
                  <g transform={`translate(${x} ${y})`}>
                    <rect x={-13} y={-16} width={6} height={18} rx={1} fill="#6B4F2A" stroke="#0C3320" strokeWidth={1} />
                    <rect x={7} y={-16} width={6} height={18} rx={1} fill="#6B4F2A" stroke="#0C3320" strokeWidth={1} />
                    <path d="M -10 -15 Q 0 -27 10 -15" fill="none" stroke="#C9A84C" strokeWidth={3} />
                    <rect x={-15} y={-20} width={30} height={5} rx={1} fill="#0C3320" />
                  </g>
                  <text x={lx} y={ly} textAnchor={esquerda ? "end" : "start"} fontSize={fs + 2} fontWeight={800}
                    fill="#0C3320" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">PORTAL DE ENTRADA</text>
                  <title>{p.nome}</title>
                </g>
              );
            }
            return (
              <g key={p.nome} pointerEvents="none">
                <circle cx={x} cy={y} r={6} fill="#C9A84C" stroke="#0C3320" strokeWidth={2} />
                <text x={x + 9} y={y + 3} textAnchor="start" fontSize={fs} fontWeight={800}
                  fill="#0C3320" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">{rotulo}</text>
                <title>{p.nome}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {!semLegenda && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs">
          {SITUACOES_LOTE.filter(s => !destacar || destacar.includes(s)).map(s => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border border-black/20" style={{ background: COR_SITUACAO[s] }} />
              {ROTULO_SITUACAO[s]} ({lotes.filter(l => l.situacao === s).length})
            </span>
          ))}
          {ctx?.pontos?.length ? <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-[#C9A84C] border-2 border-[#0C3320]" />Portal, stand, poço e pontos de apoio</span> : null}
          {ctx?.areas?.length ? <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border border-[#2F7D3A] bg-[#C7DFA8]" />Área de vivência e recreação</span> : null}
          {ctx?.rio ? <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-4 rounded-full bg-[#2C7FB8]" />Rio</span> : null}
          {ctx?.app ? <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border border-[#2F6A2C]/60 bg-[#3F7A3A]/30" />APP (30 m)</span> : null}
          {ctx?.trilha ? <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-[#7A5530]" />Trilha ecológica</span> : null}
        </div>
      )}
    </div>
  );
}
