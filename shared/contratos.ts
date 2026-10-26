/**
 * Contratos (CPCV) — regras puras usadas no servidor e nas telas: status, quem pode o quê (spec §9),
 * dados do comprador e o que a cobrança permite em cada parcela.
 */
import type { Perfil } from './equipe';

export const STATUS_CONTRATO = ['rascunho', 'minuta', 'apto_assinatura', 'em_assinatura', 'assinado', 'ativo', 'quitado', 'distratado', 'cancelado'] as const;
export type StatusContrato = typeof STATUS_CONTRATO[number];

export const ROTULO_STATUS_CONTRATO: Record<StatusContrato, string> = {
  rascunho: 'Rascunho', minuta: 'Minuta', apto_assinatura: 'Apto para assinatura', em_assinatura: 'Em assinatura', assinado: 'Assinado',
  ativo: 'Ativo', quitado: 'Quitado', distratado: 'Distratado', cancelado: 'Cancelado',
};
export const COR_STATUS_CONTRATO: Record<StatusContrato, string> = {
  rascunho: '#8a8f98', minuta: '#C9A84C', apto_assinatura: '#5AA9E6', em_assinatura: '#5AA9E6', assinado: '#2BD47A',
  ativo: '#2BD47A', quitado: '#0C9A5A', distratado: '#E5484D', cancelado: '#E5484D',
};

/** Contrato ainda segura o lote (reserva/venda) */
export const STATUS_COM_LOTE: StatusContrato[] = ['rascunho', 'minuta', 'apto_assinatura', 'em_assinatura', 'assinado', 'ativo', 'quitado'];

// ─── Permissões (spec §9) ────────────────────────────────────────────────────
/** Criar contrato/minuta: admin, secretário e corretor (o corretor só para lead dele) */
export const podeCriarContrato = (p: Perfil | null) => p === 'admin' || p === 'secretario' || p === 'corretor';
/** Gerar o definitivo e conduzir a assinatura: admin e secretário */
export const podeGerarDefinitivo = (p: Perfil | null) => p === 'admin' || p === 'secretario';
/** Emitir/cancelar cobranças, 2ª via, recibos, carnê: admin e secretário */
export const podeOperarCobranca = (p: Perfil | null) => p === 'admin' || p === 'secretario';
/** Cancelar contrato (libera o lote): admin */
export const podeCancelarContrato = (p: Perfil | null) => p === 'admin';

// ─── Comprador ───────────────────────────────────────────────────────────────
export const ESTADOS_CIVIS = [
  ['solteiro', 'Solteiro(a)'], ['casado', 'Casado(a)'], ['uniao_estavel', 'União estável'], ['divorciado', 'Divorciado(a)'],
  ['separado', 'Separado(a) judicialmente'], ['viuvo', 'Viúvo(a)'],
] as const;
export const REGIMES_BENS = [
  ['comunhao_parcial', 'Comunhão parcial de bens'], ['comunhao_universal', 'Comunhão universal de bens'], ['separacao_total', 'Separação total de bens'],
  ['separacao_obrigatoria', 'Separação obrigatória de bens'], ['participacao_final', 'Participação final nos aquestos'],
] as const;

export const exigeConjuge = (estadoCivil: string | null | undefined) => estadoCivil === 'casado' || estadoCivil === 'uniao_estavel';

