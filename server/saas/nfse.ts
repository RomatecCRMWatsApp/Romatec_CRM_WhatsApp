/**
 * Camada SaaS — NFS-e em fila. Toda fatura PAGA entra como PENDENTE com o tomador congelado no momento do pagamento
 * (nome, CPF, e-mail, endereço do cadastro). Emissão: pela Spedy (server/saas/spedy.ts — ENVIADA → EMITIDA ou
 * REJEITADA) ou fora, no portal da prefeitura, com o administrador marcando como emitida com o número.
 * Fatura estornada com nota ainda pendente: a nota é cancelada sozinha; já emitida, fica sinalizada para cancelar na prefeitura.
 */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import { empreendimentos, saasAssinaturas, saasConfig, saasFaturas, saasNfse, saasPlanos, users } from '../../drizzle/schema';

export class NfseErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'NfseErro'; } }

/** LC 116, item 1.05 — licenciamento/cessão de uso de programa de computador (confirmar com a contabilidade; editável em saasConfig.nfse_item) */
export const ITEM_SERVICO_PADRAO = '1.05';

const banco = async () => {
  const d = await getDb();
  if (!d) throw new NfseErro('Banco indisponível', 503);
  return d as any;
};
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const mesAno = (c: string) => { const [y, m] = c.split('-'); return `${m}/${y}`; };

async function itemServico(d: any): Promise<string> {
  const [c]: any[] = await d.select().from(saasConfig).where(eq(saasConfig.chave, 'nfse_item')).limit(1);
  return String(c?.valor ?? '').trim() || ITEM_SERVICO_PADRAO;
}

export function enderecoDe(u: any): string | null {
  const l1 = [u.enderecoLogradouro, u.enderecoNumero].filter(Boolean).join(', ');
  const partes = [l1, u.enderecoComplemento, u.enderecoBairro, [u.enderecoCidade, u.enderecoUf].filter(Boolean).join('/'), u.enderecoCep ? `CEP ${u.enderecoCep}` : ''].filter(Boolean);
  return partes.length ? partes.join(' — ').slice(0, 300) : null;
}

/**
 * Coloca na fila as faturas PAGAS ainda sem nota e cancela as pendentes de faturas estornadas. Idempotente
 * (UNIQUE por fatura); roda logo após cada pagamento e na rotina de cobrança, então nada fica de fora.
 */
