/**
 * Aceite versionado dos Termos/Aviso e consentimento OPCIONAL de marketing, separados.
 * Prova proporcional: usuário, documento, versão, hash SHA-256 do texto e hora do servidor. Sem IP nem dispositivo
 * (não são necessários para esta prova; ver docs/privacidade/inventario-dados.md).
 * Usuário antigo sem registro fica "pendente" — nada é retroagido nem bloqueado.
 * Só funciona com PRIVACIDADE_MINUTAS_ATIVAS (desligado em produção até a aprovação jurídica).
 */
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { privacidadeAceites } from '../../drizzle/schema';
import { CONSENTIMENTO_MARKETING_TEXTO, CONSENTIMENTO_MARKETING_VERSAO, DOCUMENTOS_PRIVACIDADE, type DocumentoPrivacidade } from '../../shared/privacidade';
import { createHash } from 'node:crypto';
import { documento, minutasAtivas } from './config';
import { PrivacidadeErro } from './pedidos';

const HASH_MARKETING = createHash('sha256').update(CONSENTIMENTO_MARKETING_TEXTO).digest('hex');

async function db() {
  const d = await getDb();
  if (!d) throw new PrivacidadeErro('Banco indisponível.', 503);
  return d as any;
}

function exigirAtivo() {
  if (!minutasAtivas()) throw new PrivacidadeErro('Termos e aviso de privacidade ainda em revisão jurídica.', 404);
}

interface RegistroAceite { id: number; documento: string; versao: string; hash: string; acao: string; criadoEm: number }

async function historico(usuarioId: number): Promise<RegistroAceite[]> {
  const d = await db();
  return (await d.select().from(privacidadeAceites).where(eq(privacidadeAceites.usuarioId, usuarioId)).orderBy(desc(privacidadeAceites.id)))
    .map((a: any) => ({ id: a.id, documento: a.documento, versao: a.versao, hash: a.hash, acao: a.acao, criadoEm: Number(a.criadoEm) }));
}

/** Situação do usuário: aceite da versão vigente (pendente se nunca aceitou ou se o texto mudou) e marketing */
export async function situacao(usuarioId: number) {
  exigirAtivo();
  const h = await historico(usuarioId);
  const docs = Object.fromEntries((Object.keys(DOCUMENTOS_PRIVACIDADE) as DocumentoPrivacidade[]).map(doc => {
    const atual = documento(doc);
    const ultimo = h.find(a => a.documento === doc && a.acao === 'aceite');
    const vigente = !!ultimo && ultimo.versao === atual.versao && ultimo.hash === atual.hash;
    return [doc, { titulo: atual.titulo, versao: atual.versao, hash: atual.hash, situacao: vigente ? 'aceito' : 'pendente', aceitoEm: vigente ? ultimo!.criadoEm : null }];
  }));
  const mk = h.find(a => a.documento === 'marketing');
  return { documentos: docs, marketing: { consentido: mk?.acao === 'aceite', desde: mk?.acao === 'aceite' ? mk.criadoEm : null, texto: CONSENTIMENTO_MARKETING_TEXTO }, historico: h };
}

/** Registra o aceite da versão que o usuário leu (versão e hash conferidos com o texto atual do servidor) */
export async function aceitar(usuarioId: number, doc: DocumentoPrivacidade, versaoLida: string, hashLido: string, agora = Date.now()) {
  exigirAtivo();
  if (!Object.hasOwn(DOCUMENTOS_PRIVACIDADE, doc)) throw new PrivacidadeErro('Documento inválido.');
  const atual = documento(doc);
  if (versaoLida !== atual.versao || hashLido !== atual.hash) throw new PrivacidadeErro('O texto foi atualizado. Leia a versão atual antes de aceitar.', 409);
  const d = await db();
  await d.insert(privacidadeAceites).values({ usuarioId, documento: doc, versao: atual.versao, hash: atual.hash, acao: 'aceite', criadoEm: agora });
}

/** Consentimento opcional de marketing: dar ou revogar (histórico preservado) */
export async function definirMarketing(usuarioId: number, consentir: boolean, agora = Date.now()) {
  exigirAtivo();
  const d = await db();
  await d.insert(privacidadeAceites).values({ usuarioId, documento: 'marketing', versao: CONSENTIMENTO_MARKETING_VERSAO, hash: HASH_MARKETING, acao: consentir ? 'aceite' : 'revogacao', criadoEm: agora });
}
