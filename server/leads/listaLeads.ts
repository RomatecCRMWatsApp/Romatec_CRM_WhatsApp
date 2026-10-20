/**
 * Lista de leads da aba Leads: Nome, Telefone, E-mail e Origem.
 * Vira tabela no painel, PDF para baixar e PDF/texto enviado pelo WhatsApp
 * para um número interno (padrão: o do José) — nunca para os leads.
 */
import { rotuloCanal } from './inbound';
import { telefonesNotificacao } from './config';
import { gerarPdfTabela } from './pdfSimples';
import { normalizePhoneBR } from '../../shared/telefone';

export interface LinhaLead {
  id: number;
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  entrada: string | null; // ISO
  /** Telefone como está no banco (só dígitos) — chave da deduplicação */
  fone?: string;
}

export interface FiltroLista {
  situacao: 'ativos' | 'descartados' | 'todos';
  origem?: string;
  search?: string;
}

/** Origem antiga (campo origem) quando o lead não tem canal de 1º toque */
const ORIGEM_LABEL: Record<string, string> = {
  instagram_ads: 'Anúncio Instagram/Facebook',
  instagram_dm: 'Direct Instagram',
  instagram_bio: 'Link da bio / landing',
  google_ads: 'Google Ads',
  site: 'Site (formulário)',
  indicacao: 'Indicação',
  whatsapp: 'WhatsApp',
  whatsapp_empreendimento: 'WhatsApp',
};

/** "Meta Lead Ads · Condomínio de Chácaras Bom Jardims", "Site (formulário)", "WhatsApp direto"… */
export function origemDoLead(
  lead: { origemCanal?: string | null; origem?: string | null; empreendimentoSlug?: string | null },
  nomesEmp: Record<string, string> = {},
): string {
  const base = lead.origemCanal ? rotuloCanal(lead.origemCanal) : (ORIGEM_LABEL[lead.origem || ''] || lead.origem || 'WhatsApp');
  const slug = lead.empreendimentoSlug;
  return slug ? `${base} · ${nomesEmp[slug] || slug}` : base;
}

export function formatarTelefone(phone: string): string {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return phone;
}

export function dataHoraBR(d: Date = new Date()): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dataBR(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
}

const SEM_NOME = 'Sem nome';
const ORIGEM_GENERICA = 'WhatsApp';

