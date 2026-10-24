/**
 * Dados do corretor como intermediador do contrato (ponto de entrada para o módulo de contrato):
 * qualificação pronta, pendências do cadastro e a certidão de quitação do CRECI que vai anexada.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, usuarioDocumentos } from "../drizzle/schema";
import { pendenciasIntermediador, qualificacaoIntermediador, situacaoCertidao, type DadosIntermediador, type SituacaoCertidao } from "../shared/cadastro";

export interface Intermediador {
  usuarioId: number;
  dados: DadosIntermediador;
  qualificacao: string;
  certidao: { situacao: SituacaoCertidao; validade: string | null; documentoId: number | null };
  pendencias: string[];
  apto: boolean;
}

/** Linha de users + certidão mais recente → intermediador (puro, testável) */
export function montarIntermediador(u: Record<string, any>, certidao: { id: number } | null, hoje = new Date()): Intermediador {
  const s = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
  const dados: DadosIntermediador = {
    nome: s(u.name) ?? "", creci: s(u.creci), creciUf: s(u.creciUf), cpf: s(u.cpf), rg: s(u.rg), rgOrgao: s(u.rgOrgao),
    nacionalidade: s(u.nacionalidade), estadoCivil: s(u.estadoCivil),
    enderecoLogradouro: s(u.enderecoLogradouro), enderecoNumero: s(u.enderecoNumero), enderecoComplemento: s(u.enderecoComplemento),
    enderecoBairro: s(u.enderecoBairro), enderecoCidade: s(u.enderecoCidade), enderecoUf: s(u.enderecoUf), enderecoCep: s(u.enderecoCep),
    telefone: s(u.telefone), email: s(u.email),
  };
  const situacao = situacaoCertidao(u.certidaoCreciValidade, !!certidao, hoje);
  const pendencias = pendenciasIntermediador(dados, situacao);
  return {
    usuarioId: Number(u.id), dados, qualificacao: qualificacaoIntermediador(dados),
    certidao: { situacao, validade: s(u.certidaoCreciValidade), documentoId: certidao?.id ?? null },
    pendencias, apto: pendencias.length === 0,
  };
}

/** Carrega do banco (o módulo de contrato chama isto no ato da venda e recusa se apto = false) */
export async function intermediadorParaContrato(usuarioId: number): Promise<Intermediador | null> {
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco indisponível");
  const [u] = await db.select().from(users).where(eq(users.id, usuarioId)).limit(1);
  if (!u) return null;
  const [cert] = await db.select({ id: usuarioDocumentos.id }).from(usuarioDocumentos)
    .where(and(eq(usuarioDocumentos.usuarioId, usuarioId), eq(usuarioDocumentos.tipo, "certidao_creci"))).orderBy(desc(usuarioDocumentos.id)).limit(1);
  return montarIntermediador(u, cert ?? null);
}
