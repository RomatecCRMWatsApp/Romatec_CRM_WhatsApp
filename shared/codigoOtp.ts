/**
 * Código de confirmação (OTP) da assinatura avançada: regras puras da tela.
 * O servidor continua sendo a autoridade (validade, uso único e tentativas ficam em server/assinatura/servico.ts);
 * aqui só se normaliza a entrada, traduz as respostas e impede que uma resposta antiga confirme a tela atual.
 */

export const TAMANHO_OTP = 6;
/** Intervalo mínimo entre pedidos de código (o servidor recusa antes disso com AGUARDE); aqui é só orientação visual */
export const ESPERA_REENVIO_S = 60;

export type EstadoOtp = 'editando' | 'verificando' | 'confirmado' | 'invalido' | 'expirado' | 'bloqueado' | 'sem_conexao' | 'erro';

export const MENSAGEM_OTP = {
  instrucao: 'Digite o código para confirmar seu acesso.',
  verificando: 'Verificando código…',
  invalido: 'Não foi possível validar esse código. Confira e tente novamente.',
  expirado: 'Este código expirou. Peça um novo código.',
  bloqueado: 'Tentativas esgotadas. Peça um novo código.',
  semConexao: 'Não foi possível confirmar agora. Verifique sua conexão e tente de novo.',
  confirmado: 'Código confirmado.',
} as const;

/**
 * Normaliza o que foi digitado ou colado: aceita espaços, hífens e pontos ("123 456", "123-456"), preserva zeros à esquerda
 * (texto, nunca número). Nada é cortado em silêncio: sobra de dígitos ou letras gera aviso.
 */
export function normalizarCodigo(bruto: string, tamanho = TAMANHO_OTP): { valor: string; aviso: string | null } {
  const semSeparadores = String(bruto ?? '').replace(/[\s.\-]/g, '');
  const digitos = semSeparadores.replace(/\D/g, '');
  if (digitos.length !== semSeparadores.length) return { valor: digitos.slice(0, tamanho), aviso: 'O código tem só números.' };
  if (digitos.length > tamanho) return { valor: digitos.slice(0, tamanho), aviso: `O código tem ${tamanho} dígitos; confira o que foi colado.` };
  return { valor: digitos, aviso: null };
}

/** Erro devolvido pela API de assinatura ({ erro, mensagem }) ou falha de rede */
export interface FalhaApi { codigo?: string; status?: number; rede?: boolean; mensagem?: string }

/**
 * Tradução da resposta do servidor para o estado da tela.
 * 'recarregar' = o servidor diz que o código já foi usado ou o contrato já foi assinado: a página busca a situação real.
 */
export function estadoDaFalha(f: FalhaApi): { estado: EstadoOtp | 'recarregar'; mensagem: string } {
  if (f.rede || (f.status != null && f.status >= 502 && f.status <= 504)) return { estado: 'sem_conexao', mensagem: MENSAGEM_OTP.semConexao };
  switch (f.codigo) {
    case 'OTP_INVALIDO': return { estado: 'invalido', mensagem: f.mensagem || MENSAGEM_OTP.invalido };
    case 'OTP_EXPIRADO': return { estado: 'expirado', mensagem: MENSAGEM_OTP.expirado };
    case 'OTP_BLOQUEADO': return { estado: 'bloqueado', mensagem: MENSAGEM_OTP.bloqueado };
    case 'OTP': return { estado: 'expirado', mensagem: f.mensagem || 'Peça o código de confirmação primeiro.' };
    case 'OTP_USADO': case 'ASSINADO': return { estado: 'recarregar', mensagem: f.mensagem || 'Atualizando a situação da assinatura…' };
    default: return { estado: 'erro', mensagem: f.mensagem || 'Não foi possível concluir. Tente novamente.' };
  }
}

/**
 * Controle de tentativas no cliente: uma por vez, presa ao desafio (código) vigente.
 * Reenviar o código troca o desafio; respostas de tentativas antigas, de desafios trocados ou após a tela fechar são ignoradas.
 * (Cancelar no cliente não cancela no servidor: por isso a resposta é descartada, não "desfeita".)
 */
export class ControleTentativas {
  private desafio = 0;
  private seq = 0;
  private emCurso: number | null = null;
  private ativo = true;

  /** Novo código pedido: tentativas em curso deixam de valer */
  novoDesafio(): void { this.desafio++; this.emCurso = null; }

  /** null quando já há tentativa em curso (Enter + clique, duplo clique) */
  iniciar(): { desafio: number; seq: number } | null {
    if (!this.ativo || this.emCurso != null) return null;
    this.emCurso = ++this.seq;
    return { desafio: this.desafio, seq: this.seq };
  }

  /** A resposta desta tentativa ainda pode mudar a tela? */
  vale(t: { desafio: number; seq: number }): boolean {
    return this.ativo && t.desafio === this.desafio && t.seq === this.emCurso;
  }

  terminar(t: { desafio: number; seq: number }): void { if (this.emCurso === t.seq) this.emCurso = null; }

  get ocupado(): boolean { return this.emCurso != null; }

  desmontar(): void { this.ativo = false; this.emCurso = null; }
}
