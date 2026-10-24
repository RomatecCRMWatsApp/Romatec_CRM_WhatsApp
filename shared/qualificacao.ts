/**
 * Qualificação da pessoa para contratos/procurações (texto gerado), com concordância de gênero,
 * cônjuge/companheiro(a), estrangeiro (RNM/passaporte), selo de regularidade do CRECI e CNAI.
 * Negrito em **markdown** nos nomes (o gerador de contrato converte).
 */
import { maskCPF, maskRG } from './masks';

export type Sexo = 'M' | 'F';

export interface PessoaQualif {
  nome: string;
  sexo: Sexo | null;
  nacionalidade: 'brasileira' | 'estrangeira' | null;
  paisOrigem?: string | null;
  docEstrangeiroTipo?: 'RNM' | 'PASSAPORTE' | string | null;
  docEstrangeiroNumero?: string | null;
  profissao: string | null;
  cpf: string | null;
  rg?: string | null;
  rgOrgao?: string | null;
  creci?: string | null;
  creciUf?: string | null;
}

export interface EnderecoQualif {
  logradouro: string | null; numero: string | null; complemento?: string | null;
  bairro: string | null; cidade: string | null; uf: string | null; cep: string | null;
}

export interface ConjugeQualif extends PessoaQualif {
  regimeBens?: string | null;
  mesmoEndereco: boolean;
  endereco?: EnderecoQualif | null;
}

/** Selo do Cartão CRECI (link de verificação) e CNAI exibido no perfil */
export interface CredenciaisQualif {
  linkVerificacaoCreci?: string | null;
  cnai?: string | null;
}

const g = (s: Sexo | null, m: string, f: string) => (s === 'F' ? f : m);

const REGIME: Record<string, string> = {
  comunhao_parcial: 'da comunhão parcial de bens',
  comunhao_universal: 'da comunhão universal de bens',
  separacao_total: 'da separação total de bens',
  separacao_obrigatoria: 'da separação obrigatória de bens',
  participacao_aquestos: 'da participação final nos aquestos',
};

function nacionalidade(p: PessoaQualif): string {
  if (p.nacionalidade !== 'estrangeira') return g(p.sexo, 'brasileiro', 'brasileira');
  return `${g(p.sexo, 'estrangeiro', 'estrangeira')}${p.paisOrigem ? ` (${p.paisOrigem})` : ''}`;
}

/** "4705" → "4.705" (CRECI como no cartão) */
const creciFmt = (c: string) => (/^\d+$/.test(c) ? Number(c).toLocaleString('pt-BR') : c);

function docs(p: PessoaQualif, cred?: CredenciaisQualif): string {
  const parts: string[] = [];
  if (p.cpf) parts.push(`${g(p.sexo, 'inscrito', 'inscrita')} no CPF sob o nº ${maskCPF(p.cpf)}`);
  if (p.nacionalidade === 'estrangeira' && p.docEstrangeiroNumero) {
    parts.push(`${g(p.sexo, 'portador', 'portadora')} do ${p.docEstrangeiroTipo === 'PASSAPORTE' ? 'Passaporte' : 'RNM'} nº ${p.docEstrangeiroNumero}`);
  } else if (p.rg) {
    parts.push(`${g(p.sexo, 'portador', 'portadora')} do RG nº ${maskRG(p.rg)}${p.rgOrgao ? ` ${p.rgOrgao}` : ''}`);
  }
  if (p.creci) {
    const selo = cred?.linkVerificacaoCreci ? ` (✓ CRECI regular — verificar em ${cred.linkVerificacaoCreci})` : '';
    parts.push(`CRECI/${p.creciUf || 'MA'} ${creciFmt(p.creci)}${selo}`);
  }
  if (cred?.cnai) parts.push(`Avaliador Imobiliário CNAI nº ${cred.cnai}`);
  return parts.join(', ');
}

export function enderecoTexto(e: EnderecoQualif): string {
  const cep = String(e.cep || '').replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3');
  return [
    `${e.logradouro || ''}${e.numero ? `, nº ${e.numero}` : ''}${e.complemento ? `, ${e.complemento}` : ''}`,
    e.bairro ? `Bairro ${e.bairro}` : '',
    [e.cidade, e.uf].filter(Boolean).join('/'),
    cep ? `CEP ${cep}` : '',
  ].filter(Boolean).join(', ');
}

const CIVIL: Record<string, [string, string]> = {
  solteiro: ['solteiro', 'solteira'], separado: ['separado judicialmente', 'separada judicialmente'],
  divorciado: ['divorciado', 'divorciada'], viuvo: ['viúvo', 'viúva'],
};

const prof = (p: PessoaQualif) => (p.profissao ? p.profissao.toLowerCase() : '');

/**
 * Ex.: **JOSÉ ROMÁRIO PINTO BEZERRA**, brasileiro, casado sob o regime da comunhão parcial de bens com
 * **FULANA DE TAL**, brasileira, …, corretor de imóveis, inscrito no CPF sob o nº …, residentes e domiciliados na …
 */
export function qualificacao(p: PessoaQualif & { estadoCivil: string | null }, end: EnderecoQualif, c?: ConjugeQualif | null, cred?: CredenciaisQualif): string {
  const nome = `**${p.nome.toUpperCase()}**`;
  const ec = p.estadoCivil || 'solteiro';
  let civil: string;
  if (ec === 'casado' && c) {
    civil = `${g(p.sexo, 'casado', 'casada')} sob o regime ${REGIME[c.regimeBens ?? 'comunhao_parcial'] ?? REGIME.comunhao_parcial} com **${c.nome.toUpperCase()}**, ${[nacionalidade(c), prof(c), docs(c)].filter(Boolean).join(', ')}`;
  } else if (ec === 'uniao_estavel' && c) {
    civil = `convivente em união estável com **${c.nome.toUpperCase()}**, ${[nacionalidade(c), prof(c), docs(c)].filter(Boolean).join(', ')}`;
  } else {
    const [m, f] = CIVIL[ec] ?? CIVIL.solteiro;
    civil = g(p.sexo, m, f);
  }
  const juntos = !!c && (ec === 'casado' || ec === 'uniao_estavel');
  const resid = juntos && c!.mesmoEndereco
    ? `residentes e domiciliados na ${enderecoTexto(end)}`
    : `${g(p.sexo, 'residente e domiciliado', 'residente e domiciliada')} na ${enderecoTexto(end)}` +
      (juntos && c!.endereco ? `, e o(a) cônjuge na ${enderecoTexto(c!.endereco)}` : '');
  return `${[nome, nacionalidade(p), civil, prof(p), docs(p, cred)].filter(Boolean).join(', ')}, ${resid}.`;
}
