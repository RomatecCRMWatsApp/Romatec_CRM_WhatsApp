import { describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
const L = await import('./financeiro/tabelaComissaoLink');

const consulta = (caminho: string) => Object.fromEntries(new URL(caminho, 'https://x.test').searchParams);

describe('link compartilhável da tabela de comissão', () => {
  it('abre com a assinatura certa por 30 dias; adulterado ou vencido não abre', () => {
    const agora = Date.UTC(2026, 10, 10);
    const c = L.linkTabelaComissao({ slug: 'bom-jardims', tipo: 'escritorio', lote: 'A01', usuarioId: 7 }, agora);
    expect(c.startsWith('/api/public/comissao/tabela.pdf?slug=bom-jardims&tipo=escritorio&lote=A01&u=7&exp=')).toBe(true);
    const q = consulta(c);
    expect(L.lerLinkTabelaComissao(q, agora + 29 * 86_400_000)).toEqual({ slug: 'bom-jardims', tipo: 'escritorio', lote: 'A01', usuarioId: 7 });
    expect(L.lerLinkTabelaComissao(q, agora + 31 * 86_400_000)).toBeNull();
    expect(L.lerLinkTabelaComissao({ ...q, tipo: 'corretor' }, agora)).toBeNull();
    expect(L.lerLinkTabelaComissao({ ...q, u: '8' }, agora)).toBeNull();
    expect(L.lerLinkTabelaComissao({ ...q, lote: 'A02' }, agora)).toBeNull();
    expect(L.lerLinkTabelaComissao({ ...q, sig: 'x' }, agora)).toBeNull();
    expect(L.lerLinkTabelaComissao({ ...q, lote: '../x' }, agora)).toBeNull();
  });
  it('nome do arquivo', () => {
    expect(L.nomeArquivoTabelaComissao('bom-jardims', 'escritorio', 'a01')).toBe('TABELA-COMISSAO-GESTAO-BOM-JARDIMS-A01.pdf');
    expect(L.nomeArquivoTabelaComissao('bom-jardims', 'corretor')).toBe('TABELA-COMISSAO-VENDA-BOM-JARDIMS.pdf');
  });
});
