/**
 * Lupa do portal de entrada: recorte ampliado (imagem da fachada/render) num canto do mapa, ligado ao
 * marcador do portal por duas linhas, com o rótulo "Portal de entrada". Usado no mapa público (LoteMap)
 * e no interno (MapaTematico). A imagem vem de mapa.json (pontos[].imagem) — trocar o render é só trocar o arquivo.
 */

export const IMAGEM_PORTAL_PADRAO = "/bom-jardims/portal-lupa.png";
/** Proporção da imagem da lupa (recorte da elevação do PA-01: 1200 × 336) */
export const PROPORCAO_LUPA = 336 / 1200;

type XY = [number, number];

/** Faixa do rótulo e altura total da lupa para uma largura (imagem inteira + faixa) */
const faixaDaLupa = (w: number) => Math.max(18, Math.round(w * 0.075));
export const alturaDaLupa = (w: number) => Math.round((w - 6) * PROPORCAO_LUPA + 6 + faixaDaLupa(w));
export interface CaixaLupa { x: number; y: number; w: number; h: number }

/**
 * Canto da lupa: entre os 4 cantos do mapa, o que cobre menos lotes (peso alto) e menos rio, área de
 * vivência e perímetro (peso baixo); no empate, o mais perto do portal.
 */
export function cantoDaLupa(W: number, H: number, w: number, h: number, pontosLotes: XY[], portal: XY, outros: XY[] = [], margem = 10): CaixaLupa {
  const folga = 8;
  const cantos: CaixaLupa[] = [
    { x: margem, y: margem, w, h }, { x: W - w - margem, y: margem, w, h },
    { x: margem, y: H - h - margem, w, h }, { x: W - w - margem, y: H - h - margem, w, h },
  ];
  const dentro = (c: CaixaLupa) => ([px, py]: XY) => px >= c.x - folga && px <= c.x + c.w + folga && py >= c.y - folga && py <= c.y + c.h + folga;
  const custo = (c: CaixaLupa) => pontosLotes.filter(dentro(c)).length * 100 + outros.filter(dentro(c)).length;
  const dist = (c: CaixaLupa) => Math.hypot(c.x + c.w / 2 - portal[0], c.y + c.h / 2 - portal[1]);
  return cantos.map(c => ({ c, n: custo(c), d: dist(c) })).sort((a, b) => a.n - b.n || a.d - b.d)[0].c;
}

/** Linha densificada (para o rio/perímetro contarem como obstáculo ao longo do traçado, não só nos vértices) */
export function densificar(pts: XY[], passo = 12): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push(a);
    if (!b) break;
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / passo);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

export default function LupaPortal({ portal, caixa, imagem = IMAGEM_PORTAL_PADRAO, rotulo = "Portal de entrada", raio = 13 }: {
  portal: XY; caixa: CaixaLupa; imagem?: string; rotulo?: string; raio?: number;
}) {
  const faixa = faixaDaLupa(caixa.w);
  const alturaImagem = caixa.h - faixa;
  const [px, py] = portal;
  // Linhas da lente até os dois cantos da caixa mais próximos do portal (efeito de "zoom")
  const cantos: XY[] = [[caixa.x, caixa.y], [caixa.x + caixa.w, caixa.y], [caixa.x, caixa.y + caixa.h], [caixa.x + caixa.w, caixa.y + caixa.h]];
  const [a, b] = cantos.map(c => ({ c, d: Math.hypot(c[0] - px, c[1] - py) })).sort((m, n) => m.d - n.d).slice(0, 2).map(m => m.c);
  const fonte = Math.max(11, Math.min(16, caixa.w / 18));
  return (
    <g pointerEvents="none" aria-label={`Lupa: ${rotulo}`}>
      <defs>
        <clipPath id="lupa-portal-recorte"><rect x={caixa.x + 3} y={caixa.y + 3} width={caixa.w - 6} height={alturaImagem - 3} rx={6} /></clipPath>
        <filter id="lupa-portal-sombra" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      {[a, b].map((c, i) => <line key={i} x1={px} y1={py} x2={c[0]} y2={c[1]} stroke="#0C3320" strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray="4 3" />)}
      {/* Lente sobre o portal */}
      <circle cx={px} cy={py} r={raio} fill="#FFFFFF" fillOpacity={0.25} stroke="#0C3320" strokeWidth={2.5} />
      <circle cx={px} cy={py} r={raio} fill="none" stroke="#C9A84C" strokeWidth={1.2} />
      {/* Quadro ampliado */}
      <g filter="url(#lupa-portal-sombra)">
        <rect x={caixa.x} y={caixa.y} width={caixa.w} height={caixa.h} rx={9} fill="#FFFFFF" stroke="#C9A84C" strokeWidth={2.5} />
      </g>
      <image href={imagem} x={caixa.x + 3} y={caixa.y + 3} width={caixa.w - 6} height={alturaImagem - 3} preserveAspectRatio="xMidYMid meet" clipPath="url(#lupa-portal-recorte)" />
      {(() => {
        const x0 = caixa.x, x1 = caixa.x + caixa.w, y0 = caixa.y + caixa.h - faixa, y1 = caixa.y + caixa.h, r = 9;
        return <path d={`M${x0},${y0} H${x1} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} Z`} fill="#0C3320" />;
      })()}
      {/* Ícone de lupa + rótulo */}
      <g transform={`translate(${caixa.x + 12} ${caixa.y + caixa.h - faixa / 2})`}>
        <circle cx={0} cy={-1} r={fonte * 0.32} fill="none" stroke="#C9A84C" strokeWidth={1.8} />
        <line x1={fonte * 0.23} y1={fonte * 0.22} x2={fonte * 0.5} y2={fonte * 0.5} stroke="#C9A84C" strokeWidth={2} strokeLinecap="round" />
      </g>
      <text x={caixa.x + 12 + fonte * 0.9} y={caixa.y + caixa.h - faixa / 2 + fonte * 0.35} fontSize={fonte} fontWeight={800} fill="#FFFFFF" letterSpacing={0.4}>
        {rotulo.toUpperCase()}
      </text>
    </g>
  );
}
