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

/** Resumo do topo da tela */
export function resumoControle(linhas: { ativo: boolean; uso: SituacaoUso; pagamento: SituacaoPagamento }[]) {
  const r = { total: linhas.length, ativos: 0, inativos: 0, pagos: 0, cortesia: 0, teste: 0, pendentes: 0, usando: 0, parados: 0 };
  for (const l of linhas) {
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
