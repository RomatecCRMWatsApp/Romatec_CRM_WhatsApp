/**
 * Clientes (tabela contacts, tela Clientes): toda pessoa cadastrada num contrato (comprador, cônjuge) entra na lista,
 * casada pelo telefone. Já existe o contato (ex.: veio do WhatsApp com apelido)? Fica com o nome do cadastro e ganha o
 * e-mail se não tinha. Roda ao salvar a pessoa no contrato, ao corrigir o número na assinatura e uma vez na subida.
 */
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { contacts, contratoPessoas, pessoas } from '../../drizzle/schema';
import { telefoneWhatsApp } from '../../shared/contratos';

/** Chave do telefone: DDD + número, sem o 55 (casa "+5599991234567", "99 99123-4567"…) */
export const chaveTelefone = (t: string | null | undefined): string | null => {
  const w = telefoneWhatsApp(t);
  return w ? w.replace(/^55/, '') : null;
};

export interface PessoaCliente { nome: string; telefone1?: string | null; email?: string | null }
export interface ContatoExistente { id: number; name: string; phone: string; email?: string | null }

/** O que fazer com uma pessoa: inserir, atualizar (nome/e-mail) ou nada */
export function planoDoCliente(p: PessoaCliente, existentes: Map<string, ContatoExistente>):
  { tipo: 'inserir'; dados: { name: string; phone: string; email: string | null } } | { tipo: 'atualizar'; id: number; dados: { name?: string; email?: string } } | { tipo: 'nada' } {
  const chave = chaveTelefone(p.telefone1);
  const nome = String(p.nome ?? '').trim().replace(/\s+/g, ' ');
  if (!chave || nome.length < 3) return { tipo: 'nada' };
  const email = String(p.email ?? '').trim() || null;
  const c = existentes.get(chave);
  if (!c) return { tipo: 'inserir', dados: { name: nome.slice(0, 255), phone: `+55${chave}`, email } };
  const dados: { name?: string; email?: string } = {};
  if (c.name !== nome) dados.name = nome.slice(0, 255);
  if (!c.email && email) dados.email = email;
  return Object.keys(dados).length ? { tipo: 'atualizar', id: c.id, dados } : { tipo: 'nada' };
}

async function aplicar(lista: PessoaCliente[]): Promise<{ inseridos: number; atualizados: number }> {
  const d = (await getDb()) as any;
  if (!d || !lista.length) return { inseridos: 0, atualizados: 0 };
  const todos: ContatoExistente[] = await d.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email }).from(contacts);
  const mapa = new Map<string, ContatoExistente>();
  for (const c of todos) { const k = chaveTelefone(c.phone); if (k && !mapa.has(k)) mapa.set(k, c); }
  let inseridos = 0, atualizados = 0;
  for (const p of lista) {
    const plano = planoDoCliente(p, mapa);
    try {
      if (plano.tipo === 'inserir') {
        await d.insert(contacts).values({ ...plano.dados, status: 'active' });
        const [novo] = await d.select({ id: contacts.id }).from(contacts).where(eq(contacts.phone, plano.dados.phone)).limit(1);
        mapa.set(chaveTelefone(plano.dados.phone)!, { id: Number(novo?.id ?? 0), name: plano.dados.name, phone: plano.dados.phone, email: plano.dados.email });
        inseridos++;
      } else if (plano.tipo === 'atualizar') {
        await d.update(contacts).set(plano.dados).where(eq(contacts.id, plano.id));
        const c = Array.from(mapa.values()).find(x => x.id === plano.id);
        if (c) Object.assign(c, plano.dados);
        atualizados++;
      }
    } catch (e: any) { console.warn('[Clientes] sincronizar:', e?.message ?? e); }
  }
  return { inseridos, atualizados };
}

/** Uma pessoa (ao salvar no contrato) */
export async function sincronizarPessoa(pessoaId: number) {
  const d = (await getDb()) as any;
  if (!d) return { inseridos: 0, atualizados: 0 };
  const ps: any[] = await d.select({ nome: pessoas.nome, telefone1: pessoas.telefone1, email: pessoas.email }).from(pessoas).where(eq(pessoas.id, pessoaId)).limit(1);
  return aplicar(ps);
}

/** As pessoas de um contrato */
export async function sincronizarClientesDoContrato(contratoId: number) {
  const d = (await getDb()) as any;
  if (!d) return { inseridos: 0, atualizados: 0 };
  const ids = ((await d.select({ id: contratoPessoas.pessoaId }).from(contratoPessoas).where(eq(contratoPessoas.contratoId, contratoId))) as any[]).map(x => Number(x.id));
  if (!ids.length) return { inseridos: 0, atualizados: 0 };
  return aplicar(await d.select({ nome: pessoas.nome, telefone1: pessoas.telefone1, email: pessoas.email }).from(pessoas).where(inArray(pessoas.id, ids)));
}

/** Todas as pessoas de contratos (migração na subida do servidor; idempotente) */
export async function sincronizarTodosClientes() {
  const d = (await getDb()) as any;
  if (!d) return { inseridos: 0, atualizados: 0 };
  const ids = Array.from(new Set(((await d.select({ id: contratoPessoas.pessoaId }).from(contratoPessoas)) as any[]).map(x => Number(x.id))));
  if (!ids.length) return { inseridos: 0, atualizados: 0 };
  const r = await aplicar(await d.select({ nome: pessoas.nome, telefone1: pessoas.telefone1, email: pessoas.email }).from(pessoas).where(inArray(pessoas.id, ids)));
  if (r.inseridos || r.atualizados) console.log(`[Clientes] contratos → clientes: ${r.inseridos} novo(s), ${r.atualizados} atualizado(s)`);
  return r;
}
