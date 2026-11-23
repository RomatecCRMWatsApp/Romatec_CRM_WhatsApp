/**
 * Respostas automáticas no WhatsApp (empreendimento — ex.: Bom Jardims): classificação da mensagem por intenção,
 * variáveis dos textos (valores sempre do simulador), horário de atendimento e aviso legal (CDC, art. 52).
 * Regras puras, usadas no servidor (server/autoresposta/motor.ts) e na tela de configuração.
 */
import { brl, type CondicoesPagamento, type Simulacao } from './simulador';
import { montarLink } from './linksDivulgacao';
import { CAMPANHA_PAGAMENTO, ROTA_PAGAMENTO } from './pagamentoBomJardims';
import { CAMPANHA_MAPA3D, ROTA_MAPA3D } from './mapa3dBomJardims';
import { CAMPANHA_ROTA, ROTA_COMO_CHEGAR } from './rotaBomJardims';
import { CAMPANHA_RIO, ROTA_RIO } from './rioBomJardims';
import { ESCRITORIO, HORARIO_ESCRITORIO, HORARIO_ESCRITORIO_EXTRA, REFERENCIA_ESCRITORIO, ROTA_ESCRITORIO } from './escritorio';

export const INTENCOES = [
  'primeiro_contato', 'valores', 'a_vista', 'escassez', 'followup', 'mapa', 'visita', 'como_chegar', 'rio', 'escritorio', 'juros', 'documentacao', 'fechar',
  'chacara_especifica', 'optout', 'ultimas_livres',
] as const;
export type Intencao = typeof INTENCOES[number];
export const ROTULO_INTENCAO: Record<Intencao, string> = {
  primeiro_contato: '1. Primeiro contato', valores: '2. Condições especiais', a_vista: '3. Pagamento à vista', escassez: '4. Escassez (régua 24 h)',
  followup: '5. Follow-up (régua 3 dias)', mapa: '6. Mapa com lupa e mapa 3D', visita: '7. Agendar visita', como_chegar: '8. Como chegar',
  rio: '9. O rio e a água', escritorio: '10. Endereço do escritório', juros: '11. Objeção: juros',
  documentacao: '12. Documentação e contrato', fechar: '13. Fechamento', chacara_especifica: 'Chácara específica (simulação)', optout: 'Descadastro',
  ultimas_livres: 'Régua 7 dias: três chácaras livres',
};

/** Intenções que só a régua usa (o cliente não "pede" por elas) */
export const SO_DA_REGUA: Intencao[] = ['escassez', 'followup', 'ultimas_livres'];

/**
 * Régua do robô depois da última mensagem do lead: 24 h escassez (+ story), 72 h follow-up, 7 dias três chácaras livres.
 * No máximo 3 mensagens automáticas seguidas sem resposta; fora do horário espera a próxima janela.
 */
export const REGUA: { intencao: Intencao; horas: number }[] = [
  { intencao: 'escassez', horas: 24 }, { intencao: 'followup', horas: 72 }, { intencao: 'ultimas_livres', horas: 168 },
];
export const MAX_SEGUIDAS = 3;

/** Próximo instante dentro do horário de atendimento (08:00–20:00, UTC−3) */
export function proximaJanela(t: number): number {
  if (dentroDoHorario(t)) return t;
  const local = new Date(t - 3 * 3_600_000);
  const h = local.getUTCHours();
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (h >= 20 ? 1 : 0), 8) + 3 * 3_600_000;
  return base;
}

/** Mídias da biblioteca de divulgação (códigos) */
export const MIDIAS = ['OFERTA', 'CONDICOES', 'STORY_ESCASSEZ', 'ESTRUTURA', 'MAPA', 'FOLDER_PDF'] as const;
export type CodigoMidia = typeof MIDIAS[number];
export const ROTULO_MIDIA: Record<CodigoMidia, string> = {
  OFERTA: '01 · Oferta (R$ 1.234/mês)', CONDICOES: '02 · Condições (Tabela Price)', STORY_ESCASSEZ: '03 · Story escassez',
  ESTRUTURA: '04 · Estrutura', MAPA: 'Mapa com a lupa do portal', FOLDER_PDF: 'Folder digital (PDF)',
};

