/**
 * Máscaras e validação de documentos (cadastro de usuário/cônjuge). No banco vai só dígitos;
 * a máscara é só de exibição. Aceita colar texto formatado ou cru.
 */
export const onlyDigits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export function maskCPF(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function isValidCPF(v: string | null | undefined): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** RG: só dígitos e "X" (o DV de alguns estados), até 14 caracteres */
export function cleanRG(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/[^0-9X]/g, '').slice(0, 14);
}

/** RG: último caractere é o DV (com hífen); o resto em grupos de 3 da direita para a esquerda */
export function maskRG(v: string): string {
  const c = cleanRG(v);
  if (c.length < 2) return c;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}-${dv}`;
}

export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)(\d{4})(\d{0,4})$/, '($1) $2 $3-$4');
}

export function maskCEP(v: string): string {
  return onlyDigits(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}

/**
 * Cursor depois de aplicar a máscara: mantém a mesma quantidade de caracteres "úteis" (dígitos/X)
 * antes do cursor que havia no texto digitado — editar no meio não joga o cursor para o fim.
 */
export function cursorDepoisDaMascara(digitado: string, cursor: number, mascarado: string): number {
  const util = (c: string) => /[0-9X]/i.test(c);
  let uteis = 0;
  for (let i = 0; i < Math.min(cursor, digitado.length); i++) if (util(digitado[i])) uteis++;
  if (uteis === 0) return 0;
  for (let i = 0, vistos = 0; i < mascarado.length; i++) {
    if (util(mascarado[i])) vistos++;
    if (vistos === uteis) return i + 1;
  }
  return mascarado.length;
}
