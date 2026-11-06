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

/**
 * Aviso único (uma vez por empreendimento): "agora tem play nos vídeos de Materiais". Vai para os corretores com o
 * empreendimento, o empreendedor e o escritório — só nos empreendimentos que têm vídeo liberado na galeria.
 */
export const CHAVE_AVISO_PLAYER = 'aviso:player-video-v1';
export async function avisarPlayerDeVideos(): Promise<number> {
  const d: any = await getDb();
  if (!d) return 0;
  const { materiais } = await import('../drizzle/schema');
  const linhas: any[] = await d.select({ slug: materiais.empreendimentoSlug, mime: materiais.mime, url: materiais.url })
    .from(materiais).where(eq(materiais.liberado, true));
  const slugs = new Set(linhas.filter(m => m.slug && ((m.mime || '').startsWith('video/') || /\/video\/upload\/|\.(mp4|mov|webm)$/i.test(m.url || ''))).map(m => m.slug as string));
  const { notificarEmpreendimentoPorSlug } = await import('./notificacoes');
  let n = 0;
  for (const slug of Array.from(slugs)) {
    const r = await notificarEmpreendimentoPorSlug(slug, {
      titulo: 'Novo: assista aos vídeos sem baixar',
      mensagem: 'Em Materiais, toque no botão ▶ Assistir do vídeo: ele abre aqui dentro, no player da Romatec, com volume, avanço e tela cheia. Veja antes de enviar ao cliente.',
      url: '/materiais',
      chave: `${CHAVE_AVISO_PLAYER}:${slug}`,
    });
    if (r) n++;
  }
  return n;
}

/** Aviso único (uma vez por empreendimento): carrossel das fotos em Materiais (para cima baixa, para baixo envia) */
export const CHAVE_AVISO_CARROSSEL = 'aviso:carrossel-fotos-v1';
export async function avisarCarrosselDeFotos(): Promise<number> {
  const d: any = await getDb();
  if (!d) return 0;
  const { materiais } = await import('../drizzle/schema');
  const linhas: any[] = await d.select({ slug: materiais.empreendimentoSlug, mime: materiais.mime, url: materiais.url })
    .from(materiais).where(eq(materiais.liberado, true));
  const slugs = new Set(linhas.filter(m => m.slug && ((m.mime || '').startsWith('image/') || /\/image\/upload\/|\.(png|jpe?g|webp)$/i.test(m.url || ''))).map(m => m.slug as string));
  const { notificarEmpreendimentoPorSlug } = await import('./notificacoes');
  let n = 0;
  for (const slug of Array.from(slugs)) {
    const r = await notificarEmpreendimentoPorSlug(slug, {
      titulo: 'Novo: carrossel das fotos',
      mensagem: 'Em Materiais, toque numa foto: ela abre em tela cheia. Arraste para cima para baixar na galeria e para baixo para enviar no WhatsApp, já com o seu carimbo.',
      url: '/materiais',
      chave: `${CHAVE_AVISO_CARROSSEL}:${slug}`,
    });
    if (r) n++;
  }
  return n;
}
