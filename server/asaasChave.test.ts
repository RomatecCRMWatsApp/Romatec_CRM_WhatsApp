import { describe, expect, it } from 'vitest';
import { chaveDoEmpreendimento, configAsaas, normalizarChave } from './financeiro/asaas';

describe('chave do Asaas como chega do painel', () => {
  it('aceita sem o "$" (o painel pode apagar "$aact_…"), tira quebras de linha e aspas', () => {
    expect(normalizarChave('aact_prod_000abc')).toBe('$aact_prod_000abc');
    expect(normalizarChave(' $aact_prod_000\nabc \n')).toBe('$aact_prod_000abc');
    expect(normalizarChave('"$aact_prod_000abc"')).toBe('$aact_prod_000abc');
    expect(normalizarChave('')).toBe('');
  });
  it('sem o "$" a chave de produção continua reconhecida como produção', () => {
    const env = { ASAAS_API_KEY_BOM_JARDIMS: 'aact_prod_000abc' } as any;
    expect(chaveDoEmpreendimento('bom-jardims', env)).toBe('$aact_prod_000abc');
    expect(configAsaas(env, 'bom-jardims')).toMatchObject({ ambiente: 'producao', baseUrl: 'https://api.asaas.com/v3' });
  });
});
