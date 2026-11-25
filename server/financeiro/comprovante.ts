/**
 * Leitura de comprovante de pagamento para a despesa (Financeiro › Despesas › Nova despesa › Ler comprovante).
 *
 * PDF com texto (Asaas, bancos): lido direto pelas regras abaixo, sem IA.
 * Foto ou print (JPG/PNG) e PDF escaneado: a IA lê a imagem (Claude, com o modelo do sistema como reserva).
 * Nada é gravado aqui: só devolve os campos para a tela preencher; o comprovante é anexado quando a despesa é lançada.
 */
import { FinanceiroErro } from './servico';

export type FormaComprovante = 'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'CARTAO' | 'DINHEIRO' | 'OUTRO';

export interface DadosComprovante {
  valor: number | null;
  /** AAAA-MM-DD */
  data: string | null;
  recebedor: string | null;
  documentoRecebedor: string | null;
  instituicaoRecebedor: string | null;
  pagador: string | null;
  forma: FormaComprovante | null;
  idTransacao: string | null;
}

export interface LeituraComprovante extends DadosComprovante {
  origem: 'texto' | 'ia';
  /** campos que não foram encontrados (a tela avisa para conferir) */
  faltando: string[];
}

const VAZIO: DadosComprovante = { valor: null, data: null, recebedor: null, documentoRecebedor: null, instituicaoRecebedor: null, pagador: null, forma: null, idTransacao: null };

/** "12.000,00" → 12000 */
export function valorBr(s: string): number | null {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const MESES: Record<string, string> = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };

