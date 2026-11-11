import { describe, expect, it } from 'vitest';
import { avaliarGate } from './contratos/gate';
import { tagsRegistro } from './contratos/contexto';

const base = { emp_licenca_validade: '07/10/2030', corr_creci_validade: '01/01/2030', corr_certidao_validade: '01/01/2030', emp_matricula_origem: '33.036' };

describe('venda antes do registro do parcelamento', () => {
  it('sem liberação: o definitivo fica travado e a 2.2 declara o registro', () => {
    expect(avaliarGate({ ...base } as any, 'definitivo').bloqueios).toContain('Parcelamento não registrado (Lei 6.766/1979, art. 37)');
    expect(String(tagsRegistro({}).ctr_clausula_registro)).toMatch(/registrado no Registro de Imóveis/);
  });

  it('liberada pelo administrador: sem a trava; a 2.2 diz a situação real, o prazo e a devolução integral; campos faltantes viram "a informar por termo aditivo"', () => {
    const emp = { ...base, emp_venda_antes_registro: true, emp_registro_protocolo: '12.345', emp_registro_prazo_dias: 180 };
    const t = tagsRegistro(emp);
    const ctx = { ...emp, ...t } as any;
    expect(avaliarGate(ctx, 'definitivo').bloqueios.some(b => b.startsWith('Parcelamento'))).toBe(false);
    expect(avaliarGate(ctx, 'definitivo').bloqueios.some(b => b.startsWith('Matrícula de origem'))).toBe(false);
    const c = String(t.ctr_clausula_registro);
    expect(c).toMatch(/AINDA NÃO REGISTRADO/);
    expect(c).toMatch(/protocolo n\.º 12\.345/);
    expect(c).toMatch(/matriculado no Registro de Imóveis sob o n\.º 33\.036/);
    expect(c).toMatch(/em até 180 \(cento e oitenta\) dias/);
    expect(c).toMatch(/restituição integral e imediata de todos os valores pagos/);
    expect(t.emp_registro_parcelamento).toBe('em processo de registro (protocolo n.º 12.345)');
    expect(t.emp_registro_data).toBe('a informar por termo aditivo');
    expect(avaliarGate(ctx, 'definitivo').faltantes.filter(k => k.startsWith('emp_registro'))).toEqual([]);
  });

  it('registrado: vale a declaração do registro, mesmo com a liberação ligada', () => {
    expect(String(tagsRegistro({ emp_parcelamento_registrado: true, emp_venda_antes_registro: true }).ctr_clausula_registro)).toMatch(/registrado no Registro de Imóveis nos termos dos itens 5 e 6/);
  });
});
