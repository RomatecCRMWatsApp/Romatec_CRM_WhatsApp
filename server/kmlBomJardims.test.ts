import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { kmlEmpreendimento, kmlChacara, nomeArquivoKml, KML_CONTENT_TYPE } from '../shared/kmlBomJardims';
import { centroDoLote, linkEmpreendimento, linkKml } from '../shared/chacaraLink';
import { registrarKmlBomJardims } from './bom-jardims';

type Pt = [number, number];
const mapa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/bom-jardims/mapa.json'), 'utf8'));
const coordsDe = (p: Pt[]) => {
  const f = p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1] ? p : [...p, p[0]];
  return f.map(([lon, lat]) => `${lon},${lat},0`).join(' ');
};
/** XML bem formado o bastante para o Google Earth: tags balanceadas e "&" sempre escapado */
const bemFormado = (kml: string) => {
  expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">')).toBe(true);
  for (const t of ['Document', 'Placemark', 'Folder', 'Polygon', 'coordinates', 'Style'])
    expect((kml.match(new RegExp(`<${t}[ >]`, 'g')) || []).length).toBe((kml.match(new RegExp(`</${t}>`, 'g')) || []).length);
  expect(/&(?!amp;|lt;|gt;|quot;)/.test(kml)).toBe(false);
};
const placemarks = (kml: string) => Array.from(kml.matchAll(/<Placemark>\s*<name>([^<]*)<\/name>[\s\S]*?<\/Placemark>/g)).map(m => ({ nome: m[1], corpo: m[0] }));

const PERIMETRO = 'Condomínio de Chácaras Bom Jardims — perímetro';
const poligonos = (kml: string) => placemarks(kml).filter(p => p.corpo.includes('<Polygon>'));
const codigosOficiais = mapa.lotes.map((l: any) => l.codigo).sort();

describe('KML do empreendimento (nível campanha): poligonal geral + TODAS as chácaras demarcadas', () => {
  const kml = kmlEmpreendimento(mapa, { link: 'https://romateccrm.com/bom-jardims' });
  const lotesDe = (k: string) => placemarks(k).filter(p => /^[A-D]\d\d$/.test(p.nome));
  it('bem formado: o perímetro + 85 lotes/áreas (84 lotes + Quadra E) e mais nada', () => {
    bemFormado(kml);
    const pm = placemarks(kml);
    expect(pm).toHaveLength(1 + 85);
    expect(pm.every(p => p.corpo.includes('<Polygon>'))).toBe(true);                 // só polígonos (sem pontos)
    expect(pm[0].nome).toBe(PERIMETRO);
    expect(pm[0].corpo).toContain(`<coordinates>${coordsDe(mapa.perimetro)}</coordinates>`);
  });
  it('Quadra E demarcada como área de uso comum (estilo próprio, não é chácara vendável)', () => {
    const e = placemarks(kml).find(p => p.nome === 'E01 — Área de uso comum')!;
    expect(e).toBeTruthy();
    expect(e.corpo).toContain('<styleUrl>#comum</styleUrl>');
    expect(e.corpo).toContain('não é chácara à venda');
    expect(e.corpo).toContain('12.939,06 m²');
    expect(e.corpo).toContain(`<coordinates>${coordsDe(mapa.areasComuns[0].poly)}</coordinates>`);
    expect(kml).toContain('<name>Quadra E · área de uso comum</name>');
    expect(e.corpo).not.toContain('/chacara/');                                       // sem página de chácara
  });
  it('cada lote com o código oficial como nome (A01…D18, 82 chácaras + A03 e B14) e a geometria oficial', () => {
    const lotes = lotesDe(kml);
    expect(lotes.map(p => p.nome).sort()).toEqual(codigosOficiais);
    expect(codigosOficiais).toHaveLength(84);
    for (const [q, n] of [['A', 22], ['B', 26], ['C', 18], ['D', 18]]) {
      expect(kml).toContain(`<name>Quadra ${q} (${n})</name>`);
      expect(codigosOficiais.filter((c: string) => c[0] === q)).toHaveLength(n);
    }
    for (const c of ['C05', 'D04', 'D10', 'A01']) {
      const l = mapa.lotes.find((x: any) => x.codigo === c);
      expect(lotes.find(p => p.nome === c)!.corpo).toContain(`<coordinates>${coordsDe(l.poly)}</coordinates>`);
    }
    expect(lotes.find(p => p.nome === 'C05')!.corpo).toContain('https://romateccrm.com/bom-jardims/chacara/C05');
    expect(lotes.find(p => p.nome === 'A03')!.corpo).toContain('área técnica');
  });
  it('nenhuma chácara destacada: todos os lotes com o mesmo estilo', () => {
    expect(kml).not.toContain('#chacara');
    expect(lotesDe(kml)).toHaveLength(84);
    expect(lotesDe(kml).every(p => p.corpo.includes('<styleUrl>#lote</styleUrl>'))).toBe(true);
  });
});

