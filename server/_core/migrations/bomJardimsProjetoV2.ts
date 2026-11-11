/**
 * Projeto V2 do Condomínio de Chácaras Bom Jardims (DXF "ATUALIZADO_V2", nov/2026) — aplicado uma vez.
 *
 * - Geometria oficial de todos os lotes (área, perímetro, vértices UTM, polígono e centro) — server/data/bom-jardims/projeto-v2.json,
 *   gerado por scripts/bom-jardims-projeto-v2.ts.
 * - A02 desmembrado: A02 (1.100,04 m²) passa a ser a área técnica do poço e reservatório; A02A (1.925,07 m²) entra à venda.
 * - A03 (antiga área técnica) e B14 (antigo stand/administração) vão para venda: a administração e o stand de vendas
 *   ficam na área de 4.125 m² na entrada, junto ao portal (Rua Walter e Maria × Rua Cedro), fora do condomínio.
 * - Ruas (rótulos do desenho, usados nas confrontações do memorial). Perímetro e área total ficam como estão.
 *
 * Proteção: se o A02 já tiver cliente, reserva ou contrato, nada é alterado (o desmembramento precisa de decisão
 * manual) e o aviso fica no log. Mudanças de situação só valem para lotes ainda livres.
 */
import { and, eq, ne } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';
import { artigosConhecimento, contratos, empreendimentos, lotes } from '../../../drizzle/schema';
import dados from '../../data/bom-jardims/projeto-v2.json';

export const CHAVE_PROJETO_V2 = 'bom_jardims_projeto_v2';
const SLUG = 'bom-jardims';
const LIVRES = new Set(['disponivel', 'bloqueado', '', null, undefined]);

export interface ResultadoV2 { aplicado: boolean; motivo?: string; atualizados: number; criados: number; liberados: string[] }

export async function aplicarProjetoV2BomJardims(): Promise<ResultadoV2> {
  const db: any = await getDb();
  const nada = (motivo: string): ResultadoV2 => ({ aplicado: false, motivo, atualizados: 0, criados: 0, liberados: [] });
  if (!db) return nada('sem banco');
  const { lerConfig, gravarConfig } = await import('../../configSistema');
  if (await lerConfig(CHAVE_PROJETO_V2).catch(() => null)) return nada('já aplicado');
  const [emp]: any[] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, SLUG)).limit(1);
  if (!emp) return nada('empreendimento não cadastrado');
  const rows: any[] = await db.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const porCodigo = new Map(rows.map(r => [String(r.codigo), r]));

  // O A02 vai mudar de área (3.025,11 → 1.100,04 m²): só se ninguém estiver com ele
  const a02 = porCodigo.get('A02');
  if (a02) {
    const comContrato: any[] = await db.select({ id: contratos.id }).from(contratos)
      .where(and(eq(contratos.empreendimentoId, emp.id), eq(contratos.loteCodigo, 'A02'), ne(contratos.status, 'cancelado'))).limit(1);
    if (!LIVRES.has(a02.situacao) || a02.contratoReservaId || a02.clienteNome || comContrato.length) {
      const motivo = 'A02 tem cliente/contrato — desmembramento A02/A02A não aplicado; resolva o A02 e aplique manualmente';
      console.error(`[Bom Jardims V2] ${motivo}`);
      return nada(motivo);
    }
  }

  let atualizados = 0, criados = 0;
  for (const l of (dados as any).lotes) {
    const geo = {
      areaM2: String(l.areaM2), perimetroM: String(l.perimetroM), verticesUtm: l.verticesUtm, poligono: l.poligono,
      lonCentro: String(l.centro[0]), latCentro: String(l.centro[1]),
    };
    const atual = porCodigo.get(l.codigo);
    if (atual) {
      await db.update(lotes).set(geo as any).where(eq(lotes.id, atual.id));
      atualizados++;
    } else {
      await db.insert(lotes).values({
        empreendimentoId: emp.id, codigo: l.codigo, quadra: l.quadra, numero: l.numero, destinacao: 'chacara',
        comercializavel: true, status: 'disponivel', situacao: 'disponivel',
        observacao: l.codigo === 'A02A' ? 'Desmembrado do A02 (projeto V2)' : 'Novo no projeto V2', ...geo,
      } as any);
      criados++;
    }
  }

  // A02: poço e reservatório
  await db.update(lotes).set({ destinacao: 'area_tecnica', comercializavel: false, status: 'nao_comercializavel', situacao: 'bloqueado', observacao: 'Poço e reservatório de água (projeto V2)' } as any)
    .where(and(eq(lotes.empreendimentoId, emp.id), eq(lotes.codigo, 'A02')));
  // A03 e B14: à venda (só se ainda estavam fora de venda e livres)
  const liberados: string[] = [];
  for (const codigo of ['A03', 'B14']) {
    const r = porCodigo.get(codigo);
    if (!r || r.comercializavel === true || r.comercializavel === 1 || !LIVRES.has(r.situacao)) continue;
    await db.update(lotes).set({ destinacao: 'chacara', comercializavel: true, status: 'disponivel', situacao: 'disponivel', observacao: 'Liberado para venda no projeto V2' } as any)
      .where(eq(lotes.id, r.id));
    liberados.push(codigo);
  }

  const todos: any[] = await db.select({ comercializavel: lotes.comercializavel }).from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  // Perímetro e área total não mudam no V2 (o contorno do desenho é só o bloco de lotes): só as ruas
  await db.update(empreendimentos).set({
    ruas: (dados as any).ruas,
    totalLotes: todos.length,
    lotesComercializaveis: todos.filter(r => r.comercializavel === true || r.comercializavel === 1).length,
  } as any).where(eq(empreendimentos.id, emp.id));

  // Ficha do empreendimento na base de conhecimento (já gravada no banco): stand e quantidade de chácaras
  try {
    const [art]: any[] = await db.select().from(artigosConhecimento).where(eq(artigosConhecimento.slug, 'ficha-do-bom-jardims')).limit(1);
    if (art?.conteudo) {
      const novo = String(art.conteudo)
        .replace('- **Stand de vendas e administração:** chácara B14.', '- **Stand de vendas e administração:** na entrada do condomínio, junto ao portal (Rua Walter e Maria, esquina com a Rua Cedro) (área própria de 4.125 m², fora do condomínio).')
        .replace('- **82 chácaras**', '- **84 chácaras**');
      if (novo !== art.conteudo) await db.update(artigosConhecimento).set({ conteudo: novo, atualizadoEm: new Date() } as any).where(eq(artigosConhecimento.id, art.id));
    }
  } catch (e: any) { console.warn('[Bom Jardims V2] ficha da base de conhecimento:', e?.message); }

  await gravarConfig(CHAVE_PROJETO_V2, JSON.stringify({ aplicadoEm: new Date().toISOString(), atualizados, criados, liberados, driver: getDbDriver() }), null);
  console.log(`[Bom Jardims V2] projeto aplicado: ${atualizados} lotes atualizados, ${criados} novo(s), liberados para venda: ${liberados.join(', ') || '—'}`);
  return { aplicado: true, atualizados, criados, liberados };
}

