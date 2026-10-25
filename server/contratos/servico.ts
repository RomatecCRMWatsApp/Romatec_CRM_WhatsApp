/**
 * Contratos no banco: numeração, criação com reserva exclusiva do lote, contexto do merge a partir do banco,
 * geração de versões (nunca sobrescritas), ativação e cancelamento.
 */
import { randomBytes } from 'node:crypto';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  condicoesPagamento, contratoPessoas, contratos, contratoSeq, contratoVersoes, empJuridico, empreendimentos, loteHistorico, lotes, pessoas,
  usuarioDocumentos, users,
} from '../../drizzle/schema';
import { condicoesDaLinha, simular, type CondicoesPagamento } from '../../shared/simulador';
import { statusPublicoDe } from '../../shared/lotes';
import { exigeConjuge, pendenciasComprador, type PessoaForm } from '../../shared/contratos';
import { memorialDoLote, type RuaMemorial } from '../lotes/memorial';
import { montarContexto, type CredenciaisCorretor, type EntradaContexto, type PessoaContrato } from './contexto';
import { planoDoContrato, type EscolhaPlano, type PlanoContrato } from './plano';
import { gerarContratoPdf } from './gerar';
import type { DadosUnidade } from './anexosLote';
import { carregarCamadas } from './mapaEmpreendimento';
import { lerArquivo, salvarArquivo } from './arquivos';
import { avaliarGate } from './gate';
import { hojeIso } from './formato';

export class ContratoErro extends Error {
  constructor(public codigo: string, mensagem: string, public status = 400, public campos?: Record<string, string>) { super(mensagem); }
}

type XY = [number, number];
const db = async () => {
  const d = (await getDb()) as any;
  if (!d) throw new ContratoErro('BANCO', 'Banco indisponível', 503);
  return d;
};
const json = <T>(v: unknown): T | null => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : (v as T));
const afetadas = (r: any): number => Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? r?.rowsAffected ?? 0);
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** Sigla do contrato: 'bom-jardims' → 'BJ' (ou emp_sigla no jurídico) */
export const siglaDoEmpreendimento = (slug: string, defaults?: Record<string, unknown> | null) =>
  String(defaults?.emp_sigla ?? slug.split('-').filter(Boolean).map(p => p[0]).join('')).toUpperCase().slice(0, 4);

/** Próximo número do ano (BJ-2026-0001), com retentativa se dois contratos forem criados juntos */
export async function proximoNumero(sigla: string, ano: number): Promise<string> {
  const d = await db();
  for (let t = 0; t < 5; t++) {
    const [s] = await d.select().from(contratoSeq).where(eq(contratoSeq.ano, ano)).limit(1);
    if (!s) {
      try { await d.insert(contratoSeq).values({ ano, ultimo: 1 }); return `${sigla}-${ano}-0001`; } catch { continue; }
    }
    const r = await d.update(contratoSeq).set({ ultimo: s.ultimo + 1 }).where(and(eq(contratoSeq.ano, ano), eq(contratoSeq.ultimo, s.ultimo)));
    if (afetadas(r) === 1) return `${sigla}-${ano}-${String(s.ultimo + 1).padStart(4, '0')}`;
  }
  throw new ContratoErro('NUMERACAO', 'Não foi possível numerar o contrato, tente de novo', 409);
}

export const codigoVerificacaoContrato = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(12), x => A[x % A.length]).join('');
};

// ─── Credenciais dos corretores (cadastro do usuário) ────────────────────────

const creciFormatado = (c: string | null | undefined) => { const d = soDigitos(c); return d.length > 3 ? `${d.slice(0, -3)}.${d.slice(-3)}` : d; };

