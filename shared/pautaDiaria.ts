/**
 * Fábrica diária de criativos: pautas do dia (Reels de anúncio, Reels orgânico, carrossel e Stories) montadas a partir
 * da biblioteca de Materiais. Porta de scripts/pauta_diaria.py do pacote "Campanhas no Instagram" (etapa 3b).
 * Funções puras: quem chama entrega o catálogo, o histórico de uso e as condições comerciais confirmadas.
 */

export const TEMAS_MIDIA = ["obra", "natureza", "rio", "portal", "seguranca", "mapa", "familia", "lazer", "visita", "acesso"] as const;
export type TemaMidia = (typeof TEMAS_MIDIA)[number];
export const ROTULO_TEMA: Record<TemaMidia, string> = {
  obra: "Obra", natureza: "Natureza", rio: "Rio", portal: "Portal", seguranca: "Segurança", mapa: "Mapa",
  familia: "Família", lazer: "Lazer", visita: "Visita", acesso: "Acesso",
};

export type TemaDia = "obra" | "natureza" | "mapa" | "pagamento" | "seguranca" | "visita" | "familia";
/** 0 = segunda … 6 = domingo */
export const TEMAS_DIA: TemaDia[] = ["obra", "natureza", "mapa", "pagamento", "seguranca", "visita", "familia"];
export const ROTULO_TEMA_DIA: Record<TemaDia, string> = {
  obra: "Obra", natureza: "Natureza", mapa: "Mapa", pagamento: "Pagamento", seguranca: "Segurança", visita: "Visita", familia: "Família",
};

export type Gancho = [string, string];
/** Ganchos que dependem das condições (entrada/parcelas) entram só nas peças com preço */
export function ganchos(c: CondicoesComerciais): Record<TemaDia, Gancho[]> {
  return {
    obra: [["Estamos construindo um condomínio", "de chácaras do zero. Acompanhe!"], ["Como está a obra", "do Bom Jardims esta semana"]],
    natureza: [["Chácara com rio", "a 17 km de Açailândia"], ["Acordar com o som do rio", "na sua própria chácara"]],
    mapa: [["3.025 m² é isso aqui:", "compare com um lote de 300 m²"], ["Veja onde fica", "cada chácara no mapa"]],
    pagamento: [["Chácara com rio a 17 km de Açailândia", `com entrada de ${c.entrada}`], [`Parcelas fixas em até ${c.parcelas},`, "direto com a incorporadora"]],
    seguranca: [["Condomínio fechado:", "sua família com segurança"], ["Portal, ruas e", "segurança no Bom Jardims"]],
    visita: [["Venha conhecer neste sábado:", "a gente busca você de carro"], ["Visite antes de decidir:", "agende pelo formulário"]],
    familia: [["Mais espaço,", "mais qualidade de vida"], ["Um lugar para a família", "reunir no fim de semana"]],
  };
}
export const TEMAS_DO_DIA: Record<TemaDia, TemaMidia[]> = {
  obra: ["obra", "portal", "acesso"], natureza: ["natureza", "rio"], mapa: ["mapa", "obra"],
  pagamento: ["natureza", "rio", "portal", "mapa"], seguranca: ["portal", "seguranca", "obra"],
  visita: ["acesso", "portal", "natureza"], familia: ["familia", "lazer", "natureza", "rio"],
};

export interface CondicoesComerciais { entrada: string; parcelas: string; handle: string }
export const CONDICOES_PADRAO: CondicoesComerciais = { entrada: "R$ 10 mil", parcelas: "180x", handle: "@avalieimob" };

export interface MidiaCatalogo {
  id: number; titulo: string; arquivo: string; tipo: "video" | "imagem";
  dur: number | null; temas: string[]; temTexto: boolean; bloqueada: boolean;
}
export interface MidiaPauta { id: number; arquivo: string; tipo: "video" | "imagem"; ini?: number; dur: number }
export interface Selo { titulo: string; sub?: string; ini?: number; fim?: number }
export interface FinalPauta { dur: number; handle: string; rodape: string; chamada: string; whatsapp?: string }
export type TipoPeca = "reels" | "carrossel" | "foto";
export type DestinoPeca = "anuncio_teste" | "feed_organico" | "stories";
export interface Pauta {
  nome: string; data: string; tema: TemaDia; tipo: TipoPeca; formato: "9:16" | "4:5" | "1:1";
  objetivo: "leads" | "seguidores"; destino: DestinoPeca; midias: MidiaPauta[];
  gancho: Gancho; selo?: Selo; final?: FinalPauta; legenda: string;
  /** Mostra entrada e parcelas: exige as condições confirmadas para aprovar */
  temPreco: boolean;
}

const RODAPE = "Romatec Consultoria Total";

