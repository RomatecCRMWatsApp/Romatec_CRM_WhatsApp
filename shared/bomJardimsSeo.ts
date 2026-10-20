/**
 * Textos de busca do Bom Jardims, usados na página (perguntas frequentes visíveis),
 * no HTML que o Google recebe antes do JavaScript e nos dados estruturados (JSON-LD).
 * Objetivo: o Google ligar "Chácaras Bom Jardims", "Bom Jardims", "chácaras à venda em
 * Açailândia" etc. à mesma página — e diferenciar de empreendimentos de nome parecido.
 * Regra: nada de preço e nada de escassez.
 */

/** Como as pessoas escrevem o nome na busca */
export const NOMES_ALTERNATIVOS = [
  'Chácaras Bom Jardims',
  'Chácara Bom Jardims',
  'Condomínio Bom Jardims',
  'Bom Jardims Açailândia',
  'Bom Jardims Chácaras',
  'Condomínio de Chácaras Bom Jardims',
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
    pergunta: 'O Bom Jardims é condomínio fechado?',
    resposta: 'Sim. É um condomínio de chácaras com portal de acesso, ruas internas com nome, poço e reservatório de água e área de vivência.',
  },
  {
    pergunta: 'Bom Jardims ou Bom Jardim?',
    resposta: 'O nome é Bom Jardims, com S no final: o condomínio de chácaras de Açailândia/MA, na BR-222. Não confundir com outros loteamentos de nome parecido em outras cidades.',
  },
  {
    pergunta: 'Como visitar ou comprar uma chácara no Bom Jardims?',
    resposta: 'Agende uma visita pelo WhatsApp com o corretor José Romário (CRECI/MA 4.705), da Romatec Consultoria. Ele passa as condições e mostra o mapa das chácaras disponíveis.',
  },
];

/** Bloco de texto para o HTML inicial (o React substitui ao carregar) */
export function htmlEstaticoBomJardims(): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<main style="font-family:sans-serif;max-width:860px;margin:0 auto;padding:24px">',
    '<h1>Chácaras Bom Jardims — Condomínio de Chácaras em Açailândia/MA</h1>',
    '<p>Chácaras à venda em Açailândia, Maranhão: o Condomínio de Chácaras Bom Jardims tem 82 chácaras a partir de 3.025 m², portal de acesso, ruas internas de 12 m e área de vivência às margens do córrego, na BR-222 (Estrada do Piquiá dos Baianos, km 15).</p>',
    '<h2>Perguntas frequentes sobre o Bom Jardims</h2>',
    ...FAQ_BOM_JARDIMS.map(f => `<h3>${esc(f.pergunta)}</h3><p>${esc(f.resposta)}</p>`),
    '<p>Romatec Consultoria Total · Corretor José Romário · CRECI/MA 4.705</p>',
    '</main>',
  ].join('');
}
