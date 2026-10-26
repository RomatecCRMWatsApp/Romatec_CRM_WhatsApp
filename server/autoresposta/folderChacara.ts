/**
 * Folder de uma chácara gerado na hora (PNG 1080 × 1350, formato do feed/WhatsApp): código, área, preço, à vista,
 * entrada e as parcelas do simulador, com a contagem real de disponíveis e o aviso legal. Os números vêm do mesmo
 * simulador das respostas; o PNG fica em memória até as condições ou a situação da chácara mudarem.
 * Texto em SVG renderizado pelo sharp com as fontes Liberation (instaladas no Dockerfile).
 */
import fs from 'fs';
import path from 'path';
import { avisoLegal, variaveisDaOferta } from '../../shared/autoresposta';
import { precoLote, simular } from '../../shared/simulador';
import { contextoDoEmpreendimento } from './motor';

const COR = { verde: '#0C3320', dourado: '#C9A84C', destaque: '#F2C04B', creme: '#F3EEDF', texto: '#23352A', suave: '#5C6B5F' };
const SANS = "'Liberation Sans', Arial, Helvetica, sans-serif";
const SERIF = "'Liberation Serif', Georgia, 'Times New Roman', serif";

const cache = new Map<string, Buffer>();
const esc = (s: string | null | undefined) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Quebra o texto em linhas de até `max` caracteres (aviso legal no rodapé) */
function linhas(texto: string, max: number): string[] {
  const out: string[] = [];
  let atual = '';
  for (const p of texto.split(/\s+/)) {
    if ((atual + ' ' + p).trim().length > max) { if (atual) out.push(atual); atual = p; } else atual = `${atual} ${p}`.trim();
  }
  if (atual) out.push(atual);
  return out;
}

function arquivoPublico(rel: string): Buffer | null {
  for (const base of [path.resolve(process.cwd(), 'dist/public'), path.resolve(process.cwd(), 'client/public')]) {
    const f = path.join(base, rel);
    if (fs.existsSync(f)) return fs.readFileSync(f);
  }
  return null;
}

export class FolderErro extends Error { constructor(msg: string, public status = 404) { super(msg); this.name = 'FolderErro'; } }

