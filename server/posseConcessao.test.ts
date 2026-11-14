import { describe, expect, it } from 'vitest';
import { CONDICOES_ESPECIFICAS, montarCondicoes, separarCondicoes, textoCondicaoEspecifica } from '../shared/condicoesEspecificas';

// Concessão da proprietária: posse e uso pela regra do pagamento à vista do CPCV (Cláusula 6ª)
describe('posse e uso na concessão', () => {
  it('é condição só da concessão (administrador); a liberação após a 3ª parcela não vale nela', () => {
    expect(CONDICOES_ESPECIFICAS.find(c => c.id === 'posse_concessao')).toMatchObject({ soConcessao: true, soAdmin: true });
    expect(CONDICOES_ESPECIFICAS.find(c => c.id === 'liberacao_uso')).toMatchObject({ semConcessao: true });
  });

  it('texto: imissão e liberação em 15 dias da última assinatura, sem mínimo de parcelas, propriedade só com escritura e registro', () => {
    const t = textoCondicaoEspecifica('posse_concessao');
    expect(t).toMatch(/^Posse e uso na concessão:/);
    expect(t).toMatch(/Termo de Entrega/);
    expect(t).toMatch(/Termo de Liberação de Uso/);
    expect(t).toMatch(/15 \(quinze\) dias da última assinatura/);
    expect(t).toMatch(/dispensado o mínimo de parcelas/);
    expect(t).toMatch(/não se confunde com o direito real de usufruto/);
    expect(t).toMatch(/arts\. 108, 541 e 1\.245/);
  });

  it('marca e desmarca pelo campo das condições específicas', () => {
    const v = montarCondicoes(['posse_concessao'], 'Entrega da chave do portão.');
    expect(separarCondicoes(v)).toEqual({ marcadas: ['posse_concessao'], livre: 'Entrega da chave do portão.' });
  });
});
