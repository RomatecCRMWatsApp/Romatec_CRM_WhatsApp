import { describe, expect, it } from 'vitest';
import { cpfValido, formatarCpf, pendenciasCredenciais, podeGerirCadastroDe, problemaArquivo, statusValidade } from '../shared/cadastro';
import { isValidCPF, maskCPF, maskRG } from '../shared/masks';
import { qualificacao } from '../shared/qualificacao';
import { cadastroSchema, errosPorCampo } from './cadastroUsuario';
import { credenciaisParaAnexar, mensagemAlerta, precisaAlerta } from './credenciais';
import { montarIntermediador } from './contratoIntermediador';
import { sessaoValida } from './_core/sdk';

const HOJE = new Date('2026-10-23T12:00:00');
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

const END = { logradouro: 'Rua São Raimundo', numero: '10', bairro: 'Centro', cidade: 'Açailândia', uf: 'MA', cep: '65930000' };
const MARIA = { nome: 'Maria da Silva', sexo: 'F' as const, nacionalidade: 'brasileira' as const, profissao: 'Corretora de imóveis', cpf: '52998224725', rg: '123456', rgOrgao: 'SSP/MA' };

const CADASTRO = {
  nome: 'Maria da Silva', sexo: 'F', cpf: '529.982.247-25', rg: '12.345-6', rgOrgao: 'SSP/MA', nacionalidade: 'brasileira',
  profissao: 'corretora de imóveis', email: 'Maria@X.com', telefone: '(99) 99181-1246', perfil: 'corretor', creci: '4705', creciUf: 'MA',
  estadoCivil: 'solteiro', enderecoCep: '65930-000', enderecoLogradouro: 'Rua São Raimundo', enderecoNumero: '10',
  enderecoBairro: 'Centro', enderecoCidade: 'Açailândia', enderecoUf: 'ma',
};

describe('máscaras', () => {
  it('CPF e RG', () => {
    expect(maskCPF('01209185369')).toBe('012.091.853-69');
    expect(isValidCPF('01209185369')).toBe(true);
    expect(maskRG('143685920001')).toBe('14.368.592.000-1');
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
  });
});

describe('cadastro — validação', () => {
  it('normaliza e aceita o cadastro completo', () => {
    const r = cadastroSchema.parse(CADASTRO);
    expect(r).toMatchObject({ cpf: '52998224725', rg: '123456', email: 'maria@x.com', telefone: '99991811246', enderecoCep: '65930000', enderecoUf: 'MA', profissao: 'Corretora de imóveis' });
  });

  it('erros por campo: CPF inválido, CRECI do corretor, cônjuge e regime', () => {
    const r = cadastroSchema.safeParse({ ...CADASTRO, cpf: '52998224724', creci: '', estadoCivil: 'casado' });
    expect(r.success).toBe(false);
    const campos = errosPorCampo((r as any).error);
    expect(campos.cpf).toBe('CPF inválido');
    expect(campos.creci).toMatch(/CRECI/);
    expect(campos.conjuge).toMatch(/cônjuge/);
    const c = cadastroSchema.safeParse({ ...CADASTRO, estadoCivil: 'casado', conjuge: { ...MARIA, nome: 'João de Souza', sexo: 'M', cpf: '01209185369' } });
    expect(errosPorCampo((c as any).error)['conjuge.regimeBens']).toMatch(/regime/);
  });

  it('estrangeiro precisa de país e RNM/passaporte', () => {
    const r = cadastroSchema.safeParse({ ...CADASTRO, nacionalidade: 'estrangeira', rg: '' });
    const campos = errosPorCampo((r as any).error);
    expect(campos.paisOrigem).toBeTruthy();
    expect(campos.docEstrangeiroNumero).toBeTruthy();
  });
});

describe('qualificação', () => {
  it('solteira, com selo do CRECI e CNAI', () => {
    const q = qualificacao({ ...MARIA, estadoCivil: 'solteiro', creci: '4705', creciUf: 'MA' }, END, null, { linkVerificacaoCreci: 'https://crecima.gov.br/v/1', cnai: '12345' });
    expect(q).toBe('**MARIA DA SILVA**, brasileira, solteira, corretora de imóveis, inscrita no CPF sob o nº 529.982.247-25, portadora do RG nº 12.345-6 SSP/MA, '
      + 'CRECI/MA 4.705 (✓ CRECI regular — verificar em https://crecima.gov.br/v/1), Avaliador Imobiliário CNAI nº 12345, '
      + 'residente e domiciliada na Rua São Raimundo, nº 10, Bairro Centro, Açailândia/MA, CEP 65.930-000.');
  });

  it('casado: regime, cônjuge e "residentes" no mesmo endereço', () => {
    const q = qualificacao({ ...MARIA, nome: 'José Pinto', sexo: 'M', profissao: 'Empresário', estadoCivil: 'casado' }, END,
      { ...MARIA, regimeBens: 'comunhao_parcial', mesmoEndereco: true });
    expect(q).toContain('**JOSÉ PINTO**, brasileiro, casado sob o regime da comunhão parcial de bens com **MARIA DA SILVA**, brasileira');
    expect(q).toContain('residentes e domiciliados na Rua São Raimundo');
  });
});

