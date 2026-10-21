/**
 * Renumera as quadras C e D do Bom Jardims para a numeração oficial (KMZ / planta).
 * Só troca código e número; geometria, área, situação, preço e histórico ficam no mesmo registro.
 *
 *   npx tsx scripts/renumerar-lotes-bom-jardims.ts            → só mostra o plano (não grava nada)
 *   npx tsx scripts/renumerar-lotes-bom-jardims.ts --aplicar  → grava (transação, com backup antes)
 *
 * Idempotente: se o banco já está na numeração oficial, não faz nada.
 */
import 'dotenv/config';
import fs from 'fs';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../server/db';
import { empreendimentos, lotes, leadQualifications } from '../drizzle/schema';
import { planoRenumeracao, codigoTemporario } from '../server/lotes/renumeracaoBomJardims';

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const db: any = await getDb();
  if (!db) throw new Error('Banco indisponível');
  const [emp]: any[] = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, 'bom-jardims'));
  if (!emp) throw new Error('Empreendimento bom-jardims não encontrado');
  const rows: any[] = await db.select({ id: lotes.id, codigo: lotes.codigo, quadra: lotes.quadra, numero: lotes.numero, lonCentro: lotes.lonCentro, latCentro: lotes.latCentro, situacao: lotes.situacao })
    .from(lotes).where(eq(lotes.empreendimentoId, emp.id));

  const passos = planoRenumeracao(rows);
  if (!passos.length) { console.log('Banco já está na numeração oficial — nada a fazer.'); process.exit(0); }
  console.log(`${passos.length} lotes a renumerar:`);
  for (const p of passos) console.log(`  id ${p.id}: ${p.de} → ${p.para}  (${rows.find(r => r.id === p.id)?.situacao})`);
  const leads: any[] = await db.select({ loteCodigo: leadQualifications.loteCodigo }).from(leadQualifications);
  const lc = leads.map(l => l.loteCodigo).filter((c: any) => /^[CD]\d\d$/.test(c || ''));
  console.log(`Leads com chácara C/D escolhida (já na numeração oficial da página pública, não mudam): ${lc.join(' ') || 'nenhum'}`);

  if (!aplicar) { console.log('\nSimulação. Para gravar: --aplicar'); process.exit(0); }

  const backup = `renumeracao-bom-jardims-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(backup, JSON.stringify(rows.filter(r => /^[CD]/.test(r.codigo)).map(r => ({ id: r.id, codigo: r.codigo, quadra: r.quadra, numero: r.numero }))));
  console.log(`Backup dos códigos atuais: ${backup}`);

  await db.transaction(async (tx: any) => {
    // 1ª fase: códigos temporários (o índice único empreendimento+código não deixa trocar direto)
    for (const p of passos) await tx.update(lotes).set({ codigo: codigoTemporario(p.para) } as any).where(and(eq(lotes.id, p.id), eq(lotes.empreendimentoId, emp.id)));
    // 2ª fase: código, quadra e número oficiais
    for (const p of passos) await tx.update(lotes).set({ codigo: p.para, quadra: p.quadra, numero: p.numero } as any).where(and(eq(lotes.id, p.id), eq(lotes.empreendimentoId, emp.id)));
  });
  const depois: any[] = await db.select({ id: lotes.id, codigo: lotes.codigo, lonCentro: lotes.lonCentro, latCentro: lotes.latCentro, quadra: lotes.quadra, numero: lotes.numero })
    .from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  console.log(planoRenumeracao(depois).length === 0 ? 'Feito: banco na numeração oficial.' : 'ATENÇÃO: conferência pós-renumeração falhou — restaure pelo backup.');
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e?.message || e); process.exit(1); });
