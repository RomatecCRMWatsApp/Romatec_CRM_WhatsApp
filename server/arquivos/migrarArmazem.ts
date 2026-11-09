/**
 * Migração gradual dos arquivos do banco para o armazém (server/arquivos/armazem.ts) e faxina de órfãos.
 *
 * - Um arquivo por vez, com pausa entre eles (não disputa o pool nem a banda com o uso normal).
 * - Cada arquivo é enviado, BAIXADO DE VOLTA e comparado (sha256) antes de o base64 sair do banco;
 *   a troca no banco só acontece se o conteúdo ainda for o mesmo que foi enviado (ninguém trocou no meio).
 * - Falhou? O arquivo continua no banco e a migração tenta de novo na próxima rodada.
 * - Tabela toda migrada: OPTIMIZE TABLE uma vez, para o MySQL devolver o espaço ao volume.
 * - Faxina diária: apaga no armazém o que não está mais referenciado no banco (documento excluído, substituído…)
 *   — só arquivos com mais de 2 h, para não pegar um envio em andamento.
 */
import { and, eq, isNull, like, sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../db';
import { properties, recrutamentoDocs, usuarioDocumentoPaginas, usuarioDocumentos } from '../../drizzle/schema';
import { apagarArquivos, armazemPronto, guardarConferido, listarArquivos, situacaoTeste } from './armazem';
import { dataUri, rotaPlanta } from './planta';

interface Alvo { nome: string; tabela: any; conteudo: any; ref: any; sub: string; sql: string }
const ALVOS: Alvo[] = [
  { nome: 'Páginas dos documentos', tabela: usuarioDocumentoPaginas, conteudo: usuarioDocumentoPaginas.pngBase64, ref: usuarioDocumentoPaginas.arquivoRef, sub: 'paginas', sql: 'usuarioDocumentoPaginas' },
  { nome: 'Documentos dos usuários', tabela: usuarioDocumentos, conteudo: usuarioDocumentos.conteudoBase64, ref: usuarioDocumentos.arquivoRef, sub: 'documentos', sql: 'usuarioDocumentos' },
  { nome: 'Documentos do recrutamento', tabela: recrutamentoDocs, conteudo: recrutamentoDocs.conteudoBase64, ref: recrutamentoDocs.arquivoRef, sub: 'recrutamento', sql: 'recrutamentoDocs' },
];

const afetadas = (r: any) => Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? 0);
const pausa = (ms: number) => new Promise(ok => setTimeout(ok, ms));

const situacao = {
  migradosNesteDeploy: {} as Record<string, number>,
  falhas: {} as Record<string, number>,
  ultimoErro: null as string | null,
  ultimaRodada: null as string | null,
  otimizadas: [] as string[],
  faxina: null as null | { em: string; noArmazem: number; apagados: number },
};
const pularIds = new Map<string, Set<number>>(); // falharam neste deploy: não tenta de novo em seguida

async function pendentesDe(d: any, a: Alvo): Promise<number> {
  const [r]: any[] = await d.select({ n: sql<number>`count(*)` }).from(a.tabela).where(and(isNull(a.ref), sql`length(${a.conteudo}) > 0`));
  return Number(r?.n ?? 0);
}

async function pendentesPlanta(d: any): Promise<number> {
  const [r]: any[] = await d.select({ n: sql<number>`count(*)` }).from(properties).where(and(isNull(properties.plantaRef), like(properties.plantaBaixaUrl, 'data:%')));
  return Number(r?.n ?? 0);
}

