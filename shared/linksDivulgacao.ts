/**
 * Links de divulgação (Campanhas de captação › Links de divulgação): página pública + texto pronto de WhatsApp.
 * Os links internos saem com a UTM da campanha e o ?c= de quem compartilha — o lead que chega por eles vai
 * para esse corretor (sem ?c=, para o rodízio). Os fixos ficam aqui; o escritório cadastra outros no banco.
 */
import { z } from 'zod';
import { CAMPANHA_OBRAS, LANCAMENTO_OBRAS, ROTA_OBRAS } from './obrasBomJardim';
import { CAMPANHA_MAPA3D, ROTA_MAPA3D } from './mapa3dBomJardims';
import { CAMPANHA_ROTA, ROTA_COMO_CHEGAR } from './rotaBomJardims';

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
    chave: 'fixo:mapa3d', titulo: 'Mapa 3D + vídeos — nova campanha', fixo: true, destaque: true, empreendimento: 'Bom Jardims',
    descricao: 'Página com o mapa 3D em destaque (girar, aproximar e tocar na chácara), os vídeos da galeria, as fotos do drone das obras, cadastro e o convite para seguir o @avalieimob.',
    url: ROTA_MAPA3D, utmSource: 'instagram', utmCampaign: CAMPANHA_MAPA3D,
    textoWhatsapp: `🌳 *Condomínio de Chácaras Bom Jardims* agora em *3D*!\n\nGire o mapa, aproxime e escolha a sua chácara — a partir de *3.025 m²*, em Açailândia/MA. Veja também os vídeos das obras.\n\n📍 Abra o mapa 3D:\n${MARCA_LINK}`,
  },
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
    chave: 'fixo:rota', titulo: 'Como chegar — rota do centro de Açailândia até o portal', fixo: true, destaque: true, empreendimento: 'Bom Jardims',
    descricao: 'Página com o vídeo narrado do caminho, os pontos de referência (Prefeitura, BR-222, PRF, estação ferroviária, duas ferrovias, Balneário Walter Figueiredo), botões do Google Maps, Waze e Apple Maps, arquivo da rota (GPX/KML), folder e PDF de apresentação.',
    url: ROTA_COMO_CHEGAR, utmSource: 'whatsapp', utmCampaign: CAMPANHA_ROTA,
    textoWhatsapp: `Quer conhecer o *Condomínio de Chácaras Bom Jardims*? Preparamos um vídeo mostrando o caminho do centro de Açailândia até o portal do condomínio.\n\nAbra o link, escolha seu aplicativo de navegação e confira os pontos de referência:\n${MARCA_LINK}\n\nPara tirar dúvidas e combinar uma visita, é só me chamar.`,
  },
  {
    chave: 'fixo:rota-resposta', titulo: 'Como chegar — resposta pronta para quem pedir a rota', fixo: true, destaque: false, empreendimento: 'Bom Jardims',
    descricao: 'Mensagem curta para responder no WhatsApp quando o cliente pedir a localização: o link da rota com o vídeo e os apps de navegação.',
    url: ROTA_COMO_CHEGAR, utmSource: 'whatsapp', utmCampaign: CAMPANHA_ROTA,
    textoWhatsapp: `Aqui está o caminho até o Condomínio de Chácaras Bom Jardims:\n${MARCA_LINK}\n\nA página abre a navegação no Google Maps, Waze ou Apple Maps e mostra os pontos de referência. Posso ajudar você a combinar uma visita?`,
  },
  {
    chave: 'fixo:rota-status', titulo: 'Como chegar — texto para o Status do WhatsApp', fixo: true, destaque: false, empreendimento: 'Bom Jardims',
    descricao: 'Poste o vídeo narrado da rota no Status e cole este texto na legenda (o link abre a página com o vídeo, Google Maps e Waze).',
    url: ROTA_COMO_CHEGAR, utmSource: 'whatsapp-status', utmCampaign: CAMPANHA_ROTA,
    textoWhatsapp: `🧭 *Como chegar ao Bom Jardims*\nDo centro de Açailândia ao portal: 17 km, uns 24 min de carro.\n\n🎥 Veja o caminho com os pontos de referência e abra no Google Maps ou Waze 👇\n${MARCA_LINK}\n\n🌳 Chácaras a partir de 3.025 m² · Lançamento oficial 14/11`,
  },
  {
    chave: 'fixo:rota-instagram', titulo: 'Como chegar — legenda do Reels no Instagram', fixo: true, destaque: false, empreendimento: 'Bom Jardims',
    descricao: 'Legenda para o Reels do vídeo narrado da rota. No Instagram o link não fica clicável: quem comentar ROTA recebe o link pelo Direct ou WhatsApp.',
    url: ROTA_COMO_CHEGAR, utmSource: 'instagram', utmCampaign: CAMPANHA_ROTA,
    textoWhatsapp: `📍 Como chegar ao Condomínio de Chácaras Bom Jardims\n\nDo centro de Açailândia até o portal em 17 km, cerca de 24 minutos de carro. No vídeo você vê o caminho inteiro com os pontos de referência:\n\n1️⃣ Prefeitura Municipal\n2️⃣ BR-222, sentido Piquiá\n3️⃣ Posto da PRF\n4️⃣ Entrada da estação ferroviária\n5️⃣ Duas ferrovias (atenção à passagem dos trens 🚆)\n6️⃣ Balneário Walter Figueiredo\n7️⃣ Portal do Bom Jardims 🌳\n\nQuer a rota no seu celular, com Google Maps, Waze e o vídeo narrado? Comente ROTA ou chame no WhatsApp que eu te mando o link.\n\n🌿 Chácaras a partir de 3.025 m² · Lançamento oficial em 14/11\n\n🔗 ${MARCA_LINK}\n\n#BomJardims #Açailândia #Chácaras #ComoChegar #Maranhão #ChácarasÀVenda #Imperatriz #CondomínioDeChácaras`,
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
  {
    chave: 'fixo:simulador', titulo: 'Simulador de financiamento (com valores)', fixo: true, destaque: false, empreendimento: 'Bom Jardims',
    descricao: 'Página com os valores: o cliente escolhe a chácara livre, arrasta a barra da entrada (mais ou menos parcelas) e vê na hora a entrada, as parcelas e o à vista. O botão "Quero a chácara" vem para o seu WhatsApp com a simulação.',
    url: '/o/bom-jardims', utmSource: 'whatsapp', utmCampaign: 'BJ-SIMULADOR',
    textoWhatsapp: `💰 *Simule a sua chácara no Condomínio Bom Jardims*\n\nEscolha a chácara, ajuste a entrada e veja na hora as parcelas — financiamento direto com a empreendedora, sem banco:\n${MARCA_LINK}`,
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
