/**
 * Links de divulgação (Campanhas de captação › Links de divulgação): página pública + texto pronto de WhatsApp.
 * Os links internos saem com a UTM da campanha e o ?c= de quem compartilha — o lead que chega por eles vai
 * para esse corretor (sem ?c=, para o rodízio). Os fixos ficam aqui; o escritório cadastra outros no banco.
 */
import { z } from 'zod';
import { CAMPANHA_OBRAS, LANCAMENTO_OBRAS, ROTA_OBRAS } from './obrasBomJardim';

/** Marcador do link no texto: trocado pelo link de quem compartilha */
export const MARCA_LINK = '{link}';

export interface LinkDivulgacao {
  /** "fixo:obras" (código) ou "db:12" (cadastrado pelo escritório) */
  chave: string;
  titulo: string;
  descricao: string | null;
  /** Caminho interno (/obras-bom-jardim) ou URL completa (https://…) */
  url: string;
  utmSource: string | null;
  utmCampaign: string | null;
  /** Texto do WhatsApp; {link} vira o link (sem a marca, o link vai no fim) */
  textoWhatsapp: string;
  empreendimento: string | null;
  destaque: boolean;
  fixo: boolean;
}

export const LINKS_FIXOS: LinkDivulgacao[] = [
  {
    chave: 'fixo:obras', titulo: 'Obras iniciadas — campanha do Instagram', fixo: true, destaque: true, empreendimento: 'Bom Jardims',
    descricao: `Página com o vídeo das obras, cadastro rápido e botões "Quero saber o valor" e "Agendar visita". Lançamento oficial em ${LANCAMENTO_OBRAS}.`,
    url: ROTA_OBRAS, utmSource: 'instagram', utmCampaign: CAMPANHA_OBRAS,
    textoWhatsapp: `🚧 *As obras do Condomínio de Chácaras Bom Jardim começaram!*\n\nLançamento oficial em *${LANCAMENTO_OBRAS}*. São só *82 chácaras*, a partir de *3.025 m²*, 100% documentado e liberado para vendas.\n\n🎥 Veja o vídeo das obras e garanta prioridade:\n${MARCA_LINK}`,
  },
  {
    chave: 'fixo:landing', titulo: 'Página do Bom Jardims (mapa de vendas)', fixo: true, destaque: false, empreendimento: 'Bom Jardims',
    descricao: 'Landing completa: fotos, vídeo, diferenciais e o mapa com as chácaras disponíveis.',
    url: '/bom-jardims', utmSource: 'whatsapp', utmCampaign: 'BJ-LANDING',
    textoWhatsapp: `🌳 *Condomínio de Chácaras Bom Jardims* — Açailândia/MA\n\nChácaras a partir de 3.025 m², portal com guarita, água encanada e área de vivência às margens do córrego.\n\n📍 Veja o mapa com as chácaras disponíveis:\n${MARCA_LINK}`,
  },
  {
    chave: 'fixo:agendar', titulo: 'Agendar visita ao Bom Jardims', fixo: true, destaque: false, empreendimento: 'Bom Jardims',
    descricao: 'O cliente escolhe o dia, o horário e a chácara no mapa; a visita cai na sua agenda.',
    url: '/agendar/bom-jardims', utmSource: 'whatsapp', utmCampaign: 'BJ-VISITA',
    textoWhatsapp: `📅 *Agende sua visita ao Condomínio de Chácaras Bom Jardims*\n\nEscolha o melhor dia e horário — eu te acompanho na visita:\n${MARCA_LINK}`,
  },
  {
    chave: 'fixo:kml', titulo: 'Localização no Google Earth (KML)', fixo: true, destaque: false, empreendimento: 'Bom Jardims',
    descricao: 'Arquivo com a poligonal do condomínio e todas as chácaras demarcadas — abre no Google Earth e em apps de mapa.',
    url: '/bom-jardims.kml', utmSource: null, utmCampaign: null,
    textoWhatsapp: `🗺️ Localização exata do *Condomínio de Chácaras Bom Jardims* (abre no Google Earth):\n${MARCA_LINK}`,
  },
];

/** Link final de quem compartilha: base do site + UTM + ?c= (só nos links do próprio site) */
export function montarLink(base: string, l: Pick<LinkDivulgacao, 'url' | 'utmSource' | 'utmCampaign'>, ref?: string | null): string {
  const raiz = base.replace(/\/$/, '');
  const interno = l.url.startsWith('/') || l.url.startsWith(raiz);
  let u: URL;
  try { u = new URL(l.url.startsWith('/') ? `${raiz}${l.url}` : l.url); } catch { return l.url; }
  if (!interno || /\.kml$/i.test(u.pathname)) return u.toString();
  if (l.utmSource && !u.searchParams.has('utm_source')) u.searchParams.set('utm_source', l.utmSource);
  if (l.utmCampaign && !u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', l.utmCampaign);
  if (ref) u.searchParams.set('c', ref);
  return u.toString();
}

/** Texto do WhatsApp com o link no lugar de {link} (ou no fim) */
export function textoComLink(texto: string, link: string): string {
  const t = texto.trim();
  return t.includes(MARCA_LINK) ? t.split(MARCA_LINK).join(link) : `${t}\n\n${link}`;
}

const urlOuCaminho = z.string().trim().min(1).max(500).refine(v => /^\/[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v), 'Use um caminho do site (/pagina) ou um link https://');
const curto = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null);

export const linkSchema = z.object({
  titulo: z.string().trim().min(3, 'Dê um título').max(120),
  descricao: curto(300),
  url: urlOuCaminho,
  utmSource: curto(60),
  utmCampaign: curto(60),
  textoWhatsapp: z.string().trim().min(5, 'Escreva o texto do WhatsApp').max(2000),
  empreendimento: curto(80),
  destaque: z.boolean().optional().default(false),
  ativo: z.boolean().optional().default(true),
});
export type DadosLink = z.infer<typeof linkSchema>;
