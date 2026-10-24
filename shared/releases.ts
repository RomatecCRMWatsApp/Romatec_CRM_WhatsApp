/**
 * Notas de versão (RELEASE_NOTES.md → tabela systemRelease): leitura do arquivo, comparação semver
 * e validação. Puro — usado pelo script `npm run release`, pelo servidor (importa ao subir) e pela
 * tela "Publicar atualização" do admin.
 */

export const TIPOS_RELEASE = ['major', 'minor', 'patch'] as const;
export type TipoRelease = typeof TIPOS_RELEASE[number];
export const PUBLICOS_RELEASE = ['todos', 'admin', 'secretario', 'corretor', 'empreendedor'] as const;
export type PublicoRelease = typeof PUBLICOS_RELEASE[number];

export interface ItensRelease { novo: string[]; melhorias: string[]; correcoes: string[]; avisos: string[] }
export const SECOES_RELEASE: { chave: keyof ItensRelease; rotulo: string; cor: string; icone: string }[] = [
  { chave: 'novo', rotulo: 'Novo', cor: '#2BD47A', icone: '🟢' },
  { chave: 'melhorias', rotulo: 'Melhorias', cor: '#5AA9E6', icone: '🔵' },
  { chave: 'correcoes', rotulo: 'Correções', cor: '#F2A25C', icone: '🟠' },
  { chave: 'avisos', rotulo: 'Avisos', cor: '#F2785C', icone: '🔴' },
];
const SECAO_POR_NOME: Record<string, keyof ItensRelease> = { novo: 'novo', melhorias: 'melhorias', correcoes: 'correcoes', 'correções': 'correcoes', avisos: 'avisos' };

export interface Release {
  versao: string; data: string; tipo: TipoRelease; obrigatoria: boolean; titulo: string; publico: PublicoRelease; itens: ItensRelease;
}

export const SEMVER = /^\d+\.\d+\.\d+$/;

/** < 0 se a < b, 0 se iguais, > 0 se a > b */
export function compararVersao(a: string, b: string): number {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

export const totalItens = (i: ItensRelease) => i.novo.length + i.melhorias.length + i.correcoes.length + i.avisos.length;

/** Um bloco "## 1.7.0 — 2026-10-24" do RELEASE_NOTES.md */
function lerBloco(bloco: string): Release {
  const linhas = bloco.split(/\r?\n/);
  const head = linhas[0].trim().match(/^(\d+\.\d+\.\d+)\s*[—–-]\s*(\d{4}-\d{2}-\d{2})/);
  if (!head) throw new Error(`Cabeçalho inválido: "## ${linhas[0].trim()}". Use: ## 1.7.0 — 2026-10-24`);
  const meta: Record<string, string> = {};
  const itens: ItensRelease = { novo: [], melhorias: [], correcoes: [], avisos: [] };
  let secao: keyof ItensRelease | null = null;
  for (const raw of linhas.slice(1)) {
    const l = raw.trim();
    if (!l) continue;
    const s = l.match(/^###\s+(.+)$/);
    if (s) { secao = SECAO_POR_NOME[s[1].toLowerCase().trim()] ?? null; continue; }
    if (l.startsWith('- ') && secao) { itens[secao].push(l.slice(2).trim()); continue; }
    const m = l.match(/^(tipo|obrigatoria|obrigatória|titulo|título|publico|público):\s*(.+)$/i);
    if (m) meta[m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] = m[2].trim();
  }
  if (!totalItens(itens)) throw new Error(`Versão ${head[1]} sem itens (Novo / Melhorias / Correções / Avisos)`);
  return {
    versao: head[1], data: head[2],
    tipo: (TIPOS_RELEASE as readonly string[]).includes(meta.tipo) ? meta.tipo as TipoRelease : 'patch',
    obrigatoria: /^s(im)?$/i.test(meta.obrigatoria ?? ''),
    titulo: (meta.titulo || `Atualização ${head[1]}`).slice(0, 150),
    publico: (PUBLICOS_RELEASE as readonly string[]).includes(meta.publico) ? meta.publico as PublicoRelease : 'todos',
    itens,
  };
}

/** Todas as versões do arquivo, da mais nova (topo) para a mais antiga */
export function lerReleaseNotes(md: string): Release[] {
  // "## " seguido de número é versão (cabeçalho errado dá erro, não some em silêncio)
  const blocos = md.split(/^## /m).slice(1).filter(b => /^\d/.test(b.trim()));
  if (!blocos.length) throw new Error('RELEASE_NOTES.md sem nenhuma versão (## 1.7.0 — 2026-10-24)');
  return blocos.map(lerBloco);
}

/** Problema na release publicada pela tela do admin (ou null) */
export function problemaRelease(r: { versao: string; titulo: string; itens: ItensRelease }, versaoAtual?: string | null): string | null {
  if (!SEMVER.test(r.versao)) return 'Versão no formato 1.7.1';
  if (versaoAtual && compararVersao(r.versao, versaoAtual) <= 0) return `A versão precisa ser maior que ${versaoAtual}`;
  if (!r.titulo.trim()) return 'Informe o título';
  if (!totalItens(r.itens)) return 'Inclua pelo menos um item';
  return null;
}

/** Quem vê a release (publico = todos ou o perfil da pessoa) */
export const releaseParaPerfil = (publico: string, perfil: string | null) => publico === 'todos' || publico === perfil;

/** Tempo da tela de descanso (minutos; 0 = desativada) */
export const OPCOES_DESCANSO = [0, 1, 3, 5, 10, 15] as const;
export const DESCANSO_PADRAO = 3;
