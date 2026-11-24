import { describe, expect, it } from 'vitest';
import { metricasAnteriores, planejar, textosCampanha, PERFIL_BOM_JARDIMS } from '../shared/campanhasInstagram';
import { semEmoji, planoCampanhaPdf } from './campanhasInstagramPdf';

describe('campanhas do Instagram', () => {
  it('métricas da campanha anterior batem com o relatório (BJ_WHATSAPP_2DIAS_2026)', () => {
    expect(metricasAnteriores({ gasto: 777.2, resultados: 256, alcance: 23284, impressoes: 48199 })).toEqual({ custoPorResultado: 3.04, cpm: 16.12, frequencia: 2.07, resultadosPorMilAlcancados: 11 });
    expect(metricasAnteriores({ gasto: 0, resultados: 10 })).toBeNull();
  });

  it('divide 50/50, projeta conversas e seguidores e avisa quando a meta não cabe', () => {
    const p = planejar({ orcamento: 1000, dias: 5, inicio: '2026-11-25', seguidoresAtuais: 1600, metaSeguidores: 10000 });
    expect(p.termino).toBe('2026-11-29');
    expect(p.vendas).toMatchObject({ total: 500, porDia: 100, conversas: { min: 100, max: 142 }, conjuntos: { frio: 350, remarketing: 150 } });
    expect(p.seguidores).toMatchObject({ total: 500, novos: { min: 416, max: 833 }, perfilNoFim: { min: 2016, max: 2433 } });
    expect(p.custoMeta).toEqual({ faltam: 8400, min: 5040, max: 10080 });
    expect(p.alertaMeta).toMatch(/não cabe neste orçamento/);
  });

  it('textos com os fatos do empreendimento e ganchos dentro de 38 caracteres', () => {
    const t = textosCampanha(PERFIL_BOM_JARDIMS);
    expect(t.anuncioVendas).toContain('17 km de Açailândia');
    expect(t.anuncioSeguidores).toContain('Siga @avalieimob');
    expect(t.anuncioSeguidores).not.toMatch(/R\$|9 9181/);
    expect(t.legendaVendas).toContain('wa.me/5599991811246');
    expect(t.avisos.filter(a => a.includes('38 caracteres'))).toEqual([]);
  });

  it('PDF do plano sai sem emoji (a fonte não tem)', async () => {
    expect(semEmoji('🌳 Chácara\n✅ Sem banco\n1️⃣ Visita')).toBe('Chácara\n• Sem banco\n1) Visita');
    const entrada = { anterior: { nome: 'BJ', gasto: 777.2, resultados: 256, alcance: 23284, impressoes: 48199 }, orcamento: 1000, dias: 5, inicio: '2026-11-25', fracaoVendas: 0.5, seguidoresAtuais: 1600, metaSeguidores: 10000, dados: PERFIL_BOM_JARDIMS } as any;
    const C = await import('../shared/campanhasInstagram');
    const r = { anterior: { ...entrada.anterior, metricas: C.metricasAnteriores(entrada.anterior) }, plano: C.planejar(entrada), textos: C.textosCampanha(PERFIL_BOM_JARDIMS), regras: C.REGRAS_CORTE, config: C.CONFIG_META };
    const pdf = await planoCampanhaPdf(entrada, r);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
