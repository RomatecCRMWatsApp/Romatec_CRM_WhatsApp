/**
 * Dados de UM titular (pedido de acesso/portabilidade) e anonimização com simulação.
 *
 * Busca por critérios informados pelo escritório (telefone, CPF, e-mail) — nunca por "tudo de um usuário" — e confere
 * cada linha em memória (últimos 11 dígitos do telefone, CPF só dígitos, e-mail exato) para não misturar pessoas.
 *
 * Separação (docs/privacidade/retencao-e-direitos.md):
 * - anonimizar titular (aqui) ≠ excluir login de colaborador (Equipe) ≠ excluir contato (Contatos) ≠ excluir empresa.
 * - contratos, partes de contrato, cobranças, assinaturas e auditoria financeira ficam RETIDOS (obrigação legal/
 *   exercício de direitos): o relatório lista o que ficou e por quê; a decisão de prazo é jurídica.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { eq, inArray, like, or } from 'drizzle-orm';
import { getDb } from '../db';
import {
  contacts, messages, leadQualifications, leadEventos, pessoas, contratoPessoas, loteFilaEspera, prospectos,
  eventosConvidados, reuniaoConvidados,
} from '../../drizzle/schema';
import { celulaCsv, final11 } from '../../shared/privacidade';
import { segredo } from './config';
import { PrivacidadeErro } from './pedidos';

export interface Criterios { telefone?: string | null; cpf?: string | null; email?: string | null }

function normalizar(c: Criterios) {
  const tel = final11(c.telefone);
  const cpf = String(c.cpf ?? '').replace(/\D/g, '');
  const email = String(c.email ?? '').trim().toLowerCase();
  const r = { tel: tel.length >= 10 ? tel : '', cpf: cpf.length === 11 || cpf.length === 14 ? cpf : '', email: email.includes('@') ? email : '' };
  if (!r.tel && !r.cpf && !r.email) throw new PrivacidadeErro('Informe ao menos um telefone, CPF/CNPJ ou e-mail do titular.');
  return r;
}

const ehTel = (alvo: string, v: unknown) => !!alvo && final11(v) === alvo;
const ehEmail = (alvo: string, v: unknown) => !!alvo && String(v ?? '').trim().toLowerCase() === alvo;
const ehDoc = (alvo: string, v: unknown) => !!alvo && String(v ?? '').replace(/\D/g, '') === alvo;
/** Pré-filtro no banco pelos últimos 8 dígitos; a igualdade exata é conferida em memória */
const pref = (tel: string) => `%${tel.slice(-8)}%`;
/** Campos técnicos/segredos que não vão para o titular (token de convite etc.) */
const SEM = new Set(['token', 'codigoHash', 'idxContactPhone']);
const limpar = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => !SEM.has(k)));

async function db() {
  const d = await getDb();
  if (!d) throw new PrivacidadeErro('Banco indisponível.', 503);
  return d as any;
}

/** Linhas do titular por seção (mesma busca da exportação e da anonimização) */
export async function localizarTitular(criterios: Criterios) {
  const c = normalizar(criterios);
  const d = await db();
  const leads: any[] = c.tel ? (await d.select().from(leadQualifications).where(like(leadQualifications.phone, pref(c.tel)))).filter((l: any) => ehTel(c.tel, l.phone)) : [];
  const contatos: any[] = (c.tel || c.email)
    ? (await d.select().from(contacts).where(or(...[c.tel ? like(contacts.phone, pref(c.tel)) : undefined, c.email ? eq(contacts.email, c.email) : undefined].filter(Boolean) as any[])))
      .filter((x: any) => ehTel(c.tel, x.phone) || ehEmail(c.email, x.email))
    : [];
  const leadIds = leads.map(l => l.id);
  const contatoIds = contatos.map(x => x.id);
  const eventos: any[] = leadIds.length ? await d.select().from(leadEventos).where(inArray(leadEventos.leadId, leadIds)) : [];
  const mensagens: any[] = contatoIds.length ? await d.select().from(messages).where(inArray(messages.contactId, contatoIds)) : [];
  const todasPessoas: any[] = await d.select().from(pessoas);
  const pessoasDoTitular = todasPessoas.filter(p => ehDoc(c.cpf, p.cpfCnpj) || ehTel(c.tel, p.telefone1) || ehTel(c.tel, p.telefone2) || ehEmail(c.email, p.email) || ehEmail(c.email, p.email2));
  const tels = async (tabela: any, col: any) => (c.tel ? (await d.select().from(tabela).where(like(col, pref(c.tel)))).filter((r: any) => ehTel(c.tel, r[col.name])) : []);
  const fila = await tels(loteFilaEspera, loteFilaEspera.telefone);
  const prosp = [...(await tels(prospectos, prospectos.telefone)), ...(c.email ? await d.select().from(prospectos).where(eq(prospectos.email, c.email)) : [])]
    .filter((v: any, i: number, a: any[]) => a.findIndex(x => x.id === v.id) === i);
  const convEventos = (await tels(eventosConvidados, eventosConvidados.telefone)).concat(c.cpf ? (await d.select().from(eventosConvidados)).filter((r: any) => ehDoc(c.cpf, r.documento)) : [])
    .filter((v: any, i: number, a: any[]) => a.findIndex(x => x.id === v.id) === i);
  const convReunioes = await tels(reuniaoConvidados, reuniaoConvidados.telefone);
  const pessoaIds = pessoasDoTitular.map(p => p.id);
  const vinculosContrato: any[] = pessoaIds.length ? await d.select().from(contratoPessoas).where(inArray(contratoPessoas.pessoaId, pessoaIds)) : [];
  return { c, leads, eventos, contatos, mensagens, pessoas: pessoasDoTitular, vinculosContrato, fila, prospectos: prosp, convEventos, convReunioes };
}

