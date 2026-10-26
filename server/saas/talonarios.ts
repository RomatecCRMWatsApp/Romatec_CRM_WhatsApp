/**
 * Modo arcaico (MD SaaS §3.4): corretor externo (sem login) e talonários numerados de contratos/recibos.
 * A folha só é lançada uma vez e apenas para o corretor a quem o bloco foi entregue; a cópia digitalizada
 * fica no banco. Relatório de folhas entregues e não devolvidas por corretor.
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { corretoresExternos, talonarioFolhas, talonarios, users } from '../../drizzle/schema';
import { detectarMime } from '../../shared/cadastro';

export class TalonarioErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'TalonarioErro'; } }

const banco = async () => {
  const d = await getDb();
  if (!d) throw new TalonarioErro('Banco indisponível', 503);
  return d as any;
};
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const MAX_BLOCO = 500;
const MAX_ARQUIVO = 10 * 1024 * 1024;

// ─── Corretor externo ─────────────────────────────────────────────────────

export async function listarExternos() {
  const d = await banco();
  const xs: any[] = await d.select().from(corretoresExternos).orderBy(desc(corretoresExternos.createdAt));
  return xs.map(x => ({ id: x.id as number, nome: x.nome as string, cpf: x.cpf as string, creci: x.creci ?? null, creciUf: x.creciUf ?? null, telefone: x.telefone ?? null, email: x.email ?? null, ativo: x.ativo !== false && x.ativo !== 0, recrutamentoId: x.recrutamentoId ?? null }));
}

export async function criarExterno(p: { nome: string; cpf: string; creci?: string | null; creciUf?: string | null; telefone?: string | null; email?: string | null; observacao?: string | null }, autorId: number) {
  const cpf = soDig(p.cpf);
  if (cpf.length !== 11) throw new TalonarioErro('CPF inválido');
  if (p.nome.trim().length < 3) throw new TalonarioErro('Informe o nome');
  const d = await banco();
  const [ja]: any[] = await d.select({ id: corretoresExternos.id }).from(corretoresExternos).where(eq(corretoresExternos.cpf, cpf)).limit(1);
  if (ja) throw new TalonarioErro('Este CPF já está cadastrado como corretor externo', 409);
  const r: any = await d.insert(corretoresExternos).values({
    nome: p.nome.trim().slice(0, 150), cpf, creci: p.creci?.trim() || null, creciUf: p.creciUf?.trim().toUpperCase() || null, telefone: soDig(p.telefone) || null,
    email: p.email?.trim() || null, observacao: p.observacao?.slice(0, 300) || null, ativo: 1, criadoPor: autorId, createdAt: new Date(),
  } as any);
  return { id: Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0) };
}

/** Marca o externo como convidado para o digital (o convite em si sai pelo Recrutamento) */
export async function vincularConvite(externoId: number, recrutamentoId: number) {
  const d = await banco();
  await d.update(corretoresExternos).set({ recrutamentoId } as any).where(eq(corretoresExternos.id, externoId));
}

// ─── Talonários ───────────────────────────────────────────────────────────

/** Entrega de bloco numerado: cria as folhas EM_BRANCO; a faixa não pode se sobrepor a outro bloco do mesmo tipo */
export async function entregarBloco(p: { tipo: 'CONTRATO' | 'RECIBO'; numeroInicial: number; numeroFinal: number; externoId?: number | null; usuarioId?: number | null; entregueEm: string; observacao?: string | null }, autorId: number) {
  const ini = Math.round(p.numeroInicial), fim = Math.round(p.numeroFinal);
  if (!(ini > 0 && fim >= ini)) throw new TalonarioErro('Faixa inválida: o número final precisa ser maior ou igual ao inicial');
  if (fim - ini + 1 > MAX_BLOCO) throw new TalonarioErro(`Bloco de até ${MAX_BLOCO} folhas`);
  if (!p.externoId === !p.usuarioId) throw new TalonarioErro('Escolha o corretor que recebeu o bloco');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.entregueEm)) throw new TalonarioErro('Data de entrega inválida');
  const d = await banco();
  if (p.externoId) {
    const [x]: any[] = await d.select({ id: corretoresExternos.id }).from(corretoresExternos).where(eq(corretoresExternos.id, p.externoId)).limit(1);
    if (!x) throw new TalonarioErro('Corretor externo não encontrado', 404);
  } else {
    const [u]: any[] = await d.select({ id: users.id }).from(users).where(eq(users.id, p.usuarioId!)).limit(1);
    if (!u) throw new TalonarioErro('Corretor não encontrado', 404);
  }
  const mesmos: any[] = await d.select().from(talonarios).where(eq(talonarios.tipo, p.tipo));
  const choque = mesmos.find(t => ini <= Number(t.numeroFinal) && fim >= Number(t.numeroInicial));
  if (choque) throw new TalonarioErro(`A faixa ${ini}–${fim} se sobrepõe ao bloco ${choque.numeroInicial}–${choque.numeroFinal} já entregue`, 409);
  const r: any = await d.insert(talonarios).values({
    tipo: p.tipo, numeroInicial: ini, numeroFinal: fim, externoId: p.externoId ?? null, usuarioId: p.usuarioId ?? null, entregueEm: p.entregueEm,
    entreguePor: autorId, observacao: p.observacao?.slice(0, 255) || null, createdAt: new Date(),
  } as any);
  const id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
  for (let n = ini; n <= fim; n++) await d.insert(talonarioFolhas).values({ talonarioId: id, numero: n, status: 'EM_BRANCO' } as any);
  return { id, folhas: fim - ini + 1 };
}

