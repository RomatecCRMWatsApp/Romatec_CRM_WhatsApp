import { getDb, getDbDriver } from '../../db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { materiais } from '../../../drizzle/schema';

/**
 * Vídeos de divulgação do Bom Jardims (Reels, versões para WhatsApp e vinhetas) em Materiais do empreendimento.
 * Os arquivos ficam no próprio site (client/public/bom-jardims). Idempotente: só insere a URL que ainda não existe.
 * Não aparecem na galeria da página pública (shared/mapa3dBomJardims.ts → videosDaGaleria).
 */
const base = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');

export const VIDEOS_DIVULGACAO_BJ: { titulo: string; caminho: string; bytes: number; liberado: boolean; observacao: string; ordem: number }[] = [
  { titulo: 'Reel · Obras avançando e lançamento 14/11 (05/11)', caminho: '/bom-jardims/ig/reel-obras-lancamento-05nov.mp4', bytes: 14435859, liberado: true, observacao: 'Imagens reais 05/11 · ruas, deck e mais de 18 unidades vendidas', ordem: 7 },
  { titulo: 'Reel · Área plana, alta e ventilada (topografia e natureza)', caminho: '/bom-jardims/ig/reel-topografia-natureza-05nov.mp4', bytes: 11956011, liberado: true, observacao: 'Imagens reais 05/11 · drone, córrego e deck', ordem: 8 },
  { titulo: 'Reel · Faltam 7 dias (lançamento 14/11)', caminho: '/bom-jardims/ig/reel-r1-faltam-7-dias.mp4', bytes: 11326764, liberado: true, observacao: 'Campanha de lançamento · Instagram 07/11', ordem: 10 },
  { titulo: 'Reel · Obras parte 2 · o tamanho real da chácara', caminho: '/bom-jardims/ig/reel-obras-parte2.mp4', bytes: 14344696, liberado: true, observacao: '55 × 55 m = 3.025 m² · ruas de 12 m', ordem: 11 },
  { titulo: 'Reel · Deck parte 2 · onde vai ficar o deck', caminho: '/bom-jardims/ig/reel-deck-parte2.mp4', bytes: 12935873, liberado: true, observacao: 'Córrego real + simulação ilustrativa do deck', ordem: 12 },
  { titulo: 'Reel · 300 m² ou 3.025 m²? (comparativo curto)', caminho: '/bom-jardims/ig/reel-comparativo-v2.mp4', bytes: 8226556, liberado: true, observacao: 'Mostra preços · use a legenda com a ressalva', ordem: 13 },
  { titulo: 'Vídeo · Comparativo lote urbano × chácara (completo, narrado)', caminho: '/bom-jardims/ig/reel-comparativo-lote-x-chacara.mp4', bytes: 29471718, liberado: true, observacao: 'Mostra preços · 70 s', ordem: 14 },
  { titulo: 'Vídeo leve para WhatsApp · Comparativo', caminho: '/bom-jardims/ig/video-comparativo-whatsapp.mp4', bytes: 8351807, liberado: true, observacao: 'Versão leve para status e grupos', ordem: 15 },
  { titulo: 'Reel · Entrada de R$ 10 mil com os 3 planos', caminho: '/bom-jardims/ig/reel-entrada-10mil-v2.mp4', bytes: 10029428, liberado: true, observacao: 'Planos A, B e C completos', ordem: 16 },
  { titulo: 'Reel · Isso aqui vai virar 82 chácaras (obras)', caminho: '/bom-jardims/ig/reel-obras-82-chacaras.mp4', bytes: 7737092, liberado: true, observacao: 'Máquinas abrindo as ruas', ordem: 17 },
  { titulo: 'Reel · Do centro à chácara em 24 minutos (rota)', caminho: '/bom-jardims/ig/reel-rota-24min.mp4', bytes: 16244257, liberado: true, observacao: '17 km do centro', ordem: 18 },
  { titulo: 'Vídeo · Banho de córrego e deck', caminho: '/bom-jardims/ig/reel-deck-corrego.mp4', bytes: 21926023, liberado: true, observacao: 'Córrego real · deck em simulação ilustrativa', ordem: 19 },
  { titulo: 'Vídeo · Deck para compartilhar (simulação)', caminho: '/bom-jardims/ig/video-deck-compartilhar.mp4', bytes: 5185906, liberado: true, observacao: 'Imagem ilustrativa do deck', ordem: 20 },
  { titulo: 'Reel · Areia, deck e vendas (lançamento 14/11)', caminho: '/bom-jardims/ig/reel-areia-vendas-14nov.mp4', bytes: 12895640, liberado: false, observacao: 'Versão antiga: fala em chácaras vendidas · use a versão nova', ordem: 21 },
  { titulo: 'Vídeo · Rota narrada até o condomínio', caminho: '/bom-jardims/rota-video-narrado-v2.mp4', bytes: 16027414, liberado: true, observacao: 'Como chegar', ordem: 22 },
  { titulo: 'Reel · Deck parte 3 · o deck saiu do papel', caminho: '/bom-jardims/ig/reel-deck-parte3.mp4', bytes: 11807175, liberado: true, observacao: 'Imagens reais da obra · 03/11/2026', ordem: 23 },
  { titulo: 'Reel · Obras parte 3 · as ruas já estão abertas', caminho: '/bom-jardims/ig/reel-obras-parte3.mp4', bytes: 14669601, liberado: true, observacao: 'Imagens reais da obra · 03/11/2026', ordem: 24 },
  { titulo: 'Reel · Córrego, deck e areia (lançamento 14/11)', caminho: '/bom-jardims/ig/reel-areia-14nov-v2.mp4', bytes: 20335381, liberado: true, observacao: 'Versão sem "chácaras vendidas"', ordem: 25 },
  { titulo: 'Reel narrado · Obras avançando e cadastro (03/11)', caminho: '/bom-jardims/ig/reel-obras-cadastro-03nov.mp4', bytes: 6343952, liberado: true, observacao: 'Deck, ruas e mais de 15 unidades vendidas (informação do proprietário em 03/11)', ordem: 9 },
  { titulo: 'Vinheta · Abertura (logo animada)', caminho: '/bom-jardims/vinhetas/abertura-9x16.mp4', bytes: 3043313, liberado: false, observacao: 'Para edição: início dos vídeos', ordem: 30 },
  { titulo: 'Vinheta · Fechamento (logo animada)', caminho: '/bom-jardims/vinhetas/fechamento-9x16.mp4', bytes: 2939021, liberado: false, observacao: 'Para edição: final dos vídeos', ordem: 31 },
  { titulo: 'Vinheta · Explosão (só promoção ou lançamento)', caminho: '/bom-jardims/vinhetas/promocao-explosao-9x16.mp4', bytes: 5637373, liberado: false, observacao: 'Nunca em vídeo sobre a mata ou o córrego', ordem: 32 },
];

