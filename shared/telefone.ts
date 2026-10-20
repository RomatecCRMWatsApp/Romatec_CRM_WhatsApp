/**
 * Telefone celular BR — mesma regra no painel e no servidor.
 */

/**
 * Normaliza celular BR para o formato que o webhook Z-API entrega: 55 + DDD + 9 + 8 dígitos.
 * Aceita "(99) 9 9181-1246", "099991811246", "+55 99 99181-1246", número antigo sem o 9.
 * Retorna null se não for celular brasileiro válido.
 */
export function normalizePhoneBR(raw: string): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  // Celular antigo sem o 9: 55 + DDD + 8 dígitos começando em 6-9 (fixo começa em 2-5)
  if (d.length === 12 && d.startsWith('55') && /[6-9]/.test(d[4])) d = d.slice(0, 4) + '9' + d.slice(4);
  if (d.length !== 13 || !d.startsWith('55') || d[4] !== '9') return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

/** Máscara enquanto digita: "(99) 99181-1246" ou, com DDI, "+55 (99) 99181-1246" */
export function mascaraTelefoneBR(raw: string): string {
  const todos = String(raw || '').replace(/\D/g, '');
  const comDdi = todos.length > 11 || (String(raw || '').trim().startsWith('+') && todos.startsWith('55'));
  const ddi = comDdi ? todos.slice(0, 2) : '';
  const d = (comDdi ? todos.slice(2) : todos).slice(0, 11);
  // ") " só depois do 3º dígito: senão o backspace trava no parêntese
  let r = '';
  if (d.length > 0) r = `(${d.slice(0, 2)}`;
  if (d.length > 2) r += `) ${d.length > 10 ? `${d.slice(2, 7)}-${d.slice(7)}` : d.length > 6 ? `${d.slice(2, 6)}-${d.slice(6)}` : d.slice(2)}`;
  return ddi ? `+${ddi} ${r}`.trimEnd() : r;
}

/** "5599991811246" → "+55 (99) 99181-1246" */
export function exibirTelefoneBR(normalizado: string): string {
  const n = String(normalizado || '').replace(/\D/g, '');
  return n.length === 13 ? `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}` : normalizado;
}
