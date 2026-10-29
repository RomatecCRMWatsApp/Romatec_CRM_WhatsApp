/**
 * Registro do compromisso de compra e venda no Cartório de Registro de Imóveis (Lei 6.766/1979, arts. 25 e 26;
 * Lei 6.015/1973, art. 167, I; Código Civil, art. 1.417). Acompanhamento do protocolo no CRM.
 */

export const STATUS_REGISTRO = ['preparando', 'protocolado', 'exigencia', 'registrado', 'devolvido'] as const;
export type StatusRegistro = typeof STATUS_REGISTRO[number];
export const ROTULO_REGISTRO: Record<StatusRegistro, string> = {
  preparando: 'Preparando o kit', protocolado: 'Protocolado no cartório', exigencia: 'Com exigência do cartório', registrado: 'Registrado na matrícula', devolvido: 'Devolvido / cancelado',
};
/** Prazo de referência do registro depois do protocolo (Lei 6.015/1973, art. 188) */
export const PRAZO_REGISTRO_DIAS = 10;

export function prazoDoRegistro(dataProtocolo: string | null | undefined): string | null {
  if (!dataProtocolo || !/^\d{4}-\d{2}-\d{2}$/.test(dataProtocolo)) return null;
  const d = new Date(`${dataProtocolo}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + PRAZO_REGISTRO_DIAS);
  return d.toISOString().slice(0, 10);
}

/** Atrasado = protocolado/com exigência e o prazo de referência já passou */
export const registroAtrasado = (status: string, dataProtocolo: string | null | undefined, hoje: string) => {
  const p = prazoDoRegistro(dataProtocolo);
  return !!p && (status === 'protocolado' || status === 'exigencia') && hoje > p;
};

export const LINKS_CARTORIO = [
  { titulo: 'ONR — e-Protocolo (Registro de Imóveis)', url: 'https://registradores.onr.org.br/', descricao: 'Protocolo eletrônico do título com certificado digital ICP-Brasil, acompanhamento e certidões de matrícula.' },
  { titulo: 'e-Notariado (Colégio Notarial do Brasil)', url: 'https://www.e-notariado.org.br/', descricao: 'Escritura pública digital (na quitação), com videoconferência e assinatura eletrônica notarizada.' },
] as const;
