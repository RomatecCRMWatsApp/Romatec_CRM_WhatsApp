/**
 * Pode receber lead? Login ativo e licença liberada (corretor sem pagamento, bloqueado ou vencido não recebe lead
 * nenhum: nem pela roleta, nem encaminhado à mão, nem os avisos e links no WhatsApp). Administrador, secretária e
 * licenciamento desligado: sempre liberado (server/saas/servico.ts → resumoLicenca).
 */
export async function podeReceberLeads(u: any, agora = Date.now()): Promise<boolean> {
  if (!u || u.ativo === false || u.ativo === 0) return false;
  try {
    const { resumoLicenca } = await import('../saas/servico');
    return (await resumoLicenca(u, agora)).liberado;
  } catch (e: any) {
    console.warn('[Leads] licença não conferida:', e?.message);
    return true;
  }
}

/** Mesma regra, buscando o usuário pelo id */
export async function idPodeReceberLeads(id: number | null | undefined, agora = Date.now()): Promise<boolean> {
  if (!id) return false;
  const { getDb } = await import('../db');
  const { users } = await import('../../drizzle/schema');
  const { eq } = await import('drizzle-orm');
  const d: any = await getDb();
  if (!d) return true;
  const [u]: any[] = await d.select().from(users).where(eq(users.id, id)).limit(1);
  return podeReceberLeads(u, agora);
}