/** "24/11/2026", "24/11/26" ou "24 de nov de 2026" → "2026-11-24" */
export function dataBr(s: string): string | null {
  let m = s.match(/\b(\d{2})\/(\d{2})\/(\d{4}|\d{2})\b/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2]}-${m[1]}`;
  }
  m = s.toLowerCase().match(/\b(\d{1,2}) de (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]* de (\d{4})\b/);
  return m ? `${m[3]}-${MESES[m[2]]}-${m[1].padStart(2, '0')}` : null;
}

const DOC = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\*{3}\.?\d{3}\.?\d{3}-?\*{2})\b/;

/** Divide o texto nas partes do destinatário e do pagador (cada banco usa um título) */
function partes(texto: string): { recebedor: string; pagador: string } {
  const t = texto.replace(/\r/g, '');
  const iniR = t.search(/dados do (destinat[aá]rio|recebedor|favorecido)|\b(destino|para|recebedor|favorecido|benefici[aá]rio)\b\s*\n/i);
  const iniP = t.search(/dados do pagador|\b(origem|pagador|de)\b\s*\n/i);
  if (iniR < 0) return { recebedor: '', pagador: iniP >= 0 ? t.slice(iniP) : '' };
  const fimR = iniP > iniR ? iniP : t.length;
  return { recebedor: t.slice(iniR, fimR), pagador: iniP >= 0 ? t.slice(iniP, iniP > iniR ? undefined : iniR) : '' };
}

function campoApos(bloco: string, rotulo: RegExp): string | null {
  const linhas = bloco.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const m = l.match(rotulo);
    if (!m) continue;
    const resto = l.slice((m.index ?? 0) + m[0].length).replace(/^[:\s-]+/, '').trim();
    if (resto) return resto;
    if (linhas[i + 1]) return linhas[i + 1];
  }
  return null;
}

/** Lê o texto de um comprovante (PDF com texto). Regra pura: sem rede. */
export function extrairDeTexto(texto: string): DadosComprovante {
  const t = texto.replace(/ /g, ' ');
  const out: DadosComprovante = { ...VAZIO };

  const valor = t.match(/valor(?: pago| da transfer[eê]ncia| do pagamento)?\s*:?\s*\n?\s*R\$\s*([\d.]+,\d{2})/i) ?? t.match(/R\$\s*([\d.]+,\d{2})/);
  if (valor) out.valor = valorBr(valor[1]);

  const data = t.match(/(?:data(?:\/hora)?(?: do pagamento| da transa[cç][aã]o)?|realizad[oa] em|pago em)\s*:?\s*\n?\s*([^\n]+)/i);
  out.data = (data && dataBr(data[1])) || dataBr(t);

  const forma = /\bpix\b/i.test(t) ? 'PIX' : /\bboleto\b/i.test(t) ? 'BOLETO' : /\b(ted|doc|transfer[eê]ncia)\b/i.test(t) ? 'TRANSFERENCIA' : null;
  out.forma = forma;

  const id = t.match(/(?:id\/?\s*transa[cç][aã]o|id da transa[cç][aã]o|identificador|autentica[cç][aã]o|end ?to ?end|c[oó]digo da transa[cç][aã]o)\s*:?\s*\n?\s*([A-Za-z0-9]{10,})/i);
  if (id) out.idTransacao = id[1];

  const { recebedor, pagador } = partes(t);
  if (recebedor) {
    out.recebedor = campoApos(recebedor, /\bnome\b/i);
    const doc = recebedor.match(DOC);
    if (doc) out.documentoRecebedor = doc[1];
    out.instituicaoRecebedor = campoApos(recebedor, /\binstitui[cç][aã]o\b|\bbanco\b/i);
  }
  if (pagador) out.pagador = campoApos(pagador, /\bnome\b/i);
  return out;
}

export function faltandoEm(d: DadosComprovante): string[] {
  const f: string[] = [];
  if (!d.valor) f.push('valor');
  if (!d.data) f.push('data');
  if (!d.recebedor) f.push('recebedor');
  return f;
}

// ─── Leitura com IA (imagem ou PDF escaneado) ───────────────────────────────

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['valor', 'data', 'recebedor', 'documentoRecebedor', 'instituicaoRecebedor', 'pagador', 'forma', 'idTransacao'],
  properties: {
    valor: { type: ['number', 'null'], description: 'valor pago em reais, número com ponto decimal (12000.5)' },
    data: { type: ['string', 'null'], description: 'data do pagamento em AAAA-MM-DD' },
    recebedor: { type: ['string', 'null'], description: 'nome de quem RECEBEU o dinheiro (destinatário/favorecido), não o pagador' },
    documentoRecebedor: { type: ['string', 'null'], description: 'CPF ou CNPJ do recebedor como aparece' },
    instituicaoRecebedor: { type: ['string', 'null'], description: 'banco ou instituição do recebedor' },
    pagador: { type: ['string', 'null'], description: 'nome de quem pagou' },
    forma: { type: ['string', 'null'], enum: ['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'DINHEIRO', 'OUTRO', null] },
    idTransacao: { type: ['string', 'null'], description: 'ID da transação, autenticação ou código end-to-end' },
  },
};

const INSTRUCAO = 'Você lê comprovantes de pagamento brasileiros (Pix, TED, boleto). Extraia só o que está escrito no comprovante; '
  + 'campo que não aparece fica null. Não invente. O recebedor é quem recebeu o dinheiro (destinatário, favorecido, beneficiário).';

export type LeitorIa = (arquivo: { base64: string; mime: string } | { texto: string }) => Promise<DadosComprovante>;

const leitorPadrao: LeitorIa = async (arq) => {
  const pedido = 'texto' in arq ? `Texto do comprovante:\n\n${arq.texto.slice(0, 12_000)}` : 'Leia o comprovante da imagem.';
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ maxRetries: 1, timeout: 60_000 });
      const anexo = 'texto' in arq ? [] : arq.mime === 'application/pdf'
        ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arq.base64 } }]
        : [{ type: 'image', source: { type: 'base64', media_type: arq.mime, data: arq.base64 } }];
      const resp: any = await client.beta.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 1024, system: INSTRUCAO,
        messages: [{ role: 'user', content: [...anexo, { type: 'text', text: pedido }] }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      } as any);
      const bloco = resp.content?.find((b: any) => b.type === 'text');
      if (resp.stop_reason !== 'refusal' && bloco?.text) return { ...VAZIO, ...JSON.parse(bloco.text) };
    } catch (e: any) {
      console.warn('[Comprovante] Claude falhou:', e?.message);
      if (!process.env.OPENAI_API_KEY && !process.env.BUILT_IN_FORGE_API_KEY) throw e;
    }
  }
  const { invokeLLM } = await import('../_core/llm');
  const conteudo: any[] = 'texto' in arq ? [{ type: 'text', text: pedido }]
    : [{ type: 'image_url', image_url: { url: `data:${arq.mime};base64,${arq.base64}`, detail: 'high' } }, { type: 'text', text: pedido }];
  const r = await invokeLLM({
    messages: [{ role: 'system', content: INSTRUCAO }, { role: 'user', content: conteudo }] as any,
    response_format: { type: 'json_schema', json_schema: { name: 'comprovante', schema: SCHEMA, strict: true } } as any,
  });
  const c = r.choices?.[0]?.message?.content;
  return { ...VAZIO, ...JSON.parse(typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => p.text || '').join('') : '{}') };
};
let leitorIa: LeitorIa = leitorPadrao;
export const definirLeitorIa = (f: LeitorIa | null) => { leitorIa = f ?? leitorPadrao; };

async function textoDoPdf(base64: string): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(base64, 'base64')), disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  const linhas: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const pg = await doc.getPage(p);
    const c = await pg.getTextContent();
    let y: number | null = null;
    let linha = '';
    for (const it of c.items as any[]) {
      const yi = Math.round(it.transform?.[5] ?? 0);
      if (y !== null && Math.abs(yi - y) > 3) { linhas.push(linha.trim()); linha = ''; }
      linha += (linha ? ' ' : '') + it.str;
      y = yi;
    }
    if (linha.trim()) linhas.push(linha.trim());
  }
  return linhas.filter(Boolean).join('\n');
}

/** Limpa o que veio da IA (valores e datas fora do formato viram null) */
function normalizar(d: DadosComprovante): DadosComprovante {
  const data = d.data && /^\d{4}-\d{2}-\d{2}$/.test(d.data) ? d.data : d.data ? dataBr(d.data) : null;
  const valor = typeof d.valor === 'number' && d.valor > 0 ? Math.round(d.valor * 100) / 100 : typeof d.valor === 'string' ? valorBr(d.valor) : null;
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : null);
  const forma = ['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'DINHEIRO', 'OUTRO'].includes(String(d.forma)) ? d.forma : null;
  return { valor, data, recebedor: txt(d.recebedor), documentoRecebedor: txt(d.documentoRecebedor), instituicaoRecebedor: txt(d.instituicaoRecebedor), pagador: txt(d.pagador), forma, idTransacao: txt(d.idTransacao) };
}

/**
 * OCR local (tesseract, português) para foto, print ou PDF escaneado: lê o texto sem IA e sem rede.
 * PDF: converte a 1ª página em imagem com o pdftoppm. Sem tesseract instalado, devolve '' (cai na IA).
 */
export type Ocr = (arq: { base64: string; mime: string }) => Promise<string>;
const ocrPadrao: Ocr = async arq => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const run = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), 'comp-'));
  try {
    let img: string;
    if (arq.mime === 'application/pdf') {
      await writeFile(join(dir, 'a.pdf'), Buffer.from(arq.base64, 'base64'));
      await run('pdftoppm', ['-f', '1', '-l', '1', '-r', '200', '-png', join(dir, 'a.pdf'), join(dir, 'p')], { timeout: 30_000 });
      const { readdir } = await import('node:fs/promises');
      const pg = (await readdir(dir)).find(f => f.startsWith('p') && f.endsWith('.png'));
      if (!pg) return '';
      img = join(dir, pg);
    } else {
      img = join(dir, arq.mime === 'image/png' ? 'a.png' : 'a.jpg');
      await writeFile(img, Buffer.from(arq.base64, 'base64'));
    }
    const { stdout } = await run('tesseract', [img, '-', '-l', 'por'], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    return String(stdout ?? '');
  } catch (e: any) {
    console.warn('[Comprovante] OCR indisponível:', String(e?.message ?? e).slice(0, 160));
    return '';
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
};
let ocr: Ocr = ocrPadrao;
/** Testes trocam o OCR */
export const definirOcr = (f: Ocr | null) => { ocr = f ?? ocrPadrao; };

export async function lerComprovante(arq: { base64: string; mime: string }): Promise<LeituraComprovante> {
  const tamanho = Buffer.byteLength(arq.base64, 'base64');
  if (tamanho > 10 * 1024 * 1024) throw new FinanceiroErro('ARQUIVO', 'Arquivo grande demais (máx. 10 MB)', 400);
  if (arq.mime === 'application/pdf') {
    const texto = await textoDoPdf(arq.base64).catch(() => '');
    if (texto.length > 40) {
      const d = normalizar(extrairDeTexto(texto));
      if (!faltandoEm(d).length) return { ...d, origem: 'texto', faltando: [] };
      const ia = normalizar(await leitorIa({ texto }).catch(() => VAZIO));
      const junto = Object.fromEntries(Object.keys(VAZIO).map(k => [k, (d as any)[k] ?? (ia as any)[k]])) as unknown as DadosComprovante;
      return { ...junto, origem: 'ia', faltando: faltandoEm(junto) };
    }
  }
  // Foto, print ou PDF escaneado: OCR local primeiro (sem IA); a IA só completa o que faltar
  const lidoOcr = await ocr(arq).catch(() => '');
  const doOcr = lidoOcr.length > 40 ? normalizar(extrairDeTexto(lidoOcr)) : null;
  if (doOcr && !faltandoEm(doOcr).length) return { ...doOcr, origem: 'texto', faltando: [] };
  try {
    const iaArq = arq.mime === 'application/pdf' && lidoOcr.length > 40 ? { texto: lidoOcr } : { base64: arq.base64, mime: arq.mime };
    const ia = normalizar(await leitorIa(iaArq as any));
    const d = doOcr ? Object.fromEntries(Object.keys(VAZIO).map(k => [k, (doOcr as any)[k] ?? (ia as any)[k]])) as unknown as DadosComprovante : ia;
    return { ...d, origem: 'ia', faltando: faltandoEm(d) };
  } catch (e: any) {
    console.warn('[Comprovante] Leitura falhou:', e?.message);
    if (doOcr && doOcr.valor != null) return { ...doOcr, origem: 'texto', faltando: faltandoEm(doOcr) };
    throw new FinanceiroErro('LEITURA', 'Não consegui ler o comprovante. Preencha os campos à mão e anexe o arquivo depois.', 422);
  }
}