export function legendas(c: CondicoesComerciais) {
  return {
    leads: "🌳 Chácaras de 3.025 a 3.600 m² em condomínio fechado, com rio e mata nativa, a 17 km de Açailândia.\n"
      + `💰 Entrada de ${c.entrada} + parcelas fixas em até ${c.parcelas}, direto com a incorporadora.\n`
      + "📅 Toque em Cadastre-se, responda 1 minuto de perguntas e agende sua visita.",
    seguidores: "Estamos construindo o Condomínio de Chácaras Bom Jardims do zero, a 17 km de Açailândia. 🌳\n"
      + `Siga ${c.handle} e acompanhe cada etapa da obra, do rio ao portal.\n#chacara #acailandia #imperatriz #condominiofechado`,
    stories: `Agende sua visita ao Bom Jardims. Responda no link · ${c.handle}`,
  };
}

/** Sugestão de temas pelo título do arquivo (a pessoa confirma no catálogo) */
export function sugerirTemas(titulo: string): TemaMidia[] {
  const t = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const regras: [TemaMidia, RegExp][] = [
    ["obra", /obra|terraplen|maquina|trator|rua|construc|drenag|cascalh/], ["rio", /rio|agua|riacho|corrego|igarape/],
    ["natureza", /natureza|mata|arvore|verde|drone|aere|por do sol|amanhecer|paisag/], ["portal", /portal|entrada|guarita/],
    ["seguranca", /seguranc|portaria|cerca|muro/], ["mapa", /mapa|planta|implantac|lote|quadra|masterplan/],
    ["familia", /familia|crianca|casal/], ["lazer", /lazer|piscina|churras|area de lazer|quiosque/],
    ["visita", /visita|cliente/], ["acesso", /acesso|estrada|br-?010|rodovia|caminho/],
  ];
  return regras.filter(([, r]) => r.test(t)).map(([k]) => k);
}

/** Palavras que bloqueiam a peça para divulgação (mesma regra do CRM) */
export const PALAVRAS_BLOQUEIO = /condic|preco|tabela/i;

// ─── Sorteio reprodutível por data ───────────────────────────────────────────────────────────────────────────

function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function sorteador(texto: string): () => number {
  let a = semente(texto);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function embaralhar<T>(lista: T[], rnd: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const diaUtc = (iso: string) => new Date(`${iso}T12:00:00Z`);
/** 0 = segunda … 6 = domingo */
export function diaDaSemana(iso: string): number { return (diaUtc(iso).getUTCDay() + 6) % 7; }
export function semanaIso(iso: string): number {
  const d = diaUtc(iso);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const ano = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - ano.getTime()) / 86_400_000 - 3 + ((ano.getUTCDay() + 6) % 7)) / 7);
}
const diasEntre = (a: string, b: string) => Math.round((diaUtc(a).getTime() - diaUtc(b).getTime()) / 86_400_000);
export function temaDoDia(iso: string): TemaDia { return TEMAS_DIA[diaDaSemana(iso)]; }

// ─── Seleção de mídias ───────────────────────────────────────────────────────────────────────────────────────

interface FiltroEscolha { tipo?: "video" | "imagem"; semTexto?: boolean }
export function escolher(catalogo: MidiaCatalogo[], temas: string[], usados: Set<number>, n: number, rnd: () => number,
  historico: Map<number, string>, f: FiltroEscolha = {}): MidiaCatalogo[] {
  const semTexto = f.semTexto ?? true;
  const limpa = (m: MidiaCatalogo) => !m.bloqueada && (!semTexto || !m.temTexto) && (!f.tipo || m.tipo === f.tipo);
  let ok = catalogo.filter(m => limpa(m) && !usados.has(m.id) && m.temas.some(t => temas.includes(t)));
  if (ok.length < n) ok = ok.concat(catalogo.filter(m => limpa(m) && !usados.has(m.id) && !ok.includes(m)));
  ok = embaralhar(ok, rnd);
  if (ok.length < n) {
    // Biblioteca pequena: reaproveita as usadas há mais tempo; as desta mesma rodada só em último caso
    const chave = (m: MidiaCatalogo) => historico.get(m.id) ?? (usados.has(m.id) ? "9999" : "0000");
    const resto = catalogo.filter(m => limpa(m) && !ok.includes(m)).sort((a, b) => chave(a).localeCompare(chave(b)));
    ok = ok.concat(resto);
  }
  return ok.slice(0, n);
}

/** Distribui ~alvo segundos entre as mídias (vídeo: trecho do meio; imagem: 3 s) */
export function sequencia(midias: MidiaCatalogo[], alvo: number): MidiaPauta[] {
  const por = Math.max(2.5, Math.min(4, alvo / Math.max(1, midias.length)));
  return midias.map(m => {
    if (m.tipo === "video") {
      const total = m.dur ?? por;
      const dur = Math.min(por, total);
      return { id: m.id, arquivo: m.arquivo, tipo: "video", ini: round2(Math.max(0, (total - dur) / 2)), dur: round2(dur) };
    }
    return { id: m.id, arquivo: m.arquivo, tipo: "imagem", dur: 3 };
  });
}
const round2 = (v: number) => Math.round(v * 100) / 100;

export const DIAS_SEM_REPETIR = 14;

/**
 * As pautas do dia. `historico` = id da mídia → último dia em que foi usada; mídias usadas há menos de
 * DIAS_SEM_REPETIR ficam de fora (a não ser que a biblioteca não tenha outras).
 */
