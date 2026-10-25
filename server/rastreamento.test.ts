import { describe, expect, it, vi } from 'vitest';
import { configRastreamento, rotaDeMarketing, EVENTOS } from '../shared/rastreamento';
import { injetarRastreamento, metaDaRota } from './seo';

const HTML = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';
const ENV = { GA4_MEASUREMENT_ID: 'G-ABC123XYZ', GOOGLE_ADS_CONVERSION_ID: 'AW-123456789', GOOGLE_ADS_CONVERSION_LABEL: 'AbC-dEf_123', GOOGLE_ADS_CONVERSION_LABEL_WHATSAPP: ' "WaLabel99" ' };

describe('rastreamento de conversão (GA4 / Google Ads)', () => {
  it('lê os IDs das variáveis; sem elas (ou inválidos) não há rastreamento', () => {
    expect(configRastreamento(ENV)).toEqual({ ga4: 'G-ABC123XYZ', ads: 'AW-123456789', conversaoAgendamento: 'AW-123456789/AbC-dEf_123', conversaoWhatsapp: 'AW-123456789/WaLabel99' });
    expect(configRastreamento({})).toBeNull();
    expect(configRastreamento({ GA4_MEASUREMENT_ID: 'UA-123', GOOGLE_ADS_CONVERSION_ID: '123' })).toBeNull();
    // Só GA4: sem conversões do Ads (rótulo sem ID é ignorado)
    expect(configRastreamento({ GA4_MEASUREMENT_ID: 'G-ABC123XYZ', GOOGLE_ADS_CONVERSION_LABEL: 'x1234' })).toEqual({ ga4: 'G-ABC123XYZ', ads: null, conversaoAgendamento: null, conversaoWhatsapp: null });
  });

  it('só as páginas públicas de marketing recebem os IDs; o CRM logado nunca', () => {
    for (const p of ['/bom-jardims', '/bom-jardims/', '/bom-jardims/chacara/C05', '/agendar/bom-jardims?c=abc']) expect(rotaDeMarketing(p)).toBe(true);
    for (const p of ['/', '/dashboard', '/leads', '/contratos/1', '/financeiro', '/login', '/empreendedor', '/bom-jardims-x']) expect(rotaDeMarketing(p)).toBe(false);
    const html = injetarRastreamento(HTML, '/bom-jardims', ENV);
    expect(html).toContain('<script>window.__RASTREAMENTO={"ga4":"G-ABC123XYZ"');
    expect(injetarRastreamento(HTML, '/dashboard', ENV)).toBe(HTML);
    expect(injetarRastreamento(HTML, '/leads/lead/3', ENV)).toBe(HTML);
    // Sem variáveis: HTML intacto (nem script, nem aviso de cookies)
    expect(injetarRastreamento(HTML, '/bom-jardims', {})).toBe(HTML);
    // Nunca o gtag no HTML: ele só vem depois do "Aceitar"
    expect(html).not.toContain('googletagmanager');
  });

  it('eventos: só depois de aceitar os cookies; conversão do Ads com o send_to certo', async () => {
    const chamadas: unknown[][] = [];
    const scripts: string[] = [];
    const store: Record<string, string> = {};
    const g: any = globalThis;
    g.window = { __RASTREAMENTO: configRastreamento(ENV), location: { pathname: '/bom-jardims' }, dataLayer: undefined };
    g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    g.document = { head: { appendChild: (s: any) => scripts.push(s.src) }, createElement: () => ({}), addEventListener: vi.fn() };
    vi.resetModules();
    const R = await import('../client/src/lib/rastreamento');
    R.carregarTags();
    R.registrarEvento(EVENTOS.agendamento, {}, 'agendamento');
    expect(scripts).toHaveLength(0); // sem escolha = nada carregado
    R.registrarEscolha('aceito');
    expect(scripts).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ']);
    g.window.gtag = (...a: unknown[]) => chamadas.push(a);
    R.registrarEvento(EVENTOS.agendamento, { formulario: 'agendamento' }, 'agendamento');
    R.registrarEvento(EVENTOS.whatsapp, {}, 'whatsapp');
    R.registrarEvento(EVENTOS.mapa, { chacara: 'A05' });
    expect(chamadas).toEqual([
      ['event', 'agendamento_enviado', { formulario: 'agendamento' }], ['event', 'conversion', { send_to: 'AW-123456789/AbC-dEf_123' }],
      ['event', 'clique_whatsapp', {}], ['event', 'conversion', { send_to: 'AW-123456789/WaLabel99' }],
      ['event', 'lead_mapa', { chacara: 'A05' }],
    ]);
    // Numa tela do CRM, nada é enviado
    g.window.location.pathname = '/dashboard';
    R.registrarEvento(EVENTOS.agendamento, {}, 'agendamento');
    expect(chamadas).toHaveLength(5);
    delete g.window; delete g.localStorage; delete g.document;
  });

  it('endereço que não existe fica fora do Google (sem "soft 404"); a home continua indexável', () => {
    expect((metaDaRota('/qualquer-coisa') as any).indexavel).toBe(false);
    expect((metaDaRota('/') as any).indexavel).toBe(true);
  });
});
