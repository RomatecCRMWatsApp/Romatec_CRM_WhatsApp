/**
 * Atribuição de origem pela mensagem pré-preenchida do WhatsApp.
 * "Olá! Tenho interesse no imóvel IMV-0012 (#IG-OUT26-CHAC)." → imóvel 12, campanha IG-OUT26-CHAC.
 * "Quero vender/avaliar meu imóvel (#IG-CAPT-OUT26)." → funil proprietário.
 */

export type Funil = 'comprador' | 'proprietario';

export interface Atribuicao {
  imovelCodigos: string[];
  campanhaCodigo: string | null;
  funilSugerido: Funil | null;
}

const RE_IMOVEL = /\bIMV-\d{4}\b/gi;
const RE_CAMPANHA = /#([A-Z0-9][A-Z0-9-]{2,19})\b/i;
const RE_PROPRIETARIO = /\b(vender|avaliar|avalia[çc][aã]o|anunciar)\b.*\b(meu|minha)\b|\b(meu|minha)\b.*\b(vender|avaliar|anunciar)\b/i;

export function extrairAtribuicao(texto: string | null | undefined): Atribuicao {
  const limpo = (texto ?? '').normalize('NFC');
  const imovelCodigos = Array.from(new Set((limpo.match(RE_IMOVEL) ?? []).map(c => c.toUpperCase())));
  const camp = limpo.match(RE_CAMPANHA);
  let funilSugerido: Funil | null = null;
  if (imovelCodigos.length > 0) funilSugerido = 'comprador';
  else if (RE_PROPRIETARIO.test(limpo)) funilSugerido = 'proprietario';
  return { imovelCodigos, campanhaCodigo: camp ? camp[1].toUpperCase() : null, funilSugerido };
}

/** Mensagem pré-preenchida padrão (§5.1) */
export function mensagemPreenchida(params: { funil: Funil; imovelCodigo?: string | null; campanhaCodigo?: string | null; empreendimentoNome?: string | null }): string {
  const camp = params.campanhaCodigo ? ` (#${params.campanhaCodigo})` : '';
  if (params.funil === 'proprietario') return `Olá! Quero vender/avaliar meu imóvel${camp}.`;
  if (params.imovelCodigo) return `Olá! Tenho interesse no imóvel ${params.imovelCodigo}${camp}. Pode me passar mais informações?`;
  // Campanha ligada a empreendimento (ex.: Bom Jardims): quem clica já sabe do que vai receber informação
  if (params.empreendimentoNome) return `Olá! Quero saber mais sobre o ${params.empreendimentoNome}${camp}.`;
  return `Olá! Quero saber mais sobre os imóveis da Romatec${camp}.`;
}

/** Link wa.me com a mensagem pré-preenchida */
export function linkWhatsApp(numeroDestino: string, mensagem: string): string {
  return `https://wa.me/${numeroDestino.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`;
}

/** Código de campanha válido para usar como #CODIGO (3–20, letras/números/hífen) */
export function normalizarCodigoCampanha(codigo: string): string | null {
  const c = codigo.trim().replace(/^#/, '').toUpperCase().replace(/\s+/g, '-');
  return /^[A-Z0-9][A-Z0-9-]{2,19}$/.test(c) ? c : null;
}
