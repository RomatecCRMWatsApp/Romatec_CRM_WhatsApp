/**
 * Relatórios fotográficos — regras puras compartilhadas (tela e servidor).
 * O relatório é um REGISTRO DE ATIVIDADE: não é laudo, prova pericial, medição de geometria nem documento jurídico.
 */
export const TIPOS_ATIVIDADE = ['visita', 'vistoria', 'obra', 'reuniao', 'outros'] as const;
export type TipoAtividade = typeof TIPOS_ATIVIDADE[number];
export const ROTULO_TIPO_ATIVIDADE: Record<TipoAtividade, string> = {
  visita: 'Visita', vistoria: 'Vistoria', obra: 'Acompanhamento de obra', reuniao: 'Reunião', outros: 'Outros',
};
export type StatusRelatorio = 'draft' | 'final';
export const ROTULO_STATUS: Record<StatusRelatorio, string> = { draft: 'Rascunho', final: 'Final' };

export const ORIGENS_CAPTURA = ['camera', 'gallery', 'desktop_upload', 'other'] as const;
export type OrigemCaptura = typeof ORIGENS_CAPTURA[number];

/** Limites revisáveis (spec: até 30 fotos por relatório e 15 MB por arquivo) */
export const MAX_FOTOS_RELATORIO = 30;
export const MAX_BYTES_FOTO = 15 * 1024 * 1024;
export const MIMES_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const AVISO_REGISTRO =
  'Registro de atividade elaborado a partir de fotos enviadas por usuário autorizado. Não constitui laudo, prova pericial, atestado de local, medição de geometria nem documento jurídico.';

/** Quem trabalha com relatórios: administrador, secretária e corretor. Empreendedor e jurídico não. */
export function podeUsarRelatorios(perfil: string | null | undefined): boolean {
  return perfil === 'admin' || perfil === 'secretario' || perfil === 'corretor';
}
/** Administrador e secretária veem todos; o corretor vê os relatórios em que é responsável ou autor */
export function podeVerRelatorio(perfil: string | null | undefined, userId: number, r: { responsavelUserId: number; criadoPor: number }): boolean {
  if (perfil === 'admin' || perfil === 'secretario') return true;
  if (perfil === 'corretor') return r.responsavelUserId === userId || r.criadoPor === userId;
  return false;
}
/** Editar só rascunho, e só quem pode vê-lo */
export function podeEditarRelatorio(perfil: string | null | undefined, userId: number, r: { status: string; responsavelUserId: number; criadoPor: number }): boolean {
  return r.status === 'draft' && podeVerRelatorio(perfil, userId, r);
}

/** "RF-2026-0007" */
export const numeroRelatorio = (ano: number, seq: number) => `RF-${ano}-${String(seq).padStart(4, '0')}`;

/** Ordem nova após mover uma foto para cima/baixo (lista de ids na ordem atual) */
export function moverNaLista<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const alvo = indice + direcao;
  if (indice < 0 || indice >= lista.length || alvo < 0 || alvo >= lista.length) return lista.slice();
  const nova = lista.slice();
  [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
  return nova;
}

/** Data AAAA-MM-DD válida e não absurda (não infere data: só valida a declarada pelo usuário) */
export function dataAtividadeValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100;
}

export const dataBr = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');
