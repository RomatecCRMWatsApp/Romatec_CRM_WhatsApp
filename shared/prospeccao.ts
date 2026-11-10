/**
 * Prospecção B2B (AvalieImob): empresas da região que podem usar o software de PTAM (NBR 14653) ou indicar avaliações.
 * Funções puras usadas no servidor e na tela (Vendas › Prospecção B2B). Nada é enviado sem aprovação humana.
 */

export const CATEGORIAS_PROSPECTO = ['imobiliaria', 'correspondente', 'engenharia', 'construtora', 'cartorio', 'banco', 'advocacia', 'outro'] as const;
export type CategoriaProspecto = (typeof CATEGORIAS_PROSPECTO)[number];

export const ROTULO_CATEGORIA: Record<CategoriaProspecto, string> = {
  imobiliaria: 'Imobiliária / corretor', correspondente: 'Correspondente bancário', engenharia: 'Engenharia / topografia',
  construtora: 'Construtora / loteadora', cartorio: 'Cartório', banco: 'Banco / cooperativa', advocacia: 'Advocacia', outro: 'Outro',
};

export const STATUS_PROSPECTO = ['novo', 'rascunho', 'aprovado', 'enviado', 'respondeu', 'interessado', 'sem_interesse', 'optout'] as const;
export type StatusProspecto = (typeof STATUS_PROSPECTO)[number];

export const ROTULO_STATUS: Record<StatusProspecto, string> = {
  novo: 'Novo', rascunho: 'Rascunho pronto', aprovado: 'Aprovado', enviado: 'Enviado', respondeu: 'Respondeu',
  interessado: 'Interessado', sem_interesse: 'Sem interesse', optout: 'Não quer contato',
};

/**
 * Objetivo da prospecção: o mesmo funil serve a duas frentes, com mensagem e material próprios.
 * - avalieimob: vender o software de PTAM (origem do módulo);
 * - parceria_bj: rede de imobiliárias e corretores parceiros na venda do Bom Jardims (kit em PDF + portal do parceiro).
 */
export const OBJETIVOS_PROSPECTO = ['avalieimob', 'parceria_bj'] as const;
export type ObjetivoProspecto = (typeof OBJETIVOS_PROSPECTO)[number];
export const ROTULO_OBJETIVO: Record<ObjetivoProspecto, string> = { avalieimob: 'AvalieImob (laudos)', parceria_bj: 'Parceria Bom Jardims' };
export const objetivoDe = (v: unknown): ObjetivoProspecto => (OBJETIVOS_PROSPECTO as readonly string[]).includes(String(v)) ? (v as ObjetivoProspecto) : 'avalieimob';

/** Busca no Google Maps (Places API): tipos de empresa → termos de busca */
export const TIPOS_BUSCA_MAPS = {
  imobiliaria: { rotulo: 'Imobiliárias', termos: ['imobiliária'], categoria: 'imobiliaria' },
  corretor: { rotulo: 'Corretores de imóveis', termos: ['corretor de imóveis', 'corretora de imóveis'], categoria: 'imobiliaria' },
  construtora: { rotulo: 'Construtoras e loteadoras', termos: ['construtora', 'loteadora'], categoria: 'construtora' },
  correspondente: { rotulo: 'Correspondentes bancários', termos: ['correspondente bancário'], categoria: 'correspondente' },
  engenharia: { rotulo: 'Engenharia e topografia', termos: ['engenharia', 'topografia'], categoria: 'engenharia' },
  cartorio: { rotulo: 'Cartórios', termos: ['cartório'], categoria: 'cartorio' },
  advocacia: { rotulo: 'Advocacia', termos: ['advogado'], categoria: 'advocacia' },
} as const satisfies Record<string, { rotulo: string; termos: readonly string[]; categoria: CategoriaProspecto }>;
export type TipoBuscaMaps = keyof typeof TIPOS_BUSCA_MAPS;
export const TIPOS_BUSCA_POR_OBJETIVO: Record<ObjetivoProspecto, TipoBuscaMaps[]> = {
  parceria_bj: ['imobiliaria', 'corretor', 'construtora'],
  avalieimob: ['imobiliaria', 'correspondente', 'engenharia', 'cartorio', 'advocacia'],
};

