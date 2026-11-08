/**
 * Filtro "mesmo telefone" para as consultas de leads e contatos: casa o número em qualquer forma gravada
 * (com/sem o 9, com/sem "+"). Evita lead duplicado quando a mesma pessoa chega por canais diferentes
 * (ex.: WhatsApp sem o 9 e formulário do Meta com o 9).
 */
import { inArray, type SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';
import { variantesTelefoneBR } from '../../shared/telefone';

export function mesmoTelefone(coluna: AnyColumn, telefone: string): SQL {
  const formas = variantesTelefoneBR(telefone);
  return inArray(coluna, formas.length ? formas : ['']);
}
