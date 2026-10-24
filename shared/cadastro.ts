/**
 * Cadastro completo dos usuários (regras puras): dados pessoais que o contrato puxa (qualificação),
 * cônjuge, documentos pessoais e credenciais profissionais (Cartão e Certidão CRECI, Certificado CNAI).
 * Máscaras e validação de CPF/RG em shared/masks.ts; texto da qualificação em shared/qualificacao.ts.
 */
import { isValidCPF, onlyDigits } from './masks';

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

export const ESTADOS_CIVIS = ['solteiro', 'casado', 'uniao_estavel', 'separado', 'divorciado', 'viuvo'] as const;
export type EstadoCivil = typeof ESTADOS_CIVIS[number];
export const ROTULO_ESTADO_CIVIL: Record<EstadoCivil, string> = {
  solteiro: 'Solteiro(a)', casado: 'Casado(a)', uniao_estavel: 'União estável',
  separado: 'Separado(a) judicialmente', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)',
};
/** Estado civil que pede o bloco do cônjuge/companheiro(a) */
export const temConjuge = (ec: string | null | undefined) => ec === 'casado' || ec === 'uniao_estavel';

export const REGIMES_BENS = ['comunhao_parcial', 'comunhao_universal', 'separacao_total', 'separacao_obrigatoria', 'participacao_aquestos'] as const;
export const ROTULO_REGIME: Record<typeof REGIMES_BENS[number], string> = {
  comunhao_parcial: 'Comunhão parcial de bens', comunhao_universal: 'Comunhão universal de bens',
  separacao_total: 'Separação total de bens', separacao_obrigatoria: 'Separação obrigatória de bens',
  participacao_aquestos: 'Participação final nos aquestos',
};

export const NACIONALIDADES = ['brasileira', 'estrangeira'] as const;

/** Sugestões do campo Profissão (aceita valor livre) */
export const PROFISSOES = [
  'Corretor(a) de Imóveis', 'Técnico(a) em Edificações', 'Técnico(a) em Agrimensura', 'Engenheiro(a) Civil', 'Arquiteto(a)', 'Advogado(a)',
  'Empresário(a)', 'Comerciante', 'Servidor(a) Público(a)', 'Autônomo(a)', 'Secretário(a)', 'Administrador(a)', 'Aposentado(a)', 'Do lar', 'Estudante',
];
/** Primeira letra maiúscula, sem espaços sobrando */
export const normalizarProfissao = (p: string) => { const t = p.trim().replace(/\s+/g, ' '); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };

export const ORGAOS_EMISSORES = ['SSP', 'SESP', 'SDS', 'PC', 'IFP', 'DETRAN', 'DPF', 'PM', 'CBM', 'MB', 'EB', 'FAB', 'OAB', 'CREA', 'CRECI', 'Outro'];

/** Documentos e credenciais (um só cadastro, com titular usuário ou cônjuge) */
export const CREDENCIAIS = ['cartao_creci', 'certidao_creci', 'certificado_cnai'] as const;
export const TIPOS_DOCUMENTO = [
  ...CREDENCIAIS, 'rg', 'cin', 'cnh', 'cpf', 'comprovante_residencia', 'certidao_casamento', 'certidao_nascimento', 'rnm_passaporte', 'outros',
] as const;
export type TipoDocumento = typeof TIPOS_DOCUMENTO[number];
export type TipoCredencial = typeof CREDENCIAIS[number];
export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  cartao_creci: 'Cartão de Regularidade (CRECI)',
  certidao_creci: 'Certidão de Regularidade (CRECI)',
  certificado_cnai: 'Certificado CNAI',
  rg: 'RG (frente/verso)',
  cin: 'CIN – Carteira de Identidade Nacional',
  cnh: 'CNH',
  cpf: 'CPF',
  comprovante_residencia: 'Comprovante de residência',
  certidao_casamento: 'Certidão de casamento / escritura de união estável',
  certidao_nascimento: 'Certidão de nascimento',
  rnm_passaporte: 'RNM / Passaporte',
  outros: 'Outros',
};
export const DOCUMENTOS_PESSOAIS = TIPOS_DOCUMENTO.filter(t => !(CREDENCIAIS as readonly string[]).includes(t)) as Exclude<TipoDocumento, TipoCredencial>[];
/** Cartão, certidão e CNAI: no máximo um por usuário (o envio novo substitui o anterior) */
export const tipoUnico = (tipo: string) => (CREDENCIAIS as readonly string[]).includes(tipo);

/** Arquivos aceitos (imagem ou PDF) e tamanho máximo */
export const MIMES_DOCUMENTO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

export const soDigitos = (v: unknown) => onlyDigits(v == null ? '' : String(v));
/** CPF com dígitos verificadores válidos (aceita com ou sem máscara) */
export const cpfValido = (v: unknown) => isValidCPF(v == null ? '' : String(v));

