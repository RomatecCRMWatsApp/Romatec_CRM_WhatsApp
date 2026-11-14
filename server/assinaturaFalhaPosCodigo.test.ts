import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const A = await import('./assinatura/servico');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Falha depois do código aceito (ex.: PDF indisponível): o código volta a valer e o erro fica na trilha. Dados fictícios.
let db: any;
const msgs: string[] = [];
const TOKEN = 'T'.repeat(43);

beforeAll(async () => {
  db = await getDb();
  A.definirEnviador(async (_t, m) => { msgs.push(m); });
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Teste')`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', '{}')`);
  // Contrato em assinatura sem o PDF atual: o carimbo falha depois de conferir o código
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, status, simulacaoJson, dadosJson, codigoVerificacao) VALUES (1, 'BJ-2026-0099', 1, 0, 'A01', 1, 'em_assinatura', '{}', '{}', 'COD1')`);
  db.run(sql`INSERT INTO assinaturaSignatarios (id, contratoId, papel, nome, cpf, whatsapp, metodo, ordem, status, token) VALUES (1, 1, 'comprador', 'Pedro Ficticio', '52998224725', '5599988887777', 'avancada', 1, 'convidado', ${TOKEN})`);
});

describe('assinatura avançada: falha depois do código aceito', () => {
  it('o código continua valendo, a pessoa vê uma mensagem clara e o erro aparece na trilha', async () => {
    await A.solicitarOtp(TOKEN);
    const codigo = msgs.at(-1)!.match(/(\d{6})/)![1];
    const ok = { ip: '1.2.3.4', ua: 'teste', leuAteOFim: true, aceite: true };
    await expect(A.confirmarAvancada(TOKEN, codigo, ok)).rejects.toThrow(/sem PDF|Arquivo do contrato/i);
    // código restaurado: a próxima tentativa não cai em "peça o código primeiro"
    expect(db.all(sql`SELECT * FROM assinaturaOtp WHERE signatarioId = 1`)).toHaveLength(1);
    const ev = db.all(sql`SELECT detalhe FROM assinaturaEventos WHERE contratoId = 1 AND evento = 'erro'`);
    expect(ev).toHaveLength(1);
    expect(String(ev[0].detalhe)).toMatch(/assinar/);
    await expect(A.confirmarAvancada(TOKEN, codigo, ok)).rejects.not.toThrow(/Peça o código/);
    expect(db.all(sql`SELECT status FROM assinaturaSignatarios WHERE id = 1`)[0].status).not.toBe('assinado');
  });
});

describe('assinatura avançada: posição gravada numa página que não existe mais (erro "Página da caixa de assinatura inexistente")', () => {
  it('assina mesmo assim: descarta a caixa inválida, procura o traço de novo e registra o ajuste na trilha', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const pg = doc.addPage([595, 842]);
    const f = await doc.embedFont(StandardFonts.Helvetica);
    pg.drawText('Contrato de teste — uma página só', { x: 50, y: 780, size: 12, font: f });
    pg.drawText('_'.repeat(40), { x: 150, y: 300, size: 8, font: f });
    pg.drawText('Ana Ficticia Compradora', { x: 160, y: 288, size: 9, font: f });
    const pdf = Buffer.from(await doc.save());
    const { salvarArquivo } = await import('./contratos/arquivos');
    await salvarArquivo('contratos/2/v001-para_assinatura.pdf', pdf);
    const T2 = 'U'.repeat(43);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, status, simulacaoJson, dadosJson, codigoVerificacao, pdfAtual) VALUES (2, 'BJ-2026-0098', 1, 0, 'A02', 1, 'em_assinatura', '{}', '{}', 'COD2', 'contratos/2/v001-para_assinatura.pdf')`);
    db.run(sql`INSERT INTO assinaturaSignatarios (id, contratoId, papel, nome, cpf, whatsapp, metodo, ordem, status, token) VALUES (2, 2, 'comprador', 'Ana Ficticia Compradora', '39053344705', '5599988886666', 'avancada', 1, 'convidado', ${T2}), (3, 2, 'vendedora', 'Vera Ficticia', '11144477735', '5599988885555', 'avancada', 2, 'convidado', ${'V'.repeat(43)})`);
    // Caixa gravada de um envio anterior, com o PDF de 42 páginas: página 41 não existe neste PDF
    db.run(sql`INSERT INTO assinaturaPosicoes (contratoId, papel, pagina, x, y, w, h) VALUES (2, 'comprador', 41, 0.2, 0.3, 0.4, 0.05)`);
    await A.solicitarOtp(T2);
    const codigo = msgs.at(-1)!.match(/(\d{6})/)![1];
    await A.confirmarAvancada(T2, codigo, { ip: '1.2.3.4', ua: 'teste', leuAteOFim: true, aceite: true });
    expect(db.all(sql`SELECT status FROM assinaturaSignatarios WHERE id = 2`)[0].status).toBe('assinado');
    expect(db.all(sql`SELECT * FROM assinaturaEventos WHERE contratoId = 2 AND evento = 'posicao_ajustada'`)).toHaveLength(1);
    expect(db.all(sql`SELECT * FROM assinaturaEventos WHERE contratoId = 2 AND evento = 'erro'`)).toHaveLength(0);
  });
});