export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const CODIGO_CHACARA = /\b([a-d])\s?0?(\d{1,2})\b/g;
const REGRAS: [Exclude<Intencao, 'chacara_especifica' | 'escassez' | 'followup'>, RegExp][] = [
  ['optout', /\b(sair|parar|pare|nao quero|descadastr|nao me mande|remover meu)/],
  ['fechar', /\b(reservar|fechar|comprar|vou ficar|quero (essa|esse|reservar|comprar|fechar|garantir))/],
  ['a_vista', /(a vista|avista|desconto|\bpix\b|dinheiro)/],
  ['valores', /(valor|preco|quanto|parcela|entrada|financ|tabela|condic)/],
  ['escritorio', /(escritorio|imobiliaria|onde voces ficam|onde fica a empresa|onde e a empresa|atendimento presencial|ir ate voces|loja)/],
  ['rio', /(\brio\b|corrego|riacho|\bagua\b|banho|deck|bangalo|praia|beira)/],
  ['como_chegar', /(como cheg|onde fica|localiza|endereco|\brota\b|caminho|distancia|quantos km|e longe|fica longe)/],
  ['mapa', /(mapa|disponive|quadra|3d)/],
  ['visita', /(visita|conhecer|ir ai|agendar)/],
  ['juros', /(juros|caro|taxa)/],
  ['documentacao', /(escritura|registro|documento|matricula|contrato)/],
  ['primeiro_contato', /^(oi|ola|opa|bom dia|boa tarde|boa noite|tenho interesse|interesse|info|vi o anuncio|anuncio)\b/],
];

/** Código de chácara citado ("A12", "c 3"); com a lista de códigos, só vale se existir */
export function chacaraCitada(texto: string, validos?: Set<string>): string | null {
  for (const m of Array.from(normalizar(texto).matchAll(CODIGO_CHACARA))) {
    const cod = `${m[1].toUpperCase()}${m[2].padStart(2, '0')}`;
    if (!validos || validos.has(cod)) return cod;
  }
  return null;
}

/**
 * Intenção da mensagem (regras por palavra-chave; sem custo). Prioridade: descadastro > fechar (também "quero a C03")
 * > chácara citada > demais. `indefinida` = cai no Claude (motor). `validos` evita ler "daqui a 2 dias" como chácara A02.
 */
export function classificar(texto: string, primeiraMensagem: boolean, validos?: Set<string>): { intencao: Intencao | 'indefinida'; chacara?: string } {
  const t = normalizar(texto);
  const chacara = chacaraCitada(texto, validos) ?? undefined;
  const regra = (n: string) => REGRAS.find(([k]) => k === n)![1];
  if (regra('optout').test(t)) return { intencao: 'optout' };
  if (regra('fechar').test(t) || (chacara && /\bquero\b/.test(t))) return { intencao: 'fechar', chacara };
  if (chacara) return { intencao: 'chacara_especifica', chacara };
  for (const [nome, re] of REGRAS) if (nome !== 'optout' && nome !== 'fechar' && re.test(t)) return { intencao: nome };
  return { intencao: primeiraMensagem ? 'primeiro_contato' : 'indefinida' };
}

/** Atendimento automático das 08:00 às 20:00 (Açailândia, UTC−3) */
export function dentroDoHorario(agora = Date.now()): boolean {
  const h = new Date(agora - 3 * 3_600_000).getUTCHours();
  return h >= 8 && h < 20;
}

