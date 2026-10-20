import { describe, it, expect, vi } from 'vitest';
import { legendaChacara, identificacaoChacara, imagemDoDataUrl, enviarFolderWhatsApp, nomeArquivoFolder, legendaMemorial, MAX_IMAGEM_BYTES } from './empreendimentoWhatsApp';
import { nomeLoteMemorial } from './lotes/memorial';
import { enviarImagem, ZApiError } from './leads/zapiClient';
import { pdfDeJpeg, tamanhoJpeg } from './leads/pdfSimples';

// JPEG mínimo: SOI + APP0 + SOF0 (1080 x 2400) + EOI — o bastante para cabeçalho/tamanho
const jpegFake = (largura = 1080, altura = 2400) => Buffer.from([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 0xff, largura >> 8, largura & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  0xff, 0xd9,
]);
const JPEG = jpegFake();
const jpegUrl = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const pngUrl = `data:image/png;base64,${PNG.toString('base64')}`;
const BJ = 'Condomínio de Chácaras Bom Jardims';
const base = { legenda: 'Legenda', nomeArquivo: 'folder-bom-jardims-B13.pdf' };

describe('Folder da chácara no WhatsApp — legenda e arquivo', () => {
  it('empreendimento + chácara/quadra/área + cidade + corretor, sem preço', () => {
    const l = legendaChacara({ empreendimento: BJ, municipio: 'Açailândia', uf: 'MA', lote: { codigo: 'B13', quadra: 'B', areaM2: 3025.11 } });
    expect(l).toBe(`🏡 *${BJ}*\nChácara B13 · Quadra B · 3.025,11 m²\n📍 Açailândia/MA\n\nRomatec Consultoria Total · José Romário — CRECI/MA 4.705`);
    expect(l).not.toMatch(/R\$|valor|pre[çc]o/i);
  });
  it('folder geral (sem lote) e dados faltando não quebram', () => {
    expect(legendaChacara({ empreendimento: BJ, disponiveis: 82 })).toContain('Mapa das chácaras · 82 disponíveis');
    expect(identificacaoChacara({ codigo: 'A01' })).toBe('Chácara A01');
  });
  it('nome do PDF', () => {
    expect(nomeArquivoFolder('bom-jardims', 'B13')).toBe('folder-bom-jardims-B13.pdf');
    expect(nomeArquivoFolder('bom-jardims')).toBe('folder-bom-jardims.pdf');
  });
});

