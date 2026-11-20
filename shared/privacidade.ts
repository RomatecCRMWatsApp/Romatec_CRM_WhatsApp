/**
 * Privacidade (LGPD) — regras puras compartilhadas entre servidor e navegador.
 * Ver docs/privacidade/ (inventário, retenção e direitos, pendências jurídicas).
 */

export const TIPOS_PEDIDO = {
  confirmacao: 'Confirmar se vocês tratam meus dados',
  acesso: 'Acessar uma cópia dos meus dados',
  correcao: 'Corrigir dados incompletos, inexatos ou desatualizados',
  anonimizacao: 'Anonimizar, bloquear ou eliminar dados desnecessários ou excessivos',
  eliminacao: 'Eliminar dados tratados com o meu consentimento',
  portabilidade: 'Portabilidade dos meus dados',
  compartilhamento: 'Saber com quem meus dados foram compartilhados',
  revogacao: 'Revogar consentimento (ex.: parar de receber mensagens)',
  oposicao: 'Opor-me a um tratamento',
  outro: 'Outro assunto de privacidade',
} as const;
export type TipoPedido = keyof typeof TIPOS_PEDIDO;

export const STATUS_PEDIDO = {
  aguardando_verificacao: 'Aguardando confirmação do contato',
  aberto: 'Recebido',
  em_analise: 'Em análise',
  concluido: 'Concluído',
  indeferido: 'Encerrado sem atendimento (com justificativa)',
} as const;
export type StatusPedido = keyof typeof STATUS_PEDIDO;

/** Documentos versionados (o texto fica em docs/privacidade/minutas; a versão sobe a cada mudança de conteúdo) */
export const DOCUMENTOS_PRIVACIDADE = {
  termos: { titulo: 'Termos de Uso', arquivo: 'termos-de-uso.md', versao: 'minuta-2026-11-20' },
  privacidade: { titulo: 'Aviso de Privacidade', arquivo: 'aviso-de-privacidade.md', versao: 'minuta-2026-11-20' },
} as const;
export type DocumentoPrivacidade = keyof typeof DOCUMENTOS_PRIVACIDADE;

/** Texto do consentimento OPCIONAL de marketing (separado do aceite dos termos; nunca pré-marcado) */
export const CONSENTIMENTO_MARKETING_TEXTO =
  'Quero receber novidades, lançamentos e ofertas da Romatec por WhatsApp e e-mail. Posso revogar quando quiser na Central de Privacidade.';
export const CONSENTIMENTO_MARKETING_VERSAO = 'v1-2026-11-20';

/** Telefone/e-mail informado no pedido: normaliza e diz o tipo (null = inválido) */
export function normalizarContato(v: string): { contato: string; tipo: 'telefone' | 'email' } | null {
  const s = String(v ?? '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 160) return { contato: s.toLowerCase(), tipo: 'email' };
  const d = s.replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 13) return { contato: d, tipo: 'telefone' };
  return null;
}

/** Últimos 11 dígitos (comparação de telefone sem depender de +55) */
export const final11 = (v: unknown): string => String(v ?? '').replace(/\D/g, '').slice(-11);

/** Célula de CSV segura contra injeção de fórmula (=, +, -, @, tab, CR) e com aspas escapadas */
export function celulaCsv(v: unknown): string {
  let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}
