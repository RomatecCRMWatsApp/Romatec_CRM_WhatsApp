/**
 * Dados do corretor como intermediador do contrato (ponto de entrada para o módulo de contrato):
 * qualificação pronta (shared/qualificacao.ts), pendências do cadastro/credenciais e o que vai anexado.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, usuarioConjuge, usuarioDocumentos } from "../drizzle/schema";
import { PRAZOS_PADRAO, cpfValido, pendenciasCredenciais, temConjuge } from "../shared/cadastro";
import { qualificacaoDasLinhas } from "./cadastroUsuario";
import { credenciaisParaAnexar } from "./credenciais";

export interface Intermediador {
  usuarioId: number;
  nome: string;
  qualificacao: string;
  pendencias: string[];
  /** Avisos da anexação (ex.: certidão vencida não vai anexada) */
  avisos: string[];
  apto: boolean;
}

type Doc = { tipo: string; titular?: string | null; validade?: string | null; numero?: string | null; linkVerificacao?: string | null; exibirPerfil?: boolean | number | null; anexarDocumentos?: boolean | number | null };

/** Campos do cadastro que o contrato exige (puro) */
export function pendenciasCadastro(u: Record<string, any>, conjuge: Record<string, any> | null): string[] {
  const vazio = (v: unknown) => v == null || String(v).trim() === "";
  const out: string[] = [];
  if (vazio(u.name)) out.push("Nome");
  if (!cpfValido(u.cpf)) out.push("CPF");
  if (u.nacionalidade === "estrangeira" ? vazio(u.docEstrangeiroNumero) : vazio(u.rg)) out.push(u.nacionalidade === "estrangeira" ? "RNM/Passaporte" : "RG");
  if (vazio(u.creci)) out.push("CRECI");
  if (vazio(u.estadoCivil)) out.push("Estado civil");
  if (vazio(u.profissao)) out.push("Profissão");
  if (vazio(u.enderecoLogradouro) || vazio(u.enderecoCidade) || vazio(u.enderecoUf)) out.push("Endereço");
  if (temConjuge(u.estadoCivil) && (!conjuge || conjuge.ativo === false || conjuge.ativo === 0)) out.push("Dados do cônjuge/companheiro(a)");
  return out;
}

/** Linha de users + cônjuge + credenciais → intermediador (puro, testável) */
export function montarIntermediador(u: Record<string, any>, conjuge: Record<string, any> | null, docs: Doc[], hoje = new Date()): Intermediador {
  const cartao = docs.find(d => d.tipo === "cartao_creci" && (d.titular ?? "usuario") === "usuario");
  const cnai = docs.find(d => d.tipo === "certificado_cnai" && (d.titular ?? "usuario") === "usuario" && (d.exibirPerfil === true || d.exibirPerfil === 1) && d.numero);
  const pendencias = [...pendenciasCadastro(u, conjuge), ...pendenciasCredenciais("corretor", docs, PRAZOS_PADRAO, hoje)];
  const { avisos } = credenciaisParaAnexar(docs as any[], hoje);
  return {
    usuarioId: Number(u.id), nome: String(u.name ?? ""),
    qualificacao: qualificacaoDasLinhas(u, conjuge, { linkVerificacaoCreci: cartao?.linkVerificacao ?? null, cnai: cnai?.numero ?? null }),
    pendencias, avisos, apto: pendencias.length === 0,
  };
}

/** Carrega do banco (o módulo de contrato chama isto no ato da venda e recusa se apto = false) */
export async function intermediadorParaContrato(usuarioId: number): Promise<Intermediador | null> {
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco indisponível");
  const [u] = await db.select().from(users).where(eq(users.id, usuarioId)).limit(1);
  if (!u) return null;
  const [c] = await db.select().from(usuarioConjuge).where(eq(usuarioConjuge.usuarioId, usuarioId)).limit(1);
  const docs: Doc[] = await db.select({
    tipo: usuarioDocumentos.tipo, titular: usuarioDocumentos.titular, validade: usuarioDocumentos.validade, numero: usuarioDocumentos.numero,
    linkVerificacao: usuarioDocumentos.linkVerificacao, exibirPerfil: usuarioDocumentos.exibirPerfil, anexarDocumentos: usuarioDocumentos.anexarDocumentos,
  }).from(usuarioDocumentos).where(eq(usuarioDocumentos.usuarioId, usuarioId));
  return montarIntermediador(u, c ?? null, docs);
}