describe('Folder da chácara no WhatsApp — imagem da página', () => {
  it('aceita JPEG e PNG de verdade', () => {
    expect(imagemDoDataUrl(jpegUrl)).toMatchObject({ mime: 'image/jpeg', base64: JPEG.toString('base64') });
    expect(imagemDoDataUrl(pngUrl).mime).toBe('image/png');
  });
  it('recusa tipo errado, conteúdo que não bate com o tipo, URL e imagem grande demais', () => {
    expect(() => imagemDoDataUrl('data:image/gif;base64,R0lGOD')).toThrow(/JPEG ou PNG/);
    expect(() => imagemDoDataUrl(`data:image/jpeg;base64,${PNG.toString('base64')}`)).toThrow(/não é JPEG/);
    expect(() => imagemDoDataUrl(`data:image/png;base64,${JPEG.toString('base64')}`)).toThrow(/não é PNG/);
    expect(() => imagemDoDataUrl('https://exemplo.com/a.jpg')).toThrow();
    const grande = Buffer.alloc(MAX_IMAGEM_BYTES + 10);
    JPEG.copy(grande);
    expect(() => imagemDoDataUrl(`data:image/jpeg;base64,${grande.toString('base64')}`)).toThrow(/grande/);
  });
  it('PDF de uma página com a imagem inteira, na proporção da página', () => {
    expect(tamanhoJpeg(JPEG)).toEqual({ largura: 1080, altura: 2400 });
    expect(tamanhoJpeg(PNG)).toBeNull();
    const pdf = pdfDeJpeg(JPEG);
    const s = pdf.toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toContain('/Count 1');
    expect(s).toContain('/MediaBox [0 0 595 1322.22]'); // 595 × 2400/1080
    expect(s).toContain('/Width 1080 /Height 2400');
    expect(s).toContain('/Filter /DCTDecode');
    expect(pdf.includes(JPEG)).toBe(true); // bytes do JPEG intactos
    const inicio = Number(s.match(/startxref\n(\d+)/)![1]);
    const offsets = Array.from(s.slice(inicio).matchAll(/^(\d{10}) 00000 n $/gm)).map(m => Number(m[1]));
    offsets.forEach((o, i) => expect(s.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(() => pdfDeJpeg(PNG)).toThrow(/não é JPEG/);
  });
});

describe('Memorial descritivo no WhatsApp', () => {
  it('legenda: lote/quadra + empreendimento + aviso de rascunho em destaque', () => {
    const l = legendaMemorial({ lote: 'Lote 18 da Quadra C', empreendimento: BJ, municipio: 'Açailândia', uf: 'MA' });
    expect(l).toBe([
      '📐 *Memorial descritivo — Lote 18 da Quadra C*',
      `${BJ} · Açailândia/MA`,
      '',
      '⚠️ *RASCUNHO PARA CONFERÊNCIA — NÃO VALE COMO DOCUMENTO OFICIAL SEM ASSINATURA DO RESPONSÁVEL TÉCNICO*',
      'Para averiguação de dados, coordenadas e localização.',
    ].join('\n'));
  });
  it('nome do lote como no memorial e nome do arquivo', () => {
    expect(nomeLoteMemorial({ codigo: 'C18', quadra: 'C', numero: 18 })).toBe('Lote 18 da Quadra C');
    expect(nomeLoteMemorial({ codigo: 'B07', quadra: 'B', numero: 7 })).toBe('Lote 07 da Quadra B');
    expect(nomeLoteMemorial({ codigo: 'X1' })).toBe('Lote X1');
    expect(nomeArquivoFolder('bom-jardims', 'C18', 'memorial')).toBe('memorial-bom-jardims-C18.pdf');
  });
  it('envio como PDF/imagem só para o número digitado; erro fala em memorial', async () => {
    const d = { enviarImagem: vi.fn().mockRejectedValue(new ZApiError('ZAPI_TIMEOUT', 'lento')), enviarDocumento: vi.fn().mockResolvedValue('m') };
    await enviarFolderWhatsApp({ telefone: '99 99181-1246', imagem: jpegUrl, formato: 'pdf', legenda: 'L', nomeArquivo: 'memorial-bom-jardims-C18.pdf' }, d);
    expect(d.enviarDocumento.mock.calls[0][0]).toBe('5599991811246');
    expect(d.enviarDocumento.mock.calls[0][1].nomeArquivo).toBe('memorial-bom-jardims-C18.pdf');
    await expect(enviarFolderWhatsApp({ telefone: '99 99181-1246', imagem: jpegUrl, formato: 'imagem', legenda: 'L', nomeArquivo: 'memorial-bom-jardims-C18.pdf' }, d))
      .rejects.toThrow('WhatsApp não enviou o memorial (ZAPI_TIMEOUT: lento)');
  });
});

describe('Folder da chácara no WhatsApp — envio', () => {
  const deps = () => ({ enviarImagem: vi.fn().mockResolvedValue('m1'), enviarDocumento: vi.fn().mockResolvedValue('m2') });

  it('como imagem: normaliza o número digitado e manda a página inteira + legenda só para ele', async () => {
    const d = deps();
    const tel = await enviarFolderWhatsApp({ ...base, telefone: '(99) 99181-1246', imagem: jpegUrl, formato: 'imagem' }, d);
    expect(tel).toBe('5599991811246');
    expect(d.enviarImagem).toHaveBeenCalledWith('5599991811246', { base64: JPEG.toString('base64'), mime: 'image/jpeg', legenda: 'Legenda' });
    expect(d.enviarDocumento).not.toHaveBeenCalled();
  });
  it('como PDF: vira PDF de uma página e vai como documento com nome e legenda', async () => {
    const d = deps();
    await enviarFolderWhatsApp({ ...base, telefone: '+55 99 99181-1246', imagem: jpegUrl, formato: 'pdf' }, d);
    expect(d.enviarImagem).not.toHaveBeenCalled();
    const [tel, doc] = d.enviarDocumento.mock.calls[0];
    expect(tel).toBe('5599991811246');
    expect(doc).toMatchObject({ extensao: 'pdf', mime: 'application/pdf', nomeArquivo: 'folder-bom-jardims-B13.pdf', legenda: 'Legenda' });
    expect(Buffer.from(doc.base64, 'base64').toString('latin1').startsWith('%PDF-1.4')).toBe(true);
  });
  it('número inválido não envia nada', async () => {
    const d = deps();
    for (const t of ['(99) 3538-1234', '123', '']) {
      await expect(enviarFolderWhatsApp({ ...base, telefone: t, imagem: jpegUrl, formato: 'imagem' }, d)).rejects.toThrow(/Número inválido/);
    }
    expect(d.enviarImagem).not.toHaveBeenCalled();
    expect(d.enviarDocumento).not.toHaveBeenCalled();
  });
  it('falha da Z-API vira erro legível', async () => {
    const d = { enviarImagem: vi.fn().mockRejectedValue(new ZApiError('ZAPI_HTTP_400', 'bad')), enviarDocumento: vi.fn() };
    await expect(enviarFolderWhatsApp({ ...base, telefone: '5599991811246', imagem: jpegUrl, formato: 'imagem' }, d))
      .rejects.toThrow('WhatsApp não enviou o folder (ZAPI_HTTP_400: bad)');
  });
  it('Z-API: /send-image com a imagem em base64 e a legenda', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ zaapId: 'z1' }) });
    const id = await enviarImagem('5599991811246', { base64: '/9j/4AA=', mime: 'image/jpeg', legenda: 'Chácara B13' },
      { creds: { instanceId: 'I', token: 'T', clientToken: 'C' }, fetchImpl: fetchImpl as any });
    expect(id).toBe('z1');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.z-api.io/instances/I/token/T/send-image');
    expect(init.headers['Client-Token']).toBe('C');
    expect(JSON.parse(init.body)).toEqual({ phone: '5599991811246', image: 'data:image/jpeg;base64,/9j/4AA=', caption: 'Chácara B13' });
  });
});
