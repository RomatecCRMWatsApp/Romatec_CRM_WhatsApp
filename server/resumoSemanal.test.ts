import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { semanaAnterior, textoResumoSemanal } = await import('../shared/resumoSemanal');
const R = await import('./resumoSemanal');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Segunda, 09/11/2026, 09h em Brasília (12h UTC)
const SEGUNDA_9H = Date.parse('2026-11-09T12:00:00Z');
const t = (d: string) => `${d} 12:00:00`;

describe('resumo semanal: regras', () => {
  it('na segunda, pega a semana anterior (segunda a domingo) e marca a chave da semana', () => {
    expect(semanaAnterior(SEGUNDA_9H)).toMatchObject({ inicio: '2026-11-02', fim: '2026-11-08', chave: '2026-11-09', ehSegunda: true, horaBrasilia: 9 });
    // Domingo à noite em Brasília (segunda 01h UTC) ainda é domingo
    expect(semanaAnterior(Date.parse('2026-11-09T01:00:00Z'))).toMatchObject({ ehSegunda: false, chave: '2026-11-02' });
  });
  it('texto do WhatsApp: números da semana, atraso e equipe, sem linha vazia de licença', () => {
    const txt = textoResumoSemanal({
      inicio: '2026-11-02', fim: '2026-11-08',
      leads: { novos: 12, quentes: 3, semResponsavel: 2, porOrigem: [{ origem: 'instagram_ads', n: 8 }, { origem: 'whatsapp', n: 4 }] },
      visitas: { realizadas: 5, proximas7dias: 2 },
      vendas: { contratos: 2, chacaras: ['B13', 'C04'], cancelados: 0, reservadasAgora: 3 },
      dinheiro: { recebido: 17234.51, vencidoTotal: 2469.02, parcelasVencidas: 2, clientesEmAtraso: 1, vencendo7dias: 4 },
      equipe: { ativos: 6, usando: 4, parados: ['Rita Modelo', 'Paulo Teste'], maisMateriais: [{ nome: 'Carla', n: 9 }] },
      licencas: { vencendo7dias: [], bloqueados: 0, pedidosPendentes: 0 },
    }, 'José');
    expect(txt).toContain('02/11 a 08/11');
    expect(txt).toContain('*Leads:* 12 novos, 3 quentes');
    expect(txt).toContain('anúncio Instagram 8 · WhatsApp 4');
    expect(txt).toContain('2 leads aguardando corretor');
    expect(txt).toContain('2 contratos novos (B13, C04)');
    expect(txt).toMatch(/R\$\s17\.234,51/);
    expect(txt).toContain('em 2 parcelas (1 cliente)');
    expect(txt).toContain('4 de 6 corretores ativos');
    expect(txt).toContain('Parados: Rita Modelo, Paulo Teste');
    expect(txt).not.toContain('Licenças');
  });
});

describe('resumo semanal: banco e envio', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo, telefone) VALUES (1, 'a', 'José Admin', 'admin', NULL, 1, '99991811246'), (2, 's', 'Sara', 'user', 'secretario', 1, '99900000002')`);
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
    db.run(sql`INSERT INTO leadQualifications (phone, nome, score, origem, createdAt, updatedAt) VALUES
      ('5599900000010', 'Lead A', 'quente', 'instagram_ads', ${t('2026-11-03')}, ${t('2026-11-03')}),
      ('5599900000011', 'Lead B', 'frio', 'whatsapp', ${t('2026-11-05')}, ${t('2026-11-05')}),
      ('5599900000012', 'Lead antigo', 'frio', 'whatsapp', ${t('2026-10-20')}, ${t('2026-10-20')})`);
    db.run(sql`INSERT INTO contratos (numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, codigoVerificacao, status, criadoEm) VALUES
      ('BJ-1', 1, 'B13', 1, '{}', '{}', 'AAAAAAAAAAAA', 'assinado', ${t('2026-11-04')})`);
    db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status, pagoEm, valorPago) VALUES
      (1, 'entrada', 1, 1, '2026-11-04', '8000.00', 'paga', '2026-11-04', '8000.00'),
      (1, 'saldo', 1, 120, '2026-11-01', '1234.51', 'vencida', NULL, NULL),
      (1, 'saldo', 2, 120, '2026-11-12', '1234.51', 'emitida', NULL, NULL)`);
  });

  it('junta os números da semana certa', async () => {
    const d = await R.dadosDaSemana('2026-11-02', '2026-11-08', SEGUNDA_9H);
    expect(d.leads).toMatchObject({ novos: 2, quentes: 1 });
    expect(d.vendas).toMatchObject({ contratos: 1, chacaras: ['B13'] });
    expect(d.dinheiro).toMatchObject({ recebido: 8000, parcelasVencidas: 1, vencidoTotal: 1234.51, clientesEmAtraso: 1, vencendo7dias: 1 });
  });

  it('manda só para o administrador, só na segunda a partir das 8h e uma vez por semana', async () => {
    const enviados: [string, string][] = [];
    const enviar = async (tel: string, txt: string) => { enviados.push([tel, txt]); };
    expect(await R.rotinaResumoSemanal(Date.parse('2026-11-09T10:00:00Z'), enviar)).toMatchObject({ enviado: false, motivo: 'fora do horário' }); // 7h
    const r = await R.rotinaResumoSemanal(SEGUNDA_9H, enviar);
    expect(r.enviado).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0][0]).toBe('5599991811246');
    expect(enviados[0][1]).toContain('Bom dia, José!');
    expect(await R.rotinaResumoSemanal(SEGUNDA_9H + 3600_000, enviar)).toMatchObject({ enviado: false, motivo: 'já enviado' });
    expect(enviados).toHaveLength(1);
  });

  it('desligado não manda', async () => {
    await R.definirResumoLigado(false, 1);
    const { limparCacheConfig } = await import('./configSistema');
    limparCacheConfig();
    expect(await R.rotinaResumoSemanal(SEGUNDA_9H + 7 * 86_400_000, async () => {})).toMatchObject({ enviado: false, motivo: 'desligado' });
  });
});
