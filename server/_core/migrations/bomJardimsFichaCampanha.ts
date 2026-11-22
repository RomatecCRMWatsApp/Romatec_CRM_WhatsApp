/**
 * Ficha do Bom Jardims na base de conhecimento (que a IA e os corretores usam para responder clientes):
 * alinha o artigo já gravado no banco ao texto de shared/baseConhecimento.ts — lançamento em 05/12/2026,
 * ruas em piçarra sem calçada entregue, concessão de 10 m lineares só para estruturas removíveis e
 * documentação em andamento. Troca só os trechos antigos: se o administrador já editou o artigo, o texto dele fica.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { artigosConhecimento } from '../../../drizzle/schema';
import { ARTIGOS_INICIAIS } from '../../../shared/baseConhecimento';

export const TROCAS_FICHA: Array<[string, string]> = [
  ['- **Lançamento oficial:** 14 de novembro de 2026.', '- **Lançamento oficial:** 5 de dezembro de 2026.'],
  ['- 8 ruas internas de 12 m (9 m de rolamento + 1,50 m de calçada de cada lado).', '- 8 ruas internas de 12 m, em piçarra, com sarjeta e meio-fio (sem calçada entregue).'],
  ['trilha, pontos de banho e deck (em construção).', 'trilha e pontos de banho. Cada chácara terá a concessão de uso de 10 metros lineares à margem do córrego, só para estruturas removíveis (tenda, churrasqueira). Não é área individual de 100 m², não inclui deck ou bangalô individual (o deck junto ao rio é da área comum) e não é autorização ambiental para construir.'],
  ['Área georreferenciada e certificada no SIGEF/INCRA, Licença de Operação da SEMMA e memorial descritivo de cada chácara.', 'Georreferenciamento, certificação e licenças **em andamento**. Não diga que estão emitidos: informe a situação atualizada de cada documento.'],
];

export function aplicarTrocas(texto: string): string {
  return TROCAS_FICHA.reduce((t, [de, para]) => t.split(de).join(para), texto);
}

export async function atualizarFichaCampanhaBomJardims(): Promise<boolean> {
  const db: any = await getDb();
  if (!db) return false;
  const [art]: any[] = await db.select().from(artigosConhecimento).where(eq(artigosConhecimento.slug, 'ficha-do-bom-jardims')).limit(1);
  if (!art?.conteudo) return false;
  const novo = aplicarTrocas(String(art.conteudo));
  if (novo === art.conteudo) return false;
  await db.update(artigosConhecimento).set({ conteudo: novo, atualizadoEm: new Date() } as any).where(eq(artigosConhecimento.id, art.id));
  console.log('[Bom Jardims] ficha da base de conhecimento atualizada (lançamento 05/12, ruas, margem, documentação)');
  return true;
}

/** O seed novo já nasce com o texto corrigido (teste garante) */
export const FICHA_SEMENTE = ARTIGOS_INICIAIS.find(a => a.slug === 'ficha-do-bom-jardims')?.conteudo ?? '';