/**
 * Onde está o contato do escritório (José Romário · CRECI · telefone · @avalieimob) em cada vídeo: rodapé gravado
 * (% de baixo) e cartão final/CTA de comentar (ms do fim). Medido nos próprios arquivos em 04/11/2026.
 * Ao baixar, o corretor recebe sem isso e com o contato dele (server/materialFormatado.ts).
 */
export const CONTATO_ESCRITORIO_BJ: Record<string, { recorteRodapePct: number; corteFinalMs: number }> = {
  '/bom-jardims/ig/reel-obras-lancamento-05nov.mp4': { recorteRodapePct: 18, corteFinalMs: 4400 },
  '/bom-jardims/ig/reel-topografia-natureza-05nov.mp4': { recorteRodapePct: 18, corteFinalMs: 4000 },
  '/bom-jardims/ig/reel-r1-faltam-7-dias.mp4': { recorteRodapePct: 10, corteFinalMs: 6600 },
  '/bom-jardims/ig/reel-obras-parte2.mp4': { recorteRodapePct: 10, corteFinalMs: 6600 },
  '/bom-jardims/ig/reel-deck-parte2.mp4': { recorteRodapePct: 0, corteFinalMs: 0 },
  '/bom-jardims/ig/reel-comparativo-v2.mp4': { recorteRodapePct: 0, corteFinalMs: 0 },
  '/bom-jardims/ig/reel-comparativo-lote-x-chacara.mp4': { recorteRodapePct: 0, corteFinalMs: 9800 },
  '/bom-jardims/ig/video-comparativo-whatsapp.mp4': { recorteRodapePct: 0, corteFinalMs: 9800 },
  '/bom-jardims/ig/reel-entrada-10mil-v2.mp4': { recorteRodapePct: 10, corteFinalMs: 3600 },
  '/bom-jardims/ig/reel-obras-82-chacaras.mp4': { recorteRodapePct: 10, corteFinalMs: 3600 },
  '/bom-jardims/ig/reel-rota-24min.mp4': { recorteRodapePct: 0, corteFinalMs: 5000 },
  '/bom-jardims/ig/reel-deck-corrego.mp4': { recorteRodapePct: 0, corteFinalMs: 10700 },
  '/bom-jardims/ig/video-deck-compartilhar.mp4': { recorteRodapePct: 0, corteFinalMs: 6900 },
  '/bom-jardims/ig/reel-areia-vendas-14nov.mp4': { recorteRodapePct: 0, corteFinalMs: 9100 },
  '/bom-jardims/rota-video-narrado-v2.mp4': { recorteRodapePct: 0, corteFinalMs: 5500 },
  '/bom-jardims/ig/reel-deck-parte3.mp4': { recorteRodapePct: 10, corteFinalMs: 0 },
  '/bom-jardims/ig/reel-obras-parte3.mp4': { recorteRodapePct: 10, corteFinalMs: 0 },
  '/bom-jardims/ig/reel-areia-14nov-v2.mp4': { recorteRodapePct: 0, corteFinalMs: 0 },
  '/bom-jardims/ig/reel-obras-cadastro-03nov.mp4': { recorteRodapePct: 0, corteFinalMs: 3800 },
};

