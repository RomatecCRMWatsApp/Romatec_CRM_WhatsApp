import { describe, it, expect } from 'vitest';
import { proximoPassoEm, novaTentativaEm, MAX_TENTATIVAS, proximoHorarioComercial } from './followup';
import { NIVEL_DA_ACAO } from './sla';
import { linhasAfetadas, situacao, mudancaDeAlerta, registrarRotina, rodarRotina, registrarEnvio, estadoRotinas, type EstadoRotina } from './rotinas';

const DIA = 24 * 3600_000;
const MIN = 60_000;
// 2026-10-19 é segunda-feira; 13h UTC = 10h em Açailândia
const seg10h = Date.UTC(2026, 9, 19, 13);

describe('Follow-up: próximo passo e nova tentativa', () => {
  it('o próximo passo conta a diferença da cadência a partir do envio real', () => {
    expect(proximoPassoEm(1, seg10h)).toBe(seg10h + 2 * DIA); // dia 1 → dia 3
    expect(proximoPassoEm(4, seg10h)).toBe(proximoHorarioComercial(seg10h + 16 * DIA)); // dia 14 → dia 30
    expect(proximoPassoEm(5, seg10h)).toBeNull(); // acabou
  });

  it('falhou: tenta de novo em 30 min, depois em 2 h, depois desiste do passo', () => {
    expect(MAX_TENTATIVAS).toBe(3);
    expect(novaTentativaEm(1, seg10h)).toBe(seg10h + 30 * MIN);
    expect(novaTentativaEm(2, seg10h)).toBe(seg10h + 2 * 3600_000);
    expect(novaTentativaEm(3, seg10h)).toBeNull();
  });

  it('nova tentativa fora do horário comercial espera a próxima janela', () => {
    const seg1845 = Date.UTC(2026, 9, 19, 21, 45); // 18h45 local
    expect(novaTentativaEm(1, seg1845)).toBe(Date.UTC(2026, 9, 20, 11)); // terça 8h
  });
});

describe('Proteção contra envio duplicado', () => {
  it('lê as linhas alteradas do MySQL e do SQLite', () => {
    expect(linhasAfetadas([{ affectedRows: 1 }, null])).toBe(1);
    expect(linhasAfetadas([{ affectedRows: 0 }])).toBe(0);
    expect(linhasAfetadas({ changes: 1 })).toBe(1);
    expect(linhasAfetadas(undefined)).toBe(0);
  });

  it('cada ação do alerta grava um nível diferente (a reserva compara o nível anterior)', () => {
    expect(NIVEL_DA_ACAO).toEqual({ lembrar: 1, repassar: 2, avisar_admin: 3 });
  });
});

describe('Vigia das rotinas', () => {
  const base = (p: Partial<EstadoRotina> = {}): EstadoRotina => ({ nome: 'followup', intervaloMs: 10 * MIN, iniciadaEm: seg10h, falhasSeguidas: 0, falhasEnvioSeguidas: 0, ...p });

  it('situação: ok, parada, falhando, sem envio', () => {
    expect(situacao(base({ ultimoSucesso: seg10h }), seg10h + 20 * MIN)).toBe('ok');
    expect(situacao(base({ ultimoSucesso: seg10h }), seg10h + 31 * MIN)).toBe('parada');
    expect(situacao(base(), seg10h + 31 * MIN)).toBe('parada'); // nunca rodou com sucesso
    expect(situacao(base({ ultimoSucesso: seg10h, falhasSeguidas: 3 }), seg10h)).toBe('falhando');
    expect(situacao(base({ ultimoSucesso: seg10h, falhasEnvioSeguidas: 3 }), seg10h)).toBe('sem_envio');
    expect(situacao(base({ ultimoSucesso: seg10h, falhasEnvioSeguidas: 2 }), seg10h)).toBe('ok');
  });

  it('avisa uma vez quando quebra e uma vez quando volta', () => {
    const e = base({ ultimoSucesso: seg10h, falhasEnvioSeguidas: 3, ultimoErroEnvio: 'Z-API 401' });
    const m = mudancaDeAlerta(e, seg10h)!;
    expect(m.nova).toBe('sem_envio');
    expect(m.texto).toContain('Follow-up automático');
    expect(m.texto).toContain('Z-API 401');
    e.alertada = m.nova;
    expect(mudancaDeAlerta(e, seg10h)).toBeNull(); // não repete
    e.falhasEnvioSeguidas = 0;
    expect(mudancaDeAlerta(e, seg10h)?.texto).toContain('voltou a funcionar');
    expect(mudancaDeAlerta(base({ ultimoSucesso: seg10h }), seg10h)).toBeNull(); // ok desde sempre: silêncio
  });

  it('rodada com erro conta falha; sucesso zera; envio falho conta à parte; estado sem dados de lead', async () => {
    registrarRotina('teste', 60_000);
    await rodarRotina('teste', async () => { throw new Error('banco fora'); });
    let r = estadoRotinas().rotinas.find(x => x.nome === 'teste')!;
    expect(r.ultimoErro).toBe('banco fora');
    await rodarRotina('teste', async () => 0);
    registrarEnvio('teste', false, 'timeout');
    r = estadoRotinas().rotinas.find(x => x.nome === 'teste')!;
    expect(r.situacao).toBe('ok');
    expect(r.ultimoErro).toBe('timeout');
    expect(Object.keys(r).sort()).toEqual(['nome', 'rotulo', 'situacao', 'ultimaRodada', 'ultimoErro', 'ultimoSucesso']);
  });
});
