/**
 * Respostas automáticas no WhatsApp (empreendimento — ex.: Bom Jardims): classificação da mensagem por intenção,
 * variáveis dos textos (valores sempre do simulador), horário de atendimento e aviso legal (CDC, art. 52).
 * Regras puras, usadas no servidor (server/autoresposta/motor.ts) e na tela de configuração.
 */
import { brl, type CondicoesPagamento, type Simulacao } from './simulador';

export const INTENCOES = [
  'primeiro_contato', 'valores', 'a_vista', 'escassez', 'followup', 'mapa', 'visita', 'juros', 'documentacao', 'fechar', 'chacara_especifica', 'optout', 'ultimas_livres',
] as const;
export type Intencao = typeof INTENCOES[number];
export const ROTULO_INTENCAO: Record<Intencao, string> = {
  primeiro_contato: '1. Primeiro contato', valores: '2. Condições completas', a_vista: '3. Pagamento à vista', escassez: '4. Escassez (régua 24 h)',
  followup: '5. Follow-up (régua 3 dias)', mapa: '6. Mapa e estrutura', visita: '7. Agendar visita', juros: '8. Objeção: juros',
  documentacao: '9. Objeção: documentação', fechar: '10. Fechamento', chacara_especifica: 'Chácara específica (simulação)', optout: 'Descadastro',
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
  ['mapa', /(mapa|onde fica|localiza|disponive|quadra)/],
  ['visita', /(visita|conhecer|ir ai|endereco|agendar)/],
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

/** Textos de partida (do arquivo TEXTOS-WHATSAPP-BOM-JARDIMS, com os números trocados por variáveis do simulador) */
export const TEXTOS_PADRAO: Record<Intencao, { texto: string; midias: CodigoMidia[] }> = {
  primeiro_contato: {
    midias: ['OFERTA'],
    texto: 'Olá, {{nome}}! Tudo bem? 😊 Aqui é {{corretor}}, corretor do *Condomínio de Chácaras Bom Jardims*, em Açailândia.\n\n' +
      'Que bom que você se interessou! São *chácaras de 3.025 m²* (55 × 55 m) em condomínio fechado, com portal e guarita, poço próprio, energia e uma área de vivência com rio para os chacreiros.\n\n' +
      '💰 *Condição de lançamento:*\n• Entrada de *{{entrada_parcelas}}× {{entrada_parcela}}* sem juros\n• Saldo em *{{prazo_maior}}× fixas de {{parcela_maior}}*\n• Financiamento direto com a empreendedora, *sem banco*\n\n' +
      'Te mandei o folder aqui embaixo 👇 Veja também a sua oferta: {{link_oferta}}\n\nVocê procura chácara para lazer da família ou para morar?',
  },
  valores: {
    midias: ['CONDICOES'],
    texto: 'Segue a tabela completa da chácara padrão de *{{area}} m²*:\n\n🏷️ Preço de tabela: *{{preco}}*\n💵 À vista: *{{avista}}* (desconto de {{desconto_avista}})\n\n' +
      '*Parcelado:*\n1️⃣ Entrada 30%: *{{entrada_parcelas}}× {{entrada_parcela}}* sem juros (ou {{entrada_avista}} à vista)\n2️⃣ Saldo de {{saldo}} no prazo que preferir:\n{{tabela_prazos}}\n\n' +
      'Juros de {{juros_aa}} ao ano ({{juros_am}} ao mês), *parcelas fixas*. Se quiser antecipar parcelas, os juros são abatidos.\n\nQual prazo cabe melhor no seu orçamento?',
  },
  a_vista: {
    midias: [],
    texto: 'Ótima escolha, {{nome}}! À vista a chácara de 3.025 m² sai por *{{avista}}* — *{{desconto_avista}} de desconto* sobre a tabela.\n\n' +
      'Também dá para pagar a *entrada à vista por {{entrada_avista}}* (economia de {{economia_entrada}}) e parcelar só o saldo. Quer que eu simule as duas opções com a chácara que você gostou?',
  },
  escassez: {
    midias: ['STORY_ESCASSEZ'],
    texto: '{{nome}}, passando para te avisar: restam *somente {{disponiveis}} chácaras* e as melhores posições — perto do portal e da área de vivência — são as primeiras a sair. 🏃‍♂️\n\n' +
      'Com a reserva, a chácara que você escolher fica *garantida por 72 horas* enquanto organizamos a documentação.\n\n' +
      'A condição de *{{entrada_parcelas}}× {{entrada_parcela}} + {{prazo_maior}}× {{parcela_maior}}* é {{validade_condicao}}. Quer que eu separe uma para você?',
  },
  followup: {
    midias: [],
    texto: 'Oi, {{nome}}! Tudo certo? Ficou alguma dúvida sobre as chácaras do Bom Jardims?\n\nPosso te mandar o *mapa com as chácaras disponíveis* ou agendar uma *visita ao local* — é só me dizer o melhor dia. 🌳',
  },
  mapa: {
    midias: ['ESTRUTURA', 'MAPA'],
    texto: 'Aqui está o mapa do condomínio 🗺️ Cada chácara tem 3.025 m², com ruas de 12 m, portal com guarita, poço com reservatório de 150 m³, rede elétrica com iluminação em LED e a área de vivência com rio e pontos de banho.\n\n' +
      'Hoje são *{{disponiveis}} chácaras disponíveis*. Me fala qual quadra te chamou mais atenção que eu te passo as livres nela.',
  },
  visita: {
    midias: [],
    texto: 'Perfeito! O condomínio fica na *Estrada do Piquiá dos Baianos, altura do km 15 da BR-222*, em Açailândia. 📍\n\n' +
      'Me diz o melhor dia e horário para você que eu confirmo a visita. Se preferir, te encontro no stand de vendas.',
  },
  juros: {
    midias: [],
    texto: 'Entendo, {{nome}}. Os juros são de *{{juros_aa}} ao ano* — bem abaixo do que bancos e consórcios costumam cobrar — e a *entrada não tem juros*.\n\n' +
      'As parcelas são *fixas*: {{parcela_maior}} do começo ao fim se pagas em dia. E se sobrar um dinheiro extra, você pode antecipar parcelas e pagar menos juros.',
  },
  documentacao: {
    midias: [],
    texto: 'A venda é feita por *contrato particular de promessa de compra e venda*, com quadro-resumo de todas as condições, assinatura digital e boletos/PIX emitidos em nome da empreendedora.\n\n' +
      'O empreendimento está em *fase de aprovação na Prefeitura*. Depois do registro do parcelamento, cada chácara terá sua matrícula individual e a escritura é feita após a quitação. Posso te enviar a minuta do contrato para você ler com calma.',
  },
  fechar: {
    midias: [],
    texto: 'Vamos garantir a sua, {{nome}}? Para a reserva preciso de:\n📄 RG/CNH e CPF (e do cônjuge, se casado)\n🏠 Comprovante de endereço\n📱 Telefone e e-mail\n\n' +
      'Assim que você me enviar, separo a chácara *{{lote}}* por 72 horas e já te mando o contrato para assinatura digital. ✍️',
  },
  chacara_especifica: {
    midias: [],
    texto: 'A chácara *{{lote}}* tem *{{area}} m²*:\n\n🏷️ Preço de tabela: *{{preco}}*\n💵 À vista: *{{avista}}*\n1️⃣ Entrada: *{{entrada_parcelas}}× {{entrada_parcela}}* sem juros (ou {{entrada_avista}} à vista)\n' +
      '2️⃣ Saldo de {{saldo}}:\n{{tabela_prazos}}\n\nQuer que eu separe a {{lote}} para você? A reserva vale 72 horas.',
  },
  optout: {
    midias: [],
    texto: 'Tudo bem, {{nome}}! Seu cadastro foi cancelado e não enviaremos mais mensagens. Obrigado! 😊',
  },
  ultimas_livres: {
    midias: [],
    texto: '{{nome}}, separei *3 chácaras que ainda estão livres* e são ótimas posições: *{{livres}}*. 🌳\n\n' +
      'Hoje são {{disponiveis}} disponíveis. A condição de *{{entrada_parcelas}}× {{entrada_parcela}} + {{prazo_maior}}× {{parcela_maior}}* é {{validade_condicao}}.\n\n' +
      'Veja a sua oferta e simule a que você gostar: {{link_oferta}}\n\nQuer que eu te mande os valores de alguma delas?',
  },
};
