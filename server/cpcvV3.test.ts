import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import { SEED_EMP_JURIDICO } from './_core/migrations/seedContratos';

/** CPCV v3 (out/2026): energia Equatorial, água com hidrômetro do comprador e tarifa pela média CAEMA × SAAE, esgoto
 *  no lote, venda na planta com aditivos, recreação exclusiva, carteirinha e vistoria de medição */
describe('CPCV Bom Jardims v3', () => {
  const texto = async () => {
    const { mergeDocx } = await import('./contratos/render');
    const docx = await mergeDocx('MODELO-CPCV-BOM-JARDIMS-v3.docx', { ...SEED_EMP_JURIDICO.defaults, ctr_parcelas_minimas_obra: '3' } as any, { minuta: false, marca: 'bomjardims' });
    return new PizZip(docx).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');
  };

  it('traz as cláusulas novas com os valores da configuração', async () => {
    const t = await texto();
    for (const trecho of [
      'Fixada inicialmente em R$ 100,00/mês por chácara',
      'espaço de uso exclusivo de 100,00 m²',
      'taxa de reimpressão de R$ 25,00 por carteirinha',
      'EQUATORIAL MARANHÃO DISTRIBUIDORA DE ENERGIA S.A.',
      'monofásico, bifásico ou trifásico',
      'ponto de alimentação (ramal com registro) deixado na testada de cada chácara',
      'A aquisição e a instalação do hidrômetro e do cavalete da unidade são de responsabilidade e às expensas do(a) COMPRADOR(A)',
      'média aritmética simples, faixa a faixa, das tarifas residenciais praticadas na região pela CAEMA e pelo SAAE',
      'fossa séptica (tanque séptico) dimensionada conforme a ABNT NBR 7229:1993',
      'filtro anaeróbio seguido de sumidouro',
      '15,00 m de poços, nascentes e cursos d',
      'Venda na planta.',
      'aprovação do projeto de energia elétrica pela Equatorial Maranhão',
      'abertura das matrículas individuais',
      'A primeira medição é de responsabilidade do condomínio e não tem custo',
      'agrimensor credenciado pelo condomínio',
      'Anexo VIII — Tabela Tarifária de Água',
      '20. Venda na planta', '21. Esgotamento sanitário', '22. Condições específicas',
      // Quadra F: área privada e reserva de preservação (v3.1)
      'área privada do empreendimento, não integrante das áreas públicas doadas ao Município',
      'somente em área já aberta, sem supressão de vegetação nativa',
      'São vedadas edificações permanentes (casa, chalé ou similar)',
      '15.3. Reserva de preservação da Quadra F.',
      'O uso do córrego limita-se ao banho e à recreação de baixo impacto',
    ]) expect(t, trecho).toContain(trecho);
    // Saiu o hidrômetro por conta do empreendimento e a contribuição "estimada"
    expect(t).not.toContain('com hidrômetro por chácara');
    expect(t).not.toContain('Estimada em R$');
    expect(t).not.toContain('cabana, banheiro, quiosque, chalé ou similar');
    // Nenhuma tag sem valor no padrão do empreendimento novo
    expect(t).not.toMatch(/emp_(taxa_carteirinha|area_recreacao_m2)/);
  });

  it('padrões do empreendimento e anexo VIII com a tabela da água', async () => {
    expect(SEED_EMP_JURIDICO.defaults.emp_taxa_carteirinha).toBe('25,00');
    expect(SEED_EMP_JURIDICO.defaults.emp_area_recreacao_m2).toBe('100,00');
    const { anexoTarifaAgua } = await import('./contratos/anexos');
    const pdf = await anexoTarifaAgua('bomjardims');
    expect(pdf).not.toBeNull();
    expect((await PDFDocument.load(pdf!)).getPageCount()).toBeGreaterThanOrEqual(2);
    expect(await anexoTarifaAgua('outra-marca')).toBeNull();
    expect(await anexoTarifaAgua('../x')).toBeNull();
  });
});

describe('Estatuto v1.2 (Quadra F privada como reserva)', () => {
  it('traz o regime privado, os espaços exclusivos, as proibições e a reimpressão da carteirinha', async () => {
    const { mergeDocx } = await import('./contratos/render');
    const { ESTATUTO, contextoEstatuto } = await import('./contratos/anexos');
    expect(ESTATUTO.arquivo).toBe('MODELO-ESTATUTO-ASSOCIACAO-BOM-JARDIMS-v2.docx');
    const docx = await mergeDocx(ESTATUTO.arquivo, contextoEstatuto({ ...SEED_EMP_JURIDICO.defaults } as any), { minuta: false, marca: 'bomjardims' });
    const t = new PizZip(docx).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');
    for (const trecho of [
      'área privada do empreendimento, de uso comum dos associados, não integrante das áreas públicas doadas ao Município',
      'espaço de uso exclusivo de 100,00 m² na Quadra F',
      'São vedadas edificações permanentes (casa, chalé ou similar)',
      'Reserva de preservação.',
      'O uso do córrego limita-se ao banho e à recreação de baixo impacto',
      'a reimpressão por perda, extravio, dano ou inclusão posterior de dependente custa R$ 25,00 por carteira',
      'O hidrômetro e o cavalete são adquiridos e instalados pelo associado',
      'fixadas inicialmente em R$ 100,00 por chácara',
      'rateadas igualmente por unidade', 'até 3 (três) veículos',
    ]) expect(t, trecho).toContain(trecho);
    expect(t).not.toContain('área pública integrante dos 25% doados ao Município');
  }, 60_000);

  it('a migração só troca o regime antigo (área pública) pelo novo', async () => {
    const { QUADRA_F_REGIME_ANTIGO } = await import('./_core/migrations/seedContratos');
    expect(QUADRA_F_REGIME_ANTIGO).toMatch(/^área pública integrante dos 25% doados ao Município/);
    expect(SEED_EMP_JURIDICO.defaults.emp_quadra_f_regime).toMatch(/^área privada do empreendimento/);
  });
});
