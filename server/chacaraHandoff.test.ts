import { describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const B = await import('./bot-ai');
const SLA = await import('./leads/sla');
const { textoEncaminhamento } = await import('./leads/encaminhamento');

describe('robô: chácara vai na hora para o corretor', () => {
  it('reconhece a escolha de chácara (4, por nome, sítio) e não confunde com outros', () => {
    for (const m of ['4', ' 4 ', 'Chácara', 'chacara', 'quero uma chácara', 'sítio', '4 - chácara']) expect(B.escolheuChacara(m)).toBe(true);
    for (const m of ['1', 'casa', 'Apartamento', '3', '40 mil', '14']) expect(B.escolheuChacara(m)).toBe(false);
  });
  it('mensagem ao cliente: Bom Jardims, corretor agora, CRECI e sem preço', () => {
    const t = B.mensagemChacaraEncaminhada('Fernando');
    expect(t).toMatch(/Bom Jardims/);
    expect(t).toMatch(/corretor/);
    expect(t).toMatch(/CRECI\/MA 4\.705/);
    expect(t).not.toMatch(/R\$/);
  });
});

describe('confirmação de recebimento em 1 toque', () => {
  it('link assinado por encaminhamento; token de outro não vale', () => {
    const tk = SLA.tokenRecebido(42);
    expect(SLA.tokenRecebidoValido(42, tk)).toBe(true);
    expect(SLA.tokenRecebidoValido(43, tk)).toBe(false);
    expect(SLA.linkRecebido(42)).toMatch(/\/c\/42\/[0-9a-f]{20}$/);
  });
  it('aviso de encaminhamento leva o link de 1 toque quando há o encaminhamento', () => {
    const t = textoEncaminhamento({ leadId: 7, cliente: 'Ana', telefone: '5599911110000', porNome: 'Bia', encaminhamentoId: 42 });
    expect(t).toMatch(/Confirmar que recebi \(1 toque\): .*\/c\/42\//);
  });
});
