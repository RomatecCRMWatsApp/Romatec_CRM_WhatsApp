/**
 * Anexos do contrato: documentos pessoais do comprador e do cônjuge (documento com foto, CPF, comprovantes de endereço e
 * de renda, certidão de casamento) e o documento de cada dependente. Enviados no "Novo contrato" logo após criar e,
 * depois, pela tela do contrato. Arquivo em contratoArquivos (mesmo armazenamento dos PDFs); foto vira JPEG reduzido.
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { contratoAnexos } from '../../drizzle/schema';
import { LIMITE_ANEXO_MB, MIMES_ANEXO, TIPOS_ANEXO, type AlvoAnexo, type TipoAnexo } from '../../shared/contratos';
import { ContratoErro, dependentesDo, pessoasDe } from './servico';
import { lerArquivo, salvarArquivo } from './arquivos';

const db = async () => {
  const d = await getDb();
  if (!d) throw new ContratoErro('BANCO', 'Banco indisponível', 503);
  return d as any;
};

/** Tipo pelo conteúdo (não confia no Content-Type do navegador) */
export function mimeDe(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export async function salvarAnexo(contratoId: number, p: { alvo: AlvoAnexo; dependente?: number | null; tipo: string; nome: string }, bruto: Buffer, autorId: number) {
  if (!(p.tipo in TIPOS_ANEXO)) throw new ContratoErro('TIPO', 'Tipo de documento inválido', 400);
  if (!bruto.length) throw new ContratoErro('VAZIO', 'Arquivo vazio', 400);
  if (bruto.length > LIMITE_ANEXO_MB * 1024 * 1024) throw new ContratoErro('GRANDE', `Arquivo acima de ${LIMITE_ANEXO_MB} MB`, 413);
  let mime = mimeDe(bruto);
  if (!mime || !MIMES_ANEXO.includes(mime)) throw new ContratoErro('FORMATO', 'Envie PDF, JPG, PNG ou WEBP', 415);
  // Quem é o dono do documento: comprador/cônjuge do contrato, ou o dependente (id; ou a posição na lista, logo após criar)
  let dependenteId: number | null = null;
  if (p.alvo === 'dependente') {
    const deps = await dependentesDo(contratoId);
    const n = Number(p.dependente);
    const dep = deps.find(x => x.id === n) ?? (Number.isInteger(n) && n >= 0 && n < deps.length && n < 10 ? deps[n] : undefined);
    if (!dep) throw new ContratoErro('NAO_ENCONTRADO', 'Dependente não encontrado neste contrato', 404);
    dependenteId = dep.id;
  } else {
    const { comprador, conjuge } = await pessoasDe(contratoId);
    if ((p.alvo === 'comprador' && !comprador) || (p.alvo === 'conjuge' && !conjuge)) throw new ContratoErro('NAO_ENCONTRADO', 'Pessoa não encontrada neste contrato', 404);
  }
  let buf = bruto;
  if (mime !== 'application/pdf') {
    const sharp = (await import('sharp')).default;
    try { buf = await sharp(bruto).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(); mime = 'image/jpeg'; }
    catch { throw new ContratoErro('FORMATO', 'Imagem inválida', 415); }
  }
  const ext = mime === 'application/pdf' ? 'pdf' : 'jpg';
  const chave = `anexos/${contratoId}/${p.alvo}${dependenteId ? `-${dependenteId}` : ''}-${p.tipo}-${Date.now()}.${ext}`;
  await salvarArquivo(chave, buf, mime);
  const nome = (p.nome || `${p.tipo}.${ext}`).replace(/[^\w À-ÿ.()-]/g, '_').slice(0, 200);
  const d = await db();
  await d.insert(contratoAnexos).values({ contratoId, alvo: p.alvo, dependenteId, tipo: p.tipo, nome, arquivo: chave, mime, bytes: buf.length, enviadoPor: autorId, enviadoEm: new Date() } as any);
  return { ok: true as const };
}

export async function listarAnexos(contratoId: number) {
  const d = await db();
  const r: any[] = await d.select().from(contratoAnexos).where(eq(contratoAnexos.contratoId, contratoId)).orderBy(asc(contratoAnexos.id));
  const deps = new Map((await dependentesDo(contratoId)).map(x => [x.id, x.nome]));
  return r.map(a => ({
    id: Number(a.id), alvo: a.alvo as AlvoAnexo, dependenteId: a.dependenteId == null ? null : Number(a.dependenteId),
    dependente: a.dependenteId == null ? null : deps.get(Number(a.dependenteId)) ?? 'dependente removido',
    tipo: a.tipo as TipoAnexo, rotulo: TIPOS_ANEXO[a.tipo as TipoAnexo] ?? a.tipo, nome: a.nome, mime: a.mime, bytes: Number(a.bytes), enviadoPor: Number(a.enviadoPor), enviadoEm: a.enviadoEm,
  }));
}

export async function lerAnexo(contratoId: number, id: number) {
  const d = await db();
  const [a]: any[] = await d.select().from(contratoAnexos).where(and(eq(contratoAnexos.id, id), eq(contratoAnexos.contratoId, contratoId))).limit(1);
  if (!a) return null;
  const f = await lerArquivo(a.arquivo);
  return f ? { buf: f.buf, mime: a.mime as string, nome: a.nome as string } : null;
}

/** Remove o vínculo do anexo (o arquivo fica guardado): escritório, ou quem enviou */
export async function removerAnexo(contratoId: number, id: number, user: { id: number }, escritorio: boolean) {
  const d = await db();
  const [a]: any[] = await d.select().from(contratoAnexos).where(and(eq(contratoAnexos.id, id), eq(contratoAnexos.contratoId, contratoId))).limit(1);
  if (!a) throw new ContratoErro('NAO_ENCONTRADO', 'Anexo não encontrado', 404);
  if (!escritorio && Number(a.enviadoPor) !== user.id) throw new ContratoErro('PROIBIDO', 'Só o escritório ou quem enviou pode remover', 403);
  await d.delete(contratoAnexos).where(eq(contratoAnexos.id, id));
  return { ok: true as const };
}
