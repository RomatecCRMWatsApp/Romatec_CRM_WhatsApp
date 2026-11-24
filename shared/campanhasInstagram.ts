/**
 * Campanhas do Instagram (Meta Ads, só Instagram): vendas (conversas no WhatsApp) e seguidores (visitas ao perfil).
 * Regras puras: métricas da campanha anterior, divisão do orçamento, projeção honesta, regras de corte e os textos
 * (anúncios, legendas, mensagem automática e ganchos). Base: kit "campanhas-instagram-vendas-seguidores" (nov/2026).
 */

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export interface CampanhaAnterior { nome?: string; gasto: number; resultados: number; alcance?: number | null; impressoes?: number | null; criativoVencedor?: string | null }

export function metricasAnteriores(c: CampanhaAnterior) {
  if (!(c.gasto > 0) || !(c.resultados > 0)) return null;
  const imp = Number(c.impressoes) || 0, alc = Number(c.alcance) || 0;
  return {
    custoPorResultado: r2(c.gasto / c.resultados),
    cpm: imp ? r2((c.gasto / imp) * 1000) : null,
    frequencia: imp && alc ? r2(imp / alc) : null,
    resultadosPorMilAlcancados: alc ? Math.round((c.resultados / alc) * 1000 * 10) / 10 : null,
  };
}

export interface EntradaPlano {
  orcamento: number; dias: number; inicio: string;
  /** Fração do orçamento para vendas (o resto vai para seguidores). Padrão 0,5 */
  fracaoVendas?: number;
  /** Faixa de custo por conversa e por seguidor [bom, conservador] */
  custoConversa?: [number, number]; custoSeguidor?: [number, number];
  seguidoresAtuais?: number | null; metaSeguidores?: number | null;
}

export const FAIXA_CONVERSA: [number, number] = [3.5, 5];
export const FAIXA_SEGUIDOR: [number, number] = [0.6, 1.2];

const somarDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function planejar(e: EntradaPlano) {
  if (!(e.orcamento > 0)) throw new Error('Informe o orçamento');
  if (!(e.dias >= 1 && e.dias <= 90)) throw new Error('Duração de 1 a 90 dias');
  const fv = Math.min(Math.max(e.fracaoVendas ?? 0.5, 0), 1);
  const [cBom, cCons] = e.custoConversa ?? FAIXA_CONVERSA;
  const [sBom, sCons] = e.custoSeguidor ?? FAIXA_SEGUIDOR;
  const vendas = r2(e.orcamento * fv), seguidores = r2(e.orcamento - vendas);
  const conversas = vendas > 0 ? { min: Math.floor(vendas / cCons), max: Math.floor(vendas / cBom) } : null;
  const novos = seguidores > 0 ? { min: Math.floor(seguidores / sCons), max: Math.floor(seguidores / sBom) } : null;
  const atuais = Number(e.seguidoresAtuais) || 0;
  const meta = Number(e.metaSeguidores) || 0;
  const perfilNoFim = novos && atuais ? { min: atuais + novos.min, max: atuais + novos.max } : null;
  let alertaMeta: string | null = null;
  let custoMeta: { faltam: number; min: number; max: number } | null = null;
  if (meta > atuais && atuais > 0) {
    const faltam = meta - atuais;
    custoMeta = { faltam, min: Math.round(faltam * sBom), max: Math.round(faltam * sCons) };
    if (!novos || novos.max < faltam) {
      alertaMeta = `A meta de ${meta.toLocaleString('pt-BR')} seguidores não cabe neste orçamento: faltam ${faltam.toLocaleString('pt-BR')}, o que custaria de R$ ${custoMeta.min.toLocaleString('pt-BR')} a R$ ${custoMeta.max.toLocaleString('pt-BR')} só em anúncio, com 2 a 4 meses de anúncio contínuo e conteúdo diário.`;
    }
  }
  return {
    inicio: e.inicio, termino: somarDias(e.inicio, e.dias - 1), dias: e.dias, orcamento: r2(e.orcamento), porDia: r2(e.orcamento / e.dias),
    vendas: {
      total: vendas, porDia: r2(vendas / e.dias), conversas, faixa: [cBom, cCons] as [number, number],
      // Conjuntos 70/30: frio (cidade + 40 km) e remarketing
      conjuntos: { frio: r2(vendas * 0.7), remarketing: r2(vendas - r2(vendas * 0.7)) },
    },
    seguidores: { total: seguidores, porDia: r2(seguidores / e.dias), novos, faixa: [sBom, sCons] as [number, number], perfilNoFim },
    alertaMeta, custoMeta,
  };
}