describe('KML da chácara: poligonal geral + SÓ a chácara pedida, destacada (numeração oficial)', () => {
  const c05 = mapa.lotes.find((l: any) => l.codigo === 'C05');
  const kml = kmlChacara(mapa, 'c05', { link: 'https://romateccrm.com/bom-jardims/chacara/C05' })!;
  it('bem formado: o perímetro + 1 polígono, o da C05 oficial', () => {
    bemFormado(kml);
    const pm = placemarks(kml);
    expect(pm.map(p => p.nome)).toEqual([PERIMETRO, 'C05']);
    expect(poligonos(kml)).toHaveLength(2);
    expect(pm[0].corpo).toContain(`<coordinates>${coordsDe(mapa.perimetro)}</coordinates>`);
    expect(pm[1].corpo).toContain('<styleUrl>#chacara</styleUrl>');
    expect(pm[1].corpo).toContain(`<coordinates>${coordsDe(c05.poly)}</coordinates>`);   // o lote físico C05 do KMZ oficial
    expect(pm[1].corpo).toContain('Chácara C05 · Quadra C · 3.143,41 m²');
    expect(kml).toContain('https://romateccrm.com/bom-jardims/chacara/C05');
    expect(kml).not.toMatch(/R\$|pre[çc]o/i);
  });
  it('vale para qualquer chácara: D04 e A01 trazem só o próprio polígono', () => {
    for (const c of ['D04', 'A01']) {
      const k = kmlChacara(mapa, c)!;
      expect(placemarks(k).map(p => p.nome)).toEqual([PERIMETRO, c]);
      expect(placemarks(k)[1].corpo).toContain(`<coordinates>${coordsDe(mapa.lotes.find((l: any) => l.codigo === c).poly)}</coordinates>`);
    }
  });
  it('abre no Google Earth já na chácara (LookAt no centro dela); código inexistente → null', () => {
    const [lon, lat] = centroDoLote(c05.poly);
    const m = /<LookAt><longitude>([-\d.]+)<\/longitude><latitude>([-\d.]+)<\/latitude>/.exec(kml)!;
    expect(Math.abs(Number(m[1]) - lon)).toBeLessThan(1e-9);
    expect(Math.abs(Number(m[2]) - lat)).toBeLessThan(1e-9);
    expect(kmlChacara(mapa, 'Z99')).toBeNull();
    expect(kmlChacara(mapa, 'C19')).toBeNull();
  });
});

describe('Links e rotas públicas do KML', () => {
  it('links do empreendimento (com a campanha) e dos KML', () => {
    expect(linkEmpreendimento('https://romateccrm.com/')).toBe('https://romateccrm.com/bom-jardims');
    expect(linkEmpreendimento('https://romateccrm.com', 'BJ-IG-PAGO')).toBe('https://romateccrm.com/bom-jardims?utm_campaign=BJ-IG-PAGO');
    expect(linkKml('https://romateccrm.com')).toBe('https://romateccrm.com/bom-jardims.kml');
    expect(linkKml('https://romateccrm.com', 'c05')).toBe('https://romateccrm.com/bom-jardims/chacara/C05.kml');
    expect(nomeArquivoKml('c05')).toBe('bom-jardims-chacara-C05.kml');
    expect(KML_CONTENT_TYPE).toBe('application/vnd.google-earth.kml+xml');
  });

  // Express de mentira: guarda os handlers e simula requisições
  const rotas = new Map<string, Function>();
  registrarKmlBomJardims({ get: (p: string, h: Function) => rotas.set(p, h) } as any, () => 'https://romateccrm.com');
  const chamar = async (rota: string, params: Record<string, string> = {}) => {
    const r: any = { headers: {} as Record<string, string>, statusCode: 200, body: '', proximo: false };
    const res: any = {
      setHeader: (k: string, v: string) => { r.headers[k.toLowerCase()] = v; },
      status: (s: number) => { r.statusCode = s; return res; },
      type: (t: string) => { r.headers['content-type'] = t; return res; },
      send: (b: string) => { r.body = b; return res; },
    };
    await rotas.get(rota)!({ params }, res, () => { r.proximo = true; });
    return r;
  };

  it('/bom-jardims.kml: KML geral com o content-type do Google Earth, sem login', async () => {
    const r = await chamar('/bom-jardims.kml');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/vnd.google-earth.kml+xml; charset=utf-8');
    expect(r.headers['content-disposition']).toBe('attachment; filename="bom-jardims.kml"');
    expect(r.body).toContain('<name>Quadra C (18)</name>');
    expect((r.body.match(/<Polygon>/g) || []).length).toBe(86);   // perímetro + 84 lotes + Quadra E
  });
  it('/bom-jardims/chacara/C05.kml: KML da chácara; código errado → 404; sem .kml → segue para a página', async () => {
    const r = await chamar('/bom-jardims/chacara/:arquivo', { arquivo: 'c05.kml' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/vnd.google-earth.kml+xml; charset=utf-8');
    expect(r.headers['content-disposition']).toBe('attachment; filename="bom-jardims-chacara-C05.kml"');
    expect(r.body).toContain('<name>C05</name>');
    expect((r.body.match(/<Polygon>/g) || []).length).toBe(2);    // perímetro + a chácara
    expect(r.body).toContain('https://romateccrm.com/bom-jardims/chacara/C05');
    expect((await chamar('/bom-jardims/chacara/:arquivo', { arquivo: 'C19.kml' })).statusCode).toBe(404);
    expect((await chamar('/bom-jardims/chacara/:arquivo', { arquivo: 'C05' })).proximo).toBe(true);
  });
});
