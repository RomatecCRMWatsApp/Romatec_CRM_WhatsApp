import { beforeAll, describe, expect, it, vi } from 'vitest';

// Banco local em memória (SQLite) com as mesmas tabelas da produção; Z-API falsa
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
delete process.env.ZAPI_INSTANCE_ID;
delete process.env.VAPID_PRIVATE_KEY;

const I = await import('./leads/importacaoContatos');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

/** 10:00 em Açailândia (UTC−3) */
const DEZ_HORAS = Date.UTC(2026, 10, 24, 13, 0, 0);
const enviados: [string, string][] = [];

beforeAll(async () => {
  await getDb();
  I.transporteRetomada.texto = async (phone, texto) => { enviados.push([phone, texto]); };
});

describe('importação de contatos (banco)', () => {
  it('cria os leads, ignora quem já está no CRM e manda a retomada no ritmo', async () => {
    const d: any = await getDb();
    d.run(sql`INSERT INTO leadQualifications (phone, nome, stage, score, createdAt, updatedAt) VALUES ('5599991110000', 'Já Cliente', 'novo_lead', 'frio', ${Date.now()}, ${Date.now()})`);

    const contatos = [
      { nome: 'Maria', telefone: '5599991112222', nomeOriginal: 'Maria CCBJ' },
      { nome: 'Já Cliente', telefone: '559991110000', nomeOriginal: 'Já Cliente CCBJ' },
    ];
    const p = await I.previa({ contatos }).catch(e => { throw new Error('previa: ' + e.message); });
    expect(p.linhas.map(l => l.situacao)).toEqual(['novo', 'ja_no_crm']);

    const r = await I.importar({ contatos, marcador: 'CCBJ', empreendimentoSlug: 'bom-jardims', modelo: 'Oi{, nome}! Morar, investir ou lazer?', enviar: true, incluirExistentes: false, userId: 1 }).catch(e => { throw new Error('importar: ' + e.message); });
    expect(r).toMatchObject({ criados: 1, enfileirados: 1, ignorados: 1 });

    const [lead]: any[] = d.all(sql`SELECT * FROM leadQualifications WHERE phone = '5599991112222'`);
    expect(lead).toMatchObject({ nome: 'Maria', empreendimentoSlug: 'bom-jardims', origemCanal: 'importacao_celular', etapa: 'qualificando' });
    expect(JSON.parse(lead.tags)).toEqual(['CCBJ', 'retomada']);

    // Fora do horário não manda
    expect(await I.processarFilaRetomada(Date.UTC(2026, 10, 24, 2, 0, 0))).toBeNull();
    // No horário manda uma; a próxima só depois de 2 minutos
    expect(await I.processarFilaRetomada(DEZ_HORAS)).not.toBeNull();
    expect(enviados).toEqual([['5599991112222', 'Oi, Maria! Morar, investir ou lazer?']]);
    const fila = await I.situacaoFila();
    expect(fila.lotes[0]).toMatchObject({ enviado: 1 });

    // Importar de novo não duplica lead nem fila
    const r2 = await I.importar({ contatos, marcador: 'CCBJ', empreendimentoSlug: 'bom-jardims', modelo: 'x', enviar: true, incluirExistentes: true, userId: 1 });
    expect(r2.criados).toBe(0);
    const [{ n }]: any[] = d.all(sql`SELECT count(*) as n FROM leadRetomadas WHERE leadId = ${lead.id}`);
    expect(Number(n)).toBe(1);
  });

  it('qualifica pela conversa: finalidade, prazo e pagamento; quente vai para o corretor', async () => {
    const { tratarRetomada } = await import('./autoresposta/qualificacaoRetomada');
    const d: any = await getDb();
    const [row]: any[] = d.all(sql`SELECT id FROM leadQualifications WHERE phone = '5599991112222'`);
    let lead: any = { id: row.id, nome: 'Maria', tags: ['CCBJ', 'retomada'], slots: {}, answers: {} };
    expect(await tratarRetomada(lead, 'bom dia', DEZ_HORAS)).toBeNull();               // sem resposta: robô segue normal
    expect(await tratarRetomada(lead, 'quero visitar sábado', DEZ_HORAS)).toBeNull();  // pedido de visita: robô trata

    const a = await tratarRetomada(lead, 'pra morar', DEZ_HORAS);
    expect(a).toMatchObject({ concluida: false });
    expect(a!.texto).toMatch(/pra quando você pensa em fechar/);
    lead = { ...lead, slots: { finalidade: { valor: 'morar' } } };
    const b = await tratarRetomada(lead, 'agora', DEZ_HORAS);
    expect(b!.texto).toMatch(/forma de pagamento/);
    lead = { ...lead, slots: { finalidade: { valor: 'morar' }, prazo: { valor: 'imediato' } } };
    const c = await tratarRetomada(lead, 'parcelado', DEZ_HORAS, { corretor: 'José Romário', link: async () => 'https://romateccrm.com/o/bom-jardims?l=x' });
    expect(c).toMatchObject({ concluida: true, quente: true, resumo: 'Morar · Imediato · Parcelado direto' });
    expect(c!.texto).toContain('https://romateccrm.com/o/bom-jardims?l=x');
    const [salvo]: any[] = d.all(sql`SELECT etapa, score, leadScore, tags FROM leadQualifications WHERE id = ${row.id}`);
    expect(salvo).toMatchObject({ etapa: 'qualificado', score: 'quente', leadScore: 30 });
    expect(JSON.parse(salvo.tags)).toContain('qualificado_retomada');
  });

  it('separa importados de captação na lista e na distribuição', async () => {
    const lista = await I.leadsImportados({ filtro: 'todos' });
    expect(lista.resumo).toMatchObject({ total: 1, enviados: 1 });
    expect(lista.itens[0]).toMatchObject({ nome: 'Maria', envio: 'enviado', qualificado: true });
    expect((await I.leadsImportados({ filtro: 'quentes' })).itens).toHaveLength(1);
    expect((await I.leadsImportados({ filtro: 'sem_resposta' })).itens).toHaveLength(0);
    const { leadsParaDistribuir } = await import('./leads/distribuicao');
    const imp = await leadsParaDistribuir('todos', '', Date.now(), 'importados');
    expect(imp.map(l => l.nome)).toEqual(['Maria']);
    expect(imp[0].importado).toBe(true);
    const cap = await leadsParaDistribuir('todos', '', Date.now(), 'captacao');
    expect(cap.map(l => l.nome)).toEqual(['Já Cliente']);
  });
});