/** Limite diário de primeiras mensagens (protege o número de WhatsApp de bloqueio por spam) */
export const LIMITE_ENVIOS_DIA_PADRAO = 20;
export const RODAPE_OPTOUT = 'Se não quiser receber mensagens, é só responder SAIR.';

/** Telefone brasileiro em dígitos com DDI 55 (null se não parecer telefone válido) */
export function normalizarTelefone(v: unknown): string | null {
  let d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('55') && (d.length === 10 || d.length === 11)) d = `55${d}`;
  if (!d.startsWith('55') || d.length < 12 || d.length > 13) return null;
  return d;
}

/** Celular (pode ter WhatsApp): 9 dígitos começando com 9 depois do DDD */
export const pareceCelular = (fone: string | null) => !!fone && fone.length === 13 && fone[4] === '9';

const SAIR = /^\s*(sair|pare|parar|stop|cancelar|remover|descadastrar|nao quero|não quero)\b/i;
export const ehOptout = (texto: string) => SAIR.test(String(texto ?? ''));

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Categoria a partir de um texto livre (planilha) */
export function categoriaDe(v: unknown): CategoriaProspecto {
  const t = norm(String(v ?? ''));
  return (CATEGORIAS_PROSPECTO as readonly string[]).includes(t) ? (t as CategoriaProspecto)
    : /imob|corret/.test(t) ? 'imobiliaria' : /correspond/.test(t) ? 'correspondente' : /engenh|topograf|arquitet|agrimens/.test(t) ? 'engenharia'
    : /constru|lote|incorpor/.test(t) ? 'construtora' : /cartor|tabelion/.test(t) ? 'cartorio' : /banco|caixa|sicoob|sicredi|cooperat/.test(t) ? 'banco'
    : /advog|advoc|jurid/.test(t) ? 'advocacia' : 'outro';
}

/** CSV simples (vírgula ou ponto e vírgula, aspas duplas) → objetos pelo cabeçalho */
export function lerCsv(texto: string): Record<string, string>[] {
  const linhas: string[][] = [];
  const src = String(texto ?? '').replace(/^﻿/, '');
  const sep = (src.split('\n')[0].match(/;/g)?.length ?? 0) > (src.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  let campo = '', linha: string[] = [], aspas = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (aspas) {
      if (c === '"' && src[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(x => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some(x => x.trim())) linhas.push(linha);
  if (linhas.length < 2) return [];
  const cab = linhas[0].map(h => norm(h.trim()));
  return linhas.slice(1).map(l => Object.fromEntries(cab.map((h, i) => [h, (l[i] ?? '').trim()])));
}

export interface ContatosDoSite { emails: string[]; telefones: string[]; whatsapp: string | null; instagram: string | null; titulo: string | null; descricao: string | null }

const EMAIL_RUIM = /\.(png|jpe?g|gif|webp|svg)$|example\.|sentry|wixpress|@2x|domain\.com/i;

/** Contatos e o que a empresa diz de si, a partir do HTML do site (sem IA) */
export function extrairContatos(html: string): ContatosDoSite {
  const h = String(html ?? '').slice(0, 2_000_000);
  const texto = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const emails = Array.from(new Set((texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map(e => e.toLowerCase()).filter(e => !EMAIL_RUIM.test(e)))).slice(0, 5);
  const wa = h.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp\.com\/send\?phone=)(\+?\d{10,13})/i);
  const telefones = Array.from(new Set([
    ...(h.match(/tel:\+?[\d\s().-]{10,20}/gi) ?? []).map(t => normalizarTelefone(t.slice(4))),
    ...(texto.replace(/<[^>]+>/g, ' ').match(/\(?\b\d{2}\)?\s?9?\s?\d{4}[-\s]?\d{4}\b/g) ?? []).map(normalizarTelefone),
  ].filter((t): t is string => !!t))).slice(0, 5);
  const ig = h.match(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})\/?/i);
  const meta = (nome: string) => h.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nome}["'][^>]*content=["']([^"']{3,400})`, 'i'))?.[1]
    ?? h.match(new RegExp(`<meta[^>]+content=["']([^"']{3,400})["'][^>]*(?:name|property)=["']${nome}["']`, 'i'))?.[1] ?? null;
  const titulo = h.match(/<title[^>]*>([^<]{2,200})<\/title>/i)?.[1]?.trim() ?? null;
  const limpar = (s: string | null) => (s ? s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim() : null);
  return {
    emails, telefones, whatsapp: wa ? normalizarTelefone(wa[1]) : null,
    instagram: ig && !/^(p|reel|explore|accounts|sharer)$/i.test(ig[1]) ? `https://instagram.com/${ig[1]}` : null,
    titulo: limpar(titulo), descricao: limpar(meta('description') ?? meta('og:description')),
  };
}

