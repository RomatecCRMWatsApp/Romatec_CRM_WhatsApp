import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { SEED_EMP_JURIDICO } from './_core/migrations/seedContratos';
import { cnpjValido, pendenciasComprador } from '../shared/contratos';
import { tagsPessoas, type PessoaContrato } from './contratos/contexto';

// Comprador empresa (PJ) com sócios que assinam por ela. Dados fictícios.
const EMPRESA: PessoaContrato = {
  tipo: 'PJ', nome: 'Agro Ficticia Ltda', cpfCnpj: '11222333000181', email: 'contato@exemplo.com', telefone1: '(99) 9 9900-0001',
  logradouro: 'Rua das Flores', numero: '10', bairro: 'Centro', cidade: 'Açailândia', uf: 'MA', cep: '65930000',
  socios: [{ nome: 'Ana Socia Ficticia', cpfCnpj: '52998224725', telefone1: '(99) 9 9900-0002' }, { nome: 'Bruno Socio Ficticio', cpfCnpj: '39053344705', telefone1: '(99) 9 9900-0003' }],
};

describe('comprador empresa com sócios', () => {
  it('valida CNPJ, sede e sócios (nome, CPF, WhatsApp, sem CPF repetido)', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    const ok = { tipo: 'PJ' as const, nome: 'Agro Ficticia Ltda', cpf: '11.222.333/0001-81', telefone1: '(99) 9 9900-0001', logradouro: 'Rua A', cidade: 'Açailândia', uf: 'MA',
      socios: [{ nome: 'Ana Socia Ficticia', cpf: '529.982.247-25', telefone1: '(99) 9 9900-0002' }] };
    expect(pendenciasComprador(ok as any)).toEqual({});
    const ruim = pendenciasComprador({ ...ok, cpf: '123', socios: [{ nome: 'Ana', cpf: '1', telefone1: '' }] } as any);
    expect(Object.keys(ruim).sort()).toEqual(['comprador.cpf', 'socio.0.cpf', 'socio.0.nome', 'socio.0.telefone1']);
    expect(pendenciasComprador({ ...ok, socios: [] } as any)['comprador.socios']).toBeTruthy();
    expect(pendenciasComprador({ ...ok, socios: [ok.socios[0], ok.socios[0]] } as any)['comprador.socios']).toMatch(/mesmo CPF/);
  });

  it('qualificação PJ com CNPJ, sede e sócios; sem cônjuge', () => {
    const t = tagsPessoas(EMPRESA);
    expect(t.comp_pj).toBe(true);
    expect(t.comp_pf).toBe(false);
    expect(t.comp_casado).toBe(false);
    expect(t.comp_doc_rotulo).toBe('CNPJ');
    expect(t.comp_cpf).toBe('11.222.333/0001-81');
    expect(String(t.comp_qualificacao_pj)).toMatch(/pessoa jurídica de direito privado, inscrita no CNPJ sob o n\.º 11\.222\.333\/0001-81/);
    expect(String(t.comp_qualificacao_pj)).toContain('ANA SOCIA FICTICIA');
    expect(String(t.comp_qualificacao_pj)).toContain('BRUNO SOCIO FICTICIO');
    expect(t.comp_socios).toHaveLength(2);
  });

  it('CPCV mostra a empresa e uma linha de assinatura por sócio', async () => {
    const { mergeDocx } = await import('./contratos/render');
    const ctx = { ...SEED_EMP_JURIDICO.defaults, ctr_parcelas_minimas_obra: '3', ...tagsPessoas(EMPRESA) } as any;
    const docx = await mergeDocx('MODELO-CPCV-BOM-JARDIMS-v3.docx', ctx, { minuta: false, marca: 'bomjardims' });
    const t = new PizZip(docx).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');
    expect(t).toContain('PROMISSÁRIA COMPRADORA: AGRO FICTICIA LTDA');
    expect(t).toContain('PROMISSÁRIA COMPRADORA — CNPJ 11.222.333/0001-81');
    expect(t.match(/ASSINA PELA COMPRADORA/g)).toHaveLength(2);
    expect(t).toContain('ANA SOCIA FICTICIA');
    expect(t).not.toMatch(/\{\{|comp_socios|comp_pj/);
  });

  it('pessoa física continua igual', () => {
    const t = tagsPessoas({ nome: 'Paulo Comprador Ficticio', cpfCnpj: '52998224725', estadoCivil: 'solteiro' });
    expect(t.comp_pf).toBe(true);
    expect(t.comp_pj).toBe(false);
    expect(t.comp_doc_rotulo).toBe('CPF');
  });
});