/** Nome para comparar: minúsculo, sem acento e sem espaços extras */
export function nomeNormalizado(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Chave do lead: telefone normalizado; sem telefone, o nome normalizado; sem os dois, o próprio registro */
export function chaveLead(l: Pick<LinhaLead, 'id' | 'nome' | 'telefone' | 'fone'>): string {
  const bruto = String(l.fone ?? l.telefone ?? '').replace(/\D/g, '');
  if (bruto) return `tel:${normalizePhoneBR(bruto) || bruto.replace(/^0+/, '')}`;
  const nome = nomeNormalizado(l.nome || '');
  return nome && nome !== nomeNormalizado(SEM_NOME) ? `nome:${nome}` : `id:${l.id}`;
}

/**
 * Um lead por pessoa: colapsa registros com o mesmo telefone (ou o mesmo nome, se não houver telefone).
 * Fica a entrada mais recente; nome, e-mail e origem vêm do registro mais recente que os tiver.
 */
export function deduplicarLinhas(linhas: LinhaLead[]): LinhaLead[] {
  const grupos = new Map<string, LinhaLead[]>();
  for (const l of linhas) {
    const k = chaveLead(l);
    const g = grupos.get(k);
    if (g) g.push(l); else grupos.set(k, [l]);
  }
  const recente = (a: LinhaLead, b: LinhaLead) => (b.entrada || '').localeCompare(a.entrada || '') || b.id - a.id;
  return Array.from(grupos.values()).map(g => {
    if (g.length === 1) return g[0];
    const ord = [...g].sort(recente);
    const primeiro = (f: (l: LinhaLead) => string | null | undefined, vazio: (v: string) => boolean = v => !v) =>
      ord.map(f).find(v => !!v && !vazio(v));
    return {
      ...ord[0],
      nome: primeiro(l => l.nome?.trim(), v => v === SEM_NOME) || ord[0].nome,
      telefone: primeiro(l => l.telefone) || ord[0].telefone,
      email: primeiro(l => l.email?.trim()) || '',
      origem: primeiro(l => l.origem, v => v === ORIGEM_GENERICA) || ord[0].origem,
      entrada: primeiro(l => l.entrada) || null,
    };
  });
}

/** Filtros por origem (rótulo sem o empreendimento ou com ele) e busca em nome/telefone/e-mail */
export function filtrarLinhas(linhas: LinhaLead[], filtro: Pick<FiltroLista, 'origem' | 'search'>): LinhaLead[] {
  let r = linhas;
  if (filtro.origem) r = r.filter(l => l.origem === filtro.origem || l.origem.startsWith(`${filtro.origem} · `));
  const q = (filtro.search || '').trim().toLowerCase();
  if (q) {
    const digitos = q.replace(/\D/g, '');
    r = r.filter(l => l.nome.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || (digitos.length >= 3 && l.telefone.replace(/\D/g, '').includes(digitos)));
  }
  return r;
}

/** Origens disponíveis para o filtro (rótulo base, sem o empreendimento), ordenadas por quantidade */
export function origensDisponiveis(linhas: LinhaLead[]): { origem: string; total: number }[] {
  const cont = new Map<string, number>();
  for (const l of linhas) {
    const base = l.origem.split(' · ')[0];
    cont.set(base, (cont.get(base) || 0) + 1);
    if (base !== l.origem) cont.set(l.origem, (cont.get(l.origem) || 0) + 1);
  }
  return Array.from(cont.entries()).map(([origem, total]) => ({ origem, total })).sort((a, b) => b.total - a.total || a.origem.localeCompare(b.origem));
}

const SITUACAO_LABEL: Record<FiltroLista['situacao'], string> = { ativos: 'leads ativos', descartados: 'leads descartados', todos: 'todos os leads' };

export function descricaoFiltro(filtro: FiltroLista): string {
  return [SITUACAO_LABEL[filtro.situacao], filtro.origem ? `origem: ${filtro.origem}` : '', filtro.search?.trim() ? `busca: "${filtro.search.trim()}"` : ''].filter(Boolean).join(' · ');
}

export function pdfListaLeads(linhas: LinhaLead[], filtro: FiltroLista, agora = new Date()): Buffer {
  return gerarPdfTabela({
    titulo: 'Lista de leads',
    subtitulo: `${linhas.length} ${linhas.length === 1 ? 'lead' : 'leads'} · ${descricaoFiltro(filtro)} · gerado em ${dataHoraBR(agora)}`,
    rodape: 'Romatec Consultoria Total — documento interno com dados pessoais (LGPD): não compartilhe fora da equipe.',
    colunas: [
      { titulo: '#', largura: 4 },
      { titulo: 'Nome', largura: 24 },
      { titulo: 'Telefone', largura: 16 },
      { titulo: 'E-mail', largura: 24 },
      { titulo: 'Origem', largura: 32 },
      { titulo: 'Entrada', largura: 9 },
    ],
    linhas: linhas.map((l, i) => [String(i + 1), l.nome, l.telefone, l.email || '—', l.origem, dataBR(l.entrada)]),
  });
}

export function nomeArquivoLista(agora = new Date()): string {
  const d = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
  return `leads-romatec-${d}.pdf`;
}

export const MAX_LINHAS_TEXTO = 80;

/** Resumo em texto para o WhatsApp (até MAX_LINHAS_TEXTO leads; o resto fica no PDF) */
export function textoListaLeads(linhas: LinhaLead[], filtro: FiltroLista, agora = new Date()): string {
  const cab = [`📋 *Lista de leads — Romatec*`, `${linhas.length} ${linhas.length === 1 ? 'lead' : 'leads'} · ${descricaoFiltro(filtro)}`, `Gerada em ${dataHoraBR(agora)}`, ''];
  const itens = linhas.slice(0, MAX_LINHAS_TEXTO).map((l, i) => `${i + 1}. *${l.nome}* — ${l.telefone}${l.email ? ` — ${l.email}` : ''}\n    ${l.origem}`);
  const resto = linhas.length > MAX_LINHAS_TEXTO ? ['', `… e mais ${linhas.length - MAX_LINHAS_TEXTO} leads (peça o PDF para a lista completa).`] : [];
  return [...cab, ...(itens.length ? itens : ['Nenhum lead neste filtro.']), ...resto].join('\n');
}

export function legendaPdf(linhas: LinhaLead[], filtro: FiltroLista, agora = new Date()): string {
  return `📋 Lista de leads — Romatec\n${linhas.length} ${linhas.length === 1 ? 'lead' : 'leads'} · ${descricaoFiltro(filtro)}\nGerada em ${dataHoraBR(agora)}`;
}

/** Número que recebe a lista quando o usuário não escolhe outro: o 1º de NOTIFY_PHONES (WhatsApp do José) */
export function telefonePadraoLista(): string {
  return telefonesNotificacao()[0] || '';
}

/** Leads do banco (mesma fonte da aba Leads), já com nome, e-mail e origem resolvidos e ordenados pela entrada */
export async function carregarLinhasLeads(filtro: FiltroLista): Promise<{ linhas: LinhaLead[]; origens: { origem: string; total: number }[] }> {
  const { getDb } = await import('../db');
  const db: any = await getDb();
  if (!db) return { linhas: [], origens: [] };
  const { leadQualifications, contacts, empreendimentos } = await import('../../drizzle/schema');
  const { leadInativo } = await import('./inativo');

  let rows: any[] = await db.select().from(leadQualifications);
  if (filtro.situacao === 'ativos') rows = rows.filter(r => !leadInativo(r));
  else if (filtro.situacao === 'descartados') rows = rows.filter(r => leadInativo(r));

  const contatos: any[] = await db.select({ id: contacts.id, phone: contacts.phone, name: contacts.name, email: contacts.email }).from(contacts);
  const porId = new Map(contatos.map(c => [c.id, c]));
  const porFone = new Map(contatos.map(c => [String(c.phone || '').replace(/\D/g, ''), c]));
  const emps: any[] = await db.select({ slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).catch(() => []);
  const nomesEmp: Record<string, string> = Object.fromEntries(emps.map(e => [e.slug, e.nome]));

  const todas: LinhaLead[] = rows.map(r => {
    const ct = (r.contactId && porId.get(r.contactId)) || porFone.get(String(r.phone || '').replace(/\D/g, ''));
    const answers = (r.answers as any) || {};
    const entrada = r.createdAt ? new Date(r.createdAt) : null;
    return {
      id: r.id,
      nome: String(ct?.name || r.nome || answers.nome || SEM_NOME).trim(),
      telefone: formatarTelefone(normalizePhoneBR(r.phone) || r.phone),
      fone: String(r.phone || '').replace(/\D/g, ''),
      email: String(answers.email || ct?.email || '').trim(),
      origem: origemDoLead(r, nomesEmp),
      entrada: entrada && !isNaN(entrada.getTime()) ? entrada.toISOString() : null,
    };
  });
  // Um lead por telefone (ou nome): tabela, PDF, WhatsApp e contagens já saem sem repetidos
  const unicos = deduplicarLinhas(todas).sort((a, b) => (b.entrada || '').localeCompare(a.entrada || ''));

  return { linhas: filtrarLinhas(unicos, filtro), origens: origensDisponiveis(unicos) };
}