/**
 * Configuração jurídica (campos emp_* do contrato): quantidade de lotes do projeto V2. Só troca os valores antigos
 * (84 lotes / 82 comercializáveis) — se o administrador já tiver posto outro número, fica o dele.
 */
export async function ajustarJuridicoV2BomJardims(): Promise<boolean> {
  const db: any = await getDb();
  if (!db) return false;
  const { empJuridico } = await import('../../../drizzle/schema');
  const [emp]: any[] = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, SLUG)).limit(1);
  if (!emp) return false;
  const [j]: any[] = await db.select().from(empJuridico).where(eq(empJuridico.empreendimentoId, emp.id)).limit(1);
  if (!j) return false;
  const d = typeof j.defaultsJson === 'string' ? JSON.parse(j.defaultsJson) : { ...(j.defaultsJson ?? {}) };
  if (String(d.emp_qtd_lotes) !== '84' || String(d.emp_qtd_comercializaveis) !== '82') return false;
  await db.update(empJuridico).set({ defaultsJson: { ...d, emp_qtd_lotes: '85', emp_qtd_comercializaveis: '84' } } as any).where(eq(empJuridico.empreendimentoId, emp.id));
  console.log('[Bom Jardims V2] configuração jurídica: 85 lotes, 84 comercializáveis');
  return true;
}

export const CHAVE_SYNC_V2 = 'bom_jardims_projeto_v2_sync_ruas';

/**
 * Sincroniza o mapa com o projeto V2 atual (uma vez): nomes e posições das ruas e a geometria de todos os lotes —
 * mesmo que a aplicação completa do V2 tenha parado na proteção do A02. Não mexe em situação, cliente nem contrato;
 * o A02/A02A só recebe a geometria nova se o desmembramento já tiver sido aplicado (A02A existe).
 * É o que o memorial e a "frente para a rua" do contrato usam.
 */
export async function sincronizarMapaV2BomJardims(): Promise<{ aplicado: boolean; lotes: number; motivo?: string }> {
  const db: any = await getDb();
  if (!db) return { aplicado: false, lotes: 0, motivo: 'sem banco' };
  const { lerConfig, gravarConfig } = await import('../../configSistema');
  if (await lerConfig(CHAVE_SYNC_V2).catch(() => null)) return { aplicado: false, lotes: 0, motivo: 'já aplicado' };
  const [emp]: any[] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, SLUG)).limit(1);
  if (!emp) return { aplicado: false, lotes: 0, motivo: 'empreendimento não cadastrado' };
  const rows: any[] = await db.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const porCodigo = new Map(rows.map(r => [String(r.codigo), r]));
  const desmembrado = porCodigo.has('A02A');
  let n = 0;
  for (const l of (dados as any).lotes) {
    if (!desmembrado && (l.codigo === 'A02' || l.codigo === 'A02A')) continue;
    const atual = porCodigo.get(l.codigo);
    if (!atual) continue;
    await db.update(lotes).set({
      areaM2: String(l.areaM2), perimetroM: String(l.perimetroM), verticesUtm: l.verticesUtm, poligono: l.poligono,
      lonCentro: String(l.centro[0]), latCentro: String(l.centro[1]),
    } as any).where(eq(lotes.id, atual.id));
    n++;
  }
  await db.update(empreendimentos).set({ ruas: (dados as any).ruas } as any).where(eq(empreendimentos.id, emp.id));
  await gravarConfig(CHAVE_SYNC_V2, JSON.stringify({ em: new Date().toISOString(), lotes: n, ruas: (dados as any).ruas.length, desmembrado }), null);
  console.log(`[Bom Jardims V2] mapa sincronizado: ${n} lotes e ${(dados as any).ruas.length} rótulos de ruas`);
  return { aplicado: true, lotes: n };
}