/** Migra um arquivo da tabela; false quando não há mais o que migrar */
async function migrarUm(d: any, a: Alvo): Promise<boolean> {
  const pular = pularIds.get(a.sql) ?? new Set<number>();
  const candidatos: any[] = await d.select({ id: a.tabela.id }).from(a.tabela).where(and(isNull(a.ref), sql`length(${a.conteudo}) > 0`)).limit(pular.size + 1);
  const alvo = candidatos.map(x => Number(x.id)).find(id => !pular.has(id));
  if (alvo == null) return false;
  const [linha]: any[] = await d.select({ conteudo: a.conteudo }).from(a.tabela).where(eq(a.tabela.id, alvo)).limit(1);
  const original = String(linha?.conteudo ?? '');
  if (!original) return true;
  try {
    const ref = await guardarConferido(Buffer.from(original, 'base64'), a.sub);
    const r = await d.update(a.tabela).set({ [a.conteudo.name]: '', [a.ref.name]: ref } as any)
      .where(and(eq(a.tabela.id, alvo), isNull(a.ref), eq(a.conteudo, original)));
    if (!afetadas(r)) { await apagarArquivos([ref]).catch(() => 0); return true; } // mudou no meio: tenta na próxima
    situacao.migradosNesteDeploy[a.sql] = (situacao.migradosNesteDeploy[a.sql] ?? 0) + 1;
  } catch (e: any) {
    pular.add(alvo); pularIds.set(a.sql, pular);
    situacao.falhas[a.sql] = (situacao.falhas[a.sql] ?? 0) + 1;
    situacao.ultimoErro = `${a.nome} #${alvo}: ${String(e?.message ?? e).slice(0, 200)}`;
    console.warn('[Armazém] migração:', situacao.ultimoErro);
  }
  return true;
}

async function migrarUmaPlanta(d: any): Promise<boolean> {
  const pular = pularIds.get('properties') ?? new Set<number>();
  const rows: any[] = await d.select({ id: properties.id }).from(properties).where(and(isNull(properties.plantaRef), like(properties.plantaBaixaUrl, 'data:%'))).limit(pular.size + 1);
  const id = rows.map(x => Number(x.id)).find(x => !pular.has(x));
  if (id == null) return false;
  const [p]: any[] = await d.select({ url: properties.plantaBaixaUrl }).from(properties).where(eq(properties.id, id)).limit(1);
  const original = String(p?.url ?? '');
  const uri = dataUri(original);
  if (!uri) { pular.add(id); pularIds.set('properties', pular); return true; }
  try {
    const ref = await guardarConferido(uri.buf, 'plantas');
    const r = await d.update(properties).set({ plantaBaixaUrl: rotaPlanta(id), plantaRef: ref } as any)
      .where(and(eq(properties.id, id), isNull(properties.plantaRef), eq(properties.plantaBaixaUrl, original)));
    if (!afetadas(r)) { await apagarArquivos([ref]).catch(() => 0); return true; }
    situacao.migradosNesteDeploy.properties = (situacao.migradosNesteDeploy.properties ?? 0) + 1;
  } catch (e: any) {
    pular.add(id); pularIds.set('properties', pular);
    situacao.falhas.properties = (situacao.falhas.properties ?? 0) + 1;
    situacao.ultimoErro = `Planta do imóvel #${id}: ${String(e?.message ?? e).slice(0, 200)}`;
    console.warn('[Armazém] migração:', situacao.ultimoErro);
  }
  return true;
}

/** Uma rodada: até `limite` arquivos, um por vez, com pausa */
export async function rodadaDeMigracao(limite = 30, pausaMs = 400): Promise<number> {
  if (!(await armazemPronto())) return 0;
  const d = await getDb();
  if (!d) return 0;
  situacao.ultimaRodada = new Date().toISOString();
  let feitos = 0;
  for (const a of ALVOS) {
    while (feitos < limite && (await migrarUm(d, a))) { feitos++; if (pausaMs) await pausa(pausaMs); }
  }
  while (feitos < limite && (await migrarUmaPlanta(d))) { feitos++; if (pausaMs) await pausa(pausaMs); }
  await otimizarConcluidas(d);
  return feitos;
}