export const REGRAS_CORTE: { quando: string; sinal: string; acao: string }[] = [
  { quando: 'Dias 1 e 2', sinal: 'aprendizado', acao: 'não mexer' },
  { quando: 'Fim do dia 2', sinal: 'custo por conversa acima de R$ 8', acao: 'pausar o criativo mais caro' },
  { quando: 'Fim do dia 2', sinal: 'custo por seguidor acima de R$ 2', acao: 'pausar o Reels' },
  { quando: 'Fim do dia 2', sinal: 'muitas visitas e poucos seguidores', acao: 'revisar bio, destaques e grade' },
  { quando: 'Fim do dia 3', sinal: 'frequência acima de 3 no remarketing', acao: 'reduzir remarketing e reforçar o frio' },
];

/** Passo a passo no Gerenciador de Anúncios (confira na Meta: os menus mudam) */
export const CONFIG_META = {
  vendas: [
    'Objetivo Engajamento → local da conversão: Apps de mensagens → WhatsApp → meta Maximizar conversas.',
    'Posicionamento manual: Feed, Stories, Reels, Explorar e Perfil do Instagram. Desmarque Facebook, Messenger, Threads e Audience Network.',
    'Conjunto frio (70%): cidade-base + raio de ~40 km, 28 a 60 anos, Advantage+ ligado.',
    'Conjunto remarketing (30%): quem viu 50% ou mais dos vídeos, interagiu com o Instagram nos últimos 60 dias ou mandou mensagem.',
    'Criativos: o corte novo de vendas e o vencedor da campanha anterior, para a Meta comparar.',
    'Mensagem automática no WhatsApp com 3 opções (visita, valores, mapa). Responder em até 5 minutos.',
  ],
  seguidores: [
    'A Meta não cobra por seguidor: objetivo Tráfego → local: Perfil do Instagram → meta Maximizar visitas ao perfil.',
    'Se a opção não aparecer, use no app do Instagram: Turbinar → Mais visitas ao perfil.',
    'Público regional: cidade-base + cidades vizinhas, raio de ~80 km, 20 a 55 anos. Exclua o público de remarketing da campanha de vendas.',
    'Meça pela coluna Seguidores do Instagram e crie a métrica Custo por seguidor = Valor gasto ÷ Seguidores do Instagram.',
  ],
  orcamento: [
    'Use orçamento total (vitalício) com data de término, para não passar do valor.',
    'Só no Instagram o CPM costuma ser maior: projete com R$ 18 a R$ 26 se a anterior misturava Facebook.',
  ],
  perfil: [
    'Bio com o nome, a cidade, o diferencial, a chamada para acompanhar a obra e o link do WhatsApp.',
    'Fixe 3 publicações fortes e crie os destaques Obra, Natureza, Mapa, Visitas e Contato.',
    'Publique 1 Reels por dia durante a campanha.',
  ],
};

export interface DadosEmpreendimentoCampanha {
  nome: string; cidade: string; distancia: string; beneficio: string; unidades: string; obra: string;
  condicoes: string[]; visita: string; corretor: string; creci: string; whatsapp: string; perfil: string; slogan: string;
  hashtags: string[];
  /** Ganchos fixos do topo do vídeo (2 linhas cada) */
  ganchoVendas: [string, string]; ganchoSeguidores: [string, string];
}

