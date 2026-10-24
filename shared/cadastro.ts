/**
 * Cadastro completo dos usuários (regras puras): dados pessoais que o contrato puxa do corretor
 * (intermediador), documentos e a certidão de quitação do CRECI (obrigatória, com validade).
 */

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;
export const ESTADOS_CIVIS = ['solteiro(a)', 'casado(a)', 'união estável', 'divorciado(a)', 'separado(a)', 'viúvo(a)'] as const;

export const TIPOS_DOCUMENTO = ['certidao_creci', 'rg', 'cpf', 'comprovante_endereco', 'outro'] as const;
export type TipoDocumento = typeof TIPOS_DOCUMENTO[number];
export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  certidao_creci: 'Certidão de quitação do CRECI',
  rg: 'RG',
  cpf: 'CPF',
  comprovante_endereco: 'Comprovante de endereço',
  outro: 'Outro documento',
};
/** Arquivos aceitos nos documentos (PDF ou imagem) e tamanho máximo */
export const MIMES_DOCUMENTO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** CPF com dígitos verificadores válidos (aceita com ou sem máscara) */
export function cpfValido(v: unknown): boolean {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export const formatarCpf = (v: unknown) => { const d = soDigitos(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v ?? ''); };
export const formatarCep = (v: unknown) => { const d = soDigitos(v); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(v ?? ''); };

/** Quem mexe nos documentos/foto de um usuário: o admin ou o próprio usuário */
export function podeGerirCadastroDe(user: { id: number; role?: string | null } | null | undefined, alvoId: number): boolean {
  return !!user && (user.role === 'admin' || user.id === alvoId);
}

/** Problema no arquivo de documento (null = ok) */
export function problemaDocumento(tipo: string, mime: string, bytes: number, validade?: string | null): string | null {
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) return 'Tipo de documento inválido';
  if (!MIMES_DOCUMENTO.includes(mime)) return 'Envie PDF ou imagem (JPG, PNG, WEBP)';
  if (!bytes) return 'Arquivo vazio';
  if (bytes > MAX_DOCUMENTO_BYTES) return 'Arquivo acima de 10 MB';
  if (tipo === 'certidao_creci' && !/^\d{4}-\d{2}-\d{2}$/.test(String(validade || ''))) return 'Informe a validade da certidão do CRECI';
  return null;
}

export type SituacaoCertidao = 'ok' | 'vencendo' | 'vencida' | 'ausente';

/** Certidão do CRECI: ausente (sem arquivo ou validade), vencida, vencendo (até 15 dias) ou ok */
export function situacaoCertidao(validade: string | Date | null | undefined, temArquivo: boolean, hoje = new Date()): SituacaoCertidao {
  if (!temArquivo || !validade) return 'ausente';
  const fim = new Date(typeof validade === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(validade) ? `${validade}T23:59:59` : validade);
  if (!Number.isFinite(fim.getTime())) return 'ausente';
  const dias = (fim.getTime() - hoje.getTime()) / 86_400_000;
  if (dias < 0) return 'vencida';
  return dias <= 15 ? 'vencendo' : 'ok';
}

export const ROTULO_CERTIDAO: Record<SituacaoCertidao, string> = {
  ok: 'CRECI em dia', vencendo: 'Certidão vence em breve', vencida: 'Certidão do CRECI vencida', ausente: 'Sem certidão do CRECI',
};

/** Dados do intermediador que o contrato usa */
export interface DadosIntermediador {
  nome: string;
  creci: string | null;
  creciUf: string | null;
  cpf: string | null;
  rg: string | null;
  rgOrgao: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
  enderecoCep: string | null;
  telefone: string | null;
  email: string | null;
}

/** O que falta para o corretor entrar num contrato como intermediador (vazio = apto) */
export function pendenciasIntermediador(d: Partial<DadosIntermediador>, certidao: SituacaoCertidao): string[] {
  const faltam: string[] = [];
  const req: [keyof DadosIntermediador, string][] = [
    ['nome', 'nome completo'], ['creci', 'nº do CRECI'], ['creciUf', 'UF do CRECI'], ['cpf', 'CPF'], ['rg', 'RG'], ['rgOrgao', 'órgão emissor do RG'],
    ['nacionalidade', 'nacionalidade'], ['estadoCivil', 'estado civil'], ['enderecoLogradouro', 'endereço'], ['enderecoNumero', 'número do endereço'],
    ['enderecoBairro', 'bairro'], ['enderecoCidade', 'cidade'], ['enderecoUf', 'UF do endereço'], ['enderecoCep', 'CEP'],
  ];
  for (const [k, r] of req) if (!String(d[k] ?? '').trim()) faltam.push(r);
  if (d.cpf && !cpfValido(d.cpf)) faltam.push('CPF válido');
  if (certidao === 'ausente') faltam.push('certidão de quitação do CRECI');
  if (certidao === 'vencida') faltam.push('certidão do CRECI dentro da validade');
  return faltam;
}

/**
 * Qualificação do intermediador no contrato, ex.: "JOSÉ ROMÁRIO, brasileiro, casado(a), corretor de imóveis,
 * CRECI/MA nº 4705, CPF 123.456.789-09, RG 123 SSP/MA, residente na Rua X, nº 10, Centro, Açailândia/MA, CEP 65930-000"
 */
export function qualificacaoIntermediador(d: DadosIntermediador): string {
  const endereco = [
    [d.enderecoLogradouro, d.enderecoNumero && `nº ${d.enderecoNumero}`, d.enderecoComplemento].filter(Boolean).join(', '),
    d.enderecoBairro, [d.enderecoCidade, d.enderecoUf].filter(Boolean).join('/'), d.enderecoCep && `CEP ${formatarCep(d.enderecoCep)}`,
  ].filter(Boolean).join(', ');
  return [
    d.nome.toUpperCase(), d.nacionalidade, d.estadoCivil, 'corretor de imóveis',
    d.creci && `CRECI/${d.creciUf || '—'} nº ${d.creci}`, d.cpf && `CPF ${formatarCpf(d.cpf)}`,
    d.rg && `RG ${d.rg}${d.rgOrgao ? ` ${d.rgOrgao}` : ''}`, endereco && `residente na ${endereco}`,
  ].filter(Boolean).join(', ');
}
