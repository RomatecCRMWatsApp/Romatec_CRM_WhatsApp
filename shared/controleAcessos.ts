/**
 * Controle de acessos dos corretores (escritório: administrador e secretária): quem está ativo, quem está pago e
 * quem está de fato usando o sistema. Regras puras, usadas no servidor e na tela.
 */

/** Uso do sistema pelo último acesso (users.lastSignedIn é atualizado a cada uso, não só no login) */
export const USO = ['usando', 'pouco', 'parado', 'nunca'] as const;
export type SituacaoUso = typeof USO[number];
export const DIAS_USANDO = 3;
export const DIAS_POUCO_USO = 15;

export const ROTULO_USO: Record<SituacaoUso, string> = {
  usando: 'Usando',
  pouco: 'Pouco uso',
  parado: 'Parado',
  nunca: 'Nunca entrou',
};
export const DICA_USO: Record<SituacaoUso, string> = {
  usando: `Entrou nos últimos ${DIAS_USANDO} dias`,
  pouco: `Último acesso entre ${DIAS_USANDO + 1} e ${DIAS_POUCO_USO} dias`,
  parado: `Sem acesso há mais de ${DIAS_POUCO_USO} dias`,
  nunca: 'Ainda não entrou no sistema',
};

const DIA_MS = 86_400_000;

export function situacaoDeUso(ultimoAcesso: Date | string | number | null | undefined, agora = Date.now()): SituacaoUso {
  if (!ultimoAcesso) return 'nunca';
  const t = new Date(ultimoAcesso).getTime();
  if (!Number.isFinite(t)) return 'nunca';
  const dias = (agora - t) / DIA_MS;
  if (dias <= DIAS_USANDO) return 'usando';
  if (dias <= DIAS_POUCO_USO) return 'pouco';
  return 'parado';
}

/** Pagamento / licença, do ponto de vista do escritório */
export const PAGAMENTO = ['pago', 'cortesia', 'teste', 'atrasado', 'bloqueado', 'vencido', 'cancelado', 'sem_licenca', 'nao_exige'] as const;
export type SituacaoPagamento = typeof PAGAMENTO[number];

export const ROTULO_PAGAMENTO: Record<SituacaoPagamento, string> = {
  pago: 'Pago',
  cortesia: 'Cortesia',
  teste: 'Em teste',
  atrasado: 'Pagamento atrasado',
  bloqueado: 'Bloqueado',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
  sem_licenca: 'Sem licença',
  nao_exige: 'Licença desligada',
};

export type LicencaResumo = { status: string; origem: string; liberado: boolean } | null;

/**
 * Situação de pagamento a partir da assinatura do corretor.
 * licenciamentoAtivo=false (licença desligada no SaaS) → ninguém precisa pagar para entrar.
 */
export function situacaoDePagamento(a: LicencaResumo, licenciamentoAtivo = true): SituacaoPagamento {
  if (!a) return licenciamentoAtivo ? 'sem_licenca' : 'nao_exige';
  if (a.status === 'CANCELADA') return 'cancelado';
  if (a.status === 'BLOQUEADO') return 'bloqueado';
  if (a.status === 'INADIMPLENTE') return a.liberado ? 'atrasado' : 'bloqueado';
  if (a.status === 'TRIAL') return a.liberado ? 'teste' : 'vencido';
  if (a.status === 'PENDENTE_CONVERSAO') return 'teste';
  if (a.status === 'ATIVA') {
    if (!a.liberado) return 'vencido';
    return a.origem === 'CORTESIA' || a.origem === 'PACOTE_GESTAO' ? 'cortesia' : 'pago';
  }
  return a.liberado ? 'pago' : 'vencido';
}

/** Consegue entrar hoje? Login ativo e (licença desligada ou liberada) */
export function podeEntrar(ativo: boolean, pagamento: SituacaoPagamento): boolean {
  if (!ativo) return false;
  return ['pago', 'cortesia', 'teste', 'atrasado', 'nao_exige'].includes(pagamento);
}

