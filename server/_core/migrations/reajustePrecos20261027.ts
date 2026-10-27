import { eq, sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';
import { saasConfig } from '../../../drizzle/schema';

/**
 * Reajuste dos planos do corretor pedido em 27/10/2026 (Essencial R$ 149,90 / R$ 1.499,00 no anual; Pro R$ 299,90 /
 * R$ 2.999,00). Roda UMA vez (marca em saasConfig) — depois disso o preço é o que o administrador editar na tela.
 * Pix e boleto saem com o valor novo na próxima fatura; o cartão recorrente é reajustado em seguida
 * (reajustarRecorrencias: preço negociado e cupom em vigor continuam valendo).
 */
const CHAVE = 'reajuste_precos_2026_10_27';
const PRECOS = [
  { codigo: 'CORRETOR_ESSENCIAL', mensal: '149.90', anual: '1499.00' },
  { codigo: 'CORRETOR_PRO', mensal: '299.90', anual: '2999.00' },
] as const;

export async function reajustePrecos20261027(): Promise<void> {
  const db: any = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    const [ja] = await db.select().from(saasConfig).where(eq(saasConfig.chave, CHAVE)).limit(1);
    if (ja) return;
    for (const p of PRECOS) {
      await db.execute(sql`UPDATE saasPlanos SET precoMensal = ${p.mensal}, precoAnual = ${p.anual} WHERE codigo = ${p.codigo}`);
    }
    await db.execute(sql`INSERT IGNORE INTO saasConfig (chave, valor) VALUES (${CHAVE}, ${JSON.stringify({ aplicadoEm: new Date().toISOString(), precos: PRECOS })})`);
    console.log('[Migration] ✅ reajuste de preços dos planos do corretor (Essencial 149,90 / Pro 299,90)');
  } catch (e: any) {
    console.warn('[Migration] reajuste de preços:', e?.message);
    return;
  }
  // Cartão recorrente: depois que o servidor sobe (Mercado Pago e caches prontos)
  setTimeout(async () => {
    try {
      const S = await import('../../saas/servico');
      const C = await import('../../saas/cobranca');
      S.limparCaches();
      for (const p of PRECOS) {
        const plano = (await S.listarPlanos()).find(x => x.codigo === p.codigo);
        if (!plano) continue;
        const r = await C.reajustarRecorrencias(plano.id, 0);
        console.log(`[Reajuste] ${p.codigo}: ${r.atualizadas} assinatura(s) no cartão atualizada(s)${r.falhas.length ? `; falhas: ${r.falhas.join(' · ')}` : ''}`);
      }
    } catch (e: any) { console.warn('[Reajuste] cartão recorrente:', e?.message); }
  }, 60_000).unref?.();
}
