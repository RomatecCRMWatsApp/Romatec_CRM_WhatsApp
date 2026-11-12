import { describe, expect, it } from 'vitest';
import { calcularVencimentos, mesSugerido } from './financeiro/vencimentos';

const mes = (ini: string, k: number) => { const [a, m] = ini.split('-').map(Number); const t = a * 12 + m - 1 + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-10`; };
const linhas = [
  { id: 1, tipo: 'entrada', numero: 1, total: 1, vencimento: '2026-12-10', status: 'paga' },
  ...Array.from({ length: 120 }, (_, i) => ({ id: 100 + i, tipo: 'saldo', numero: i + 1, total: 120, vencimento: mes('2027-01', i), status: 'prevista' })),
  ...Array.from({ length: 36 }, (_, i) => ({ id: 300 + i, tipo: 'complemento', numero: i + 1, total: 36, vencimento: mes('2028-03', i), status: 'prevista' })),
];

describe('dia de vencimento escolhido pelo comprador', () => {
  it('entrada paga em novembro → 1ª parcela em dezembro, dia 25; complemento congelado anda junto', () => {
    expect(mesSugerido('2026-11-12', '2026-11-12')).toBe('2026-12');
    const r = calcularVencimentos(linhas, 25, '2026-12');
    expect(r).toHaveLength(156);
    const saldo = r.filter(x => x.tipo === 'saldo'), comp = r.filter(x => x.tipo === 'complemento');
    expect(saldo[0]).toMatchObject({ numero: 1, de: '2027-01-10', para: '2026-12-25' });
    expect(saldo[119].para).toBe('2036-11-25');
    expect(comp[0]).toMatchObject({ numero: 1, de: '2028-03-10', para: '2028-02-25' });
    expect(r.every(x => x.para.endsWith('-25'))).toBe(true);
  });
  it('dia 31 em mês curto vira o último dia; emitidas e pagas não mudam', () => {
    const l = linhas.map(x => (x.id === 101 ? { ...x, status: 'emitida' } : x));
    const r = calcularVencimentos(l, 31, '2026-12');
    expect(r.find(x => x.id === 101)).toBeUndefined();
    expect(r.find(x => x.tipo === 'saldo' && x.numero === 3)!.para).toBe('2027-02-28');
  });
});