/** Pacote de dados do titular (JSON) — só as linhas que casam com os critérios */
export async function dadosDoTitular(criterios: Criterios) {
  const t = await localizarTitular(criterios);
  return {
    geradoEm: new Date().toISOString(),
    aviso: 'Dados pessoais localizados no CRM da Romatec para os critérios informados. Contratos e cobranças podem ter cópias próprias com retenção legal.',
    secoes: {
      leads: t.leads.map(limpar), eventosDosLeads: t.eventos.map(limpar), contatos: t.contatos.map(limpar), mensagensDeCampanha: t.mensagens.map(limpar),
      cadastrosDePessoa: t.pessoas.map(limpar), participacaoEmContratos: t.vinculosContrato.map(limpar), filaDeEspera: t.fila.map(limpar),
      prospeccao: t.prospectos.map(limpar), convidadosDeEventos: t.convEventos.map(limpar), convidadosDeReunioes: t.convReunioes.map(limpar),
    } as Record<string, Record<string, unknown>[]>,
  };
}

/** CSV (seção, id, campo, valor) com proteção contra fórmula */
export function paraCsv(pacote: Awaited<ReturnType<typeof dadosDoTitular>>): string {
  const linhas = ['secao;id;campo;valor'];
  for (const [secao, rows] of Object.entries(pacote.secoes)) {
    for (const r of rows) for (const [k, v] of Object.entries(r)) {
      if (k === 'id') continue;
      linhas.push([secao, r.id ?? '', k, v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString()) : v].map(celulaCsv).join(';'));
    }
  }
  return '﻿' + linhas.join('\r\n');
}

// ─── Link de exportação: assinado, curto (15 min) e ainda exige sessão de administrador ──
export const VALIDADE_EXPORTACAO_MS = 15 * 60 * 1000;
const assinar = (corpo: string) => createHmac('sha256', segredo()).update(`exportacao|${corpo}`).digest('base64url');

export function tokenExportacao(pedidoId: number, criterios: Criterios, formato: 'json' | 'csv', agora = Date.now()): string {
  normalizar(criterios);
  const corpo = Buffer.from(JSON.stringify({ p: pedidoId, c: criterios, f: formato, e: agora + VALIDADE_EXPORTACAO_MS })).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

export function lerTokenExportacao(token: string, agora = Date.now()): { pedidoId: number; criterios: Criterios; formato: 'json' | 'csv' } | null {
  const [corpo, sig] = String(token ?? '').split('.');
  if (!corpo || !sig) return null;
  const a = Buffer.from(assinar(corpo)); const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const x = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    if (typeof x.e !== 'number' || x.e < agora) return null;
    return { pedidoId: Number(x.p), criterios: x.c, formato: x.f === 'csv' ? 'csv' : 'json' };
  } catch { return null; }
}

// ─── Anonimização (simulação + execução idempotente) ────────────────────────
const ANON = 'Titular anonimizado';
const marca = (tabela: string, id: number) => `anon-${createHash('sha256').update(`${tabela}|${id}`).digest('hex').slice(0, 10)}`;

