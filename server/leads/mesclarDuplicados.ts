/**
 * Junta leads duplicados da mesma pessoa (mesmo celular gravado com e sem o 9, ou com "+"): fica o lead mais antigo,
 * que recebe os dados que faltavam nele, o histórico (eventos, mensagens, visitas, interesses, encaminhamentos…)
 * e as ligações (lotes, contratos, simulações); o duplicado é apagado e o registro da junção fica nos eventos do lead.
 * Roda ao subir o servidor (idempotente: sem duplicados, não faz nada).
 */
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { leadEventos, leadQualifications } from '../../drizzle/schema';
import { chaveTelefoneBR } from '../../shared/telefone';

/** Tabelas com leadId que seguem o lead que fica */
const TABELAS_LEAD = ['lotes', 'simulacoes', 'loteHistorico', 'leadEventos', 'leadMensagens', 'leadVisitas', 'reunioes', 'leadScoreHistorico',
  'contratos', 'pessoas', 'loteFilaEspera', 'igConversas', 'leadEncaminhamentos'];
/** Tabelas com leadId em chave única: se o lead que fica já tem a linha, a do duplicado é descartada */
const TABELAS_LEAD_UNICAS = ['linksOferta', 'autoRespostaRegua', 'leadInteresses', 'visitaOfertas'];
/** Campos que o lead que fica herda do duplicado quando estão vazios nele */
const HERDAR = ['nome', 'email', 'contactId', 'campaignId', 'corretorId', 'campanhaOrigem', 'origem', 'cidade'];

const vazio = (v: unknown) => v === null || v === undefined || v === '' || v === 'Cliente';

export function gruposDuplicados<T extends { id: number; phone: string; createdAt?: unknown }>(leads: T[]): T[][] {
  const grupos = new Map<string, T[]>();
  for (const l of leads) {
    const k = chaveTelefoneBR(l.phone);
    if (!k) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  return Array.from(grupos.values()).filter(g => g.length > 1)
    .map(g => g.slice().sort((a, b) => new Date(a.createdAt as any || 0).getTime() - new Date(b.createdAt as any || 0).getTime() || a.id - b.id));
}

export async function mesclarLeadsDuplicados(): Promise<{ grupos: number; apagados: number }> {
  const d: any = await getDb();
  if (!d) return { grupos: 0, apagados: 0 };
  // SQL cru nos dois bancos: MySQL (execute) e SQLite dos testes (run)
  const exec = (q: ReturnType<typeof sql>): Promise<unknown> => Promise.resolve().then(() => (typeof d.execute === 'function' ? d.execute(q) : d.run(q)));
  const todos: any[] = await d.select().from(leadQualifications);
  const grupos = gruposDuplicados(todos.map(l => ({ ...l, id: Number(l.id), phone: String(l.phone ?? '') })));
  let apagados = 0;
  for (const [fica, ...dups] of grupos) {
    for (const dup of dups) {
      try {
        const herdar: Record<string, unknown> = {};
        for (const c of HERDAR) if (c in fica && vazio((fica as any)[c]) && !vazio((dup as any)[c])) herdar[c] = (dup as any)[c];
        if (Object.keys(herdar).length) {
          await d.update(leadQualifications).set(herdar).where(eq(leadQualifications.id, fica.id));
          Object.assign(fica, herdar);
        }
        for (const t of TABELAS_LEAD) {
          await exec(sql`UPDATE ${sql.identifier(t)} SET leadId = ${fica.id} WHERE leadId = ${dup.id}`).catch(() => undefined);
        }
        for (const t of TABELAS_LEAD_UNICAS) {
          // Move o que não conflita; o resto (o lead que fica já tem) é descartado
          await exec(sql`UPDATE ${sql.identifier(t)} SET leadId = ${fica.id} WHERE leadId = ${dup.id}`)
            .catch(() => exec(sql`DELETE FROM ${sql.identifier(t)} WHERE leadId = ${dup.id}`).catch(() => undefined));
        }
        await d.insert(leadEventos).values({
          leadId: fica.id, tipo: 'lead_mesclado',
          dados: { leadApagado: dup.id, telefoneApagado: dup.phone, telefoneMantido: fica.phone, nome: dup.nome ?? null, origem: dup.origem ?? null, criadoEm: dup.createdAt ?? null },
        } as any).catch(() => undefined);
        await d.delete(leadQualifications).where(eq(leadQualifications.id, dup.id));
        apagados++;
        console.log(`[Leads] 🔗 Lead ${dup.id} (${dup.phone}) juntado ao ${fica.id} (${fica.phone}) — mesma pessoa`);
      } catch (e: any) {
        console.warn(`[Leads] Não juntou o lead ${dup.id} ao ${fica.id}:`, e?.message);
      }
    }
  }
  return { grupos: grupos.length, apagados };
}
