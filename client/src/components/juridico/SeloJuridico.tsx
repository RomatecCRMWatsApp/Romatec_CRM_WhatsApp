import { useId } from "react";

/** Dourado vivo do portal jurídico (mesma família do dourado do sistema, mais aceso) */
export const OURO_JURIDICO = { claro: "#F6D56B", base: "#E8B931", escuro: "#B88A1C" } as const;

/**
 * Selo do portal jurídico: anel duplo dourado, "PORTAL JURÍDICO" no arco, ramos de louro e a balança da justiça
 * sobre o verde da marca. SVG puro (nítido em qualquer tamanho).
 */
export function SeloJuridico({ tamanho = 230, texto = "PORTAL JURÍDICO", className }: { tamanho?: number; texto?: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const g = `ouro-${id}`, arco = `arco-${id}`;
  const folhas: [number, number, number][] = [[56, 158, -40], [50, 140, -25], [48, 121, -10], [50, 102, 5], [174, 158, 40], [180, 140, 25], [182, 121, 10], [180, 102, -5]];
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 230 230" fill="none" role="img" aria-label="Selo do portal jurídico" className={className}>
      <defs>
        <linearGradient id={g} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="220">
          <stop offset="0" stopColor={OURO_JURIDICO.claro} /><stop offset=".55" stopColor={OURO_JURIDICO.base} /><stop offset="1" stopColor={OURO_JURIDICO.escuro} />
        </linearGradient>
        <path id={arco} d="M35 115a80 80 0 0 1 160 0" />
      </defs>
      <circle cx="115" cy="115" r="108" stroke={`url(#${g})`} strokeWidth="2.5" />
      <circle cx="115" cy="115" r="99" stroke={OURO_JURIDICO.base} strokeOpacity=".35" strokeWidth="1" />
      <circle cx="115" cy="115" r="58" fill="#0C3320" stroke={`url(#${g})`} strokeWidth="2" />
      <text fontFamily="Cinzel, 'Times New Roman', serif" fontSize="15" letterSpacing="4" fill={OURO_JURIDICO.claro}>
        <textPath href={`#${arco}`} startOffset="50%" textAnchor="middle">{texto}</textPath>
      </text>
      <path d="M70 172q-26-34-18-82" stroke={`url(#${g})`} strokeWidth="1.8" />
      <path d="M160 172q26-34 18-82" stroke={`url(#${g})`} strokeWidth="1.8" />
      <g fill={OURO_JURIDICO.base} fillOpacity=".85">
        {folhas.map(([x, y, r]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="3.2" ry="8" transform={`rotate(${r} ${x} ${y})`} />)}
      </g>
      <g stroke={`url(#${g})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="115" cy="76" r="3" fill={OURO_JURIDICO.base} stroke="none" />
        <line x1="115" y1="79" x2="115" y2="148" /><line x1="90" y1="88" x2="140" y2="88" />
        <path d="M101 150h28M106 148l3-5h12l3 5" />
        <line x1="90" y1="88" x2="82" y2="112" /><line x1="90" y1="88" x2="98" y2="112" /><path d="M80 112h20a10 6 0 0 1-20 0z" fill="rgba(232,185,49,.2)" />
        <line x1="140" y1="88" x2="132" y2="112" /><line x1="140" y1="88" x2="148" y2="112" /><path d="M130 112h20a10 6 0 0 1-20 0z" fill="rgba(232,185,49,.2)" />
      </g>
    </svg>
  );
}