async function nomesDosCorretores(d: any) {
  const [xs, us]: any[][] = await Promise.all([d.select({ id: corretoresExternos.id, nome: corretoresExternos.nome }).from(corretoresExternos), d.select({ id: users.id, nome: users.name }).from(users)]);
  return { X: new Map(xs.map(x => [x.id, x.nome])), U: new Map(us.map(u => [u.id, u.nome])) };
}

export async function listarTalonarios() {
  const d = await banco();
  const ts: any[] = await d.select().from(talonarios).orderBy(desc(talonarios.createdAt));
  const fs: any[] = await d.select({ talonarioId: talonarioFolhas.talonarioId, status: talonarioFolhas.status }).from(talonarioFolhas);
  const { X, U } = await nomesDosCorretores(d);
  return ts.map(t => {
    const minhas = fs.filter(f => f.talonarioId === t.id);
    const conta = (s: string) => minhas.filter(f => f.status === s).length;
    return {
      id: t.id as number, tipo: t.tipo as string, numeroInicial: Number(t.numeroInicial), numeroFinal: Number(t.numeroFinal), entregueEm: t.entregueEm,
      corretor: (t.externoId ? X.get(t.externoId) : U.get(t.usuarioId)) ?? '—', externo: !!t.externoId,
      externoId: (t.externoId ?? null) as number | null, usuarioId: (t.usuarioId ?? null) as number | null,
      emBranco: conta('EM_BRANCO'), utilizadas: conta('UTILIZADA'), canceladas: conta('CANCELADA'), extraviadas: conta('EXTRAVIADA'), observacao: t.observacao ?? null,
    };
  });
}

export async function folhasDoTalonario(talonarioId: number) {
  const d = await banco();
  const fs: any[] = await d.select({
    numero: talonarioFolhas.numero, status: talonarioFolhas.status, contratoId: talonarioFolhas.contratoId, referencia: talonarioFolhas.referencia,
    arquivoNome: talonarioFolhas.arquivoNome, lancadoEm: talonarioFolhas.lancadoEm,
  }).from(talonarioFolhas).where(eq(talonarioFolhas.talonarioId, talonarioId));
  return fs.sort((a, b) => a.numero - b.numero);
}

/**
 * Lançamento da folha: valida que o nº pertence ao bloco do corretor informado e que ainda está em branco.
 * UTILIZADA exige a cópia digitalizada (PDF/imagem); CANCELADA/EXTRAVIADA só registram.
 */
