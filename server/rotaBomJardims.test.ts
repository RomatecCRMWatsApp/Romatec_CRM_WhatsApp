import { afterEach, describe, expect, it, vi } from 'vitest';
import { gpxRota, kmlRota, linkGoogleRota, linkWazeRota, PONTOS_ROTA, ROTA_COMO_CHEGAR } from '../shared/rotaBomJardims';
import { LINKS_FIXOS, montarLink } from '../shared/linksDivulgacao';
import { PORTAL_ENTRADA } from '../shared/chacaraLink';
import { metaDaRota } from './seo';

describe('Como chegar ao Bom Jardims (/bom-jardims/rota)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('pontos de referência em ordem, do centro ao portal', () => {
    expect(PONTOS_ROTA.map(p => p.titulo)).toEqual(['Prefeitura Municipal', 'BR-222', 'Polícia Rodoviária Federal', 'Entrada da estação ferroviária', 'Duas ferrovias', 'Balneário Walter Figueiredo', 'Portal do Bom Jardims']);
    expect(linkGoogleRota()).toContain('origin=Prefeitura%20Municipal%20de%20A%C3%A7ail%C3%A2ndia');
    expect(linkWazeRota()).toMatch(/^https:\/\/waze\.com\/ul\?ll=-4\.9/);
  });

  it('GPX com trilha pelas estradas terminando no portal; sem traçado, só rota e pontos', () => {
    const g = gpxRota([[-47.5, -4.9469], [-47.45, -4.94], [-47.40, -4.93], [-47.3815739, -4.929037]], 'https://x/bom-jardims/rota');
    expect(g).toContain('<trk>');
    expect(g).toContain(`<trkpt lat="${PORTAL_ENTRADA.lat.toFixed(6)}" lon="${PORTAL_ENTRADA.lon.toFixed(6)}"/>`);
    expect((g.match(/<trkpt/g) || []).length).toBe(5);
    const semTracado = gpxRota([], 'https://x');
    expect(semTracado).not.toContain('<trk>');
    expect(semTracado).toContain('<rtept');
    expect(kmlRota([], 'https://x')).toContain('<LineString>');
  });

  it('servidor: traçado do OSRM em cache; falha → linha vazia', async () => {
    let chamadas = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { chamadas++; return new Response(JSON.stringify({ routes: [{ distance: 16234, duration: 1260, geometry: { coordinates: [[-47.5, -4.9469], [-47.3815739, -4.929037]] } }] }), { status: 200 }); }));
    const { tracadoRota } = await import('./bom-jardims');
    const r = await tracadoRota(1_000_000);
    expect(r).toMatchObject({ km: 16.2, minutos: 21 });
    await tracadoRota(1_000_000 + 3600_000);
    expect(chamadas).toBe(1);
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fora do ar'); }));
    const m2 = await import('./bom-jardims');
    expect(await m2.tracadoRota(5_000_000)).toMatchObject({ km: null, linha: [] });
  });

  it('link de divulgação e meta da página', () => {
    const l = LINKS_FIXOS.find(x => x.chave === 'fixo:rota')!;
    expect(montarLink('https://romateccrm.com', l, 'ab12')).toBe('https://romateccrm.com/bom-jardims/rota?utm_source=whatsapp&utm_campaign=BJ-ROTA&c=ab12');
    const m = metaDaRota(ROTA_COMO_CHEGAR);
    expect(m !== 'imovel' && m.image).toBe('/bom-jardims/divulgacao/como-chegar.png');
  });
});