/** SVG do folder (exportado para teste) */
export function svgDoFolder(p: { empreendimento: string; codigo: string; vars: Record<string, string>; aviso: string; temLogo: boolean }): string {
  const v = p.vars;
  const W = 1080, H = 1350;
  const prazos = (v.tabela_prazos || '').split('\n').map(l => l.replace(/^•\s*/, '').replace(' ⭐ o mais escolhido', '')).filter(Boolean);
  const linhaPrazo = (t: string, i: number) => {
    const [n, ...resto] = t.split(' ');
    const y = 905 + i * 46;
    const destaque = i === prazos.length - 1;
    return `<text x="120" y="${y}" font-family="${SANS}" font-size="30" fill="${destaque ? COR.verde : COR.texto}" font-weight="${destaque ? 700 : 400}">${esc(n)}</text>` +
      `<text x="${W - 120}" y="${y}" font-family="${SANS}" font-size="30" text-anchor="end" fill="${destaque ? COR.verde : COR.texto}" font-weight="${destaque ? 700 : 400}">${destaque ? '<tspan font-size="22" font-weight="400" fill="' + COR.suave + '">o mais escolhido · </tspan>' : ''}${esc(resto.join(' '))}</text>`;
  };
  const aviso = linhas(p.aviso, 92).slice(0, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${COR.creme}"/>
  <rect width="${W}" height="300" fill="${COR.verde}"/>
  <rect y="300" width="${W}" height="8" fill="${COR.dourado}"/>
  <text x="${p.temLogo ? 330 : 80}" y="120" font-family="${SANS}" font-size="28" font-weight="700" fill="${COR.dourado}" letter-spacing="3">${esc(p.empreendimento.toUpperCase())}</text>
  <text x="${p.temLogo ? 330 : 80}" y="215" font-family="${SERIF}" font-size="96" font-weight="700" fill="#FFFFFF">Chácara ${esc(p.codigo)}</text>
  <text x="${p.temLogo ? 330 : 80}" y="265" font-family="${SANS}" font-size="32" fill="#FFFFFF" opacity="0.9">${esc(v.area)} m² · Açailândia/MA</text>

  <text x="${W / 2}" y="395" font-family="${SANS}" font-size="30" text-anchor="middle" fill="${COR.suave}">Preço de tabela ${esc(v.preco)}</text>
  <text x="${W / 2}" y="470" font-family="${SERIF}" font-size="64" font-weight="700" text-anchor="middle" fill="${COR.verde}">À vista ${esc(v.avista)}</text>
  <text x="${W / 2}" y="515" font-family="${SANS}" font-size="28" text-anchor="middle" fill="${COR.texto}">desconto de ${esc(v.desconto_avista)}</text>

  <rect x="80" y="560" width="${W - 160}" height="230" rx="28" fill="${COR.verde}"/>
  <text x="${W / 2}" y="620" font-family="${SANS}" font-size="28" font-weight="700" text-anchor="middle" fill="${COR.dourado}" letter-spacing="2">OU PARCELADO, DIRETO COM A EMPREENDEDORA</text>
  <text x="${W / 2}" y="695" font-family="${SERIF}" font-size="56" font-weight="700" text-anchor="middle" fill="#FFFFFF">${esc(v.entrada_parcelas)}× ${esc(v.entrada_parcela)} de entrada</text>
  <text x="${W / 2}" y="755" font-family="${SANS}" font-size="34" text-anchor="middle" fill="${COR.destaque}">+ ${esc(v.prazo_maior)}× fixas de ${esc(v.parcela_maior)} · sem banco</text>

  <text x="120" y="850" font-family="${SANS}" font-size="26" font-weight="700" fill="${COR.suave}" letter-spacing="2">SALDO DE ${esc(v.saldo)} — ESCOLHA O PRAZO</text>
  ${prazos.slice(0, 6).map(linhaPrazo).join('\n  ')}

  <rect x="80" y="1185" width="${W - 160}" height="2" fill="${COR.dourado}"/>
  <text x="${W / 2}" y="1145" font-family="${SANS}" font-size="26" font-weight="700" text-anchor="middle" fill="${COR.verde}">Restam ${esc(v.disponiveis)} chácaras · condição ${esc(v.validade_condicao)}</text>
  ${aviso.map((l, i) => `<text x="${W / 2}" y="${1225 + i * 26}" font-family="${SANS}" font-size="19" font-style="italic" text-anchor="middle" fill="${COR.suave}">${esc(l)}</text>`).join('\n  ')}
</svg>`;
}

/** PNG do folder da chácara (só chácara livre de empreendimento com condições cadastradas) */
export async function folderDaChacara(slug: string, codigoBruto: string): Promise<Buffer> {
  const codigo = codigoBruto.toUpperCase();
  if (!/^[A-Z]\d{2}$/.test(codigo)) throw new FolderErro('Chácara inválida', 400);
  const ctx = await contextoDoEmpreendimento(slug);
  if (!ctx) throw new FolderErro('Empreendimento não encontrado');
  if (!ctx.cond) throw new FolderErro('Sem condições de pagamento');
  const lote = ctx.lotes.find(l => l.codigo === codigo);
  if (!lote || lote.areaM2 <= 0) throw new FolderErro('Chácara não encontrada');
  if (lote.situacao !== 'disponivel') throw new FolderErro('Chácara indisponível', 410);
  const disponiveis = ctx.lotes.filter(l => l.situacao === 'disponivel').length;
  const ent = Math.min(ctx.cfg.entradaParcelas, ctx.cond.entradaMaxParcelas);
  const sim = simular(lote.areaM2, ent, ctx.cond, lote.precoTabela ?? precoLote(lote.areaM2, ctx.cond));
  const vars = variaveisDaOferta({ sim, c: ctx.cond, disponiveis, condicaoValidaAte: ctx.cfg.condicaoValidaAte, entradaParcelas: ent });
  const aviso = avisoLegal(vars, ctx.cfg.avisoLegal);
  const chave = `${slug}:${codigo}:${JSON.stringify(vars)}:${aviso}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;

  const sharp = (await import('sharp')).default;
  const logo = slug === 'bom-jardims' ? arquivoPublico('bom-jardims/logo-520.webp') : null;
  const svg = svgDoFolder({ empreendimento: ctx.emp.nome, codigo, vars, aviso, temLogo: !!logo });
  let img = sharp(Buffer.from(svg));
  if (logo) {
    const l = await sharp(logo).resize(210, 210, { fit: 'inside' }).png().toBuffer();
    img = sharp(await img.png().toBuffer()).composite([{ input: l, left: 80, top: 45 }]);
  }
  const png = await img.png({ compressionLevel: 9 }).toBuffer();
  if (cache.size > 300) cache.clear();
  cache.set(chave, png);
  return png;
}
