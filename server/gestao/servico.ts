/**
 * Contrato de Gestão do empreendimento — dados (parâmetros, adiantamentos) e leitura da qualificação da EMPREENDEDORA
 * e do imóvel na configuração jurídica (empJuridico: os dados pessoais ficam no banco, nunca no código).
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { empJuridico, empreendimentos, gestaoAditivos, gestaoAportes, gestaoContratos, lotes } from '../../drizzle/schema';
import { MAX_BYTES_ANEXO_APORTE, PARAMETROS_PADRAO, aditivoGestaoSchema, anexoAporteSchema, ordenarAnexos, type DadosAnexoAporte, type TipoAnexoAporte, numeroContratoGestao, parametrosSchema, type DadosAditivoGestao, type DadosAporte, type ParametrosGestao, type TipoAditivoGestao } from '../../shared/gestao';

export class GestaoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'GestaoErro'; } }

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new GestaoErro('Banco indisponível', 503);
  return d;
}

const json = (v: unknown): Record<string, any> => {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return v as Record<string, any>;
};
/** Valor útil (vazio e "[PREENCHER…]" contam como ausentes) */
const util = (v: unknown) => { const t = String(v ?? '').trim(); return t && !/^\[?PREENCHER/i.test(t) ? t : ''; };

export interface AnexoAporte { chave: string; nome: string; mime: string; tipo: TipoAnexoAporte; descricao: string; bytes: number }
export interface AporteGestao extends DadosAporte {
  id: number; numero: number; ressarcidoEm: string | null;
  /** Termos aditivos que reconhecem este recibo */
  aditivos: number[];
  /** Comprovantes e documentos de origem anexos (o conteúdo fica em contratoArquivos) */
  anexos: AnexoAporte[];
}
const anexosDe = (v: unknown): AnexoAporte[] => { try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch { return []; } };
export interface AditivoGestao { id: number; numero: number; data: string; tipo: TipoAditivoGestao; objeto: string; texto: string; valor: number | null; aportes: number[] }

export interface DadosContratoGestao {
  empreendimento: { id: number; slug: string; nome: string; municipio: string; uf: string };
  numero: string;
  parametros: ParametrosGestao;
  qtdLotes: number;
  lotesCadastrados: number;
  /** Campos emp_* e vend_* (configuração jurídica), já sem os marcadores [PREENCHER] */
  emp: Record<string, string>;
  vend: Record<string, string>;
  vendedoraPj: boolean;
  aportes: AporteGestao[];
  aditivos: AditivoGestao[];
  atualizadoEm: string | null;
}

async function empreendimentoDe(slug: string) {
  const d = await banco();
  const [e]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!e) throw new GestaoErro('Empreendimento não encontrado', 404);
  return e;
}

