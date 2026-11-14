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