/** Bom Jardims (fatos da narração de 24/11/2026 — confirme preço e condições antes de veicular) */
export const PERFIL_BOM_JARDIMS: DadosEmpreendimentoCampanha = {
  nome: 'Condomínio de Chácaras Bom Jardims', cidade: 'Açailândia', distancia: '17 km',
  beneficio: 'Chácaras de 3.025 a 3.600 m² com rio e natureza', unidades: '84 chácaras',
  obra: 'obras iniciadas, ruas de 12 m abertas e chácaras demarcadas',
  condicoes: ['Financiamento direto, sem banco', 'Entrada de R$ 10 mil e parcelas fixas em até 180x'],
  visita: 'Visita com busca de carro', corretor: 'José Romário', creci: 'CRECI/MA F-4.705', whatsapp: '5599991811246', perfil: 'avalieimob',
  slogan: 'Mais espaço, mais qualidade de vida.',
  hashtags: ['#Açailândia', '#AçailândiaMA', '#chácara', '#chácaras', '#condomíniodechácaras', '#terreno', '#imóveisMaranhão', '#BomJardims', '#vidanocampo', '#natureza'],
  ganchoVendas: ['Chácara com rio a 17 km de Açailândia', 'com entrada de R$ 10 mil'],
  ganchoSeguidores: ['Estamos construindo um condomínio', 'de chácaras do zero. Acompanhe!'],
};

const foneBr = (w: string) => { const d = w.replace(/\D/g, '').replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}` : w; };

export function textosCampanha(p: DadosEmpreendimentoCampanha) {
  const handle = `@${p.perfil.replace(/^@/, '')}`;
  const anuncioVendas = [
    `🌳 ${p.beneficio}, a apenas ${p.distancia} de ${p.cidade}.`,
    `${p.nome}: ${p.unidades}, ${p.obra}.`,
    ...p.condicoes.map(c => `✅ ${c}`),
    `✅ ${p.visita}`,
    `📲 Toque em Enviar mensagem e fale com o corretor ${p.corretor}.`,
    p.slogan,
  ].join('\n');
  const anuncioSeguidores = [
    `Estamos mostrando, etapa por etapa, a construção do ${p.nome}, a ${p.distancia} de ${p.cidade} 🌳 Obras, natureza e novidades em primeira mão.`,
    `👉 Siga ${handle} para acompanhar tudo.`,
  ].join('\n');
  const mensagemAutomatica = [
    `Olá! Que bom que você se interessou pelo ${p.nome} 🌳 Para eu te atender melhor, escolha uma opção:`,
    '1️⃣ Quero agendar uma visita', '2️⃣ Quero saber valores e condições', '3️⃣ Quero ver o mapa das unidades disponíveis',
  ].join('\n');
  const tags = p.hashtags.slice(0, 12).join(' ');
  const legendaVendas = [
    `${p.ganchoVendas.join(' ')} 🌳`, '',
    `📍 ${p.distancia} de ${p.cidade}`, `🏡 ${p.unidades}`, `🚧 ${p.obra.replace(/^./, c => c.toUpperCase())}`,
    ...p.condicoes.map(c => `💰 ${c}`), `🚗 ${p.visita}`, '',
    `📲 Fale com ${p.corretor} (${p.creci}): ${foneBr(p.whatsapp)} · wa.me/${p.whatsapp.replace(/\D/g, '')}`, '', p.slogan, '', tags,
  ].join('\n');
  const legendaSeguidores = [
    `Estamos construindo o ${p.nome} do zero 🌳`, '',
    'Aqui você acompanha cada etapa: obras, natureza, as chácaras e as novidades em primeira mão.', '',
    `👉 Siga ${handle}`, '', p.slogan, '', tags,
  ].join('\n');
  return {
    anuncioVendas, tituloVendas: `Agende sua visita ao ${p.nome}`, ctaVendas: 'Enviar mensagem',
    anuncioSeguidores, ctaSeguidores: 'Visitar perfil', mensagemAutomatica, legendaVendas, legendaSeguidores,
    ganchoVendas: p.ganchoVendas, ganchoSeguidores: p.ganchoSeguidores,
    avisos: [
      ...[...p.ganchoVendas, ...p.ganchoSeguidores].filter(l => l.length > 38).map(l => `Gancho com mais de 38 caracteres (corta no vídeo): "${l}"`),
      'Confirme preço e condições antes de veicular. Não use escassez nem valorização que não foram ditas.',
    ],
  };
}