/** Tabela que recebeu migração neste deploy e não tem mais pendências: o MySQL devolve o espaço ao volume */
async function otimizarConcluidas(d: any) {
  if (getDbDriver() !== 'mysql') return;
  for (const a of ALVOS) {
    if (!situacao.migradosNesteDeploy[a.sql] || situacao.otimizadas.includes(a.sql)) continue;
    if ((await pendentesDe(d, a)) > 0) continue;
    try {
      await d.execute(sql.raw(`OPTIMIZE TABLE \`${a.sql}\``));
      situacao.otimizadas.push(a.sql);
      console.log(`[Armazém] ${a.sql}: migração concluída e espaço devolvido (OPTIMIZE TABLE)`);
    } catch (e: any) { console.warn(`[Armazém] OPTIMIZE ${a.sql}:`, e?.message); }
  }
}

/** Faxina: apaga no armazém os arquivos que nenhum registro do banco aponta mais (só os com mais de 2 h) */
export async function faxinaDeOrfaos(agora = Date.now()): Promise<{ noArmazem: number; apagados: number }> {
  if (!(await armazemPronto())) return { noArmazem: 0, apagados: 0 };
  const d = await getDb();
  if (!d) return { noArmazem: 0, apagados: 0 };
  const noArmazem = await listarArquivos();
  const emUso = new Set<string>();
  for (const a of ALVOS) {
    const rows: any[] = await d.select({ ref: a.ref }).from(a.tabela).where(sql`${a.ref} IS NOT NULL`);
    for (const r of rows) emUso.add(String(r.ref));
  }
  const plantas: any[] = await d.select({ ref: properties.plantaRef }).from(properties).where(sql`${properties.plantaRef} IS NOT NULL`);
  for (const r of plantas) emUso.add(String(r.ref));
  const orfaos = noArmazem.filter(x => !emUso.has(x.ref) && (!x.criadoEm || agora - Date.parse(x.criadoEm) > 2 * 3600_000)).map(x => x.ref);
  const apagados = orfaos.length ? await apagarArquivos(orfaos) : 0;
  situacao.faxina = { em: new Date(agora).toISOString(), noArmazem: noArmazem.length, apagados };
  if (apagados) console.log(`[Armazém] faxina: ${apagados} arquivo(s) sem registro apagado(s)`);
  return { noArmazem: noArmazem.length, apagados };
}

/** Situação para o quadro do banco (Configurações) */
export async function situacaoArmazem() {
  const d = await getDb();
  const pendentes: { nome: string; pendentes: number; migrados: number; falhas: number }[] = [];
  if (d) {
    for (const a of ALVOS) pendentes.push({ nome: a.nome, pendentes: await pendentesDe(d, a).catch(() => -1), migrados: situacao.migradosNesteDeploy[a.sql] ?? 0, falhas: situacao.falhas[a.sql] ?? 0 });
    pendentes.push({ nome: 'Plantas dos imóveis', pendentes: await pendentesPlanta(d).catch(() => -1), migrados: situacao.migradosNesteDeploy.properties ?? 0, falhas: situacao.falhas.properties ?? 0 });
  }
  return { teste: situacaoTeste(), tabelas: pendentes, ultimoErro: situacao.ultimoErro, ultimaRodada: situacao.ultimaRodada, otimizadas: situacao.otimizadas, faxina: situacao.faxina };
}

/** Agenda: migração 3 min após subir e a cada 10 min enquanto houver pendência; faxina 40 min após subir e a cada 24 h */
export function iniciarArmazem() {
  if (getDbDriver() !== 'mysql' && process.env.ARMAZEM_EM_SQLITE !== '1') return;
  const rodar = async () => {
    try { await rodadaDeMigracao(); } catch (e: any) { console.warn('[Armazém] rodada:', e?.message); }
  };
  setTimeout(rodar, 3 * 60_000).unref();
  setInterval(rodar, 10 * 60_000).unref();
  const faxina = async () => { try { await faxinaDeOrfaos(); } catch (e: any) { console.warn('[Armazém] faxina:', e?.message); } };
  setTimeout(faxina, 40 * 60_000).unref();
  setInterval(faxina, 24 * 3600_000).unref();
}

export const _situacao = situacao;