export async function sincronizarFilaNfse(agora = Date.now()): Promise<{ criadas: number; canceladas: number }> {
  const d = await banco();
  let criadas = 0, canceladas = 0;
  const pagas: any[] = await d.select().from(saasFaturas).where(and(eq(saasFaturas.status, 'PAGA'), isNull(saasFaturas.nfseId)));
  if (pagas.length) {
    const item = await itemServico(d);
    const as: any[] = await d.select().from(saasAssinaturas).where(inArray(saasAssinaturas.id, Array.from(new Set(pagas.map(f => f.assinaturaId)))));
    const A = new Map(as.map(a => [a.id, a]));
    const us: any[] = as.length ? await d.select().from(users).where(inArray(users.id, Array.from(new Set(as.map(a => a.usuarioId))))) : [];
    const U = new Map(us.map(u => [u.id, u]));
    const ps: any[] = await d.select().from(saasPlanos);
    const P = new Map(ps.map(p => [p.id, p]));
    const empIds = Array.from(new Set(as.map(a => a.empreendimentoId).filter(Boolean)));
    const es: any[] = empIds.length ? await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos).where(inArray(empreendimentos.id, empIds)) : [];
    const E = new Map(es.map(e => [e.id, e.nome]));
    for (const f of pagas) {
      const a = A.get(f.assinaturaId);
      if (!a) continue;
      const u = U.get(a.usuarioId) ?? {};
      const plano = P.get(a.planoId);
      const emp = a.empreendimentoId ? E.get(a.empreendimentoId) : null;
      // Fatura de upgrade (competência U+AAMMDD): diferença proporcional do plano novo até o fim do período já pago
      const novoPlano = f.upgradePlanoId ? P.get(Number(f.upgradePlanoId)) : null;
      const discriminacao = f.upgradePlanoId
        ? `Licença de uso do software Romatec CRM — upgrade para o plano ${novoPlano?.nome ?? plano?.nome ?? 'superior'} (diferença proporcional até o fim do período vigente)${emp ? ` — ${emp}` : ''}, pago em ${new Date(f.pagoEm ?? agora).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}.`
        : `Licença de uso do software Romatec CRM — plano ${plano?.nome ?? 'assinatura'}${a.ciclo === 'ANUAL' ? ' (anual)' : ''}${emp ? ` — ${emp}` : ''}, competência ${mesAno(f.competencia)}.`;
      const [ja]: any[] = await d.select({ id: saasNfse.id }).from(saasNfse).where(eq(saasNfse.faturaId, f.id)).limit(1);
      let id = ja?.id;
      if (!id) {
        const r: any = await d.insert(saasNfse).values({
          faturaId: f.id, assinaturaId: a.id, usuarioId: a.usuarioId, status: 'PENDENTE', competencia: f.competencia, valor: String(f.valor),
          itemServico: item, discriminacao: discriminacao.slice(0, 500), tomadorNome: String(u.name ?? 'Assinante').slice(0, 160),
          tomadorDoc: soDig(u.cpf) || null, tomadorEmail: u.email ?? null, tomadorTelefone: u.telefone ?? null, tomadorEndereco: enderecoDe(u),
          createdAt: new Date(agora), updatedAt: new Date(agora),
        } as any);
        id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
        if (!id) { const [n]: any[] = await d.select({ id: saasNfse.id }).from(saasNfse).where(eq(saasNfse.faturaId, f.id)).limit(1); id = n?.id; }
        criadas++;
      }
      if (id) await d.update(saasFaturas).set({ nfseId: id } as any).where(eq(saasFaturas.id, f.id));
    }
  }
  // Estornadas: pendente → cancelada; emitida → sinaliza para cancelar na prefeitura
  const estornadas: any[] = await d.select({ id: saasFaturas.id }).from(saasFaturas).where(eq(saasFaturas.status, 'ESTORNADA'));
  if (estornadas.length) {
    const notas: any[] = await d.select().from(saasNfse).where(inArray(saasNfse.faturaId, estornadas.map(f => f.id)));
    for (const n of notas) {
      if (n.status === 'PENDENTE') {
        await d.update(saasNfse).set({ status: 'CANCELADA', observacao: 'Pagamento estornado antes da emissão', updatedAt: new Date(agora) } as any).where(eq(saasNfse.id, n.id));
        canceladas++;
      } else if (['EMITIDA', 'ENVIADA'].includes(n.status) && !String(n.observacao ?? '').startsWith('ESTORNO')) {
        await d.update(saasNfse).set({ observacao: `ESTORNO: pagamento estornado — cancelar esta nota ${n.provedor === 'spedy' ? 'na Spedy' : 'no portal da prefeitura'}`, updatedAt: new Date(agora) } as any).where(eq(saasNfse.id, n.id));
      }
    }
  }
  return { criadas, canceladas };
}

export type StatusNfse = 'PENDENTE' | 'ENVIADA' | 'EMITIDA' | 'REJEITADA' | 'CANCELADA';

export async function listarNfse(status?: StatusNfse) {
  const d = await banco();
  const q = d.select().from(saasNfse);
  const linhas: any[] = await (status ? q.where(eq(saasNfse.status, status)) : q).orderBy(desc(saasNfse.id)).limit(500);
  const fs: any[] = linhas.length ? await d.select({ id: saasFaturas.id, metodo: saasFaturas.metodo, pagoEm: saasFaturas.pagoEm, modo: saasFaturas.modo }).from(saasFaturas).where(inArray(saasFaturas.id, linhas.map(n => n.faturaId))) : [];
  const F = new Map(fs.map(f => [f.id, f]));
  return linhas.map(n => ({
    ...n, valor: Number(n.valor), metodo: F.get(n.faturaId)?.metodo ?? null, pagoEm: F.get(n.faturaId)?.pagoEm ?? null, modo: F.get(n.faturaId)?.modo ?? null,
    faltaCadastro: !n.tomadorDoc || !n.tomadorEndereco,
  }));
}

