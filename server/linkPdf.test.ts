import { describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
const L = await import('./_core/linkPdf');

describe('link compartilhável de PDF', () => {
  const agora = Date.UTC(2026, 10, 11);
  const req = (url: string, method = 'GET') => ({ method, originalUrl: url });

  it('vale para o PDF exato, por 30 dias, para a mesma versão de sessão; baixar=1 não invalida', () => {
    const c = L.assinarLinkPdf('/api/gestao/bom-jardims/recibo/3.pdf', 1, 2, agora);
    const sv = (id: number) => (id === 1 ? 2 : null);
    expect(L.lerLinkPdf(req(c), sv, agora + 29 * 86_400_000)).toBe(1);
    expect(L.lerLinkPdf(req(`${c}&baixar=1`), sv, agora)).toBe(1);
    expect(L.lerLinkPdf(req(c), sv, agora + 31 * 86_400_000)).toBeNull();
    expect(L.lerLinkPdf(req(c.replace('/3.pdf', '/4.pdf')), sv, agora)).toBeNull();
    expect(L.lerLinkPdf(req(c.replace('_u=1', '_u=2')), id => (id === 2 ? 2 : null), agora)).toBeNull();
    expect(L.lerLinkPdf(req(c), () => 3, agora)).toBeNull(); // perfil trocado: versão de sessão mudou
    expect(L.lerLinkPdf(req(c, 'POST'), sv, agora)).toBeNull();
  });

  it('parâmetros: ordem não importa, alteração invalida', () => {
    const c = L.assinarLinkPdf('/api/comissao/tabela.pdf?slug=bom-jardims&tipo=escritorio&lote=A01', 5, 0, agora);
    const sv = () => 0;
    expect(L.lerLinkPdf(req(c), sv, agora)).toBe(5);
    expect(L.lerLinkPdf(req(c.replace('tipo=escritorio', 'tipo=corretor')), sv, agora)).toBeNull();
  });

  it('só PDFs do /api, fora do /api/public e sem ".."', () => {
    expect(L.caminhoPdfValido('/api/contratos/12/manifesto.pdf')).toBe(true);
    expect(L.caminhoPdfValido('/api/trpc/x')).toBe(false);
    expect(L.caminhoPdfValido('/api/public/x.pdf')).toBe(false);
    expect(L.caminhoPdfValido('/api/../x.pdf')).toBe(false);
    expect(L.caminhoPdfValido('https://outro.site/a.pdf')).toBe(false);
    expect(() => L.assinarLinkPdf('/api/x.json', 1, 0)).toThrow();
  });

  it('?baixar=1 vira download', () => {
    const h: Record<string, string> = {};
    const res = { setHeader: (k: string, v: any) => { h[k] = v; } };
    L.forcarDownloadPdf({ method: 'GET', path: '/api/a/b.pdf', query: { baixar: '1' } }, res, () => {});
    res.setHeader('Content-Disposition', 'inline; filename="b.pdf"');
    expect(h['Content-Disposition']).toBe('attachment; filename="b.pdf"');
  });
});