export async function dadosContrato(slug: string): Promise<DadosContratoGestao> {
  const d = await banco();
  const e = await empreendimentoDe(slug);
  const [g]: any[] = await d.select().from(gestaoContratos).where(eq(gestaoContratos.empreendimentoId, e.id)).limit(1);
  const salvos = g ? json(g.parametrosJson) : {};
  const parametros: ParametrosGestao = { ...PARAMETROS_PADRAO, ...parametrosSchema.partial().parse(salvos) };
  const [j]: any[] = await d.select().from(empJuridico).where(eq(empJuridico.empreendimentoId, e.id)).limit(1);
  const limpar = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, util(v)]).filter(([, v]) => v));
  const ls: any[] = await d.select({ id: lotes.id }).from(lotes).where(eq(lotes.empreendimentoId, e.id));
  const ap: any[] = await d.select().from(gestaoAportes).where(eq(gestaoAportes.empreendimentoId, e.id)).orderBy(asc(gestaoAportes.numero));
  const ad: any[] = await d.select().from(gestaoAditivos).where(eq(gestaoAditivos.empreendimentoId, e.id)).orderBy(asc(gestaoAditivos.numero));
  const ano = parametros.dataContrato ? Number(parametros.dataContrato.slice(0, 4)) : new Date().getFullYear();
  const r: DadosContratoGestao = {
    empreendimento: { id: Number(e.id), slug: e.slug, nome: e.nome, municipio: e.municipio ?? 'Açailândia', uf: e.uf ?? 'MA' },
    numero: g?.numero ?? numeroContratoGestao(Number(e.id), ano),
    parametros,
    qtdLotes: parametros.qtdLotes ?? ls.length,
    lotesCadastrados: ls.length,
    emp: limpar(json(j?.defaultsJson)),
    vend: limpar(json(j?.vendedoraJson)),
    vendedoraPj: j?.vendedoraTipo === 'PJ',
    aportes: ap.map(a => ({
      id: Number(a.id), numero: Number(a.numero), data: a.data, valor: Number(a.valor), descricao: a.descricao, categoria: a.categoria,
      favorecido: a.favorecido ?? '', formaPagamento: a.formaPagamento, comprovante: a.comprovante ?? '', ressarcidoEm: a.ressarcidoEm ?? null,
      valorContratado: a.valorContratado != null ? Number(a.valorContratado) : null, referencia: a.referencia ?? '', aditivos: [] as number[], anexos: anexosDe(a.anexosJson),
    })),
    aditivos: ad.map(a => ({
      id: Number(a.id), numero: Number(a.numero), data: a.data, tipo: a.tipo, objeto: a.objeto ?? '', texto: a.texto ?? '',
      valor: a.valor != null ? Number(a.valor) : null, aportes: (() => { try { return JSON.parse(a.aportesJson || '[]').map(Number); } catch { return []; } })(),
    })),
    atualizadoEm: g?.atualizadoEm ? new Date(g.atualizadoEm).toISOString() : null,
  };
  // Vínculos: cada recibo sabe em quais termos aditivos foi reconhecido
  for (const ap of r.aportes) ap.aditivos = r.aditivos.filter(x => x.tipo === 'adiantamentos' && x.aportes.includes(ap.id)).map(x => x.numero);
  return r;
}

export async function salvarParametros(slug: string, p: ParametrosGestao, autorId: number) {
  const d = await banco();
  const e = await empreendimentoDe(slug);
  const dados = parametrosSchema.parse(p);
  const ano = dados.dataContrato ? Number(dados.dataContrato.slice(0, 4)) : new Date().getFullYear();
  await d.delete(gestaoContratos).where(eq(gestaoContratos.empreendimentoId, e.id));
  await d.insert(gestaoContratos).values({
    empreendimentoId: e.id, numero: numeroContratoGestao(Number(e.id), ano), parametrosJson: JSON.stringify(dados), atualizadoPor: autorId, atualizadoEm: new Date(),
  } as any);
  return { ok: true as const };
}

export async function criarAporte(slug: string, a: DadosAporte, autorId: number) {
  const d = await banco();
  const e = await empreendimentoDe(slug);
  const ex: any[] = await d.select({ numero: gestaoAportes.numero }).from(gestaoAportes).where(eq(gestaoAportes.empreendimentoId, e.id));
  const numero = ex.reduce((m, x) => Math.max(m, Number(x.numero)), 0) + 1;
  await d.insert(gestaoAportes).values({
    empreendimentoId: e.id, numero, data: a.data, valor: a.valor.toFixed(2), descricao: a.descricao, categoria: a.categoria,
    favorecido: a.favorecido || null, formaPagamento: a.formaPagamento, comprovante: a.comprovante || null,
    valorContratado: a.valorContratado != null ? a.valorContratado.toFixed(2) : null, referencia: a.referencia || null, criadoPor: autorId, criadoEm: new Date(),
  } as any);
  return { ok: true as const, numero };
}