/** Troca {{variavel}}; desconhecida vira vazio */
export function preencher(texto: string, vars: Record<string, string | number | null | undefined>): string {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

const pct = (v: number, d: number) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Variáveis de valores (todas do simulador) e de escassez/prazo — nunca números fixos no texto */
export function variaveisDaOferta(p: { sim: Simulacao; c: CondicoesPagamento; disponiveis: number; condicaoValidaAte?: string | null; entradaParcelas: number }) {
  const { sim, c } = p;
  const plano = (n: number) => sim.planos.find(x => x.prazo === n);
  const maior = sim.planos.reduce((a, b) => (b.prazo > a.prazo ? b : a), sim.planos[0]);
  const parcelaEntrada = sim.parcelasEntrada[0] ?? sim.entrada30;
  const vars: Record<string, string> = {
    area: sim.areaM2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    preco: brl(sim.preco), avista: brl(sim.avistaTotal.valor), desconto_avista: brl(sim.avistaTotal.desconto),
    entrada: brl(sim.entrada30), entrada_parcelas: String(p.entradaParcelas), entrada_parcela: brl(parcelaEntrada),
    entrada_avista: brl(sim.entradaAvista), economia_entrada: brl(sim.descontoAvista), saldo: brl(sim.saldo),
    juros_aa: pct(c.jurosAaEfetivo, 0), juros_am: pct(sim.taxaMensal, 4),
    prazo_maior: String(maior?.prazo ?? ''), parcela_maior: maior ? brl(maior.parcela) : '',
    total_prazo: maior ? brl(sim.entrada30 + maior.totalSaldo) : '',
    disponiveis: String(p.disponiveis),
    validade_condicao: p.condicaoValidaAte ? `válida até ${dataBr(p.condicaoValidaAte)}` : 'de lançamento e pode mudar sem aviso',
  };
  for (const n of c.prazos) { const x = plano(n); if (x) vars[`p${n}`] = brl(x.parcela); }
  vars.tabela_prazos = sim.planos.map(x => `• ${x.prazo}× ${brl(x.parcela)}${x.prazo === maior?.prazo ? ' ⭐ o mais escolhido' : ''}`).join('\n');
  return vars;
}

/** Aviso legal (CDC, art. 52) com os números do simulador; `modelo` pode trazer {{variaveis}} */
export function avisoLegal(vars: Record<string, string>, modelo?: string | null): string {
  const padrao = 'Simulação sem valor de proposta firme, sujeita à disponibilidade e a alteração de condições. Financiamento direto com a empreendedora. ' +
    'Preço à vista {{avista}}; juros {{juros_aa}} a.a. ({{juros_am}} a.m.); {{prazo_maior}} parcelas mensais; total a prazo {{total_prazo}} (CDC, art. 52).';
  return preencher(modelo?.trim() || padrao, vars);
}

/** Toda mensagem com valores termina com o aviso legal (em itálico no WhatsApp) */
export function comAvisoLegal(texto: string, aviso: string): string {
  if (!/R\$\s?\d/.test(texto) || texto.includes(aviso)) return texto;
  return `${texto.trimEnd()}\n\n_${aviso}_`;
}

/**
 * Vídeo da intenção (imagem + áudio explicativo, o mesmo que o corretor manda nos links): sai como UMA mensagem,
 * o vídeo com o texto na legenda. Texto maior que o limite da legenda vai em mensagem separada, logo depois.
 */
export const VIDEOS_DO_ROBO: Record<string, Partial<Record<Intencao, { url: string; titulo: string }>>> = {
  'bom-jardims': {
    valores: { url: '/bom-jardims/robo/formas-de-pagamento.mp4', titulo: 'Formas de pagamento' },
    a_vista: { url: '/bom-jardims/robo/formas-de-pagamento.mp4', titulo: 'Formas de pagamento' },
    juros: { url: '/bom-jardims/robo/formas-de-pagamento.mp4', titulo: 'Formas de pagamento' },
    mapa: { url: '/bom-jardims/robo/mapa-3d.mp4', titulo: 'Mapa 3D' },
    escassez: { url: '/bom-jardims/robo/mapa-3d.mp4', titulo: 'Mapa 3D' },
    ultimas_livres: { url: '/bom-jardims/robo/mapa-3d.mp4', titulo: 'Mapa 3D' },
    visita: { url: '/bom-jardims/robo/visita-e-retorno.mp4', titulo: 'Como funciona a visita' },
    followup: { url: '/bom-jardims/robo/visita-e-retorno.mp4', titulo: 'Agende seu retorno' },
    como_chegar: { url: '/bom-jardims/robo/como-chegar.mp4', titulo: 'Como chegar' },
    rio: { url: '/bom-jardims/robo/rio-e-agua.mp4', titulo: 'O rio e a água' },
    escritorio: { url: '/bom-jardims/robo/escritorio.mp4', titulo: 'Nosso escritório' },
    documentacao: { url: '/bom-jardims/robo/contrato.mp4', titulo: 'Contrato' },
    fechar: { url: '/bom-jardims/robo/contrato.mp4', titulo: 'Contrato' },
  },
};
/** Limite seguro da legenda de vídeo no WhatsApp */
export const LIMITE_LEGENDA = 1000;

/** Páginas do empreendimento que o robô manda (cada uma com áudio explicativo), com o código do corretor (?c=) */
export const VARIAVEIS_LINKS = ['link_pagamento', 'link_mapa3d', 'link_rota', 'link_visita', 'link_rio', 'link_escritorio', 'link_contrato', 'link_retorno'] as const;

export function linksDoRobo(base: string, slug: string, ref?: string | null): Record<string, string> {
  const l = (url: string, campanha: string | null) => montarLink(base, { url, utmSource: 'robo-whatsapp', utmCampaign: campanha }, ref);
  const bj = slug === 'bom-jardims';
  return {
    link_pagamento: bj ? l(ROTA_PAGAMENTO, CAMPANHA_PAGAMENTO) : l(`/o/${slug}`, null),
    link_mapa3d: bj ? l(ROTA_MAPA3D, CAMPANHA_MAPA3D) : l(`/${slug}`, null),
    link_rota: bj ? l(ROTA_COMO_CHEGAR, CAMPANHA_ROTA) : l(`/${slug}`, null),
    link_rio: bj ? l(ROTA_RIO, CAMPANHA_RIO) : l(`/${slug}`, null),
    link_visita: l(`/agendar/${slug}`, 'BJ-VISITA'),
    link_retorno: l(`/retorno/${slug}`, 'BJ-RETORNO'),
    link_contrato: l(`/documentos/${slug}/contrato`, 'BJ-CONTRATO'),
    link_escritorio: l(ROTA_ESCRITORIO, 'ESCRITORIO'),
  };
}

const ENDERECO_ESCRITORIO = `${ESCRITORIO.endereco}, ${REFERENCIA_ESCRITORIO.charAt(0).toLowerCase()}${REFERENCIA_ESCRITORIO.slice(1)}`;

/**
 * Textos de partida (v2): curtos, uma pergunta por vez, e cada assunto com a página dele (áudio + detalhes) no lugar de
 * textos longos. Valores só do simulador ou das condições de lançamento; nenhuma escassez inventada ({{disponiveis}} é real).
 */
export const TEXTOS_PADRAO: Record<Intencao, { texto: string; midias: CodigoMidia[] }> = {
  primeiro_contato: {
    midias: ['OFERTA'],
    texto: 'Olá, {{nome}}! Aqui é {{corretor}}, do *Condomínio de Chácaras Bom Jardims* 🌳\n\n' +
      'São chácaras de *3.025 m²* em condomínio fechado, a 17 km do centro de Açailândia, com portaria, poço artesiano, energia e área de vivência à beira do rio.\n\n' +
      '💰 *Entrada a partir de R$ 10 mil* e parcelas fixas direto com a empreendedora, sem banco.\n\n' +
      '🏷️ Sua oferta (escolha a chácara e veja a parcela): {{link_oferta}}\n🧮 Formas de pagamento, com áudio: {{link_pagamento}}\n🗺️ Mapa 3D das chácaras: {{link_mapa3d}}\n\n' +
      'Me conta: a ideia é *morar*, *investir* ou ter um lugar de *lazer* no fim de semana?',
  },
  valores: {
    midias: ['CONDICOES'],
    texto: '*Condições especiais de lançamento* do Bom Jardims, {{nome}}:\n\n' +
      '✅ *Entrada de 30%*: {{entrada_parcelas}}× {{entrada_parcela}} sem juros + saldo em até {{prazo_maior}}× {{parcela_maior}} fixas (o menor total)\n✅ *Plano A*: R$ 10 mil + parcelas + reforço no 13º\n✅ *Plano B*: R$ 10 mil + até 180× fixas, sem reforço\n✅ *Plano C*: R$ 10 mil + resto da entrada em 36× sem juros\n\n' +
      'Na página você escolhe a chácara, o plano e o prazo e vê na hora quanto paga por mês (tem um áudio explicando cada plano):\n{{link_pagamento}}\n\n' +
      'Qual plano cabe melhor no seu bolso?',
  },
  a_vista: {
    midias: [],
    texto: 'À vista a chácara de {{area}} m² sai por *{{avista}}*: *{{desconto_avista}} de desconto* sobre a tabela. 💵\n\n' +
      'Outra opção é pagar *a entrada à vista ({{entrada_avista}})* e parcelar só o saldo.\n\n' +
      'Simule as duas na página de pagamento (tem áudio explicando):\n{{link_pagamento}}',
  },
  escassez: {
    midias: ['STORY_ESCASSEZ'],
    texto: '{{nome}}, passando rapidinho: hoje restam *{{disponiveis}} chácaras* no Bom Jardims, e as posições perto do portal e da área do rio são as primeiras a sair. 🏃\n\n' +
      'No mapa 3D você vê quais ainda estão livres:\n{{link_mapa3d}}\n\n' +
      'Se alguma te chamar atenção, me manda o código dela (ex.: *B07*) que eu simulo para você.',
  },
  followup: {
    midias: [],
    texto: 'Oi, {{nome}}! Ficou alguma dúvida sobre o Bom Jardims? Pode perguntar por aqui mesmo 😊\n\n' +
      'Estas páginas têm um áudio curto explicando:\n🧮 Pagamento: {{link_pagamento}}\n🌊 O rio e a água: {{link_rio}}\n📄 Contrato: {{link_contrato}}\n\n' +
      'Se preferir que eu te ligue, escolha o melhor horário aqui:\n{{link_retorno}}',
  },
  mapa: {
    midias: ['MAPA', 'ESTRUTURA'],
    texto: 'Aqui está o mapa de vendas, com a lupa no portal 🗺️ Hoje são *{{disponiveis}} chácaras disponíveis*, todas com 3.025 m².\n\n' +
      'Quer ver em 3D? Gire, aproxime e toque nas chácaras:\n{{link_mapa3d}}\n\n' +
      'Me fala qual quadra te chamou mais atenção.',
  },
  visita: {
    midias: [],
    texto: 'Ótimo, {{nome}}! A visita é para escolher a posição da sua chácara e fechar: buscamos você de carro, o condomínio fica a 17 km do centro. 🚗\n\n' +
      'Escolha o dia e o horário por aqui:\n{{link_visita}}\n\nQuer ver o caminho antes? {{link_rota}}',
  },
  como_chegar: {
    midias: [],
    texto: 'O Bom Jardims fica a *17 km do centro de Açailândia*, uns 24 minutos de carro. 📍\n\n' +
      'Nesta página tem o vídeo do caminho com os pontos de referência, um áudio explicando e os botões para abrir no Google Maps ou no Waze:\n{{link_rota}}\n\n' +
      'Quando decidir pela sua chácara, buscamos você de carro para a visita.',
  },
  rio: {
    midias: [],
    texto: 'Boa pergunta! 🌊 O rio *não passa dentro das chácaras*: ele fica na área de preservação, que é *área comum de todos os condôminos*, ' +
      'e cada chácara tem um espaço exclusivo de *10 metros lineares* na margem, onde pode fazer deck ou bangalô de madeira. A água da chácara vem do *poço artesiano* do condomínio.\n\n' +
      'Veja os detalhes e ouça o áudio explicativo:\n{{link_rio}}',
  },
  escritorio: {
    midias: [],
    texto: `Nosso escritório fica na *${ENDERECO_ESCRITORIO}*. 🏢\n\n🕘 ${HORARIO_ESCRITORIO}.\n📅 ${HORARIO_ESCRITORIO_EXTRA}.\n\n` +
      'Abra o caminho no Google Maps ou no Waze (tem um áudio com as orientações):\n{{link_escritorio}}',
  },
  juros: {
    midias: [],
    texto: 'Entendo, {{nome}}. Os juros são de *{{juros_aa}} ao ano*, bem abaixo do que bancos e consórcios costumam cobrar, e a *entrada não tem juros*.\n\n' +
      'As parcelas são *fixas*: {{parcela_maior}} do começo ao fim se pagas em dia. E se sobrar um dinheiro extra, você pode antecipar e pagar menos juros.\n\n' +
      'Veja o plano que fica melhor para você:\n{{link_pagamento}}',
  },
  documentacao: {
    midias: [],
    texto: 'A venda é feita por *contrato particular de promessa de compra e venda*, com quadro-resumo de todas as condições, assinatura digital e boletos/PIX em nome da empreendedora.\n\n' +
      'O empreendimento está em *fase de aprovação na Prefeitura*. Depois do registro do parcelamento, cada chácara terá sua matrícula individual, e a escritura é feita após a quitação.\n\n' +
      '📄 Leia a minuta do contrato com calma (tem um áudio de 2 minutos com os pontos principais):\n{{link_contrato}}',
  },
  fechar: {
    midias: [],
    texto: 'Vamos garantir a sua, {{nome}}? Para a reserva preciso de:\n📄 RG/CNH e CPF (e do cônjuge, se casado)\n🏠 Comprovante de endereço\n📱 Telefone e e-mail\n\n' +
      'Assim que você me enviar, separo a chácara *{{lote}}* por 24 horas e te mando o contrato para assinatura digital. ✍️\n\n' +
      'Se quiser ler a minuta antes: {{link_contrato}}',
  },
  chacara_especifica: {
    midias: [],
    texto: 'A chácara *{{lote}}* tem *{{area}} m²*:\n\n🏷️ Preço de tabela: *{{preco}}*\n💵 À vista: *{{avista}}*\n1️⃣ Entrada: *{{entrada_parcelas}}× {{entrada_parcela}}* sem juros (ou {{entrada_avista}} à vista)\n' +
      '2️⃣ Saldo de {{saldo}}:\n{{tabela_prazos}}\n\nOs planos com entrada a partir de R$ 10 mil estão aqui: {{link_pagamento}}\n\nQuer que eu separe a {{lote}} para você? A reserva vale 24 horas.',
  },
  optout: {
    midias: [],
    texto: 'Tudo bem, {{nome}}! Seu cadastro foi cancelado e não enviaremos mais mensagens. Obrigado! 😊',
  },
  ultimas_livres: {
    midias: [],
    texto: '{{nome}}, separei *3 chácaras que ainda estão livres* e são ótimas posições: *{{livres}}*. 🌳\n\n' +
      'Hoje são {{disponiveis}} disponíveis. Veja onde ficam no mapa 3D:\n{{link_mapa3d}}\n\n' +
      'E simule a que você gostar: {{link_oferta}}',
  },
};