describe('credenciais', () => {
  it('validade: vencida, a vencer, válida', () => {
    expect(statusValidade('2026-10-22', 5, HOJE)).toEqual({ status: 'vencida', dias: -1 });
    expect(statusValidade('2026-10-28', 5, HOJE)).toEqual({ status: 'a_vencer', dias: 5 });
    expect(statusValidade('2026-12-31', 5, HOJE).status).toBe('valida');
    expect(statusValidade(null, 5, HOJE).status).toBe('sem_validade');
  });

  it('arquivo: 415 formato, 413 tamanho, 400 tipo', () => {
    expect(problemaArquivo('rg', PDF)).toBeNull();
    expect(problemaArquivo('rg', new Uint8Array([1, 2, 3, 4]))?.status).toBe(415);
    const grande = new Uint8Array(10 * 1024 * 1024 + 1); grande.set(PDF);
    expect(problemaArquivo('rg', grande)?.status).toBe(413);
    expect(problemaArquivo('xpto', PDF)?.status).toBe(400);
  });

  it('alerta: certidão ≤ 5 dias, cartão ≤ 30, a cada 2 dias', () => {
    expect(precisaAlerta({ tipo: 'certidao_creci', validade: '2026-10-27' }, undefined, HOJE)).toBe(true);
    expect(precisaAlerta({ tipo: 'certidao_creci', validade: '2026-11-10' }, undefined, HOJE)).toBe(false);
    expect(precisaAlerta({ tipo: 'cartao_creci', validade: '2026-11-10' }, undefined, HOJE)).toBe(true);
    expect(precisaAlerta({ tipo: 'cartao_creci', validade: '2026-11-10', alertaEnviadoEm: '2026-10-22' }, undefined, HOJE)).toBe(false);
    expect(precisaAlerta({ tipo: 'cartao_creci', validade: '2026-11-10', alertaEnviadoEm: '2026-10-21' }, undefined, HOJE)).toBe(true);
    expect(precisaAlerta({ tipo: 'rg', validade: '2026-10-24' }, undefined, HOJE)).toBe(false);
    expect(mensagemAlerta('Maria Silva', 'certidao_creci', '2026-10-27', 'https://x', HOJE)).toMatch(/^Olá, Maria! Sua Certidão .* vence em 27\/10\/2026/);
  });

  it('anexar: cartão, certidão, CNAI nessa ordem; certidão vencida fica de fora', () => {
    const docs = [
      { tipo: 'certificado_cnai', anexarDocumentos: true },
      { tipo: 'certidao_creci', validade: '2026-10-22', anexarDocumentos: true },
      { tipo: 'cartao_creci', anexarDocumentos: 1 },
      { tipo: 'rg', anexarDocumentos: true },
    ];
    const r = credenciaisParaAnexar(docs, HOJE);
    expect(r.anexar.map(d => d.tipo)).toEqual(['cartao_creci', 'certificado_cnai']);
    expect(r.avisos).toEqual(['Certidão CRECI vencida — não anexada']);
  });

  it('pendências: só corretor; cartão ausente/vencido, certidão a vencer', () => {
    expect(pendenciasCredenciais('secretario', [], undefined, HOJE)).toEqual([]);
    expect(pendenciasCredenciais('corretor', [], undefined, HOJE)).toEqual(['Cartão CRECI ausente']);
    expect(pendenciasCredenciais('corretor', [{ tipo: 'cartao_creci', validade: '2026-01-01' }, { tipo: 'certidao_creci', validade: '2026-10-25' }], undefined, HOJE))
      .toEqual(['Cartão CRECI vencido', 'Certidão CRECI a vencer']);
  });

  it('documentos e foto: só o admin ou o próprio usuário', () => {
    expect(podeGerirCadastroDe({ id: 1, role: 'admin' }, 9)).toBe(true);
    expect(podeGerirCadastroDe({ id: 9, role: 'user' }, 9)).toBe(true);
    expect(podeGerirCadastroDe({ id: 5, role: 'user' }, 9)).toBe(false);
    expect(podeGerirCadastroDe(null, 9)).toBe(false);
  });
});

describe('contrato — corretor como intermediador', () => {
  const U = {
    id: 9, name: 'Maria da Silva', sexo: 'F', creci: '4705', creciUf: 'MA', cpf: '52998224725', rg: '123456', rgOrgao: 'SSP/MA',
    nacionalidade: 'brasileira', estadoCivil: 'solteiro', profissao: 'Corretora de imóveis', enderecoLogradouro: 'Rua São Raimundo', enderecoNumero: '10',
    enderecoBairro: 'Centro', enderecoCidade: 'Açailândia', enderecoUf: 'MA', enderecoCep: '65930000',
  };
  const CARTAO = { tipo: 'cartao_creci', validade: '2027-03-31', linkVerificacao: 'https://crecima.gov.br/v/1', anexarDocumentos: true };

  it('cadastro completo + cartão em dia = apto, com selo na qualificação', () => {
    const r = montarIntermediador(U, null, [CARTAO], HOJE);
    expect(r.apto).toBe(true);
    expect(r.qualificacao).toContain('✓ CRECI regular');
  });

  it('dados faltando, sem cartão ou casado sem cônjuge: não apto', () => {
    expect(montarIntermediador(U, null, [], HOJE).pendencias).toEqual(['Cartão CRECI ausente']);
    const r = montarIntermediador({ ...U, cpf: null, estadoCivil: 'casado' }, null, [CARTAO], HOJE);
    expect(r.apto).toBe(false);
    expect(r.pendencias).toEqual(['CPF', 'Dados do cônjuge/companheiro(a)']);
  });
});

describe('sessão', () => {
  it('troca de perfil (sessaoVersao) encerra o token antigo', () => {
    expect(sessaoValida(undefined, 0)).toBe(true);
    expect(sessaoValida(undefined, null)).toBe(true);
    expect(sessaoValida(1, 1)).toBe(true);
    expect(sessaoValida(0, 1)).toBe(false);
  });
});
