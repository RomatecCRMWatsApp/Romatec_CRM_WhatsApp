import { describe, it, expect } from 'vitest';
import { urlPdfPermitida } from './pdfProxyGuard';

describe('/api/pdf-proxy só busca PDFs do Cloudinary da Romatec', () => {
  const nuvem = 'pw6j57yo';
  it('aceita PDF da nuvem da Romatec', () => {
    expect(urlPdfPermitida('https://res.cloudinary.com/pw6j57yo/raw/upload/v1/romatec/planta.pdf', nuvem))
      .toBe('https://res.cloudinary.com/pw6j57yo/raw/upload/v1/romatec/planta.pdf');
  });
  it('recusa outros sites, inclusive os que só citam "res.cloudinary.com"', () => {
    for (const u of [
      'https://evil.com/?x=res.cloudinary.com',
      'https://res.cloudinary.com.evil.com/pw6j57yo/a.pdf',
      'https://evil.com/res.cloudinary.com/pw6j57yo/a.pdf',
      'https://user:pass@res.cloudinary.com/pw6j57yo/a.pdf',
      'http://res.cloudinary.com/pw6j57yo/a.pdf',
      'https://res.cloudinary.com/outra-nuvem/a.pdf',
      'https://res.cloudinary.com:8443/pw6j57yo/a.pdf',
      'http://169.254.169.254/latest/meta-data',
      'file:///etc/passwd',
      '',
    ]) expect(urlPdfPermitida(u, nuvem)).toBeNull();
  });
  it('sem a nuvem configurada, ou com parâmetro inválido, recusa', () => {
    expect(urlPdfPermitida('https://res.cloudinary.com/pw6j57yo/a.pdf', undefined)).toBeNull();
    expect(urlPdfPermitida(['https://res.cloudinary.com/pw6j57yo/a.pdf'], nuvem)).toBeNull();
  });
});
