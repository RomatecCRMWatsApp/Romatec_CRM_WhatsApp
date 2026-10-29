/**
 * Andamento da obra do Bom Jardims — fotos do drone de 28/10/2026 (client/public/bom-jardims/obra). Cria as
 * atualizações no portal do comprador uma vez só (confere pelo título + data); se o escritório apagar, não volta.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { empreendimentos, obraAtualizacoes } from '../../../drizzle/schema';

export const OBRA_20261028 = [
  { titulo: 'Início das obras: abertura das ruas', foto: '/bom-jardims/obra/2026-10-28-abertura-das-ruas.webp',
    texto: 'As máquinas começaram a abrir as ruas internas do condomínio, no traçado do projeto aprovado. Os próximos passos são o nivelamento e o cascalhamento das vias.' },
  { titulo: 'Demarcação das chácaras', foto: '/bom-jardims/obra/2026-10-28-demarcacao-das-chacaras.webp',
    texto: 'As divisas das chácaras estão abertas no terreno: na vista aérea já dá para ver as quadras e o desenho das ruas do condomínio.' },
  { titulo: 'Chácaras demarcadas vistas de cima', foto: '/bom-jardims/obra/2026-10-28-chacaras-de-cima.webp',
    texto: 'Vista de cima de um trecho do condomínio, com as picadas das divisas entre as chácaras.' },
  { titulo: 'Acessos da área de vivência', foto: '/bom-jardims/obra/2026-10-28-acessos-area-de-vivencia.webp',
    texto: 'Os acessos da área de vivência e recreação estão abertos junto à mata nativa, que será mantida preservada como reserva do condomínio.' },
] as const;
const DATA = '2026-10-28';

export async function obraBomJardims20261028(): Promise<number> {
  const d: any = await getDb();
  if (!d) return 0;
  const [emp]: any[] = await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, 'bom-jardims')).limit(1);
  if (!emp) return 0;
  let n = 0;
  for (const o of OBRA_20261028) {
    const ja: any[] = await d.select({ id: obraAtualizacoes.id }).from(obraAtualizacoes)
      .where(and(eq(obraAtualizacoes.empreendimentoId, emp.id), eq(obraAtualizacoes.titulo, o.titulo), eq(obraAtualizacoes.data, DATA))).limit(1);
    if (ja.length) continue;
    await d.insert(obraAtualizacoes).values({ empreendimentoId: emp.id, titulo: o.titulo, texto: o.texto, percentual: null, fotoArquivo: o.foto, data: DATA, criadoEm: new Date() } as any);
    n++;
  }
  if (n) console.log(`[Migration] ✅ obraBomJardims20261028: ${n} atualização(ões) da obra publicadas`);
  return n;
}