export async function credenciaisDoUsuario(userId: number): Promise<CredenciaisCorretor> {
  const d = await db();
  const [u] = await d.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new ContratoErro('CORRETOR', 'Corretor não encontrado', 404);
  const docs: any[] = await d.select().from(usuarioDocumentos).where(eq(usuarioDocumentos.usuarioId, userId));
  const doTipo = (t: string) => docs.filter(x => x.tipo === t && (x.titular ?? 'usuario') === 'usuario').sort((a, b) => String(b.validade ?? '').localeCompare(String(a.validade ?? '')))[0];
  const cartao = doTipo('cartao_creci'), certidao = doTipo('certidao_creci');
  return {
    nome: String(u.name ?? ''), cpf: u.cpf ?? '', creci: creciFormatado(u.creci), creciUf: u.creciUf ?? 'MA',
    creciValidade: cartao?.validade ?? '', certidaoCodigo: certidao?.numero ?? '', certidaoEmissao: certidao?.emissao ?? '',
    certidaoValidade: certidao?.validade ?? u.certidaoCreciValidade ?? '',
  };
}

/** Responsável técnico da Romatec (corr_* do contrato): jurídico › responsavel_tecnico_user_id, senão o administrador com CRECI */
export async function responsavelTecnicoId(defaults: Record<string, unknown>): Promise<number | null> {
  const id = Number(defaults.responsavel_tecnico_user_id);
  if (id > 0) return id;
  const d = await db();
  const admins: any[] = await d.select({ id: users.id, creci: users.creci }).from(users).where(eq(users.role, 'admin'));
  return admins.find(a => a.creci)?.id ?? admins[0]?.id ?? null;
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function contratoPorId(id: number) {
  const d = await db();
  const [c] = await d.select().from(contratos).where(eq(contratos.id, id)).limit(1);
  if (!c) throw new ContratoErro('NAO_ENCONTRADO', 'Contrato não encontrado', 404);
  return c;
}

export async function juridicoDe(empreendimentoId: number) {
  const d = await db();
  const [j] = await d.select().from(empJuridico).where(eq(empJuridico.empreendimentoId, empreendimentoId)).limit(1);
  if (!j) throw new ContratoErro('SEM_JURIDICO', 'Configuração jurídica do empreendimento ausente', 409);
  return { ...j, defaults: json<Record<string, unknown>>(j.defaultsJson) ?? {}, vendedora: json<Record<string, unknown>>(j.vendedoraJson) ?? {} };
}

export async function condicoesDe(empreendimentoId: number): Promise<CondicoesPagamento> {
  const d = await db();
  const rs: any[] = (await d.select().from(condicoesPagamento).where(eq(condicoesPagamento.empreendimentoId, empreendimentoId))).filter((x: any) => !!Number(x.ativo) || x.ativo === true);
  const r = rs.sort((a, b) => String(a.vigenteDesde).localeCompare(String(b.vigenteDesde))).at(-1);
  if (!r) throw new ContratoErro('SEM_CONDICOES', 'Empreendimento sem condições de pagamento', 409);
  return condicoesDaLinha(r);
}

const linhaParaPessoa = (p: any): PessoaContrato => ({
  nome: p.nome, cpfCnpj: p.cpfCnpj, nacionalidade: p.nacionalidade, estadoCivil: p.estadoCivil, regimeBens: p.regimeBens,
  pactoAntenupcial: p.pactoAntenupcial, profissao: p.profissao, nascimento: p.nascimento ? String(p.nascimento).slice(0, 10) : null, sexo: p.sexo,
  rg: p.rg, rgOrgao: p.rgOrgao, rgUf: p.rgUf, email: p.email, telefone1: p.telefone1, cep: p.cep, logradouro: p.logradouro, numero: p.numero,
  complemento: p.complemento, bairro: p.bairro, cidade: p.cidade, uf: p.uf,
});

export async function pessoasDe(contratoId: number) {
  const d = await db();
  const rs: any[] = await d.select({ papel: contratoPessoas.papel, p: pessoas }).from(contratoPessoas)
    .innerJoin(pessoas, eq(pessoas.id, contratoPessoas.pessoaId)).where(eq(contratoPessoas.contratoId, contratoId));
  const de = (papel: string) => rs.find(r => r.papel === papel)?.p ?? null;
  return { comprador: de('comprador'), conjuge: de('conjuge') };
}

// ─── Criação ─────────────────────────────────────────────────────────────────

export interface NovoContrato {
  empreendimentoSlug: string;
  loteCodigo: string;
  leadId?: number | null;
  /** Corretor que vendeu (admin/secretário escolhem; corretor = ele mesmo) */
  corretorUserId: number;
  plano: { modalidade: 'financiado' | 'avista'; entradaParcelas: number; prazo?: number; dataPrimeiroPagamento: string };
  comprador: PessoaForm;
  conjuge?: PessoaForm | null;
  condicoes?: { especificas?: string; modoAssinatura?: 'eletronica' | 'manuscrita' };
}

const pessoaParaLinha = (p: PessoaForm) => ({
  tipo: 'PF', nome: p.nome.trim(), cpfCnpj: soDigitos(p.cpf), sexo: p.sexo || null, nacionalidade: p.nacionalidade || 'brasileira',
  estadoCivil: p.estadoCivil || null, regimeBens: p.regimeBens || null, pactoAntenupcial: p.pactoAntenupcial || null, profissao: p.profissao || null,
  nascimento: p.nascimento || null, rg: p.rg || null, rgOrgao: p.rgOrgao || null, rgUf: p.rgUf || null, email: p.email || null,
  telefone1: soDigitos(p.telefone1) || null, cep: soDigitos(p.cep) || null, logradouro: p.logradouro || null, numero: p.numero || null,
  complemento: p.complemento || null, bairro: p.bairro || null, cidade: p.cidade || null, uf: p.uf ? p.uf.toUpperCase() : null,
});

/** Cadastro único por CPF: atualiza quem já existe, cria quem não existe */
async function salvarPessoa(p: PessoaForm, leadId: number | null): Promise<number> {
  const d = await db();
  const linha = pessoaParaLinha(p);
  const [ja] = await d.select({ id: pessoas.id }).from(pessoas).where(eq(pessoas.cpfCnpj, linha.cpfCnpj)).limit(1);
  const agora = new Date();
  if (ja) { await d.update(pessoas).set({ ...linha, atualizadoEm: agora }).where(eq(pessoas.id, ja.id)); return ja.id; }
  // Booleanos em SQL: o SQLite local não aceita true/false do drizzle (no MySQL tanto faz)
  await d.insert(pessoas).values({ ...linha, leadId, telefone1Whatsapp: sql`TRUE` as any, telefone2Whatsapp: sql`FALSE` as any, lgpdMarketing: sql`FALSE` as any, criadoEm: agora, atualizadoEm: agora });
  const [novo] = await d.select({ id: pessoas.id }).from(pessoas).where(eq(pessoas.cpfCnpj, linha.cpfCnpj)).limit(1);
  return novo.id;
}

export function planoEscolhido(n: NovoContrato['plano'], areaM2: number, precoTabela: number | null, c: CondicoesPagamento, comCorretor: boolean): PlanoContrato {
  const sim = simular(areaM2, n.modalidade === 'avista' ? 1 : n.entradaParcelas, c, precoTabela);
  const escolha: EscolhaPlano = { modalidade: n.modalidade, prazo: n.prazo, dataPrimeiroPagamento: n.dataPrimeiroPagamento };
  return planoDoContrato(sim, escolha, c, comCorretor);
}

export async function criarContrato(n: NovoContrato, autorId: number): Promise<{ id: number; numero: string }> {
  const campos = pendenciasComprador(n.comprador, exigeConjuge(n.comprador.estadoCivil) ? n.conjuge : null);
  if (Object.keys(campos).length) throw new ContratoErro('CAMPOS', 'Confira os dados do comprador', 400, campos);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.plano.dataPrimeiroPagamento)) throw new ContratoErro('DATA', 'Data do 1º pagamento inválida', 400);
  const d = await db();
  const [emp] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, n.empreendimentoSlug)).limit(1);
  if (!emp) throw new ContratoErro('NAO_ENCONTRADO', 'Empreendimento não encontrado', 404);
  const [lote] = await d.select().from(lotes).where(and(eq(lotes.empreendimentoId, emp.id), eq(lotes.codigo, n.loteCodigo))).limit(1);
  if (!lote) throw new ContratoErro('LOTE', `Chácara ${n.loteCodigo} não encontrada`, 404);
  if (!lote.comercializavel || lote.situacao === 'bloqueado') throw new ContratoErro('LOTE', `Chácara ${lote.codigo} não é comercializável`, 409);
  if ((lote.situacao ?? 'disponivel') !== 'disponivel') throw new ContratoErro('LOTE_INDISPONIVEL', `Chácara ${lote.codigo} está ${lote.situacao}`, 409);
  const j = await juridicoDe(emp.id);
  const cond = await condicoesDe(emp.id);
  const resp = await responsavelTecnicoId(j.defaults);
  const plano = planoEscolhido(n.plano, Number(lote.areaM2), lote.precoTabela != null ? Number(lote.precoTabela) : null, cond, n.corretorUserId !== resp);

  const numero = await proximoNumero(siglaDoEmpreendimento(emp.slug, j.defaults), new Date().getFullYear());
  const codigo = codigoVerificacaoContrato();
  const agora = new Date();
  await d.insert(contratos).values({
    numero, empreendimentoId: emp.id, loteId: lote.id, loteCodigo: lote.codigo, leadId: n.leadId ?? null, corretorUserId: n.corretorUserId,
    simulacaoJson: plano as any, dadosJson: { condicionantes: { ctr_condicoes_especificas: n.condicoes?.especificas?.trim() || 'Não há.' } } as any,
    status: 'rascunho', modoAssinatura: n.condicoes?.modoAssinatura ?? 'eletronica', codigoVerificacao: codigo, usoLiberado: sql`FALSE` as any,
    criadoPor: autorId, criadoEm: agora, atualizadoEm: agora,
  });
  const [c] = await d.select().from(contratos).where(eq(contratos.numero, numero)).limit(1);

  // Reserva exclusiva: só pega o lote se ninguém pegou entre a leitura e agora
  const r = await d.update(lotes).set({
    situacao: 'reservado', status: statusPublicoDe('reservado'), contratoReservaId: c.id, reservadoAte: new Date(Date.now() + 72 * 3600_000),
    leadId: n.leadId ?? null, corretorId: n.corretorUserId, clienteNome: n.comprador.nome.trim(), valorVenda: String(plano.total_pagar),
    valorEntrada: String(plano.entrada_valor || plano.total_pagar), numParcelas: plano.saldo_qtd || 1, dataSituacao: agora,
  } as any).where(and(eq(lotes.id, lote.id), or(eq(lotes.situacao, 'disponivel'))));
  if (afetadas(r) !== 1) {
    await d.update(contratos).set({ status: 'cancelado', atualizadoEm: agora }).where(eq(contratos.id, c.id));
    throw new ContratoErro('LOTE_INDISPONIVEL', `Chácara ${lote.codigo} acabou de ser reservada por outra pessoa`, 409);
  }
  await d.insert(loteHistorico).values({ loteId: lote.id, de: lote.situacao ?? 'disponivel', para: 'reservado', leadId: n.leadId ?? null,
    corretorId: n.corretorUserId, usuarioId: autorId, detalhe: `Contrato ${numero}`, createdAt: agora } as any);

  const compradorId = await salvarPessoa(n.comprador, n.leadId ?? null);
  await d.insert(contratoPessoas).values({ contratoId: c.id, pessoaId: compradorId, papel: 'comprador' });
  if (exigeConjuge(n.comprador.estadoCivil) && n.conjuge) {
    const conjugeId = await salvarPessoa({ ...n.conjuge, estadoCivil: n.comprador.estadoCivil, regimeBens: n.comprador.regimeBens }, null);
    await d.insert(contratoPessoas).values({ contratoId: c.id, pessoaId: conjugeId, papel: 'conjuge' });
  }
  return { id: c.id, numero };
}

