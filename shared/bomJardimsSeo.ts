/**
 * Textos de busca do Bom Jardims, usados na página (texto "Sobre" e perguntas frequentes visíveis),
 * no HTML que o Google recebe antes do JavaScript e nos dados estruturados (JSON-LD).
 * Objetivo: o Google ligar "condomínio de chácaras em Açailândia", "chácara à venda em Açailândia/MA",
 * "Chácaras Bom Jardims" / "Bom Jardins" etc. à mesma página — e diferenciar de empreendimentos de nome parecido.
 * Regra: nada de preço e nada de escassez. Só fatos do empreendimento (memorial, licença, SIGEF).
 */

export const TITULO_BOM_JARDIMS = 'Condomínio de Chácaras em Açailândia/MA — Chácaras Bom Jardims à venda';

export const DESCRICAO_BOM_JARDIMS =
  'Chácaras à venda em Açailândia/MA: Condomínio de Chácaras Bom Jardims, na BR-222. 82 chácaras a partir de 3.025 m², portal, água encanada e área de vivência. Agende sua visita.';

/** Rota pública do formulário de agendamento */
export const AGENDAR_BOM_JARDIMS = '/agendar/bom-jardims';

/** Como as pessoas escrevem o nome na busca */
export const NOMES_ALTERNATIVOS = [
  'Chácaras Bom Jardims',
  'Chácara Bom Jardims',
  'Condomínio Bom Jardims',
  'Bom Jardims Açailândia',
  'Bom Jardims Chácaras',
  'Condomínio de Chácaras Bom Jardims',
  'Chácaras Bom Jardins Açailândia',
  'Condomínio Bom Jardins',
];

/** Texto "Sobre" (seção da página e HTML inicial) */
export const SOBRE_BOM_JARDIMS: { titulo: string; paragrafos: string[] }[] = [
  {
    titulo: 'Condomínio de chácaras em Açailândia/MA',
    paragrafos: [
      'O Condomínio de Chácaras Bom Jardims é um condomínio fechado de chácaras em Açailândia, no Maranhão. São 82 chácaras à venda, com terrenos a partir de 3.025 m², numa área total de 41 hectares — espaço para morar com tranquilidade, ter um lugar de lazer no fim de semana ou investir em terra perto da cidade.',
      'O nome é Bom Jardims, com S no final; muita gente procura como "Bom Jardins" ou "chácaras Bom Jardim". É o mesmo empreendimento da BR-222, em Açailândia.',
    ],
  },
  {
    titulo: 'Localização: BR-222, região de Açailândia e Imperatriz',
    paragrafos: [
      'As chácaras ficam na Estrada do Piquiá dos Baianos, na altura do km 15 da BR-222, na Fazenda Lua Nova, em Açailândia/MA — acesso fácil para quem mora em Açailândia, Imperatriz e na região do Sudoeste Maranhense.',
    ],
  },
  {
    titulo: 'Infraestrutura do condomínio',
    paragrafos: [
      'Portal de acesso com guarita e controle de acesso, 8 ruas internas de 12 m (9 m de rolamento e calçada dos dois lados), água encanada de poço artesiano do condomínio com reservatório elevado de 50 m³ e hidrômetro individual em cada chácara.',
      'Às margens do córrego fica a área de vivência exclusiva dos moradores: trilha, pontos de banho, quiosques, vestiário e churrasqueira, com a flora e a fauna preservadas.',
    ],
  },
  {
    titulo: 'Documentação e condições',
    paragrafos: [
      'A área é georreferenciada e certificada no SIGEF/INCRA, tem Licença de Operação da Secretaria Municipal de Meio Ambiente (SEMMA) e cada chácara tem memorial descritivo próprio.',
      'O pagamento é direto com o empreendimento, sem banco: à vista com desconto ou a prazo, em pagamentos mensais. A tabela de valores e as condições completas são apresentadas pelo corretor no atendimento.',
    ],
  },
];