export interface ProspectoParaMensagem { nome: string; categoria: CategoriaProspecto; cidade?: string | null; fato?: string | null }

/** Mensagem-modelo (quando a IA não está disponível): curta, pessoal, com saída fácil */
export function mensagemModelo(p: ProspectoParaMensagem, remetente = 'José Romário, da Romatec'): string {
  const gancho: Record<CategoriaProspecto, string> = {
    imobiliaria: 'vocês captam e vendem imóveis e de vez em quando o cliente pede um laudo de avaliação',
    correspondente: 'vocês lidam com financiamento e o banco sempre pede avaliação do imóvel',
    engenharia: 'vocês já fazem trabalho técnico e podem incluir laudos de avaliação no portfólio',
    construtora: 'vocês precisam avaliar áreas e unidades para venda, garantia e financiamento',
    cartorio: 'muita gente chega aí precisando de avaliação para inventário, partilha ou ITBI',
    banco: 'a agência recebe pedidos de garantia imobiliária que exigem avaliação',
    advocacia: 'inventários, partilhas e divórcios costumam precisar de avaliação do imóvel',
    outro: 'vocês trabalham com imóveis e podem precisar de laudos de avaliação',
  };
  const fato = p.fato ? ` Vi que ${p.fato.replace(/\.$/, '')}.` : '';
  return [
    `Olá, pessoal da ${p.nome}! Aqui é o ${remetente}, de Açailândia.${fato}`,
    `Como ${gancho[p.categoria]}, queria mostrar o AvalieImob: um sistema que monta o PTAM (Parecer Técnico de Avaliação Mercadológica) dentro da NBR 14653, com amostras, tratamento por fatores e o laudo pronto em PDF.`,
    'Posso te mandar um exemplo de laudo para você ver como fica?',
    RODAPE_OPTOUT,
  ].join('\n\n');
}

/** A mensagem precisa ter a saída (LGPD/boa prática) e caber numa conversa de WhatsApp */
export function validarMensagem(texto: string): string | null {
  const t = String(texto ?? '').trim();
  if (t.length < 40) return 'A mensagem está curta demais.';
  if (t.length > 1500) return 'A mensagem passou de 1.500 caracteres. Encurte para caber numa conversa.';
  if (!/\bSAIR\b/.test(t)) return 'Inclua a saída: "Se não quiser receber mensagens, é só responder SAIR."';
  return null;
}

/** Mensagem-modelo da parceria Bom Jardims (quando a IA não está disponível) */
export function mensagemModeloParceria(p: ProspectoParaMensagem, remetente = 'José Romário, da Romatec'): string {
  const fato = p.fato ? ` Vi que ${p.fato.replace(/\.$/, '')}.` : '';
  const quem = p.categoria === 'construtora' ? 'vocês' : 'vocês, que atendem quem procura imóvel na região,';
  return [
    `Olá, pessoal da ${p.nome}! Aqui é o ${remetente}, de Açailândia.${fato}`,
    `Estamos montando uma rede de parceiros para o Condomínio de Chácaras Bom Jardims, aqui em Açailândia, e queria convidar ${quem} para indicar clientes, com comissão definida no cadastro da parceria e um portal próprio para acompanhar cada indicação.`,
    'Posso te mandar a apresentação com as condições da parceria?',
    RODAPE_OPTOUT,
  ].join('\n\n');
}