// ─── Contexto do merge a partir do banco ─────────────────────────────────────

export async function entradaDoContrato(contratoId: number): Promise<{ entrada: EntradaContexto; unidade: DadosUnidade; plano: PlanoContrato; marca: string; modelo: string }> {
  const d = await db();
  const c = await contratoPorId(contratoId);
  const [emp] = await d.select().from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const j = await juridicoDe(c.empreendimentoId);
  const todos: any[] = await d.select().from(lotes).where(eq(lotes.empreendimentoId, c.empreendimentoId));
  const lote = todos.find(l => l.codigo === c.loteCodigo);
  if (!lote) throw new ContratoErro('LOTE', 'Lote do contrato não encontrado', 404);
  const { comprador, conjuge } = await pessoasDe(contratoId);
  if (!comprador) throw new ContratoErro('SEM_COMPRADOR', 'Contrato sem comprador', 409);
  const plano = json<PlanoContrato>(c.simulacaoJson)!;
  const resp = await responsavelTecnicoId(j.defaults);
  const corretor = resp ? await credenciaisDoUsuario(resp) : { nome: '', cpf: '', creci: '', creciUf: 'MA', creciValidade: '', certidaoCodigo: '', certidaoEmissao: '', certidaoValidade: '' };
  const parceiro = c.corretorUserId && c.corretorUserId !== resp ? await credenciaisDoUsuario(c.corretorUserId) : null;

  const geom = (l: any) => json<XY[]>(l.verticesUtm) ?? [];
  const lm = (l: any) => ({ codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: Number(l.areaM2 ?? 0), perimetroM: Number(l.perimetroM ?? 0), verticesUtm: geom(l) });
  const ruas = (json<{ nome: string; e: number; n: number; angulo: number }[]>(emp?.ruas) ?? []) as RuaMemorial[];
  const perimetroUtm = json<{ verticesUtm: XY[] }>(emp?.perimetro)?.verticesUtm ?? null;
  const fuso = emp?.utmFuso ?? 23;
  const comGeometria = geom(lote).length >= 3;
  const memorial = comGeometria
    ? memorialDoLote(lm(lote), todos.filter(l => geom(l).length >= 3).map(lm),
      { nome: emp?.nome ?? '', municipio: emp?.municipio, uf: emp?.uf, fuso, matricula: emp?.registroMatricula, ruas, perimetroUtm })
    : { titulo: `Chácara ${lote.codigo}`, cabecalho: [], descricao: 'Geometria da unidade ainda não importada do DXF.', vertices: [] };
  const viaFrente = lote.viaFrente || memorial.vertices.map(v => v.confronta).find(t => /^a /.test(t))?.replace(/^a /, '') || '';
  const dados = json<{ condicionantes?: Record<string, string> }>(c.dadosJson) ?? {};

  const entrada: EntradaContexto = {
    contrato: { numero: c.numero, codigoVerificacao: c.codigoVerificacao, modoAssinatura: c.modoAssinatura, dataGeracao: hojeIso() },
    juridico: { defaults: j.defaults, vendedoraTipo: j.vendedoraTipo === 'PJ' ? 'PJ' : 'PF', vendedora: j.vendedora, modeloVersao: j.modeloVersao },
    overrides: json<Record<string, unknown>>(c.overridesJson),
    lote: { codigo: lote.codigo, quadra: lote.quadra, numero: lote.numero, areaM2: Number(lote.areaM2), perimetroM: Number(lote.perimetroM ?? 0),
      descricao: lote.memorialTexto || memorial.descricao, viaFrente, matricula: lote.matricula ?? '' },
    plano, comprador: linhaParaPessoa(comprador), conjuge: conjuge ? linhaParaPessoa(conjuge) : null, corretor, parceiro,
    condicionantes: dados.condicionantes,
  };
  const unidade: DadosUnidade = {
    codigo: lote.codigo, quadra: lote.quadra, numero: lote.numero, areaM2: Number(lote.areaM2), perimetroM: Number(lote.perimetroM ?? 0),
    verticesUtm: geom(lote), memorial, outros: todos.filter(l => l.id !== lote.id && geom(l).length >= 3).map(l => ({ codigo: l.codigo, verticesUtm: geom(l) })),
    perimetroUtm, ruas, fuso, responsavelTecnico: emp?.responsavelTecnico ?? null, camadas: await carregarCamadas(emp?.slug, fuso),
  };
  return { entrada, unidade, plano, marca: j.marcaSlug, modelo: j.modeloCpcv };
}