/** Colunas novas da tabela materiais (idempotente: coluna repetida é ignorada) */
async function colunasContato(db: any) {
  for (const [c, tipo] of [['recorteRodapePct', 'INT NULL'], ['corteFinalMs', 'INT NULL']]) {
    try {
      if (getDbDriver() === 'mysql') await db.execute(sql.raw(`ALTER TABLE materiais ADD COLUMN ${c} ${tipo}`));
      else db.run(sql.raw(`ALTER TABLE materiais ADD COLUMN ${c} INTEGER`));
    } catch (e: any) {
      const msg = String(e?.message ?? e?.cause?.message ?? '');
      if (!/duplicate|already exists|ER_DUP_FIELDNAME/i.test(msg + (e?.code ?? e?.cause?.code ?? ''))) console.warn(`[Migration] materiais.${c}:`, msg);
    }
  }
}

export async function addMateriaisDivulgacaoBJ(): Promise<number> {
  const db: any = await getDb();
  if (!db) return 0;
  await colunasContato(db);
  const existentes = new Set(((await db.select({ url: materiais.url }).from(materiais)) as any[]).map(r => String(r.url)));
  let n = 0;
  for (const v of VIDEOS_DIVULGACAO_BJ) {
    const url = `${base()}${v.caminho}`;
    if (existentes.has(url)) continue;
    await db.insert(materiais).values({
      empreendimentoSlug: 'bom-jardims', titulo: v.titulo, tipo: 'video', url, mime: 'video/mp4', tamanhoBytes: v.bytes,
      liberado: v.liberado, observacao: v.observacao, ordem: v.ordem, createdAt: new Date(),
    } as any);
    n++;
    // Material novo liberado → aviso aos corretores e ao empreendedor (não na 1ª carga de um banco vazio)
    if (v.liberado && existentes.size) {
      import('../../notificacoes').then(N => N.notificarEmpreendimentoPorSlug('bom-jardims', {
        titulo: 'Material novo para divulgar', mensagem: `Novo material em Materiais: ${v.titulo}. Baixe no seu formato, já com o seu carimbo.`, url: '/materiais', chave: `material:${v.caminho}`,
      })).catch(() => {});
    }
  }
  // O Reel antigo da areia fala em "chácaras vendidas": se entrou como liberado na 1.96.1, passa a "não divulgar"
  await db.update(materiais).set({ liberado: false, observacao: 'Versão antiga: fala em chácaras vendidas · use a versão nova' } as any)
    .where(and(eq(materiais.url, `${base()}/bom-jardims/ig/reel-areia-vendas-14nov.mp4`), eq(materiais.liberado, true)));
  // Contato do escritório gravado nos vídeos: só preenche o que ainda não foi ajustado na tela
  for (const [caminho, c] of Object.entries(CONTATO_ESCRITORIO_BJ)) {
    await db.update(materiais).set(c as any).where(and(eq(materiais.url, `${base()}${caminho}`), isNull(materiais.recorteRodapePct)));
  }
  if (n) console.log(`[Migration] ✅ addMateriaisDivulgacaoBJ: ${n} vídeo(s) em Materiais do Bom Jardims`);
  return n;
}