export const formatarCpf = (v: unknown) => { const d = soDigitos(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v ?? ''); };
export const formatarCep = (v: unknown) => { const d = soDigitos(v); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(v ?? ''); };

/** Quem mexe nos documentos/foto/cadastro de um usuário: o admin ou o próprio usuário */
export function podeGerirCadastroDe(user: { id: number; role?: string | null } | null | undefined, alvoId: number): boolean {
  return !!user && (user.role === 'admin' || user.id === alvoId);
}

/** Tipo real do arquivo pelos primeiros bytes (não confia no nome nem no cabeçalho do navegador) */
export function detectarMime(buf: Uint8Array): string | null {
  const hex = (a: number, b: number) => Array.from(buf.subarray(a, b)).map(x => x.toString(16).padStart(2, '0')).join('');
  const txt = (a: number, b: number) => String.fromCharCode(...Array.from(buf.subarray(a, b)));
  if (hex(0, 4) === '25504446') return 'application/pdf';
  if (hex(0, 8) === '89504e470d0a1a0a') return 'image/png';
  if (hex(0, 3) === 'ffd8ff') return 'image/jpeg';
  if (txt(0, 4) === 'RIFF' && txt(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Problema no arquivo: { status, erro } (415 formato, 413 tamanho, 400 tipo) ou null */
export function problemaArquivo(tipo: string, buf: Uint8Array): { status: number; erro: string } | null {
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) return { status: 400, erro: 'Tipo de documento inválido' };
  if (!buf?.length) return { status: 400, erro: 'Arquivo vazio' };
  if (buf.length > MAX_DOCUMENTO_BYTES) return { status: 413, erro: 'Arquivo acima de 10 MB' };
  if (!detectarMime(buf)) return { status: 415, erro: 'Formato não suportado (use PNG, JPG, WEBP ou PDF)' };
  return null;
}

// ─── Validade (certidão e cartão CRECI) ──────────────────────────────────────
export type StatusValidade = 'sem_validade' | 'valida' | 'a_vencer' | 'vencida';

/** Status pela validade (AAAA-MM-DD) e quantos dias faltam; a_vencer = dentro de alertaDias */
export function statusValidade(validade: string | null | undefined, alertaDias: number, hoje = new Date()): { status: StatusValidade; dias: number | null } {
  if (!validade || !/^\d{4}-\d{2}-\d{2}/.test(validade)) return { status: 'sem_validade', dias: null };
  const [a, m, d] = validade.slice(0, 10).split('-').map(Number);
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((Date.UTC(a, m - 1, d) - h) / 86_400_000);
  if (dias < 0) return { status: 'vencida', dias };
  if (dias <= alertaDias) return { status: 'a_vencer', dias };
  return { status: 'valida', dias };
}

/** hoje + N dias (validade sugerida da certidão nova: 30) */
export function maisDias(n: number, hoje = new Date()): string {
  return new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n)).toISOString().slice(0, 10);
}

export const PRAZOS_PADRAO = { certidaoValidadeDias: 30, certidaoAlertaDias: 5, cartaoAlertaDias: 30 };
export const LINK_CERTIDAO_PADRAO = 'https://www.crecima.gov.br';

/** Situação do corretor para "Recebe leads": precisa do Cartão de Regularidade CRECI */
export const MSG_SEM_CARTAO = 'Envie o Cartão de Regularidade CRECI';

/** Pendências de credencial (badge do menu e card do admin) */
export function pendenciasCredenciais(perfil: string | null, docs: { tipo: string; titular?: string | null; validade?: string | null }[], prazos = PRAZOS_PADRAO, hoje = new Date()): string[] {
  if (perfil !== 'corretor') return [];
  const doc = (t: string) => docs.find(d => d.tipo === t && (d.titular ?? 'usuario') === 'usuario');
  const out: string[] = [];
  const cartao = doc('cartao_creci');
  if (!cartao) out.push('Cartão CRECI ausente');
  else if (statusValidade(cartao.validade, prazos.cartaoAlertaDias, hoje).status === 'vencida') out.push('Cartão CRECI vencido');
  const certidao = doc('certidao_creci');
  if (certidao) {
    const s = statusValidade(certidao.validade, prazos.certidaoAlertaDias, hoje).status;
    if (s === 'vencida') out.push('Certidão CRECI vencida');
    else if (s === 'a_vencer') out.push('Certidão CRECI a vencer');
  }
  return out;
}

/** Link do CRECI da UF para emitir/renovar a certidão */
export const linkCrecUf = (uf: string | null | undefined) => `https://www.creci${String(uf || 'ma').toLowerCase()}.gov.br`;