// ─── Dependentes (carteirinhas do condomínio) ────────────────────────────────
// Titular e cônjuge têm carteirinha sempre; os dependentes são opcionais, até 6 por contrato.
export const MAX_DEPENDENTES = 6;
export const PARENTESCOS: [string, string][] = [
  ['filho', 'Filho'], ['filha', 'Filha'], ['enteado', 'Enteado'], ['enteada', 'Enteada'], ['pai', 'Pai'], ['mae', 'Mãe'],
  ['sogro', 'Sogro'], ['sogra', 'Sogra'], ['neto', 'Neto'], ['neta', 'Neta'], ['irmao', 'Irmão'], ['irma', 'Irmã'], ['outro', 'Outro'],
];
export const rotuloParentesco = (v: string) => PARENTESCOS.find(([k]) => k === v)?.[1] ?? v;
/** Dependente da chácara (tabela chacaraDependentes): cadastro completo para a carteirinha */
export interface Dependente {
  /** chacaraDependentes.id (ausente = novo) */
  id?: number | null;
  nome: string; parentesco: string; cpf: string; nascimento?: string | null;
  telefone1: string; telefone2?: string | null; email: string;
  /** Já tem foto enviada (só leitura: a foto sobe pelo endpoint próprio) */
  temFoto?: boolean;
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Celular/fixo brasileiro com DDD (10 ou 11 dígitos, sem contar o 55) */
export const telefoneValido = (t: unknown) => {
  const d = String(t ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return (d.length === 10 || d.length === 11) && Number(d.slice(0, 2)) >= 11 && (d.length === 10 || d[2] === '9');
};
export const emailValido = (e: unknown) => EMAIL_OK.test(String(e ?? '').trim());

/** Erros por campo (chave dependentes.<i>.<campo>): nome, parentesco, CPF, telefone e e-mail obrigatórios; nascimento opcional */
export function pendenciasDependentes(deps: Dependente[] | null | undefined, hoje = new Date()): Record<string, string> {
  const e: Record<string, string> = {};
  const lista = deps ?? [];
  if (lista.length > MAX_DEPENDENTES) e['dependentes'] = `No máximo ${MAX_DEPENDENTES} dependentes por chácara`;
  const hojeIso = new Date(hoje.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const cpfs = new Map<string, number>();
  lista.forEach((d, i) => {
    if (String(d.nome ?? '').trim().split(/\s+/).filter(Boolean).length < 2) e[`dependentes.${i}.nome`] = 'Nome completo';
    if (!PARENTESCOS.some(([k]) => k === d.parentesco)) e[`dependentes.${i}.parentesco`] = 'Grau de parentesco';
    const cpf = String(d.cpf ?? '').replace(/\D/g, '');
    if (!cpfValido(cpf)) e[`dependentes.${i}.cpf`] = 'CPF inválido';
    else if (cpfs.has(cpf)) e[`dependentes.${i}.cpf`] = 'CPF repetido';
    else cpfs.set(cpf, i);
    if (d.nascimento && (!/^\d{4}-\d{2}-\d{2}$/.test(d.nascimento) || d.nascimento > hojeIso || d.nascimento < '1900-01-01')) e[`dependentes.${i}.nascimento`] = 'Data de nascimento';
    if (!telefoneValido(d.telefone1)) e[`dependentes.${i}.telefone1`] = 'Telefone/WhatsApp com DDD';
    if (d.telefone2 && !telefoneValido(d.telefone2)) e[`dependentes.${i}.telefone2`] = 'Telefone inválido';
    if (!emailValido(d.email)) e[`dependentes.${i}.email`] = 'E-mail inválido';
  });
  return e;
}

/**
 * O que falta para EMITIR a carteirinha de um dependente (gate): nome, CPF, telefone e e-mail válidos + foto.
 * Vazio = pode emitir.
 */
export function pendenciasCarteirinhaDependente(d: Partial<Dependente> & { temFoto?: boolean }): string[] {
  const out: string[] = [];
  if (String(d.nome ?? '').trim().split(/\s+/).filter(Boolean).length < 2) out.push('nome completo');
  if (!cpfValido(String(d.cpf ?? ''))) out.push('CPF válido');
  if (!telefoneValido(d.telefone1)) out.push('telefone/WhatsApp');
  if (!emailValido(d.email)) out.push('e-mail válido');
  if (!d.temFoto) out.push('foto');
  return out;
}
/** Regime diferente da comunhão parcial exige pacto antenupcial (spec §13.2) */
export const exigePacto = (estadoCivil: string | null | undefined, regime: string | null | undefined) =>
  estadoCivil === 'casado' && !!regime && regime !== 'comunhao_parcial';

export interface PessoaForm {
  nome: string; cpf: string; sexo?: string | null; nacionalidade?: string | null; estadoCivil?: string | null; regimeBens?: string | null;
  pactoAntenupcial?: string | null; profissao?: string | null; nascimento?: string | null; rg?: string | null; rgOrgao?: string | null; rgUf?: string | null;
  email?: string | null; telefone1?: string | null; cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null;
  bairro?: string | null; cidade?: string | null; uf?: string | null;
}

export function cpfValido(cpf: string | null | undefined): boolean {
  const d = String(cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}

/** Campos que faltam no comprador (e no cônjuge, quando casado/união estável) para criar o contrato */
export function pendenciasComprador(c: PessoaForm, conj?: PessoaForm | null): Record<string, string> {
  const e: Record<string, string> = {};
  const vazio = (v: unknown) => v == null || String(v).trim() === '';
  if (vazio(c.nome) || String(c.nome).trim().split(/\s+/).length < 2) e['comprador.nome'] = 'Nome completo';
  if (!cpfValido(c.cpf)) e['comprador.cpf'] = 'CPF inválido';
  if (vazio(c.estadoCivil)) e['comprador.estadoCivil'] = 'Estado civil';
  if (vazio(c.telefone1) || String(c.telefone1).replace(/\D/g, '').length < 10) e['comprador.telefone1'] = 'Telefone com WhatsApp';
  if (vazio(c.logradouro) || vazio(c.cidade) || vazio(c.uf)) e['comprador.endereco'] = 'Endereço completo';
  if (exigeConjuge(c.estadoCivil)) {
    if (!conj || vazio(conj.nome)) e['conjuge.nome'] = 'Nome do cônjuge/companheiro(a)';
    if (!conj || !cpfValido(conj.cpf)) e['conjuge.cpf'] = 'CPF do cônjuge inválido';
    if (c.estadoCivil === 'casado' && vazio(c.regimeBens)) e['comprador.regimeBens'] = 'Regime de bens';
    if (exigePacto(c.estadoCivil, c.regimeBens) && vazio(c.pactoAntenupcial)) e['comprador.pactoAntenupcial'] = 'Pacto antenupcial (cartório, livro, folha, data)';
  }
  return e;
}

// ─── Cobrança: ações por parcela ─────────────────────────────────────────────
export const DIAS_SEGUNDA_VIA = 59;

export function diasDeAtraso(vencimento: string, hoje: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(hoje) - t(vencimento)) / 86_400_000);
}

/** O que a tela mostra em cada parcela (Boleto A4, 2ª via, Recibo, selo Negociação) */
export function acoesDaParcela(c: { status: string; vencimento: string; vencimentoOriginal?: string | null; asaas: boolean; recibo: boolean }, hoje: string) {
  const vencida = c.status === 'vencida' || (c.status === 'emitida' && c.vencimento < hoje);
  const atraso = vencida ? diasDeAtraso(c.vencimentoOriginal ?? c.vencimento, hoje) : 0;
  return {
    boleto: c.asaas && ['emitida', 'vencida'].includes(c.status) && !vencida,
    segundaVia: c.asaas && vencida && atraso <= DIAS_SEGUNDA_VIA,
    negociacao: vencida && atraso > DIAS_SEGUNDA_VIA,
    recibo: c.status === 'paga' && c.recibo,
    atraso,
    vencida,
  };
}

/** Telefone para o WhatsApp (Z-API): só dígitos com o 55 do Brasil — "(99) 9 9123-4567" → "5599991234567" */
export function telefoneWhatsApp(t: string | null | undefined): string | null {
  const d = String(t ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

// ─── Anexos do contrato (documentos do comprador, cônjuge e dependentes) ───
export type AlvoAnexo = 'comprador' | 'conjuge' | 'dependente';
export const TIPOS_ANEXO = {
  documento_foto: 'Documento com foto (RG/CNH) — frente',
  documento_foto_verso: 'Documento com foto — verso',
  cpf: 'CPF',
  comprovante_residencia: 'Comprovante de endereço',
  comprovante_renda: 'Comprovante de renda',
  certidao_casamento: 'Certidão de casamento / união estável',
  documento_dependente: 'Documento do dependente (RG ou certidão de nascimento)',
  outro: 'Outro documento',
} as const;
export type TipoAnexo = keyof typeof TIPOS_ANEXO;
export const MIMES_ANEXO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const LIMITE_ANEXO_MB = 10;
