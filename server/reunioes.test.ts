import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./reunioes/servico');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const { resumoEmTexto } = await import('../shared/reunioes');

const admin = { id: 1, permissoes: { perfil: 'admin', modulos: null, acessos: [] } } as any;
const maria = { id: 2, permissoes: { perfil: 'corretor', modulos: {}, acessos: [] } } as any;
const outro = { id: 5, permissoes: { perfil: 'corretor', modulos: {}, acessos: [] } } as any;
const dona = { id: 6, permissoes: { perfil: 'empreendedor', modulos: null, acessos: [] } } as any;

const transcritas: string[] = [];
beforeAll(async () => {
  const db: any = await getDb();
  db.run(sql`INSERT INTO leadQualifications (id, phone, nome, stage, score, responsavelId, createdAt, updatedAt) VALUES (10, '5599911112222', 'Carlos Cliente', 'novo_lead', 'frio', 2, ${Date.now()}, ${Date.now()})`);
  db.run(sql`INSERT INTO leadQualifications (id, phone, nome, stage, score, responsavelId, createdAt, updatedAt) VALUES (11, '5599933334444', 'Lead do Outro', 'novo_lead', 'frio', 5, ${Date.now()}, ${Date.now()})`);
  S.ia.transcrever = async (audio: Buffer) => { const t = `trecho ${audio.toString()}`; transcritas.push(t); return t; };
  S.ia.resumir = async (texto: string, ctx: any) => ({
    resumo: `Resumo de ${ctx.cliente}: ${texto.length} caracteres`, pontosPrincipais: ['Chácara B07'], interesse: 'B07, entrada parcelada, quente',
    objecoes: ['Prazo da escritura'], proximosPassos: ['Enviar a simulação até sexta'], dadosCliente: ['Mora em Imperatriz'],
  });
});

describe('reuniões com clientes', () => {
  it('grava em partes (fora de ordem), finaliza com transcrição na ordem e resumo; o corretor do lead vê, outro não', async () => {
    await expect(S.criarReuniao({ titulo: 'Visita', tipo: 'presencial', leadId: 10, consentimento: false }, maria)).rejects.toMatchObject({ name: 'ReuniaoErro' });
    const { id } = await S.criarReuniao({ titulo: 'Visita ao Bom Jardims', tipo: 'presencial', leadId: 10, consentimento: true }, maria);
    await S.receberParte(id, 1, Buffer.from('dois'), 'audio/webm', 300, maria);
    await S.receberParte(id, 0, Buffer.from('um'), 'audio/webm', 300, maria);
    await S.receberParte(id, 2, Buffer.from('tres'), 'audio/webm', 42, maria);
    await S.finalizarReuniao(id, maria, false);
    const r = await S.obterReuniao(id, maria);
    expect(r).toMatchObject({ status: 'pronta', duracaoSeg: 642, cliente: 'Carlos Cliente', erro: null });
    expect(r.transcricao).toBe('trecho um\n\ntrecho dois\n\ntrecho tres');
    expect(r.resumo?.proximosPassos).toEqual(['Enviar a simulação até sexta']);
    expect(resumoEmTexto(r.titulo, r.resumo)).toContain('*Próximos passos*\n• Enviar a simulação até sexta');
    // Depois de pronta, não recebe mais partes
    await expect(S.receberParte(id, 3, Buffer.from('x'), 'audio/webm', 1, maria)).rejects.toMatchObject({ status: 409 });
    // Visibilidade
    expect((await S.listarReunioes(maria)).map(x => x.id)).toContain(id);
    expect((await S.listarReunioes(admin, { leadId: 10 })).map(x => x.id)).toEqual([id]);
    expect((await S.listarReunioes(outro)).map(x => x.id)).not.toContain(id);
    await expect(S.obterReuniao(id, outro)).rejects.toMatchObject({ status: 403 });
    await expect(S.listarReunioes(dona)).rejects.toMatchObject({ status: 403 });
    // Corretor não vincula reunião a lead de outro corretor
    await expect(S.criarReuniao({ titulo: 'x', tipo: 'ligacao', leadId: 11, consentimento: true }, maria)).rejects.toMatchObject({ status: 403 });
    // Excluir: só quem gravou ou o admin
    await expect(S.excluirReuniao(id, outro)).rejects.toMatchObject({ status: 403 });
    await S.excluirReuniao(id, maria);
    await expect(S.obterReuniao(id, admin)).rejects.toMatchObject({ status: 404 });
  });

  it('sem crédito na OpenAI: o trecho fica guardado e "Tentar de novo" transcreve e apaga o áudio', async () => {
    const db: any = await getDb();
    const { id } = await S.criarReuniao({ titulo: 'Ligação', tipo: 'ligacao', consentimento: true }, maria);
    await S.receberParte(id, 0, Buffer.from('ok'), 'audio/webm', 60, maria);
    const real = S.ia.transcrever;
    S.ia.transcrever = async () => { throw new Error('A conta da OpenAI está sem créditos.'); };
    expect(await S.receberParte(id, 1, Buffer.from('dois'), 'audio/webm', 60, maria)).toMatchObject({ pendente: true });
    // Finaliza ainda sem crédito: resumo do que saiu, avisa o trecho pendente e o áudio continua guardado
    await S.finalizarReuniao(id, maria, false);
    let r = await S.obterReuniao(id, maria);
    expect(r).toMatchObject({ status: 'pronta', transcricao: 'trecho ok' });
    expect(r.erro).toContain('1 trecho(s) ainda sem transcrição: A conta da OpenAI está sem créditos.');
    expect(db.all(sql`SELECT COUNT(*) AS n FROM reuniaoPartes WHERE reuniaoId = ${id} AND audioBase64 IS NOT NULL`)[0].n).toBe(1);
    // Créditos de volta: tentar de novo transcreve o trecho guardado, na ordem, e apaga o áudio
    S.ia.transcrever = real;
    await S.finalizarReuniao(id, maria, false);
    r = await S.obterReuniao(id, maria);
    expect(r).toMatchObject({ status: 'pronta', transcricao: 'trecho ok\n\ntrecho dois', erro: null });
    expect(db.all(sql`SELECT COUNT(*) AS n FROM reuniaoPartes WHERE reuniaoId = ${id} AND audioBase64 IS NOT NULL`)[0].n).toBe(0);

    const vazia = await S.criarReuniao({ titulo: 'Vazia', tipo: 'video', consentimento: true }, maria);
    await S.finalizarReuniao(vazia.id, maria, false);
    expect(await S.obterReuniao(vazia.id, maria)).toMatchObject({ status: 'erro', erro: 'Nenhum áudio recebido.' });
  });

  it('buscar cliente: só os leads que o corretor vê', async () => {
    expect((await S.buscarLeads(maria, 'carlos')).map(l => l.id)).toEqual([10]);
    expect(await S.buscarLeads(maria, 'outro')).toEqual([]);
    expect((await S.buscarLeads(admin, '3333')).map(l => l.id)).toEqual([11]);
  });
});
