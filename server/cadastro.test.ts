import { describe, expect, it } from 'vitest';
import { cpfValido, formatarCpf, pendenciasIntermediador, podeGerirCadastroDe, problemaDocumento, situacaoCertidao } from '../shared/cadastro';
import { montarIntermediador } from './contratoIntermediador';

const HOJE = new Date('2026-10-23T12:00:00');
const COMPLETO = {
  id: 9, name: 'Maria da Silva', creci: '1234', creciUf: 'MA', cpf: '52998224725', rg: '123456', rgOrgao: 'SSP/MA',
  nacionalidade: 'brasileira', estadoCivil: 'casado(a)', enderecoLogradouro: 'Rua São Raimundo', enderecoNumero: '10',
  enderecoBairro: 'Centro', enderecoCidade: 'Açailândia', enderecoUf: 'MA', enderecoCep: '65930000',
  telefone: '99991811246', email: 'maria@x.com', certidaoCreciValidade: '2027-03-31',
};

describe('cadastro — CPF e documentos', () => {
  it('CPF: dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
  });

  it('certidão do CRECI: ausente, vencida, vencendo e em dia', () => {
    expect(situacaoCertidao('2027-03-31', false, HOJE)).toBe('ausente');
    expect(situacaoCertidao(null, true, HOJE)).toBe('ausente');
    expect(situacaoCertidao('2026-10-22', true, HOJE)).toBe('vencida');
    expect(situacaoCertidao('2026-10-23', true, HOJE)).toBe('vencendo');
    expect(situacaoCertidao('2027-03-31', true, HOJE)).toBe('ok');
  });

  it('documento: PDF/imagem até 10 MB; certidão exige validade', () => {
    expect(problemaDocumento('rg', 'application/pdf', 1000)).toBeNull();
    expect(problemaDocumento('rg', 'application/zip', 1000)).toMatch(/PDF/);
    expect(problemaDocumento('rg', 'image/png', 11 * 1024 * 1024)).toMatch(/10 MB/);
    expect(problemaDocumento('certidao_creci', 'application/pdf', 1000)).toMatch(/validade/);
    expect(problemaDocumento('certidao_creci', 'application/pdf', 1000, '2027-03-31')).toBeNull();
    expect(problemaDocumento('xpto', 'application/pdf', 1000)).toMatch(/inválido/);
  });

  it('documentos e foto: só o admin ou o próprio usuário', () => {
    expect(podeGerirCadastroDe({ id: 1, role: 'admin' }, 9)).toBe(true);
    expect(podeGerirCadastroDe({ id: 9, role: 'user' }, 9)).toBe(true);
    expect(podeGerirCadastroDe({ id: 5, role: 'user' }, 9)).toBe(false);
    expect(podeGerirCadastroDe(null, 9)).toBe(false);
  });
});

describe('contrato — corretor como intermediador', () => {
  it('cadastro completo + certidão em dia = apto, com qualificação pronta', () => {
    const r = montarIntermediador(COMPLETO, { id: 77 }, HOJE);
    expect(r.apto).toBe(true);
    expect(r.certidao).toEqual({ situacao: 'ok', validade: '2027-03-31', documentoId: 77 });
    expect(r.qualificacao).toBe('MARIA DA SILVA, brasileira, casado(a), corretor de imóveis, CRECI/MA nº 1234, CPF 529.982.247-25, RG 123456 SSP/MA, residente na Rua São Raimundo, nº 10, Centro, Açailândia/MA, CEP 65930-000');
  });

  it('sem certidão, vencida ou dados faltando: não apto, com a lista de pendências', () => {
    expect(montarIntermediador(COMPLETO, null, HOJE).pendencias).toEqual(['certidão de quitação do CRECI']);
    expect(montarIntermediador({ ...COMPLETO, certidaoCreciValidade: '2026-01-01' }, { id: 1 }, HOJE).pendencias).toEqual(['certidão do CRECI dentro da validade']);
    const r = montarIntermediador({ ...COMPLETO, cpf: null, enderecoCep: '' }, { id: 1 }, HOJE);
    expect(r.apto).toBe(false);
    expect(r.pendencias).toEqual(['CPF', 'CEP']);
    expect(pendenciasIntermediador({ ...r.dados, cpf: '11111111111' }, 'ok')).toContain('CPF válido');
  });
});
