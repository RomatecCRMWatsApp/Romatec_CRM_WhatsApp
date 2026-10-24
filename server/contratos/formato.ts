/** Formatação dos valores no texto do contrato (pt-BR, por extenso) */
import extensoLib from 'extenso';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 1234.5 → "1.234,50" */
export const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 0.06 → "6,00%" */
export const pct = (v: number, d = 2) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
/** "2026-11-10" → "10/11/2026" */
export const dataBR = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
/** "2026-11-10" → "10 de novembro de 2026" */
export function dataExtenso(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
/** Data local de hoje em "AAAA-MM-DD" */
export function hojeIso(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** 6 → "seis" */
export const extenso = (n: number) => extensoLib(String(n));
/** 160000 → "cento e sessenta mil reais" */
export const reaisExtenso = (v: number) => extensoLib(v.toFixed(2), { mode: 'currency' });
/** 3025.11 → "três mil e vinte e cinco metros quadrados e onze decímetros quadrados" */
export function areaExtenso(m2: number): string {
  const int = Math.floor(m2), dec = Math.round((m2 - int) * 100);
  return `${extenso(int)} metros quadrados` + (dec ? ` e ${extenso(dec)} decímetros quadrados` : '');
}

/** CPF/CNPJ só dígitos → com máscara */
export function docMascara(d: string | null | undefined): string {
  const s = String(d ?? '').replace(/\D/g, '');
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return String(d ?? '');
}