export const FAQ_BOM_JARDIMS: { pergunta: string; resposta: string }[] = [
  {
    pergunta: 'Onde ficam as Chácaras Bom Jardims?',
    resposta: 'O Condomínio de Chácaras Bom Jardims fica em Açailândia, no Maranhão, na Estrada do Piquiá dos Baianos, na altura do km 15 da BR-222, na Fazenda Lua Nova — região de Açailândia e Imperatriz.',
  },
  {
    pergunta: 'Qual o tamanho das chácaras do Bom Jardims?',
    resposta: 'São 82 chácaras a partir de 3.025 m², em quadras com ruas internas de 12 metros e área de vivência e recreação às margens do córrego.',
  },
  {
    pergunta: 'Qual o preço das chácaras do Bom Jardims?',
    resposta: 'O valor depende do tamanho e da posição de cada chácara. A tabela atualizada, com o valor à vista e a prazo, é enviada pelo corretor no atendimento — agende sua visita ou peça pelo WhatsApp.',
  },
  {
    pergunta: 'Quais as formas de pagamento?',
    resposta: 'À vista, com desconto, ou a prazo direto com o empreendimento, sem banco, em pagamentos mensais. O corretor apresenta as condições completas e faz a simulação com você.',
  },
  {
    pergunta: 'O Bom Jardims é condomínio fechado?',
    resposta: 'Sim. É um condomínio de chácaras com portal de acesso, ruas internas com nome, poço e reservatório de água e área de vivência.',
  },
  {
    pergunta: 'O empreendimento tem documentação?',
    resposta: 'Sim. A área é georreferenciada e certificada no SIGEF/INCRA, tem Licença de Operação da SEMMA de Açailândia e cada chácara tem memorial descritivo.',
  },
  {
    pergunta: 'Bom Jardims ou Bom Jardim?',
    resposta: 'O nome é Bom Jardims, com S no final: o condomínio de chácaras de Açailândia/MA, na BR-222. Não confundir com outros loteamentos de nome parecido em outras cidades.',
  },
  {
    pergunta: 'Como visitar ou comprar uma chácara no Bom Jardims?',
    resposta: 'Agende sua visita pelo formulário de agendamento ou pelo WhatsApp com o corretor José Romário (CRECI/MA 4.705), da Romatec Consultoria. Ele passa as condições e mostra o mapa das chácaras disponíveis.',
  },
];

/** Imagens da página com o texto alternativo (HTML inicial e prévia) */
export const IMAGENS_BOM_JARDIMS = [
  { src: '/bom-jardims/portal-dia.webp', alt: 'Portal de acesso do Condomínio de Chácaras Bom Jardims, em Açailândia/MA (perspectiva ilustrativa)', w: 1600, h: 900 },
  { src: '/bom-jardims/stand-aerea.webp', alt: 'Stand de vendas do Bom Jardims — vista aérea (perspectiva ilustrativa)', w: 1200, h: 676 },
];

/** Bloco de texto para o HTML inicial (o React substitui ao carregar) — mesmo conteúdo da página */
export function htmlEstaticoBomJardims(): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const [hero, aerea] = IMAGENS_BOM_JARDIMS;
  const botao = 'display:inline-block;padding:14px 20px;border-radius:12px;background:#C9A24A;color:#0C3320;font-weight:700;text-decoration:none;margin:4px 8px 4px 0';
  return [
    '<main style="font-family:sans-serif;max-width:860px;margin:0 auto;padding:24px 16px;color:#E8F0EB;line-height:1.55">',
    `<img src="${hero.src}" alt="${esc(hero.alt)}" width="${hero.w}" height="${hero.h}" fetchpriority="high" style="width:100%;height:auto;border-radius:16px" />`,
    '<h1>Chácaras Bom Jardims — Condomínio de Chácaras em Açailândia/MA</h1>',
    '<p>Chácaras à venda em Açailândia, Maranhão: o Condomínio de Chácaras Bom Jardims tem 82 chácaras a partir de 3.025 m², portal de acesso, ruas internas de 12 m e área de vivência às margens do córrego, na BR-222 (Estrada do Piquiá dos Baianos, km 15).</p>',
    `<p><a href="${AGENDAR_BOM_JARDIMS}" style="${botao}">Agendar visita</a><a href="#mapa" style="color:#E8F0EB">Ver as chácaras no mapa</a></p>`,
    '<h2>Sobre o Condomínio de Chácaras Bom Jardims</h2>',
    ...SOBRE_BOM_JARDIMS.map(s => `<h3>${esc(s.titulo)}</h3>${s.paragrafos.map(p => `<p>${esc(p)}</p>`).join('')}`),
    `<img src="${aerea.src}" alt="${esc(aerea.alt)}" width="${aerea.w}" height="${aerea.h}" loading="lazy" style="width:100%;height:auto;border-radius:16px" />`,
    '<h2>Perguntas frequentes sobre o Bom Jardims</h2>',
    ...FAQ_BOM_JARDIMS.map(f => `<h3>${esc(f.pergunta)}</h3><p>${esc(f.resposta)}</p>`),
    `<p><a href="${AGENDAR_BOM_JARDIMS}" style="${botao}">Agendar visita ao Bom Jardims</a></p>`,
    '<p>Romatec Consultoria Total · Rua São Raimundo, 10, Centro, Açailândia/MA · Corretor José Romário · CRECI/MA 4.705 · (99) 99181-1246</p>',
    '</main>',
  ].join('');
}
