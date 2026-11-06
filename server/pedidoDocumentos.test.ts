import { describe, expect, it } from 'vitest';
import { textoPedidoDocumentos } from '../shared/pedidoDocumentos';

describe('texto de pedido de documentos do contrato', () => {
  it('personaliza com primeiro nome, chácara e corretor', () => {
    const t = textoPedidoDocumentos({ nome: 'Maria da Silva', chacara: 'c05', corretor: 'José Romário · CRECI/MA F-4.705' });
    expect(t.startsWith('Olá, Maria! Tudo bem?')).toBe(true);
    expect(t).toContain('contrato da chácara C05 no Condomínio de Chácaras Bom Jardims');
    expect(t.trim().endsWith('José Romário · CRECI/MA F-4.705')).toBe(true);
  });
  it('sem dados fica genérico e pede tudo o que o contrato usa', () => {
    const t = textoPedidoDocumentos();
    expect(t.startsWith('Olá! Tudo bem?')).toBe(true);
    for (const item of ['RG ou CNH', 'Comprovante de residência', 'Certidão de nascimento', 'regime de bens', 'cônjuge', 'forma de pagamento', 'vencimento', 'dependentes', 'LGPD']) expect(t).toContain(item);
    expect(t).not.toContain('undefined');
  });
});