/** Uso dos materiais do empreendimento (últimos 30 dias): só contagem, sem destinatário nem conteúdo */
export const CATEGORIAS_MIDIA = ['imagem', 'video', 'pdf', 'texto'] as const;
export type CategoriaMidia = typeof CATEGORIAS_MIDIA[number];
export const ROTULO_MIDIA: Record<CategoriaMidia, string> = { imagem: 'Fotos', video: 'Vídeos', pdf: 'PDFs', texto: 'Textos' };
const NOME_MIDIA: Record<CategoriaMidia, [string, string]> = { imagem: ['foto', 'fotos'], video: ['vídeo', 'vídeos'], pdf: ['PDF', 'PDFs'], texto: ['texto', 'textos'] };
/** "3 fotos, 1 vídeo" (ou "nenhum") */
export function descreverMidias(u: UsoMidias): string {
  const partes = CATEGORIAS_MIDIA.filter(c => u[c] > 0).map(c => `${u[c]} ${NOME_MIDIA[c][u[c] === 1 ? 0 : 1]}`);
  return partes.length ? partes.join(', ') : 'nenhum';
}
export type UsoMidias = Record<CategoriaMidia, number> & { total: number; ultimo: string | null };
export const usoMidiasVazio = (): UsoMidias => ({ imagem: 0, video: 0, pdf: 0, texto: 0, total: 0, ultimo: null });

/** Soma os registros de uso (categoria + data) de uma pessoa */
export function somarUsoMidias(registros: { categoria: string; criadoEm: Date | string | number | null }[]): UsoMidias {
  const u = usoMidiasVazio();
  let ultimo = 0;
  for (const r of registros) {
    if (!(CATEGORIAS_MIDIA as readonly string[]).includes(r.categoria)) continue;
    u[r.categoria as CategoriaMidia]++;
    u.total++;
    const t = r.criadoEm ? new Date(r.criadoEm).getTime() : 0;
    if (Number.isFinite(t) && t > ultimo) ultimo = t;
  }
  u.ultimo = ultimo ? new Date(ultimo).toISOString() : null;
  return u;
}

/** Resumo do topo da tela: pessoas, uso do sistema, contador das licenças e das mídias */
export function resumoControle(linhas: { ativo: boolean; uso: SituacaoUso; pagamento: SituacaoPagamento; midias?: UsoMidias }[]) {
  const r = {
    total: linhas.length, ativos: 0, inativos: 0, pagos: 0, cortesia: 0, teste: 0, pendentes: 0, usando: 0, parados: 0,
    /** Contador das licenças: quantos em cada situação (pago, cortesia, teste, atrasado, bloqueado, vencido…) */
    licencas: Object.fromEntries(PAGAMENTO.map(p => [p, 0])) as Record<SituacaoPagamento, number>,
    /** Mídias usadas pela equipe nos últimos 30 dias e quantos corretores usaram */
    midias: usoMidiasVazio(), usaramMidias: 0,
  };
  for (const l of linhas) {
    r.licencas[l.pagamento]++;
    if (l.midias) {
      for (const c of CATEGORIAS_MIDIA) r.midias[c] += l.midias[c];
      r.midias.total += l.midias.total;
      if (l.midias.total > 0) r.usaramMidias++;
      if (l.midias.ultimo && (!r.midias.ultimo || l.midias.ultimo > r.midias.ultimo)) r.midias.ultimo = l.midias.ultimo;
    }
    if (l.ativo) r.ativos++; else r.inativos++;
    if (l.pagamento === 'pago') r.pagos++;
    else if (l.pagamento === 'cortesia') r.cortesia++;
    else if (l.pagamento === 'teste') r.teste++;
    else if (['atrasado', 'bloqueado', 'vencido', 'sem_licenca'].includes(l.pagamento)) r.pendentes++;
    if (l.uso === 'usando') r.usando++;
    else if (l.uso === 'parado' || l.uso === 'nunca') r.parados++;
  }
  return r;
}
