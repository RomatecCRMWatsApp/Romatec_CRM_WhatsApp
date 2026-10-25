/**
 * Cadastro completo do cliente (tela Clientes): o contato (nome, telefone, e-mail) e, com CPF, a ficha da pessoa —
 * a MESMA tabela de pessoas dos contratos (uma por CPF). Assim, quando esse cliente comprar, o contrato já sai preenchido.
 */
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { contacts, pessoas } from '../drizzle/schema';
import { normalizePhoneBR } from '../shared/telefone';
import { cpfValido, type PessoaForm } from '../shared/contratos';
import { salvarPessoa } from './contratos/servico';

export class CadastroErro extends Error { constructor(msg: string) { super(msg); this.name = 'CadastroErro'; } }

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
/** Telefone sem DDI, para comparar formatos diferentes (+55 99 9…, (99) 9…, 5599…) */
const final11 = (v: unknown) => digitos(v).slice(-11);
const iso = (v: unknown) => (v == null || v === '' ? '' : String(v instanceof Date ? v.toISOString() : v).slice(0, 10));

/** Ficha da pessoa ligada ao contato (pelo telefone) — para abrir o formulário de edição */
export async function cadastroDoContato(id: number): Promise<{ contato: { id: number; name: string; phone: string; email: string | null }; pessoa: PessoaForm | null }> {
  const d: any = await getDb();
  if (!d) throw new CadastroErro('Banco indisponível');
  const [c] = await d.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!c) throw new CadastroErro('Contato não encontrado');
  const alvo = final11(c.phone);
  const todas: any[] = alvo.length >= 10 ? await d.select().from(pessoas) : [];
  const p = todas.find(x => final11(x.telefone1) === alvo) ?? null;
  return {
    contato: { id: c.id, name: c.name, phone: c.phone, email: c.email ?? null },
    pessoa: p ? {
      nome: p.nome ?? '', cpf: p.cpfCnpj ?? '', sexo: p.sexo ?? '', nacionalidade: p.nacionalidade ?? 'brasileira', estadoCivil: p.estadoCivil ?? '',
      regimeBens: p.regimeBens ?? '', pactoAntenupcial: p.pactoAntenupcial ?? '', profissao: p.profissao ?? '', nascimento: iso(p.nascimento),
      rg: p.rg ?? '', rgOrgao: p.rgOrgao ?? '', rgUf: p.rgUf ?? '', email: p.email ?? '', telefone1: p.telefone1 ?? '', cep: p.cep ?? '',
      logradouro: p.logradouro ?? '', numero: p.numero ?? '', complemento: p.complemento ?? '', bairro: p.bairro ?? '', cidade: p.cidade ?? '', uf: p.uf ?? '',
    } : null,
  };
}

/**
 * Cria ou atualiza o contato e, se houver CPF, a ficha completa. Sem CPF, só o contato (como antes).
 * Nome e telefone obrigatórios; CPF, quando preenchido, tem de ser válido.
 */
export async function salvarContatoCompleto(id: number | null, p: PessoaForm): Promise<{ id: number; ficha: boolean }> {
  const d: any = await getDb();
  if (!d) throw new CadastroErro('Banco indisponível');
  const nome = String(p.nome ?? '').trim();
  if (!nome) throw new CadastroErro('Informe o nome');
  const tel = normalizePhoneBR(String(p.telefone1 ?? ''));
  if (!tel) throw new CadastroErro('Telefone inválido — use o celular com DDD (WhatsApp)');
  const phone = `+${tel}`;
  const email = String(p.email ?? '').trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CadastroErro('E-mail inválido');
  const cpf = digitos(p.cpf);
  if (cpf && !cpfValido(cpf)) throw new CadastroErro('CPF inválido');

  // Telefone é único na tabela de contatos: outro contato com o mesmo número não pode ser sobrescrito
  const todos: any[] = await d.select({ id: contacts.id, phone: contacts.phone }).from(contacts);
  const outro = todos.find(c => final11(c.phone) === final11(phone) && c.id !== id);
  if (outro) throw new CadastroErro('Já existe um contato com este telefone');

  let contatoId = id;
  if (id) await d.update(contacts).set({ name: nome, phone, email, updatedAt: new Date() }).where(eq(contacts.id, id));
  else {
    await d.insert(contacts).values({ name: nome, phone, email, status: 'active', createdAt: new Date(), updatedAt: new Date() });
    const [novo] = await d.select({ id: contacts.id }).from(contacts).where(eq(contacts.phone, phone)).limit(1);
    contatoId = novo?.id ?? null;
  }
  if (!contatoId) throw new CadastroErro('Não foi possível salvar o contato');
  if (cpf) await salvarPessoa({ ...p, nome, cpf, telefone1: tel.slice(-11), email: email ?? '' }, null);
  return { id: contatoId, ficha: !!cpf };
}