/** Nota emitida no portal da prefeitura: grava o número (e o código de verificação, se houver) */
export async function marcarEmitida(id: number, p: { numero: string; codigoVerificacao?: string | null }, autorId: number, agora = Date.now()) {
  const numero = p.numero.trim();
  if (!numero) throw new NfseErro('Informe o número da NFS-e');
  const d = await banco();
  const [n]: any[] = await d.select().from(saasNfse).where(eq(saasNfse.id, id)).limit(1);
  if (!n) throw new NfseErro('Nota não encontrada', 404);
  if (n.status !== 'PENDENTE') throw new NfseErro('Só nota pendente pode ser marcada como emitida');
  await d.update(saasNfse).set({ status: 'EMITIDA', numero: numero.slice(0, 30), codigoVerificacao: p.codigoVerificacao?.trim().slice(0, 60) || null, emitidaEm: new Date(agora), emitidaPor: autorId, updatedAt: new Date(agora) } as any).where(eq(saasNfse.id, id));
  return { ok: true as const };
}

/** Atualiza o tomador de uma nota pendente com o cadastro atual da pessoa (quando faltava CPF/endereço no pagamento) */
export async function atualizarTomador(id: number, agora = Date.now()) {
  const d = await banco();
  const [n]: any[] = await d.select().from(saasNfse).where(eq(saasNfse.id, id)).limit(1);
  if (!n) throw new NfseErro('Nota não encontrada', 404);
  if (n.status !== 'PENDENTE') throw new NfseErro('Só nota pendente pode ser atualizada');
  const [u]: any[] = await d.select().from(users).where(eq(users.id, n.usuarioId)).limit(1);
  if (!u) throw new NfseErro('Pessoa não encontrada', 404);
  await d.update(saasNfse).set({ tomadorNome: String(u.name ?? n.tomadorNome).slice(0, 160), tomadorDoc: soDig(u.cpf) || null, tomadorEmail: u.email ?? null, tomadorTelefone: u.telefone ?? null, tomadorEndereco: enderecoDe(u), updatedAt: new Date(agora) } as any).where(eq(saasNfse.id, id));
  return { ok: true as const };
}

export async function cancelarNfse(id: number, motivo: string, agora = Date.now()) {
  if (!motivo?.trim()) throw new NfseErro('Informe o motivo');
  const d = await banco();
  const [n]: any[] = await d.select().from(saasNfse).where(eq(saasNfse.id, id)).limit(1);
  if (!n) throw new NfseErro('Nota não encontrada', 404);
  if (n.status === 'CANCELADA') return { ok: true as const };
  // Nota que passou pela Spedy: o cancelamento é lá (a prefeitura precisa saber); aqui só a pendente/rejeitada
  if (n.provedor === 'spedy' && ['ENVIADA', 'EMITIDA'].includes(n.status)) throw new NfseErro('Nota enviada pela Spedy: cancele no painel da Spedy; o status volta para cá pelo webhook', 409);
  await d.update(saasNfse).set({ status: 'CANCELADA', observacao: motivo.trim().slice(0, 300), updatedAt: new Date(agora) } as any).where(eq(saasNfse.id, id));
  return { ok: true as const };
}

/** CSV (separador ;) para a contabilidade ou para lançar no portal da prefeitura */
export async function exportarCsv(status?: StatusNfse): Promise<string> {
  const linhas = await listarNfse(status);
  const cel = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['id', 'status', 'competencia', 'valor', 'item_servico', 'tomador', 'cpf_cnpj', 'email', 'telefone', 'endereco', 'discriminacao', 'pago_em', 'numero_nfse', 'emitida_em'];
  const corpo = linhas.map(n => [n.id, n.status, n.competencia, n.valor.toFixed(2).replace('.', ','), n.itemServico, n.tomadorNome, n.tomadorDoc, n.tomadorEmail, n.tomadorTelefone, n.tomadorEndereco,
    n.discriminacao, n.pagoEm ? new Date(n.pagoEm).toISOString().slice(0, 10) : '', n.numero, n.emitidaEm ? new Date(n.emitidaEm).toISOString().slice(0, 10) : ''].map(cel).join(';'));
  return '﻿' + [cab.join(';'), ...corpo].join('\r\n');
}
