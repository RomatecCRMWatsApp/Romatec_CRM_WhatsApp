/**
 * Importação de contatos do celular para o CRM (ex.: contatos salvos com o final "CCBJ" = interessados no Bom Jardims)
 * e retomada com qualificação pelo robô: finalidade → prazo → pagamento. Regras puras (servidor, tela e testes).
 */

export interface ContatoBruto { nome: string; telefone: string }
export interface ContatoMarcado { nome: string; telefone: string; nomeOriginal: string }

const tirarAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const normalizarTexto = (s: string) => tirarAcentos(String(s ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();

/** Telefone para o padrão do CRM (só dígitos, com 55). null = não parece celular/fixo do Brasil */
export function telefoneBr(t: string | null | undefined): string | null {
  const bruto = String(t ?? '').trim();
  let d = bruto.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^(\+|00)/.test(bruto) && !d.startsWith('55')) return null; // código de outro país
  if (d.length === 12 || d.length === 13) return d.startsWith('55') ? d : null;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

/** O nome termina com o marcador? ("Fulano CCBJ", "Fulano - ccbj", "FulanoCCBJ") */
export function temMarcador(nome: string, marcador: string): boolean {
  const m = marcador.trim();
  if (!m) return false;
  return new RegExp(`${escapar(m)}\\s*$`, 'i').test(String(nome ?? '').trim());
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tira o marcador e a pontuação que sobra no fim: "Maria Souza - CCBJ" → "Maria Souza" */
export function nomeSemMarcador(nome: string, marcador: string): string {
  return String(nome ?? '').trim()
    .replace(new RegExp(`[\\s\\-_.,|/]*${escapar(marcador.trim())}\\s*$`, 'i'), '')
    .replace(/[\s\-_.,|/]+$/, '').trim();
}

/**
 * Da agenda inteira, os contatos com o marcador: nome limpo, telefone no padrão, um por número
 * (o primeiro nome encontrado fica). Números que não são do Brasil ficam de fora.
 */
export function contatosMarcados(lista: ContatoBruto[], marcador: string): { contatos: ContatoMarcado[]; semTelefone: string[] } {
  const vistos = new Set<string>();
  const contatos: ContatoMarcado[] = [];
  const semTelefone: string[] = [];
  for (const c of lista) {
    if (!temMarcador(c.nome, marcador)) continue;
    const tel = telefoneBr(c.telefone);
    if (!tel) { semTelefone.push(c.nome); continue; }
    const chave = chaveTel(tel);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    contatos.push({ nome: nomeSemMarcador(c.nome, marcador) || 'Cliente', telefone: tel, nomeOriginal: c.nome.trim() });
  }
  return { contatos, semTelefone: Array.from(new Set(semTelefone)) };
}

/** DDD + 8 últimos dígitos: iguala com e sem o 9 e com e sem o 55 */
export function chaveTel(t: string): string {
  let d = String(t ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return `${d.slice(0, 2)}${d.slice(-8)}`;
}

export const primeiroNome = (nome: string | null | undefined) => {
  const p = String(nome ?? '').trim().split(/\s+/)[0] || '';
  return /^[A-Za-zÀ-ÿ'-]{2,20}$/.test(p) && !/^(cliente|lead|sr|sra|dr|dra)$/i.test(p) ? p : '';
};

// ─── Arquivos exportados do celular / Google Contatos ─────────────────────────

/** Valor de vCard: QUOTED-PRINTABLE com CHARSET e escapes */
function valorVcf(params: string, valor: string): string {
  if (/QUOTED-PRINTABLE/i.test(params)) {
    const charset = /CHARSET=([^;:]+)/i.exec(params)?.[1]?.toLowerCase() ?? 'utf-8';
    const bytes: number[] = [];
    for (let i = 0; i < valor.length; i++) {
      if (valor[i] === '=' && /^[0-9A-F]{2}$/i.test(valor.slice(i + 1, i + 3))) { bytes.push(parseInt(valor.slice(i + 1, i + 3), 16)); i += 2; }
      else bytes.push(valor.charCodeAt(i) & 0xff);
    }
    try { return new TextDecoder(charset === 'iso-8859-1' || charset === 'latin1' ? 'windows-1252' : charset).decode(new Uint8Array(bytes)); }
    catch { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); }
  }
  return valor.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ');
}

/** Arquivo .vcf (Android, iPhone, Google Contatos): um registro por telefone de cada contato */
export function lerVcf(texto: string): ContatoBruto[] {
  const linhas = texto.replace(/\r\n?/g, '\n').replace(/=\n/g, '').replace(/\n[ \t]/g, '').split('\n');
  const out: ContatoBruto[] = [];
  let fn = '', n = '', tels: string[] = [];
  for (const l of linhas) {
    const i = l.indexOf(':');
    if (i < 0) continue;
    const [campo, ...resto] = l.slice(0, i).split(';');
    const params = resto.join(';');
    const valor = l.slice(i + 1);
    const c = campo.replace(/^item\d+\./i, '').toUpperCase();
    if (c === 'BEGIN') { fn = ''; n = ''; tels = []; }
    else if (c === 'FN') fn = valorVcf(params, valor).trim();
    else if (c === 'N') { const p = valorVcf(params, valor).split(';'); n = [p[1], p[2], p[0]].filter(Boolean).join(' ').trim(); }
    else if (c === 'TEL') tels.push(valor);
    else if (c === 'END') { const nome = fn || n; if (nome) for (const t of tels) out.push({ nome, telefone: t }); }
  }
  return out;
}

/** Linha de CSV com aspas */
function camposCsv(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = '', aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { out.push(atual); atual = ''; }
    else atual += ch;
  }
  out.push(atual);
  return out.map(s => s.trim());
}

/** Linhas do CSV respeitando quebra dentro de aspas */
function linhasCsv(texto: string): string[] {
  const out: string[] = [];
  let atual = '', aspas = false;
  for (const ch of texto.replace(/\r\n?/g, '\n')) {
    if (ch === '"') aspas = !aspas;
    if (ch === '\n' && !aspas) { out.push(atual); atual = ''; } else atual += ch;
  }
  if (atual.trim()) out.push(atual);
  return out.filter(l => l.trim());
}

/**
 * CSV do Google Contatos (inglês ou português) ou planilha simples com colunas de nome e telefone.
 * Colunas de nome: Name/Nome, ou First/Middle/Last Name (Nome/Nome do meio/Sobrenome). Telefone: toda coluna
 * "Phone … Value"/"Telefone … Valor"/"Telefone"/"Celular"/"WhatsApp"; vários números na mesma célula (" ::: ").
 */
export function lerCsv(texto: string): ContatoBruto[] {
  const linhas = linhasCsv(texto.replace(/^﻿/, ''));
  if (linhas.length < 2) return [];
  const sep = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const cab = camposCsv(linhas[0], sep).map(normalizarTexto);
  const idx = (re: RegExp) => cab.findIndex(h => re.test(h));
  const iNome = idx(/^(name|nome|nome completo|display name|contato)$/);
  const iPrimeiro = idx(/^(first name|given name|nome proprio|primeiro nome)$/);
  const iMeio = idx(/^(middle name|additional name|nome do meio)$/);
  const iUltimo = idx(/^(last name|family name|sobrenome)$/);
  const iTels = cab.map((h, i) => ((/(phone|telefone|celular|whatsapp|fone)/.test(h) && !/(type|tipo|label|rotulo)/.test(h)) ? i : -1)).filter(i => i >= 0);
  if (!iTels.length) return [];
  const out: ContatoBruto[] = [];
  for (const l of linhas.slice(1)) {
    const c = camposCsv(l, sep);
    const nome = (iNome >= 0 && c[iNome]) || [iPrimeiro, iMeio, iUltimo].filter(i => i >= 0).map(i => c[i]).filter(Boolean).join(' ').trim();
    if (!nome) continue;
    for (const i of iTels) for (const t of String(c[i] ?? '').split(/:::|\//)) if (t.trim()) out.push({ nome, telefone: t.trim() });
  }
  return out;
}

/** Lê o arquivo pelo conteúdo (vCard ou CSV) */
export function lerArquivoContatos(texto: string): ContatoBruto[] {
  return /BEGIN:VCARD/i.test(texto) ? lerVcf(texto) : lerCsv(texto);
}

// ─── Mensagem de retomada e qualificação ──────────────────────────────────────

export const MARCADOR_PADRAO = 'CCBJ';

/** {nome} = primeiro nome do cliente (some com a vírgula se não houver) */
export const TEXTO_RETOMADA_PADRAO = [
  'Oi{, nome}, tudo bem? Aqui é o José Romário, da Romatec.',
  'Já conversamos pelo meu WhatsApp pessoal sobre o *Condomínio de Chácaras Bom Jardims*. Este agora é o número oficial de atendimento do condomínio, por aqui eu consigo te enviar tudo organizado.',
  '',
  'Pra eu te mostrar as chácaras que mais combinam com você, me conta: a ideia é *morar*, *investir* ou ter um lugar de *lazer* no fim de semana?',
  '',
  '_Se não quiser mais receber mensagens sobre o Bom Jardims, é só responder SAIR._',
].join('\n');

export function montarRetomada(modelo: string, nome: string | null | undefined): string {
  const p = primeiroNome(nome);
  return String(modelo || TEXTO_RETOMADA_PADRAO)
    .replace(/\{,\s*nome\}/g, p ? `, ${p}` : '')
    .replace(/\{nome\}/g, p || '')
    .replace(/[ \t]+([,!?.])/g, '$1');
}

export const PERGUNTAS_RETOMADA = ['finalidade', 'prazo', 'pagamento'] as const;
export type CampoRetomada = typeof PERGUNTAS_RETOMADA[number];
export type RespostasRetomada = Partial<Record<CampoRetomada, string>>;

export const TEXTO_PERGUNTA: Record<CampoRetomada, string> = {
  finalidade: 'A ideia é *morar*, *investir* ou ter um lugar de *lazer* no fim de semana?',
  prazo: 'E pra quando você pensa em fechar: *agora*, nos *próximos 3 meses*, em *até 1 ano* ou ainda está *pesquisando*?',
  pagamento: 'E a forma de pagamento: você prefere *à vista* ou *parcelado direto com a empreendedora*, sem banco (entrada a partir de R$ 10 mil)?',
};

export const ROTULO_RESPOSTA: Record<CampoRetomada, Record<string, string>> = {
  finalidade: { morar: 'Morar', lazer: 'Lazer de fim de semana', investimento: 'Investimento' },
  prazo: { imediato: 'Imediato', '3m': 'Até 3 meses', '12m': 'Até 12 meses', pesquisando: 'Só pesquisando' },
  pagamento: { avista: 'À vista', parcelado: 'Parcelado direto' },
};

const R = (re: string) => new RegExp(re);
const REGRAS_RESPOSTA: Record<CampoRetomada, [string, RegExp, RegExp?][]> = {
  // [valor, regra forte (vale sempre), regra fraca (só quando é a pergunta da vez)]
  finalidade: [
    ['morar', R('\\b(morar|moradia|residir|residencia|viver|mudar|minha casa|construir (uma |minha )?casa)'), R('\\b(casa|residenc)')],
    ['investimento', R('\\b(investi|investimento|valoriza|revend|renda|negocio)')],
    ['lazer', R('\\b(lazer|fim de semana|final de semana|fds|descans|passeio|veraneio|ferias|curtir|recreio|sitio|chacara pra familia)'), R('\\b(familia|amigos|diversao)')],
  ],
  prazo: [
    ['pesquisando', R('\\b(pesquisando|so olhando|sem pressa|sem previsao|nao sei ainda|ainda nao sei|vendo ainda|so (uma )?informac|curiosidade)'), R('\\b(pensando|depois|mais pra frente|futuro)')],
    ['imediato', R('\\b(imediat|agora mesmo|o quanto antes|urgente|esse mes|este mes|essa semana|esta semana)'), R('\\b(agora|ja|logo|rapido)\\b')],
    ['3m', R('\\b((1|2|3|um|dois|tres) mes(es)?|proximos meses|90 dias|curto prazo|ate o fim do ano|fim do ano|dezembro|janeiro|fevereiro)'), R('\\b(breve|em breve|pouco tempo)')],
    ['12m', R('\\b((4|5|6|7|8|9|10|11|12|seis|doze) meses|um ano|1 ano|ano que vem|proximo ano|2027|medio prazo|longo prazo)')],
  ],
  pagamento: [
    ['avista', R('\\b(a vista|avista|pix|de uma vez|dinheiro na mao|pagamento unico)'), R('\\b(vista)\\b')],
    ['parcelado', R('\\b(parcel|financi|prestac|mensais|mensal|carne|parcela|direto com)'), R('\\b(entrada|aos poucos|dividido|dividir)')],
  ],
};

/** Respostas encontradas no texto. `pendente` = a pergunta da vez (aceita respostas curtas como "agora", "casa") */
export function extrairRespostas(texto: string, pendente?: CampoRetomada | null): RespostasRetomada {
  const t = normalizarTexto(texto);
  const out: RespostasRetomada = {};
  for (const campo of PERGUNTAS_RETOMADA) {
    for (const [valor, forte, fraca] of REGRAS_RESPOSTA[campo]) {
      if (forte.test(t) || (campo === pendente && fraca?.test(t))) { out[campo] = valor; break; }
    }
  }
  return out;
}

/** Primeira pergunta ainda sem resposta (null = qualificação completa) */
export function proximaPergunta(r: RespostasRetomada): CampoRetomada | null {
  return PERGUNTAS_RETOMADA.find(c => !r[c]) ?? null;
}

/** Quente = quer fechar em até 3 meses (o José liga já); demais seguem com o robô */
export function retomadaQuente(r: RespostasRetomada): boolean {
  return r.prazo === 'imediato' || r.prazo === '3m';
}

export function resumoRetomada(r: RespostasRetomada): string {
  return PERGUNTAS_RETOMADA.filter(c => r[c]).map(c => ROTULO_RESPOSTA[c][r[c]!] ?? r[c]).join(' · ');
}

/** Resposta do robô depois de entender a resposta: agradece e faz a próxima pergunta, ou encerra */
export function respostaQualificacao(p: { nome?: string | null; respostas: RespostasRetomada; link?: string | null; corretor?: string | null }): string {
  const prox = proximaPergunta(p.respostas);
  const nome = primeiroNome(p.nome);
  const ok = ['Ótimo!', 'Perfeito!', 'Entendi!'][Math.min(2, PERGUNTAS_RETOMADA.filter(c => p.respostas[c]).length - 1)] ?? 'Entendi!';
  if (prox) return `${ok} ${TEXTO_PERGUNTA[prox]}`;
  const quem = String(p.corretor || 'José').split(/\s+/)[0];
  const link = p.link ? `\n\nEnquanto isso, simule a sua chácara aqui (escolha a chácara e veja a parcela na hora):\n${p.link}` : '';
  if (retomadaQuente(p.respostas)) {
    return `Obrigado${nome ? `, ${nome}` : ''}! Já passei suas respostas para o ${quem}: ele vai te chamar com as chácaras que encaixam no que você procura.${link}`;
  }
  return `Obrigado${nome ? `, ${nome}` : ''}! Vou te mandando as novidades do Bom Jardims por aqui, sem pressa. Quando quiser conversar, é só me chamar.${link}`;
}

/** Respostas já gravadas nos slots do lead */
export function respostasDosSlots(slots: unknown): RespostasRetomada {
  const out: RespostasRetomada = {};
  const s = (slots ?? {}) as Record<string, { valor?: string } | undefined>;
  for (const k of PERGUNTAS_RETOMADA) if (s[k]?.valor) out[k] = String(s[k]!.valor);
  return out;
}