export async function lancarFolha(p: {
  talonarioId: number; numero: number; corretor: { externoId?: number | null; usuarioId?: number | null }; status: 'UTILIZADA' | 'CANCELADA' | 'EXTRAVIADA';
  contratoId?: number | null; referencia?: string | null; arquivo?: { buf: Buffer; nome: string } | null;
}, autorId: number) {
  const d = await banco();
  const [t]: any[] = await d.select().from(talonarios).where(eq(talonarios.id, p.talonarioId)).limit(1);
  if (!t) throw new TalonarioErro('Talonário não encontrado', 404);
  const doCorretor = (t.externoId && t.externoId === p.corretor.externoId) || (t.usuarioId && t.usuarioId === p.corretor.usuarioId);
  if (!doCorretor) throw new TalonarioErro('Esta folha pertence ao talonário de outro corretor', 403);
  if (p.numero < Number(t.numeroInicial) || p.numero > Number(t.numeroFinal)) throw new TalonarioErro(`A folha ${p.numero} não é deste bloco (${t.numeroInicial}–${t.numeroFinal})`);
  const [f]: any[] = await d.select().from(talonarioFolhas).where(and(eq(talonarioFolhas.talonarioId, p.talonarioId), eq(talonarioFolhas.numero, p.numero))).limit(1);
  if (!f) throw new TalonarioErro('Folha não encontrada', 404);
  if (f.status !== 'EM_BRANCO') throw new TalonarioErro(`A folha ${p.numero} já foi lançada (${String(f.status).toLowerCase()})`, 409);
  let arquivo: { nome: string; mime: string; b64: string } | null = null;
  if (p.status === 'UTILIZADA') {
    if (!p.arquivo?.buf?.length) throw new TalonarioErro('Anexe a cópia digitalizada da folha');
    if (p.arquivo.buf.length > MAX_ARQUIVO) throw new TalonarioErro('Arquivo acima de 10 MB', 413);
    const mime = detectarMime(p.arquivo.buf);
    if (!mime) throw new TalonarioErro('Envie PDF, JPG, PNG ou WEBP', 415);
    if (!p.contratoId && !p.referencia?.trim()) throw new TalonarioErro('Informe o contrato ou a referência (cliente/unidade)');
    arquivo = { nome: (p.arquivo.nome || `folha-${p.numero}`).slice(0, 200), mime, b64: p.arquivo.buf.toString('base64') };
  }
  // Condição no WHERE: dois lançamentos ao mesmo tempo não usam a mesma folha
  const r: any = await d.update(talonarioFolhas).set({
    status: p.status, contratoId: p.contratoId ?? null, referencia: p.referencia?.slice(0, 160) || null,
    arquivoNome: arquivo?.nome ?? null, arquivoMime: arquivo?.mime ?? null, arquivoBase64: arquivo?.b64 ?? null, lancadoPor: autorId, lancadoEm: new Date(),
  } as any).where(and(eq(talonarioFolhas.talonarioId, p.talonarioId), eq(talonarioFolhas.numero, p.numero), eq(talonarioFolhas.status, 'EM_BRANCO')));
  const afetadas = Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? 1);
  if (!afetadas) throw new TalonarioErro(`A folha ${p.numero} acabou de ser lançada por outra pessoa`, 409);
  return { ok: true as const };
}

export async function arquivoDaFolha(talonarioId: number, numero: number) {
  const d = await banco();
  const [f]: any[] = await d.select().from(talonarioFolhas).where(and(eq(talonarioFolhas.talonarioId, talonarioId), eq(talonarioFolhas.numero, numero))).limit(1);
  if (!f?.arquivoBase64) throw new TalonarioErro('Folha sem cópia digitalizada', 404);
  return { buf: Buffer.from(String(f.arquivoBase64), 'base64'), mime: f.arquivoMime as string, nome: f.arquivoNome as string };
}

/** Folhas entregues e ainda em branco, por corretor */
export async function pendencias() {
  const d = await banco();
  const ts: any[] = await d.select().from(talonarios);
  const fs: any[] = await d.select({ talonarioId: talonarioFolhas.talonarioId, numero: talonarioFolhas.numero, status: talonarioFolhas.status }).from(talonarioFolhas);
  const { X, U } = await nomesDosCorretores(d);
  const porCorretor = new Map<string, { corretor: string; externo: boolean; tipo: string; folhas: number[] }[]>();
  for (const t of ts) {
    const emBranco = fs.filter(f => f.talonarioId === t.id && f.status === 'EM_BRANCO').map(f => Number(f.numero)).sort((a, b) => a - b);
    if (!emBranco.length) continue;
    const chave = t.externoId ? `x${t.externoId}` : `u${t.usuarioId}`;
    const lista = porCorretor.get(chave) ?? [];
    lista.push({ corretor: (t.externoId ? X.get(t.externoId) : U.get(t.usuarioId)) ?? '—', externo: !!t.externoId, tipo: t.tipo, folhas: emBranco });
    porCorretor.set(chave, lista);
  }
  return Array.from(porCorretor.values()).map(blocos => ({
    corretor: blocos[0].corretor, externo: blocos[0].externo,
    contratos: blocos.filter(b => b.tipo === 'CONTRATO').flatMap(b => b.folhas), recibos: blocos.filter(b => b.tipo === 'RECIBO').flatMap(b => b.folhas),
  })).sort((a, b) => b.contratos.length + b.recibos.length - (a.contratos.length + a.recibos.length));
}