export function pautasDoDia(catalogo: MidiaCatalogo[], data: string, historico: Map<number, string>, c: CondicoesComerciais = CONDICOES_PADRAO): Pauta[] {
  const usados = new Set<number>();
  historico.forEach((quando, id) => { if (diasEntre(data, quando) < DIAS_SEM_REPETIR) usados.add(id); });
  const rnd = sorteador(data);
  const tema = temaDoDia(data), temas = TEMAS_DO_DIA[tema], G = ganchos(c), L = legendas(c);
  const lista = G[tema];
  const g = lista[semanaIso(data) % lista.length];
  const gOrg = tema === "pagamento" ? G.natureza[0] : g; // orgânico sem preço no gancho
  const final = (chamada: string, extra: Partial<FinalPauta> = {}): FinalPauta => ({ dur: 3, handle: c.handle, rodape: RODAPE, chamada, ...extra });
  const marca = (ms: MidiaCatalogo[]) => { for (const m of ms) usados.add(m.id); };
  const pautas: Pauta[] = [];

  const m1 = escolher(catalogo, temas, usados, 5, rnd, historico); marca(m1);
  pautas.push({ nome: `BJ_${data}_${tema}_ADS`, data, tema, tipo: "reels", formato: "9:16", objetivo: "leads", destino: "anuncio_teste",
    midias: sequencia(m1, 16), gancho: tema === "pagamento" ? G.pagamento[0] : g,
    selo: { titulo: `Entrada de ${c.entrada} + ${c.parcelas}`, sub: "Condomínio fechado · 3.025 m²", ini: 1, fim: 7 },
    final: final("Agende sua visita", { whatsapp: "Toque em Cadastre-se" }), legenda: L.leads, temPreco: true });

  const m2 = escolher(catalogo, temas, usados, 4, rnd, historico); marca(m2);
  pautas.push({ nome: `BJ_${data}_${tema}_ORG`, data, tema, tipo: "reels", formato: "9:16", objetivo: "seguidores", destino: "feed_organico",
    midias: sequencia(m2, 13), gancho: gOrg, final: final("Acompanhe a obra em primeira mão"), legenda: L.seguidores, temPreco: false });

  const m3 = escolher(catalogo, temas, usados, 4, rnd, historico, { tipo: "imagem" }); marca(m3);
  if (m3.length) pautas.push({ nome: `BJ_${data}_${tema}_CAR`, data, tema, tipo: "carrossel", formato: "4:5", objetivo: "seguidores", destino: "feed_organico",
    midias: m3.map(m => ({ id: m.id, arquivo: m.arquivo, tipo: "imagem" as const, dur: 3 })), gancho: gOrg,
    final: final("Siga e acompanhe a obra"), legenda: L.seguidores, temPreco: false });

  const m4 = escolher(catalogo, temas, usados, 1, rnd, historico, { tipo: "imagem" }); marca(m4);
  if (m4.length) pautas.push({ nome: `BJ_${data}_${tema}_STORY`, data, tema, tipo: "foto", formato: "9:16", objetivo: "leads", destino: "stories",
    midias: [{ id: m4[0].id, arquivo: m4[0].arquivo, tipo: "imagem", dur: 3 }], gancho: g,
    selo: { titulo: "Agende sua visita", sub: `Responda no link · ${c.handle}` }, legenda: L.stories,
    // O gancho de quinta fala da entrada: a peça passa a mostrar preço
    temPreco: tema === "pagamento" });

  return pautas.filter(p => p.midias.length);
}

/**
 * Troca a mídia da posição `indice` por outra que sirva ao tema e não esteja na peça. Mantém o trecho/duração.
 */
export function trocarMidia(p: Pauta, indice: number, catalogo: MidiaCatalogo[], historico: Map<number, string>, semente = String(Date.now())): Pauta {
  const atual = p.midias[indice];
  if (!atual) throw new Error("Mídia não encontrada na peça");
  const naPeca = new Set(p.midias.map(m => m.id));
  const tipo = p.tipo === "reels" ? undefined : "imagem";
  const [nova] = escolher(catalogo.filter(m => !naPeca.has(m.id)), TEMAS_DO_DIA[p.tema], new Set(), 1, sorteador(`${p.nome}:${semente}`), historico, { tipo });
  if (!nova) throw new Error("Não há outra mídia disponível para trocar");
  const [seq] = p.tipo === "reels" ? sequencia([nova], atual.dur) : [{ id: nova.id, arquivo: nova.arquivo, tipo: "imagem" as const, dur: 3 }];
  return { ...p, midias: p.midias.map((m, i) => (i === indice ? seq : m)) };
}

/** Validade da confirmação das condições comerciais (entrada/parcelas) para aprovar peças com preço */
export const DIAS_VALIDADE_CONDICOES = 30;
export function condicoesValidas(confirmadoEm: string | null, hoje: string): boolean {
  if (!confirmadoEm) return false;
  const d = diasEntre(hoje, confirmadoEm.slice(0, 10));
  return d >= 0 && d < DIAS_VALIDADE_CONDICOES;
}