async function aporteDoEmpreendimento(slug: string, id: number) {
  const d = await banco();
  const e = await empreendimentoDe(slug);
  const [a]: any[] = await d.select().from(gestaoAportes).where(and(eq(gestaoAportes.id, id), eq(gestaoAportes.empreendimentoId, e.id))).limit(1);
  if (!a) throw new GestaoErro('Adiantamento não encontrado', 404);
  return { d, a };
}

const ASSINATURA_ARQUIVO: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': b => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

/** Anexa ao recibo o comprovante do pagamento ou o documento de origem (PDF, PNG ou JPG, até 10 MB) */
export async function anexarAporte(slug: string, id: number, entrada: DadosAnexoAporte) {
  const { d, a } = await aporteDoEmpreendimento(slug, id);
  const x = anexoAporteSchema.parse(entrada);
  const buf = Buffer.from(x.conteudoBase64, 'base64');
  if (!buf.length || buf.length > MAX_BYTES_ANEXO_APORTE) throw new GestaoErro('Arquivo vazio ou maior que 10 MB.');
  if (!ASSINATURA_ARQUIVO[x.mime](buf)) throw new GestaoErro('O conteúdo do arquivo não corresponde a PDF, PNG ou JPG.');
  const atuais = anexosDe(a.anexosJson);
  if (atuais.length >= 10) throw new GestaoErro('Limite de 10 anexos por recibo.');
  const ext = x.mime === 'application/pdf' ? 'pdf' : x.mime === 'image/png' ? 'png' : 'jpg';
  const chave = `gestao/${a.empreendimentoId}/recibo-${a.numero}-${x.tipo}-${Date.now()}.${ext}`;
  const { salvarArquivo } = await import('../contratos/arquivos');
  await salvarArquivo(chave, buf, x.mime);
  const novo: AnexoAporte = { chave, nome: x.nome, mime: x.mime, tipo: x.tipo, descricao: x.descricao, bytes: buf.length };
  await d.update(gestaoAportes).set({ anexosJson: JSON.stringify([...atuais, novo]) } as any).where(eq(gestaoAportes.id, id));
  return { ok: true as const, anexo: novo };
}

/** Retira um anexo do recibo (o arquivo continua guardado: versões nunca são apagadas) */
export async function removerAnexoAporte(slug: string, id: number, chave: string) {
  const { d, a } = await aporteDoEmpreendimento(slug, id);
  const atuais = anexosDe(a.anexosJson);
  if (!atuais.some(x => x.chave === chave)) throw new GestaoErro('Anexo não encontrado', 404);
  await d.update(gestaoAportes).set({ anexosJson: JSON.stringify(atuais.filter(x => x.chave !== chave)) } as any).where(eq(gestaoAportes.id, id));
  return { ok: true as const };
}

/** Conteúdo dos anexos de um recibo, na ordem: comprovantes, depois documentos de origem */
export async function arquivosDoAporte(a: Pick<AporteGestao, 'anexos'>): Promise<(AnexoAporte & { buf: Buffer })[]> {
  const { lerArquivo } = await import('../contratos/arquivos');
  const r: (AnexoAporte & { buf: Buffer })[] = [];
  for (const x of ordenarAnexos(a.anexos)) {
    const f = await lerArquivo(x.chave).catch(() => null);
    if (f) r.push({ ...x, buf: f.buf });
    else console.warn(`[Gestão] anexo ${x.chave} não encontrado`);
  }
  return r;
}

/** Marca (ou desmarca) o ressarcimento de um adiantamento */
export async function marcarRessarcido(slug: string, id: number, data: string | null) {
  const { d } = await aporteDoEmpreendimento(slug, id);
  await d.update(gestaoAportes).set({ ressarcidoEm: data } as any).where(eq(gestaoAportes.id, id));
  return { ok: true as const };
}