/** O que seria alterado e o que fica retido (não altera nada) */
export async function planejarAnonimizacao(criterios: Criterios) {
  const t = await localizarTitular(criterios);
  const comContrato = new Set(t.vinculosContrato.map((v: any) => v.pessoaId));
  const pessoasLivres = t.pessoas.filter(p => !comContrato.has(p.id));
  const pessoasRetidas = t.pessoas.filter(p => comContrato.has(p.id));
  return {
    t,
    pessoasLivres,
    relatorio: {
      anonimizar: {
        leads: t.leads.length, eventosDosLeads: t.eventos.length, contatos: t.contatos.length, mensagensDeCampanha: t.mensagens.length,
        cadastrosDePessoaSemContrato: pessoasLivres.length, filaDeEspera: t.fila.length, prospeccao: t.prospectos.length,
        convidadosDeEventos: t.convEventos.length, convidadosDeReunioes: t.convReunioes.length,
      },
      retidos: {
        cadastrosDePessoaComContrato: pessoasRetidas.length,
        contratosVinculados: new Set(t.vinculosContrato.map((v: any) => v.contratoId)).size,
        motivo: 'Partes de contrato, cobranças, assinaturas e auditoria financeira ficam retidos por obrigação legal/exercício de direitos (prazo a validar pelo jurídico). Não são alterados por esta rotina.',
      },
      foraDoAlcance: 'Backups do banco, conversas no WhatsApp/Z-API e cópias em fornecedores (Asaas, Cloudinary, Telegram) não são alterados aqui: ver docs/privacidade/retencao-e-direitos.md (reaplicação após restore).',
    },
  };
}

/** Executa a anonimização (idempotente: rodar de novo não encontra mais o titular). Não apaga registros com retenção legal. */
export async function executarAnonimizacao(criterios: Criterios) {
  const { t, pessoasLivres, relatorio } = await planejarAnonimizacao(criterios);
  const d = await db();
  for (const l of t.leads) {
    await d.update(leadQualifications).set({
      nome: ANON, phone: marca('lead', l.id), answers: null, utm: null, consentimento: null, slots: null, tags: null, scoreDetalhe: null,
      instagramUserId: null, metaLeadId: null, discardReason: 'anonimizado_lgpd', tipoEmprego: null, restricaoCPF: null,
    } as any).where(eq(leadQualifications.id, l.id));
  }
  if (t.eventos.length) await d.update(leadEventos).set({ dados: null, visitanteId: null } as any).where(inArray(leadEventos.id, t.eventos.map((e: any) => e.id)));
  for (const x of t.contatos) await d.update(contacts).set({ name: ANON, phone: marca('contato', x.id), email: null } as any).where(eq(contacts.id, x.id));
  if (t.mensagens.length) await d.update(messages).set({ messageText: '[removido — LGPD]', errorMessage: null } as any).where(inArray(messages.id, t.mensagens.map((m: any) => m.id)));
  for (const p of pessoasLivres) {
    await d.update(pessoas).set({
      nome: ANON, nomeSocial: null, cpfCnpj: marca('pessoa', p.id).replace('-', '').slice(0, 14), rg: null, rgOrgao: null, rgUf: null, rgEmissao: null, cnh: null, nascimento: null, naturalidade: null,
      filiacaoMae: null, filiacaoPai: null, profissao: null, empregador: null, rendaMensal: null, email: null, email2: null, telefone1: null, telefone2: null,
      cep: null, logradouro: null, numero: null, complemento: null, bairro: null, lgpdConsentimentoIp: null, lgpdMarketing: false,
    } as any).where(eq(pessoas.id, p.id));
  }
  for (const f of t.fila) await d.update(loteFilaEspera).set({ nome: ANON, telefone: marca('fila', f.id), observacao: null } as any).where(eq(loteFilaEspera.id, f.id));
  for (const p of t.prospectos) {
    await d.update(prospectos).set({ nome: ANON, telefone: null, email: null, endereco: null, instagram: null, site: null, sobre: null, mensagem: null, ultimaResposta: null, observacoes: null, fato: null } as any).where(eq(prospectos.id, p.id));
  }
  for (const v of t.convEventos) await d.update(eventosConvidados).set({ nome: ANON, documento: '—', telefone: null, placa: null } as any).where(eq(eventosConvidados.id, v.id));
  for (const v of t.convReunioes) await d.update(reuniaoConvidados).set({ nome: ANON, telefone: marca('reuniao', v.id) } as any).where(eq(reuniaoConvidados.id, v.id));
  return relatorio;
}
