/**
 * GET /api/materiais/:id/arquivo?formato=… — material no formato escolhido, sem o contato do escritório e com o
 * de quem está logado (server/materialFormatado.ts). Confere o acesso ao empreendimento/imóvel como o tRPC.
 */
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { empreendimentos, materiais, properties } from '../drizzle/schema';
import { carregarPermissoes } from './permissoes';
import { temAcesso } from '../shared/permissoes';
import { FORMATOS_DOWNLOAD, type FormatoDownload } from '../shared/materiais';
import { dadosDoCarimbo } from './carimbo';
import { FormatoErro, ehPdfMaterial, ehVideoMaterial, imagemDoMaterial, nomeDownload, pedirVideo, type DadosCorretor, type MaterialFonte } from './materialFormatado';

const base = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');

export function formatoValido(v: unknown): FormatoDownload {
  return (FORMATOS_DOWNLOAD as readonly string[]).includes(String(v)) ? (v as FormatoDownload) : 'original';
}

/** Página pública do material com o ?c= de quem divulga (mesma regra do navegador em lib/materialDoCorretor) */
export function linkPublico(m: { empreendimentoSlug?: string | null; codigoImovel?: string | null }, ref: string | null): string {
  let caminho = '/imoveis';
  if (m.empreendimentoSlug) caminho = m.empreendimentoSlug === 'bom-jardims' ? '/bom-jardims' : `/agendar/${encodeURIComponent(m.empreendimentoSlug)}`;
  else if (m.codigoImovel && /^IMV-\d{4}$/i.test(m.codigoImovel)) caminho = `/i/${m.codigoImovel.toUpperCase()}`;
  const url = `${base()}${caminho}?utm_source=whatsapp&utm_medium=material`;
  return ref ? `${url}&c=${encodeURIComponent(ref)}` : url;
}

export type RespostaArquivo =
  | { tipo: 'imagem'; corpo: Buffer; nome: string }
  | { tipo: 'video'; arquivo: string; nome: string }
  | { tipo: 'gerando'; segundos: number };

export async function arquivoFormatado(user: { id: number; role?: string | null; perfil?: string | null }, materialId: number, formato: FormatoDownload): Promise<RespostaArquivo> {
  const d: any = await getDb();
  if (!d) throw new FormatoErro('Banco indisponível', 503);
  const [m]: any[] = await d.select().from(materiais).where(eq(materiais.id, materialId)).limit(1);
  if (!m) throw new FormatoErro('Material não encontrado', 404);
  const p = await carregarPermissoes(user as any);
  let empreendimento: string | null = null, codigoImovel: string | null = null;
  if (m.empreendimentoSlug) {
    const [e]: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, m.empreendimentoSlug)).limit(1);
    if (!e || !temAcesso(p.perfil, p.acessos, 'empreendimento', e.id)) throw new FormatoErro('Material não encontrado', 404);
    empreendimento = e.nome ?? null;
  } else if (m.propertyId) {
    if (!temAcesso(p.perfil, p.acessos, 'imovel', m.propertyId)) throw new FormatoErro('Material não encontrado', 404);
    const [i]: any[] = await d.select({ codigo: properties.codigo }).from(properties).where(eq(properties.id, m.propertyId)).limit(1);
    codigoImovel = i?.codigo ?? null;
  }
  if (ehPdfMaterial(m)) throw new FormatoErro('PDF sai pelo botão Baixar (rodapé com os seus dados)', 415);
  // Faixa com o carimbo salvo pelo usuário em Materiais › Meu carimbo (sem ele, o cadastro)
  const c = await dadosDoCarimbo(user.id);
  const dados: DadosCorretor = { cartao: c.cartao, instagram: c.instagram, email: c.email, link: linkPublico({ empreendimentoSlug: m.empreendimentoSlug, codigoImovel }, c.ref), empreendimento };
  const fonte: MaterialFonte = { id: Number(m.id), titulo: String(m.titulo), url: String(m.url), mime: m.mime, tipo: m.tipo, recorteRodapePct: m.recorteRodapePct ?? null, corteFinalMs: m.corteFinalMs ?? null };
  if (ehVideoMaterial(fonte)) {
    const r = pedirVideo(fonte, formato, dados);
    if (r.status === 'erro') throw new FormatoErro(r.erro, 500);
    if (r.status === 'gerando') return { tipo: 'gerando', segundos: r.segundos };
    return { tipo: 'video', arquivo: r.arquivo, nome: nomeDownload(fonte.titulo, formato, 'mp4') };
  }
  if (/\.gif(\?|$)/i.test(fonte.url)) throw new FormatoErro('GIF não é convertido: baixe o original', 415);
  return { tipo: 'imagem', corpo: await imagemDoMaterial(fonte, formato, dados), nome: nomeDownload(fonte.titulo, formato, 'jpg') };
}
