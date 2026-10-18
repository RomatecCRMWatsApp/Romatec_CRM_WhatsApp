import { describe, it, expect } from 'vitest';
import { crmRouter } from './crm.router';
import { DATA_ISO } from '../leads/relatorio';

// Regressão: o padrão de data perdeu as barras invertidas (/^d{4}-.../) e o relatório recusava qualquer período
describe('crm.relatorio — filtro de período', () => {
  const input = (crmRouter as any)._def.procedures.relatorio._def.inputs[0];

  it('aceita as datas do input type="date"', () => {
    expect(input.parse({ de: '2026-09-18', ate: '2026-10-17', toque: 'primeiro' })).toEqual({ de: '2026-09-18', ate: '2026-10-17', toque: 'primeiro' });
    expect(input.parse({})).toEqual({ toque: 'primeiro' });
  });

  it('recusa data em outro formato', () => {
    expect(() => input.parse({ de: '18/09/2026' })).toThrow();
    expect(() => input.parse({ de: 'dddd-dd-dd' })).toThrow();
    expect(DATA_ISO.test('2026-10-17')).toBe(true);
  });
});
