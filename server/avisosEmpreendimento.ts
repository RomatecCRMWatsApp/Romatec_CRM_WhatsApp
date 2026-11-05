/**
 * Novidades do empreendimento que mudam sem tela própria (hoje: condições/planos de pagamento, ajustadas no banco):
 * a cada subida, compara a condição ativa de cada empreendimento com a última avisada (configSistema) e, se mudou,
 * avisa corretores, empreendedor e escritório. Na primeira vez só guarda (não avisa o que já estava valendo).
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { condicoesPagamento, empreendimentos } from '../drizzle/schema';

export function assinaturaCondicao(c: any): string {
  const prazos = Array.isArray(c?.prazos) ? c.prazos : (() => { try { return JSON.parse(String(c?.prazos ?? '[]')); } catch { return []; } })();
  return JSON.stringify([c?.id, String(c?.precoBase), String(c?.entradaPct), c?.entradaMaxParcelas, String(c?.descontoAvistaPct), String(c?.descontoAvistaTotal), String(c?.jurosAaEfetivo), prazos]);
}

export async function avisarMudancaDeCondicoes(): Promise<number> {
  const d: any = await getDb();
  if (!d) return 0;
  const { lerConfig, gravarConfig } = await import('./configSistema');
  const emps: any[] = await d.select({ id: empreendimentos.id, slug: empreendimentos.slug }).from(empreendimentos);
  let avisados = 0;
  for (const e of emps) {
    const [c]: any[] = await d.select().from(condicoesPagamento).where(and(eq(condicoesPagamento.empreendimentoId, e.id), eq(condicoesPagamento.ativo, true)))
      .orderBy(desc(condicoesPagamento.vigenteDesde), desc(condicoesPagamento.id)).limit(1);
    if (!c) continue;
    const chave = `condicoes_avisadas:${e.id}`;
    const atual = assinaturaCondicao(c);
    const antes = await lerConfig(chave);
    if (antes === atual) continue;
    await gravarConfig(chave, atual.slice(0, 500), null);
    if (antes == null) continue; // primeira vez: só registra
    const { notificarEmpreendimentoPorSlug } = await import('./notificacoes');
    await notificarEmpreendimentoPorSlug(e.slug, {
      titulo: 'Planos de pagamento atualizados',
      mensagem: 'As condições de pagamento (entrada, prazos ou planos) mudaram. Confira no simulador antes de passar valores ao cliente.',
      url: `/empreendimentos/${e.slug}`, chave: `condicoes:${e.id}:${c.id}:${atual.length}:${Date.now() / 3_600_000 | 0}`,
    });
    avisados++;
  }
  return avisados;
}
