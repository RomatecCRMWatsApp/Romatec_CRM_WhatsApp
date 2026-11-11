/**
 * Via assinada do contrato para o(a) comprador(a): liberada só depois de paga a entrada (ou o pagamento à vista).
 * Antes de assinar, ele(a) lê o contrato normalmente (é preciso ler para assinar); depois de assinar, a via assinada —
 * pelo link de assinatura e pelo Portal do comprador — só abre com a entrada paga. Paga a entrada e com todos assinados,
 * o sistema manda a via pelo WhatsApp (uma vez). Concessão e contrato sem cobrança: liberado.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { assinaturaEventos, assinaturaSignatarios, cobrancas, contratos, users } from '../../drizzle/schema';

const ehPrimeiro = (l: { tipo: string; numero: number | string }) => l.tipo === 'avista' || (l.tipo === 'entrada' && Number(l.numero) === 1);
const json = (v: unknown): any => { if (typeof v !== 'string') return v ?? {}; try { return JSON.parse(v); } catch { return {}; } };

export interface SituacaoVia { liberada: boolean; motivo: string | null }

export async function situacaoDaVia(contratoId: number): Promise<SituacaoVia> {
  const d: any = await getDb();
  if (!d) return { liberada: true, motivo: null };
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) return { liberada: false, motivo: 'Contrato não encontrado' };
  if (json(c.simulacaoJson)?.concessao) return { liberada: true, motivo: null };
  if (c.entradaPagaNoAto === true || c.entradaPagaNoAto === 1) return { liberada: true, motivo: null };
  const cobs: any[] = await d.select({ tipo: cobrancas.tipo, numero: cobrancas.numero, status: cobrancas.status }).from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const primeira = cobs.find(ehPrimeiro);
  if (!primeira) return { liberada: false, motivo: 'A via assinada do contrato é liberada depois do pagamento da entrada.' };
  return primeira.status === 'paga' ? { liberada: true, motivo: null } : { liberada: false, motivo: 'A via assinada do contrato é liberada depois da compensação do pagamento da entrada.' };
}

/** Comprador(a)/cônjuge que já assinou e a via ainda não foi liberada? (os demais signatários veem sempre) */
export async function bloquearViaParaSignatario(contratoId: number, s: { papel: string; status: string }): Promise<string | null> {
  if (!['comprador', 'conjuge'].includes(s.papel) || s.status !== 'assinado') return null;
  const v = await situacaoDaVia(contratoId);
  return v.liberada ? null : v.motivo;
}

/** Via oficial: o contrato com todas as assinaturas + o manifesto (Anexo VII) no fim, num PDF só */
export async function montarViaAssinada(contratoId: number): Promise<{ buf: Buffer; nome: string } | null> {
  const d: any = await getDb();
  if (!d) return null;
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c?.pdfAtual) return null;
  const { lerArquivo } = await import('./arquivos');
  const contrato = await lerArquivo(c.pdfAtual);
  if (!contrato) return null;
  const manifesto = c.manifestoArquivo ? await lerArquivo(c.manifestoArquivo) : null;
  let buf = contrato.buf;
  if (manifesto) {
    const { PDFDocument } = await import('pdf-lib');
    const via = await PDFDocument.load(contrato.buf, { ignoreEncryption: true });
    const m = await PDFDocument.load(manifesto.buf, { ignoreEncryption: true });
    (await via.copyPages(m, m.getPageIndices())).forEach(pg => via.addPage(pg));
    buf = Buffer.from(await via.save({ useObjectStreams: false }));
  }
  return { buf, nome: `CONTRATO-${c.numero}-VIA-ASSINADA.pdf` };
}

const COMPRADOR = ['comprador', 'conjuge'];
const primeiroNome = (n: unknown) => String(n ?? '').trim().split(/\s+/)[0] || '';

/** Manda o PDF da via pelo WhatsApp do sistema (Z-API); falha no arquivo não impede o aviso com o link */
async function anexarPdf(telefone: string, via: { buf: Buffer; nome: string } | null, legenda: string): Promise<boolean> {
  if (!via) return false;
  try {
    const W = await import('../whatsapp/enviarArquivo');
    if (!W.envio.disponivel()) return false;
    await W.enviarArquivoWhatsapp({ telefone, buf: via.buf, nome: via.nome, legenda, autorId: 0 });
    return true;
  } catch (e: any) { console.warn('[Assinatura] PDF da via:', e?.message); return false; }
}

export interface ResultadoVias { enviados: { papel: string; nome: string; pdf: boolean }[]; aguardando: { papel: string; nome: string; motivo: string }[] }

/**
 * Todas as assinaturas concluídas: manda a via oficial assinada (PDF + link de conferência) pelo WhatsApp a cada
 * envolvido, uma vez por pessoa. Proprietária/gestora/testemunhas e o corretor recebem na hora; o(a) comprador(a) e
 * o cônjuge, quando a entrada estiver paga (a via é liberada com o pagamento).
 */