/** Gate atual do contrato (para a tela: o que falta e o que bloqueia) */
export async function gateDoContrato(contratoId: number) {
  const { entrada } = await entradaDoContrato(contratoId);
  const ctx = montarContexto(entrada);
  return { minuta: avaliarGate(ctx, 'minuta'), definitivo: avaliarGate(ctx, 'definitivo') };
}

// ─── Versões ─────────────────────────────────────────────────────────────────

export async function gerarVersao(contratoId: number, alvo: 'minuta' | 'definitivo', o: { licenca?: Buffer | null } = {}) {
  const d = await db();
  const c = await contratoPorId(contratoId);
  if (['ativo', 'quitado', 'distratado', 'cancelado', 'assinado'].includes(c.status)) throw new ContratoErro('STATUS', `Contrato ${c.status}: não gera nova versão`, 409);
  const { entrada, unidade, plano, marca, modelo } = await entradaDoContrato(contratoId);
  const ctx = montarContexto(entrada);
  const { pdf, sha256, gate } = await gerarContratoPdf(ctx, plano, { alvo, modelo, marca, unidade, licenca: o.licenca });
  const versoes: any[] = await d.select({ versao: contratoVersoes.versao }).from(contratoVersoes).where(eq(contratoVersoes.contratoId, contratoId));
  const versao = versoes.reduce((m, v) => Math.max(m, Number(v.versao)), 0) + 1;
  const chave = `contratos/${contratoId}/v${String(versao).padStart(3, '0')}-${alvo}.pdf`;
  await salvarArquivo(chave, pdf);
  await d.insert(contratoVersoes).values({ contratoId, versao, etapa: alvo === 'minuta' ? 'gerado:minuta' : 'gerado', arquivo: chave, sha256, bytes: pdf.length, criadoEm: new Date() });
  const dados = json<Record<string, unknown>>(c.dadosJson) ?? {};
  await d.update(contratos).set({
    status: alvo === 'minuta' ? 'minuta' : 'apto_assinatura', pdfAtual: chave, hashAtual: sha256, dadosJson: { ...dados, ctx } as any, atualizadoEm: new Date(),
  }).where(eq(contratos.id, contratoId));
  return { versao, sha256, bytes: pdf.length, faltantes: gate.faltantes };
}