/** Exclui um lançamento ainda não ressarcido (a numeração dos recibos não é reaproveitada) */
export async function excluirAporte(slug: string, id: number) {
  const { d, a } = await aporteDoEmpreendimento(slug, id);
  if (a.ressarcidoEm) throw new GestaoErro('Adiantamento já ressarcido: desmarque o ressarcimento antes de excluir.', 409);
  await d.delete(gestaoAportes).where(eq(gestaoAportes.id, id));
  return { ok: true as const };
}

/**
 * Agrimensura passou de R$ 800 para R$ 850 por lote (nov/2026): condições já salvas com 800 passam a 850, uma vez só
 * (marcador em configSistema) — se depois o administrador puser outro valor, fica o dele.
 */
export async function ajustarAgrimensura850(): Promise<number> {
  const d: any = await getDb();
  if (!d) return 0;
  const { lerConfig, gravarConfig } = await import('../configSistema');
  const CHAVE = 'gestao_agrimensura_850';
  if (await lerConfig(CHAVE).catch(() => null)) return 0;
  const rows: any[] = await d.select().from(gestaoContratos);
  let n = 0;
  for (const r of rows) {
    const p = json(r.parametrosJson);
    if (Number(p.valorPorLote) !== 800) continue;
    await d.update(gestaoContratos).set({ parametrosJson: JSON.stringify({ ...p, valorPorLote: 850 }) } as any).where(eq(gestaoContratos.empreendimentoId, r.empreendimentoId));
    n++;
  }
  await gravarConfig(CHAVE, JSON.stringify({ em: new Date().toISOString(), ajustados: n }), null);
  if (n) console.log(`[Gestão] agrimensura: ${n} contrato(s) de R$ 800 para R$ 850 por lote`);
  return n;
}

/** Novo termo aditivo ao Contrato de Gestão (número seguinte; numeração não é reaproveitada) */
export async function criarAditivoGestao(slug: string, entrada: DadosAditivoGestao, autorId: number) {
  const d = await banco();
  const e = await empreendimentoDe(slug);
  const a = aditivoGestaoSchema.parse(entrada);
  if (a.tipo === 'adiantamentos') {
    if (!a.aportes.length) throw new GestaoErro('Escolha os adiantamentos (recibos) que o termo reconhece.');
    const ex: any[] = await d.select({ id: gestaoAportes.id }).from(gestaoAportes).where(eq(gestaoAportes.empreendimentoId, e.id));
    const validos = new Set(ex.map(x => Number(x.id)));
    if (a.aportes.some(id => !validos.has(id))) throw new GestaoErro('Adiantamento não encontrado neste empreendimento.', 404);
  } else if (!a.texto && !a.valor && !a.objeto) throw new GestaoErro('Descreva o que o termo altera ou inclui.');
  const todos: any[] = await d.select({ numero: gestaoAditivos.numero }).from(gestaoAditivos).where(eq(gestaoAditivos.empreendimentoId, e.id));
  const numero = todos.reduce((m, x) => Math.max(m, Number(x.numero)), 0) + 1;
  await d.insert(gestaoAditivos).values({
    empreendimentoId: e.id, numero, data: a.data, tipo: a.tipo, objeto: a.objeto || null, texto: a.texto || null,
    valor: a.valor != null ? a.valor.toFixed(2) : null, aportesJson: JSON.stringify(a.aportes), criadoPor: autorId, criadoEm: new Date(),
  } as any);
  return { ok: true as const, numero };
}

export async function excluirAditivoGestao(slug: string, id: number) {
  const d = await banco();
  const e = await empreendimentoDe(slug);
  const [a]: any[] = await d.select({ id: gestaoAditivos.id }).from(gestaoAditivos).where(and(eq(gestaoAditivos.id, id), eq(gestaoAditivos.empreendimentoId, e.id))).limit(1);
  if (!a) throw new GestaoErro('Termo aditivo não encontrado', 404);
  await d.delete(gestaoAditivos).where(eq(gestaoAditivos.id, id));
  return { ok: true as const };
}
