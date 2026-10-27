/**
 * Nomes de contatos com "?" (carga inicial do Manus: o vCard foi lido com a codificação errada e limpo para ASCII —
 * cada byte de letra acentuada virou "?", "ã" → "??", emoji → "????"). O nome original não está no banco; aqui ele é
 * recuperado pelo TELEFONE, na agenda do celular conectado à Z-API (GET /contacts) ou num arquivo .vcf, e só é sugerido
 * quando bate com o padrão do nome estragado ("Zez??o" aceita "Zezão", não "Fulano"). O administrador confere e aplica.
 */
import { eq, like } from 'drizzle-orm';
import { getDb } from './db';
import { contacts } from '../drizzle/schema';

export class NomesErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'NomesErro'; } }

const banco = async () => { const d = await getDb(); if (!d) throw new NomesErro('Banco indisponível', 503); return d as any; };
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export const nomeCorrompido = (nome: string | null | undefined) => /\?/.test(String(nome ?? ''));

/** Chave do telefone: DDD + 8 últimos dígitos (iguala com e sem o 9 e com e sem o 55) */
export function chaveTelefone(tel: string | null | undefined): string | null {
  let d = soDig(tel);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10) return null;
  return `${d.slice(0, 2)}${d.slice(-8)}`;
}

/** Regex do nome estragado: cada sequência de N "?" vale de 1 a N caracteres quaisquer */
export function padraoDoNome(corrompido: string): RegExp {
  const partes = corrompido.trim().split(/(\?+)/).filter(Boolean)
    .map(p => (p.startsWith('?') ? `.{1,${p.length}}` : p.replace(/[.*+^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`^${partes.join('')}$`, 'isu');
}

export const compativel = (corrompido: string, candidato: string) => !nomeCorrompido(candidato) && padraoDoNome(corrompido).test(candidato.trim());

// ─── Fontes ──────────────────────────────────────────────────────────────────

export type Agenda = Map<string, string[]>;
const juntar = (a: Agenda, tel: string | null | undefined, nomes: (string | null | undefined)[]) => {
  const k = chaveTelefone(tel);
  if (!k) return;
  const lista = a.get(k) ?? [];
  for (const n of nomes) { const t = String(n ?? '').trim(); if (t && !lista.includes(t)) lista.push(t); }
  if (lista.length) a.set(k, lista);
};

/** Agenda do celular conectado à Z-API (nome salvo, nome no vCard, nome curto e o do WhatsApp) */
export async function agendaZapi(fetchImpl: typeof fetch = fetch, env = process.env): Promise<Agenda> {
  const id = env.ZAPI_INSTANCE_ID, token = env.ZAPI_TOKEN, cliente = env.ZAPI_CLIENT_TOKEN;
  if (!id || !token) throw new NomesErro('Z-API não configurada (ZAPI_INSTANCE_ID / ZAPI_TOKEN)', 503);
  const agenda: Agenda = new Map();
  const tamanho = 500;
  for (let pagina = 1; pagina <= 60; pagina++) {
    const r = await fetchImpl(`https://api.z-api.io/instances/${id}/token/${token}/contacts?page=${pagina}&pageSize=${tamanho}`, {
      headers: { 'Content-Type': 'application/json', ...(cliente ? { 'Client-Token': cliente } : {}) }, signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new NomesErro(`Z-API recusou a lista de contatos (HTTP ${r.status})`, 502);
    const lista: any[] = await r.json().catch(() => []);
    if (!Array.isArray(lista) || !lista.length) break;
    for (const c of lista) juntar(agenda, c?.phone, [c?.name, c?.vname, c?.short, c?.notify]);
    if (lista.length < tamanho) break;
  }
  return agenda;
}

/** Decodifica um valor de vCard: QUOTED-PRINTABLE com CHARSET (UTF-8 ou Windows-1252/ISO-8859-1) */
function valorVcf(params: string, valor: string): string {
  const charset = /CHARSET=([^;:]+)/i.exec(params)?.[1]?.toLowerCase() ?? 'utf-8';
  if (/QUOTED-PRINTABLE/i.test(params)) {
    const bytes: number[] = [];
    for (let i = 0; i < valor.length; i++) {
      if (valor[i] === '=' && /^[0-9A-F]{2}$/i.test(valor.slice(i + 1, i + 3))) { bytes.push(parseInt(valor.slice(i + 1, i + 3), 16)); i += 2; }
      else bytes.push(valor.charCodeAt(i) & 0xff);
    }
    try { return new TextDecoder(charset === 'iso-8859-1' || charset === 'latin1' ? 'windows-1252' : charset).decode(new Uint8Array(bytes)); }
    catch { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); }
  }
  return valor.replace(/\\,/g, ',').replace(/\\;/g, ';');
}

/** Arquivo .vcf (agenda exportada do celular ou do Google) — o texto já chega em UTF-8 do navegador */
export function agendaVcf(texto: string): Agenda {
  const agenda: Agenda = new Map();
  // Desdobra linhas continuadas (espaço no início) e as quebras suaves do quoted-printable ("=" no fim)
  const linhas = texto.replace(/\r\n/g, '\n').replace(/=\n/g, '').replace(/\n[ \t]/g, '').split('\n');
  let nomes: string[] = [], tels: string[] = [];
  for (const l of linhas) {
    const i = l.indexOf(':');
    if (i < 0) continue;
    const chave = l.slice(0, i), valor = l.slice(i + 1);
    const [campo, ...resto] = chave.split(';');
    const params = resto.join(';');
    const c = campo.replace(/^item\d+\./i, '').toUpperCase();
    if (c === 'BEGIN') { nomes = []; tels = []; }
    else if (c === 'FN') nomes.unshift(valorVcf(params, valor));
    else if (c === 'N') { const p = valorVcf(params, valor).split(';'); const n = [p[1], p[2], p[0]].filter(Boolean).join(' ').trim(); if (n) nomes.push(n); }
    else if (c === 'TEL') tels.push(valor);
    else if (c === 'END') for (const t of tels) juntar(agenda, t, nomes);
  }
  return agenda;
}

// ─── Sugestão pela grafia (quando o número não está em nenhuma agenda) ───────

const ACENTOS = ['ã', 'á', 'é', 'í', 'ó', 'ú', 'ê', 'ô', 'õ', 'ç', 'â', 'à', 'ü'];
/** Nomes e palavras comuns com acento (nomes de pessoas, sobrenomes, profissões, comércio da região) */
const PALAVRAS = new Set(`
joão josé antônio antonio mário márcio márcia marcia lúcia lucia luís luis luísa luíza luiza sônia sonia vitória vitoria glória gloria
patrícia patricia flávio flávia fábio fábia cláudio cláudia júlio júlia sérgio rogério inácio emília cecília letícia otávio
otávia tânia vânia cássio cássia thaís taís andréia andréa andré cícero sebastião adão damião estêvão estevão simão leão
gavião falcão brandão romão ribeirão conceição assunção natividade jesus araújo gonçalves simões magalhães guimarães
lázaro jéssica jessica mônica monica verônica veronica fátima fatima raí rafaél rúbia rúben benedito benedita zé zézinho zezão
joãozinho conceiçao tião irmão irmã mãe pai avó avô tia tio dona seu dr dra açaí açailândia açailandia imperatriz maranhão
pará goiás paraná ceará piauí amapá rondônia são josé nazaré belém conceição tocantinópolis buriticupu marabá
jurídica jurídico advocacia advogado advogada contábil contabilidade crédito agrícola agrônomo agrônoma técnico técnica
elétrica eletrônica mecânica gráfica ótica óptica clínica médico médica odontológica farmácia drogaria imóveis imobiliária
construção construções acabamentos pré moldados móveis eletrodomésticos veículos peças serviços comércio indústria
agência associação educação saúde administração secretária secretário escritório negócios investimentos fazenda sítio
chácara chácaras condomínio loteamento terraplenagem topografia agrimensura avaliação perícia corretor corretora cartório
escola faculdade universidade graduação pós música lanchonete padaria pão café açougue mercadinho distribuidora calçados
confecções transportes logística segurança vigilância elétrica hidráulica refrigeração climatização energia solar
`.split(/\s+/).filter(Boolean));

/**
 * Reconstrói o nome estragado pela grafia: cada "??" dentro de uma palavra vira a letra acentuada que forma uma palavra
 * conhecida (certeza) ou, sem achado, a mais provável pelo contexto (sem certeza); sequências que não são de uma letra
 * acentuada (emojis: 3, 4, 6, 8 "?"…) saem. null = não sobra nome.
 */
const LETRA = new RegExp('\\p{L}', 'u');
const TRECHO_DE_LETRAS = new RegExp('[\\p{L}?]+', 'gu');

export function sugerirGrafia(corrompido: string): { nome: string; certeza: boolean } | null {
  let certeza = true;
  // Emoji ou símbolo: sequência de "?" que não é exatamente 2 dentro de uma palavra
  const semEmoji = corrompido.replace(/\?+/g, (m, pos: number, s: string) => {
    const antes = s[pos - 1] ?? '', depois = s[pos + m.length] ?? '';
    return m.length === 2 && LETRA.test(antes) && LETRA.test(depois) ? m : ' ';
  }).replace(/\s+/g, ' ').replace(/^[\s~•·\-_.,;:|]+|[\s\-_.,;:|]+$/g, '').trim();
  // Cada trecho de letras com "??" (em "A.Lu??s", só "Lu??s") é resolvido separado
  const nome = semEmoji.replace(TRECHO_DE_LETRAS, palavra => {
    if (!palavra.includes('??')) return palavra;
    const partes = palavra.split('??');
    // Todas as combinações de acento para os "??" da palavra (no máximo 3 por palavra)
    let opcoes = [partes[0]];
    for (let i = 1; i < partes.length && i <= 3; i++) opcoes = opcoes.flatMap(o => ACENTOS.map(a => o + a + partes[i]));
    const achadas = opcoes.filter(o => PALAVRAS.has(o.toLowerCase()));
    if (achadas.length >= 1) return achadas[0];
    certeza = false;
    // Sem achado: "??o"/"??e" no fim → ã (Leão, mãe); "??ão" → ç; "??ri[ao]" → ó; senão í
    return palavra.replace(/\?\?(?=[oe]$)/i, 'ã').replace(/\?\?(?=ão)/i, 'ç').replace(/\?\?(?=ri[ao])/i, 'ó').replace(/\?\?/g, 'í');
  }).trim();
  if (!nome || nomeCorrompido(nome) || !LETRA.test(nome)) return null;
  return { nome, certeza };
}

// ─── Sugestões e aplicação ───────────────────────────────────────────────────

/** origem: agenda (Z-API ou .vcf) | grafia (reconstruído) | null (sem sugestão) */
export interface Sugestao {
  id: number; telefone: string; atual: string; sugerido: string | null; outros: string[]; compativel: boolean;
  origem: 'agenda' | 'grafia' | null; certeza: boolean;
}

export async function contatosCorrompidos() {
  const d = await banco();
  const cs: any[] = await d.select({ id: contacts.id, name: contacts.name, phone: contacts.phone }).from(contacts).where(like(contacts.name, '%?%'));
  return cs.filter(c => nomeCorrompido(c.name)).map(c => ({ id: Number(c.id), nome: String(c.name), telefone: String(c.phone ?? '') }));
}

/** Para cada contato com "?", o nome da agenda pelo telefone — compatível com o padrão vem marcado */
export function sugerir(corrompidos: { id: number; nome: string; telefone: string }[], agenda: Agenda): Sugestao[] {
  return corrompidos.map(c => {
    const k = chaveTelefone(c.telefone);
    const nomes = (k ? agenda.get(k) : undefined) ?? [];
    const bate = nomes.find(n => compativel(c.nome, n));
    const limpos = nomes.filter(n => !nomeCorrompido(n));
    const daAgenda = bate ?? limpos[0] ?? null;
    if (daAgenda) return { id: c.id, telefone: c.telefone, atual: c.nome, sugerido: daAgenda, outros: limpos.filter(n => n !== daAgenda), compativel: !!bate, origem: 'agenda', certeza: !!bate };
    // Fora de qualquer agenda: reconstrói pela grafia
    const g = sugerirGrafia(c.nome);
    return { id: c.id, telefone: c.telefone, atual: c.nome, sugerido: g?.nome ?? null, outros: [], compativel: false, origem: g ? 'grafia' : null, certeza: !!g?.certeza };
  });
}

/** Grava os nomes escolhidos — só em contato que ainda está com "?" (não sobrescreve correção feita à mão) */
export async function aplicarNomes(correcoes: { id: number; nome: string }[]) {
  const d = await banco();
  let aplicadas = 0;
  for (const c of correcoes) {
    const nome = c.nome.trim().slice(0, 255);
    if (!nome || nomeCorrompido(nome)) continue;
    const [atual]: any[] = await d.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, c.id)).limit(1);
    if (!atual || !nomeCorrompido(atual.name)) continue;
    await d.update(contacts).set({ name: nome, updatedAt: new Date() } as any).where(eq(contacts.id, c.id));
    aplicadas++;
  }
  return { aplicadas };
}