export async function pdfDaVersao(contratoId: number, versao: number) {
  const d = await db();
  const [v] = await d.select().from(contratoVersoes).where(and(eq(contratoVersoes.contratoId, contratoId), eq(contratoVersoes.versao, versao))).limit(1);
  if (!v) throw new ContratoErro('NAO_ENCONTRADA', 'Versão não encontrada', 404);
  const a = await lerArquivo(v.arquivo);
  if (!a) throw new ContratoErro('ARQUIVO', 'Arquivo da versão não encontrado', 404);
  return { pdf: a.buf, nome: v.arquivo.split('/').pop()! };
}

// ─── Assinado / cancelado ────────────────────────────────────────────────────

/**
 * Contrato assinado (a punho ou fora do sistema, enquanto a assinatura eletrônica não entra): guarda o PDF assinado,
 * ativa o contrato, marca o lote como vendido e grava o plano de cobranças (previstas — a emissão no Asaas é outro passo).
 */
export async function registrarAssinado(contratoId: number, pdfAssinado: Buffer | null, usuarioId: number) {
  const d = await db();
  const c = await contratoPorId(contratoId);
  if (!['apto_assinatura', 'em_assinatura', 'assinado'].includes(c.status)) {
    throw new ContratoErro('STATUS', 'Só contrato definitivo (apto para assinatura) pode ser ativado', 409);
  }
  const plano = json<PlanoContrato>(c.simulacaoJson)!;
  const agora = new Date();
  if (pdfAssinado) {
    if (pdfAssinado.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ContratoErro('PDF', 'Envie o contrato assinado em PDF', 400);
    const versoes: any[] = await d.select({ versao: contratoVersoes.versao }).from(contratoVersoes).where(eq(contratoVersoes.contratoId, contratoId));
    const versao = versoes.reduce((m, v) => Math.max(m, Number(v.versao)), 0) + 1;
    const chave = `contratos/${contratoId}/v${String(versao).padStart(3, '0')}-assinado.pdf`;
    const s = await salvarArquivo(chave, pdfAssinado);
    await d.insert(contratoVersoes).values({ contratoId, versao, etapa: 'manuscrito', arquivo: chave, sha256: s.sha256, bytes: s.bytes, criadoEm: agora });
    await d.update(contratos).set({ pdfAtual: chave, hashAtual: s.sha256 }).where(eq(contratos.id, contratoId));
  }
  await d.update(contratos).set({ status: 'ativo', atualizadoEm: agora }).where(eq(contratos.id, contratoId));
  const situacao = plano.modalidade === 'avista' ? 'vendido_avista' : 'vendido_parcelado';
  if (c.loteId) {
    await d.update(lotes).set({ situacao, status: statusPublicoDe(situacao), dataSituacao: agora } as any).where(eq(lotes.id, c.loteId));
    await d.insert(loteHistorico).values({ loteId: c.loteId, de: 'reservado', para: situacao, corretorId: c.corretorUserId, usuarioId,
      detalhe: `Contrato ${c.numero} ativo`, createdAt: agora } as any);
  }
  const { gerarCobrancasDoPlano } = await import('../financeiro/emissao');
  const cobrancas = await gerarCobrancasDoPlano(contratoId, plano);
  return { cobrancas };
}

export async function cancelarContrato(contratoId: number, usuarioId: number, motivo: string) {
  const d = await db();
  const c = await contratoPorId(contratoId);
  if (['cancelado', 'distratado'].includes(c.status)) return { ok: true };
  if (['ativo', 'quitado'].includes(c.status)) throw new ContratoErro('STATUS', 'Contrato ativo só sai por distrato (com as retenções da Lei 6.766, art. 32-A)', 409);
  const agora = new Date();
  await d.update(contratos).set({ status: 'cancelado', atualizadoEm: agora }).where(eq(contratos.id, contratoId));
  if (c.loteId) {
    const r = await d.update(lotes).set({
      situacao: 'disponivel', status: statusPublicoDe('disponivel'), contratoReservaId: null, reservadoAte: null, leadId: null, corretorId: null,
      clienteNome: null, valorVenda: null, valorEntrada: null, numParcelas: null, dataSituacao: agora,
    } as any).where(and(eq(lotes.id, c.loteId), eq(lotes.contratoReservaId, contratoId)));
    if (afetadas(r)) await d.insert(loteHistorico).values({ loteId: c.loteId, de: 'reservado', para: 'disponivel', usuarioId,
      detalhe: `Contrato ${c.numero} cancelado: ${motivo}`.slice(0, 500), createdAt: agora } as any);
  }
  return { ok: true };
}

/** Lista para a tela */
export async function listarContratos(filtro: { corretorUserId?: number; status?: string[] } = {}) {
  const d = await db();
  const cs: any[] = await d.select().from(contratos);
  const lista = cs.filter(c => (!filtro.corretorUserId || c.corretorUserId === filtro.corretorUserId) && (!filtro.status?.length || filtro.status.includes(c.status)));
  const ids = lista.map(c => c.id);
  const ps: any[] = ids.length ? await d.select({ contratoId: contratoPessoas.contratoId, papel: contratoPessoas.papel, nome: pessoas.nome })
    .from(contratoPessoas).innerJoin(pessoas, eq(pessoas.id, contratoPessoas.pessoaId)).where(inArray(contratoPessoas.contratoId, ids)) : [];
  const emps: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos);
  const us: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  return lista.sort((a, b) => b.id - a.id).map(c => {
    const plano = json<PlanoContrato>(c.simulacaoJson);
    return {
      id: c.id, numero: c.numero, status: c.status, loteCodigo: c.loteCodigo, empreendimento: emps.find(e => e.id === c.empreendimentoId)?.nome ?? '',
      comprador: ps.find(p => p.contratoId === c.id && p.papel === 'comprador')?.nome ?? '—', corretor: us.find(u => u.id === c.corretorUserId)?.name ?? '—',
      corretorUserId: c.corretorUserId, total: plano?.total_pagar ?? null, modalidade: plano?.modalidade ?? null, criadoEm: c.criadoEm,
    };
  });
}