export async function enviarViasAssinadas(contratoId: number): Promise<ResultadoVias> {
  const out: ResultadoVias = { enviados: [], aguardando: [] };
  const d: any = await getDb();
  if (!d) return out;
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c || !c.manifestoArquivo) return out;
  const A = await import('../assinatura/servico');
  const situacao = await situacaoDaVia(contratoId);
  const sigs: any[] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, contratoId));
  const eventos: any[] = await d.select({ signatarioId: assinaturaEventos.signatarioId, evento: assinaturaEventos.evento }).from(assinaturaEventos)
    .where(and(eq(assinaturaEventos.contratoId, contratoId), eq(assinaturaEventos.evento, 'via_assinada_enviada')));
  const ja = new Set(eventos.map(e => e.signatarioId == null ? 'corretor' : String(e.signatarioId)));
  const conferencia = `${A.urlPublica()}/c/v/${c.codigoVerificacao}`;
  let via: { buf: Buffer; nome: string } | null | undefined;
  const pegarVia = async () => (via === undefined ? (via = await montarViaAssinada(contratoId).catch(() => null)) : via);
  const fones = new Set<string>();
  for (const s of [...sigs].sort((a, b) => Number(a.ordem) - Number(b.ordem))) {
    const fone = String(s.whatsapp ?? '').replace(/\D/g, '');
    if (fone) fones.add(fone.slice(-9));
    if (ja.has(String(s.id)) || !fone) continue;
    const ehComprador = COMPRADOR.includes(String(s.papel));
    if (ehComprador && !situacao.liberada) { out.aguardando.push({ papel: s.papel, nome: s.nome, motivo: 'entrada não paga' }); continue; }
    const msg = ehComprador
      ? `Olá, ${primeiroNome(s.nome)}! Pagamento da entrada confirmado. ✅\n\nA via assinada do contrato ${c.numero} (Chácara ${c.loteCodigo}) já está liberada para você, com o manifesto das assinaturas e o seu carnê: ${A.urlPublica()}/c/${c.codigoVerificacao}\n\nDúvidas: (99) 9 9101-1970.`
      : `Olá, ${primeiroNome(s.nome)}! Todas as assinaturas do contrato ${c.numero} (Chácara ${c.loteCodigo}) foram concluídas. ✅\n\nSegue a via oficial assinada, com o manifesto das assinaturas. Conferência da autenticidade: ${conferencia}\n\nRomatec Consultoria Total · (99) 9 9101-1970.`;
    try {
      await A.enviarMensagem(s.whatsapp, msg);
      const pdf = await anexarPdf(s.whatsapp, await pegarVia(), `Contrato ${c.numero} — via assinada`);
      await A.evento(contratoId, s.id, 'via_assinada_enviada', { detalhe: { canal: 'whatsapp', pdf } });
      out.enviados.push({ papel: s.papel, nome: s.nome, pdf });
    } catch (e: any) {
      await A.evento(contratoId, s.id, 'erro', { detalhe: { etapa: 'via_assinada', msg: String(e?.message ?? e).slice(0, 200) } });
    }
  }
  // Corretor do contrato (quando não é signatário): recebe a via para o arquivo dele
  if (c.corretorUserId && !ja.has('corretor')) {
    const [u]: any[] = await d.select({ name: users.name, telefone: users.telefone }).from(users).where(eq(users.id, c.corretorUserId)).limit(1);
    const fone = String(u?.telefone ?? '').replace(/\D/g, '');
    if (fone.length >= 10 && !fones.has(fone.slice(-9))) {
      try {
        await A.enviarMensagem(fone, `Olá, ${primeiroNome(u.name)}! O contrato ${c.numero} (Chácara ${c.loteCodigo}) foi assinado por todos. ✅\n\nSegue a via oficial assinada, com o manifesto das assinaturas, para o seu arquivo. Conferência: ${conferencia}`);
        const pdf = await anexarPdf(fone, await pegarVia(), `Contrato ${c.numero} — via assinada`);
        await A.evento(contratoId, null, 'via_assinada_enviada', { detalhe: { canal: 'whatsapp', para: 'corretor', pdf } });
        out.enviados.push({ papel: 'corretor', nome: String(u.name ?? ''), pdf });
      } catch (e: any) { console.warn('[Assinatura] via ao corretor:', e?.message); }
    }
  }
  return out;
}

/** Compatível com quem já chamava: resultado do envio ao(à) comprador(a) */
export async function enviarViaAssinadaSeLiberada(contratoId: number): Promise<{ enviado: boolean; motivo?: string }> {
  const d: any = await getDb();
  if (!d) return { enviado: false, motivo: 'sem banco' };
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c || !c.manifestoArquivo) return { enviado: false, motivo: 'assinaturas incompletas' };
  const r = await enviarViasAssinadas(contratoId);
  if (r.enviados.some(x => x.papel === 'comprador')) return { enviado: true };
  if (r.aguardando.some(x => x.papel === 'comprador')) return { enviado: false, motivo: 'entrada não paga' };
  const [s]: any[] = await d.select().from(assinaturaSignatarios).where(and(eq(assinaturaSignatarios.contratoId, contratoId), eq(assinaturaSignatarios.papel, 'comprador'))).limit(1);
  if (!s?.whatsapp) return { enviado: false, motivo: 'comprador sem WhatsApp' };
  return { enviado: false, motivo: 'já enviada' };
}
