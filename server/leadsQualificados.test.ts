import { beforeAll, describe, expect, it } from 'vitest';
import { pontuar, projetarFunil, CENARIOS_FUNIL, ehFormularioQualificado } from '../shared/leadScoreForm';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
const Q = await import('./leads/leadsQualificados');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('nota do formulário qualificado (mesmos números do lead_score.py)', () => {
  it('A, C e A com evento', () => {
    expect(pontuar({ momento: 'Agora, nos próximos 30 dias', pagamento: 'A entrada + parcelas cabem no meu planejamento', prioridade: 'Contato com a natureza e o rio', regiao: 'Moro em Açailândia', visita: 'Sim, neste fim de semana' })).toMatchObject({ leadScore: 100, faixa: 'A' });
    expect(pontuar({ momento: 'De 3 a 6 meses', pagamento: 'Ainda não sei', regiao: 'Outro estado', visita: 'Prefiro receber informações primeiro' })).toMatchObject({ leadScore: 19, faixa: 'C' });
    expect(pontuar({ momento: 'De 1 a 3 meses', pagamento: 'Preciso de uma entrada menor', prioridade: 'Investimento e valorização', regiao: 'Moro em Imperatriz ou região', visita: 'Sim, em outro dia', respondeu_whatsapp: 'sim' })).toMatchObject({ leadScore: 72, faixa: 'A' });
    expect(ehFormularioQualificado({ finalidade: 'morar' })).toBe(false);
    // Exemplos da estratégia: Ana (A) e João (C)
    expect(pontuar({ momento: 'De 1 a 3 meses', pagamento: 'Quero pagar à vista', prioridade: 'Investimento e valorização', regiao: 'Moro em Imperatriz ou região', visita: 'Sim, em outro dia' })).toMatchObject({ leadScore: 79, faixa: 'A' });
    expect(pontuar({ momento: 'De 3 a 6 meses', pagamento: 'Ainda não sei', prioridade: 'Segurança de condomínio fechado', regiao: 'Outra cidade do MA, PA ou TO', visita: 'Prefiro receber informações primeiro' })).toMatchObject({ leadScore: 33, faixa: 'C' });
  });
  it('funil base: R$ 3.000, 77 unidades em 12 meses', () => {
    expect(projetarFunil(3000, 77, 12, CENARIOS_FUNIL.base)).toMatchObject({ leads: 100, qualificados: 45, visitas: 14, vendasMes: 2, mesesParaVender: 38, custoPorVenda: 1481, verbaParaMeta: 9506 });
  });
});

describe('importação do CSV da Central de Leads', () => {
  const avisos: string[] = [];
  beforeAll(async () => {
    await getDb();
    Q.definirAvisoEscritorio(async t => { avisos.push(t); });
  });

  it('lê CSV com aspas e tabulação', () => {
    const l = Q.lerCsv('id\tfull_name\tphone_number\n"l:1"\t"Maria, da Silva"\t"+5599988887777"\n');
    expect(l).toEqual([{ id: 'l:1', full_name: 'Maria, da Silva', phone_number: '+5599988887777' }]);
  });

  it('cria os leads, dá a nota, avisa o lead A e separa o C para a nutrição', async () => {
    const csv = [
      'id,created_time,campaign_name,adset_name,ad_name,full_name,phone_number,city,momento,pagamento,prioridade,regiao,visita',
      'l:111,2026-11-25,BJ_LEADS_QUALIFICADOS_IG,Frio,Video A,Maria Quente,+55 99 98101-0001,Açailândia,"Agora, nos próximos 30 dias",A entrada + parcelas cabem no meu planejamento,Contato com a natureza e o rio,Moro em Açailândia,"Sim, neste fim de semana"',
      'l:222,2026-11-25,BJ_LEADS_QUALIFICADOS_IG,Frio,Video A,João Frio,+55 99 98101-0002,Belém,De 3 a 6 meses,Ainda não sei,Investimento e valorização,Outro estado,Prefiro receber informações primeiro',
      'l:333,2026-11-25,BJ_LEADS_QUALIFICADOS_IG,Frio,Video A,Sem Fone,,,,,,,',
    ].join('\n');
    const r = await Q.importarCsvMeta(csv, { empreendimentoSlug: 'bom-jardims' });
    expect(r).toMatchObject({ total: 3, A: 1, B: 0, C: 1 });
    expect(r.linhas[0]).toMatchObject({ nome: 'Maria Quente', leadScore: 100, faixa: 'A', situacao: 'novo', campanha: 'Video A' });
    expect(r.linhas.find(l => l.nome === 'Sem Fone')?.situacao).toBe('sem_telefone');
    await new Promise(res => setTimeout(res, 20));
    expect(avisos.some(a => a.includes('Lead A (nota 100)') && a.includes('Maria Quente'))).toBe(true);
    expect(avisos.some(a => a.includes('João Frio'))).toBe(false);

    const c = await Q.leadsDaFaixa('C');
    expect(c[0]).toMatchObject({ nome: 'João Frio', nota: 29, regiao: 'Outro estado' }); // 10 + 3 + 10 + 4 + 2
    const d: any = await getDb();
    const tags = d.all(sql`SELECT tags FROM leadQualifications WHERE nome = 'João Frio'`)[0].tags;
    expect(String(tags)).toContain('nutricao');

    // Reimportar o mesmo arquivo não duplica
    const de2 = await Q.importarCsvMeta(csv, { empreendimentoSlug: 'bom-jardims' });
    expect(de2.linhas.filter(l => l.situacao === 'duplicado')).toHaveLength(2);

    const p = await Q.painelQualificados();
    expect(p.campanhas[0]).toMatchObject({ campanha: 'BJ_LEADS_QUALIFICADOS_IG', leads: 2, A: 1, C: 1 });
  });

  it('a nota muda com o comportamento: responde (+10), confirma a visita (+15), 24 h sem resposta (−15)', async () => {
    const d: any = await getDb();
    const id = (nome: string) => Number(d.all(sql`SELECT id FROM leadQualifications WHERE nome = ${nome}`)[0].id);
    const nota = (nome: string) => Number(d.all(sql`SELECT leadScore FROM leadQualifications WHERE nome = ${nome}`)[0].leadScore);
    const joao = id('João Frio');
    expect((await Q.registrarEvento(joao, 'respondeu_whatsapp'))?.leadScore).toBe(39);
    expect(await Q.registrarEvento(joao, 'respondeu_whatsapp')).toBeNull(); // só uma vez
    const avisosAntes = avisos.length;
    expect(await Q.registrarEvento(joao, 'visita_confirmada')).toMatchObject({ leadScore: 54, faixa: 'B' });
    expect(avisos.length).toBe(avisosAntes); // B não aciona o alerta de lead A
    // Dois dias depois: a Maria (A, 100) não respondeu e cai 15; o João já respondeu e não muda
    expect(await Q.verificarSemResposta(Date.now() + 2 * 86_400_000)).toBe(1);
    expect(nota('Maria Quente')).toBe(85);
    expect(nota('João Frio')).toBe(54);
    // Se responde depois, o desconto sai
    expect((await Q.registrarEvento(id('Maria Quente'), 'respondeu_whatsapp'))?.leadScore).toBe(100);
  });
});
