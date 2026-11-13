import { describe, expect, it } from 'vitest';
import { linkImovel, textoAnuncio } from '../shared/anuncioImovel';

const casa = { id: 1, denomination: 'ALACIDE', codigo: 'IMV-0001', address: 'Av. Tocantins, Qd. 38 Lt. 01', city: 'Açailândia', state: 'MA',
  price: 380000, offerPrice: 380000, propertyType: 'Casa', finalidade: 'venda', bedrooms: 3, bathrooms: 2, garageSpaces: 1, areaConstruida: '127.52', areaTerreno: '300.00' };

describe('anúncio do imóvel para compartilhar', () => {
  it('link da landing com a origem do compartilhamento e o corretor', () => {
    const l = linkImovel('https://romateccrm.com', casa, 'whatsapp', 7)!;
    expect(l).toBe('https://romateccrm.com/i/IMV-0001?utm_source=whatsapp&utm_medium=compartilhar&utm_campaign=IMV-0001&utm_content=corretor-7');
    expect(linkImovel('https://x', { id: 2, denomination: 'A', publicSlug: 'casa-a' }, 'link')).toBe('https://x/imovel/casa-a?utm_source=link&utm_medium=compartilhar&utm_campaign=imovel-2');
    expect(linkImovel('https://x', { id: 3, denomination: 'B' }, 'link')).toBeNull();
  });

  it('ficha com preço, cômodos no singular/plural, áreas e link', () => {
    const t = textoAnuncio(casa, 'https://l', 'José · (99) 9 9181-1246');
    expect(t).toContain('🏡 *ALACIDE* (IMV-0001)');
    expect(t).toContain('Casa à venda');
    expect(t).toMatch(/💰 \*R\$\s?380\.000\*/);
    expect(t).not.toMatch(/De R\$/);
    expect(t).toContain('🛏 3 quartos · 🛁 2 banheiros · 🚗 1 vaga');
    expect(t).toContain('📐 Área construída 127,52 m² · terreno 300 m²');
    expect(t).toContain('👉 Fotos e detalhes: https://l');
    expect(t).toContain('Fale comigo: José');
  });

  it('oferta menor mostra o "de/por"; preço oculto vira consulta', () => {
    expect(textoAnuncio({ ...casa, offerPrice: 350000 }, null)).toMatch(/De R\$\s?380\.000 por \*R\$\s?350\.000\*/);
    expect(textoAnuncio({ ...casa, exibirPreco: false }, null)).toContain('Valor sob consulta');
    expect(textoAnuncio({ ...casa, finalidade: 'aluguel', price: 1500, offerPrice: null }, null)).toMatch(/1\.500\*\/mês/);
  });
});
