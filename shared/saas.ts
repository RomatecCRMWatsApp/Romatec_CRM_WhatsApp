/**
 * Camada SaaS (MD "CRM Romatec — Camada SaaS v1", fase 1): planos, assinaturas, trial, cupons e licença.
 * O licenciamento começa DESLIGADO (saasConfig.licenciamento_ativo); ao ligar, quem já usa o CRM recebe cortesia
 * até a data escolhida e os convites novos entram no trial de 7 dias (começa no 1º login, um por CPF).
 * Cupons portados do AvalieImob (backend/models/cupom.py): valor fixo ou percentual, limite de usos, validade.
 * Cobrança online (Mercado Pago), NFS-e e SSO AvalieImob ficam na fase 2.
 */

export const PUBLICOS = ['CORRETOR', 'EMPREENDEDOR'] as const;
export type Publico = typeof PUBLICOS[number];

export const ORIGENS = ['TRIAL', 'PAGA', 'PACOTE_GESTAO', 'CORTESIA'] as const;
export type Origem = typeof ORIGENS[number];

export const CICLOS = ['MENSAL', 'ANUAL'] as const;
export type Ciclo = typeof CICLOS[number];

export const STATUS_ASSINATURA = ['TRIAL', 'ATIVA', 'INADIMPLENTE', 'BLOQUEADO', 'CANCELADA', 'PENDENTE_CONVERSAO'] as const;
export type StatusAssinatura = typeof STATUS_ASSINATURA[number];

export const ROTULO_STATUS: Record<StatusAssinatura, string> = {
  TRIAL: 'Período de teste', ATIVA: 'Ativa', INADIMPLENTE: 'Pagamento em atraso', BLOQUEADO: 'Bloqueada', CANCELADA: 'Cancelada',
  PENDENTE_CONVERSAO: 'Contrato de gestão vencido — converter',
};
export const ROTULO_ORIGEM: Record<Origem, string> = { TRIAL: 'Teste grátis', PAGA: 'Paga', PACOTE_GESTAO: 'Pacote de gestão Romatec', CORTESIA: 'Cortesia' };

export const DIAS_TRIAL = 7;
export const DIAS_TOLERANCIA_PADRAO = 3;
/** Lembretes do fim do teste/cortesia: 3 dias antes, véspera e no dia */
export const LEMBRETES_DIAS = [3, 1, 0] as const;

export interface PlanoSaas {
  codigo: string; publico: Publico; nome: string; precoMensal: number; precoAnual: number | null;
  storageGb: number; incluiAvalieimob: boolean; conteudo: string; unico?: boolean;
}

/** Tabela da seção 2 do MD — seed; os valores ficam editáveis no Admin › Planos e cupons */
export const PLANOS_PADRAO: PlanoSaas[] = [
  { codigo: 'CORRETOR_ESSENCIAL', publico: 'CORRETOR', nome: 'Corretor Essencial', precoMensal: 89.9, precoAnual: 899, storageGb: 5, incluiAvalieimob: false,
    conteudo: 'Empreendimentos vinculados, mapa em tempo real, reserva, contrato digital com assinatura eletrônica, PDFs, upload de documentos do cliente, relatório fotográfico, 5 GB' },
  { codigo: 'CORRETOR_PRO', publico: 'CORRETOR', nome: 'Corretor Pro', precoMensal: 159.9, precoAnual: 1599, storageGb: 20, incluiAvalieimob: true,
    conteudo: 'Tudo do Essencial + AvalieImob (PTAM, contrato de exclusividade, captação de leads próprios, carteira particular), 20 GB' },
  { codigo: 'EMPREENDEDOR_AVULSO', publico: 'EMPREENDEDOR', nome: 'Empreendedor (por empreendimento)', precoMensal: 397, precoAnual: 3970, storageGb: 5, incluiAvalieimob: false,
    conteudo: 'Painel do empreendimento: mapa vendido/não vendido, contratos pendentes, clientes fechados/reservados, leads' },
  { codigo: 'EMPREENDEDOR_PACOTE', publico: 'EMPREENDEDOR', nome: 'Empreendedor — pacote de gestão', precoMensal: 0, precoAnual: null, storageGb: 5, incluiAvalieimob: false,
    conteudo: 'Igual ao avulso; vale enquanto durar o contrato de gestão com a Romatec' },
  { codigo: 'IMPLANTACAO', publico: 'EMPREENDEDOR', nome: 'Implantação do empreendimento', precoMensal: 990, precoAnual: null, storageGb: 0, incluiAvalieimob: false,
    conteudo: 'Cadastro do mapa, lotes e tabela de preços (cobrança única)', unico: true },
];

/** Cupom FUNDADOR: 20 primeiros corretores, R$ 69,90 (Essencial) / R$ 129,90 (Pro) por 12 ciclos */
export const CUPOM_FUNDADOR = { codigo: 'FUNDADOR', limiteUsos: 20, duracaoCiclos: 12, precoFixo: { CORRETOR_ESSENCIAL: 69.9, CORRETOR_PRO: 129.9 } as Record<string, number> };

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface AssinaturaLicenca {
  status: StatusAssinatura | string; origem?: Origem | string; trialFim?: Date | string | null; periodoFim?: Date | string | null; diasTolerancia?: number | null;
}

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : NaN);

/**
 * Libera o acesso? (§5 do MD) — TRIAL no prazo, ATIVA (paga até o fim do período; cortesia/pacote até periodoFim,
 * sem data = sem fim) ou INADIMPLENTE dentro da tolerância. Sem assinatura: bloqueado.
 */
export function licencaLiberada(a: AssinaturaLicenca | null | undefined, agora = Date.now()): boolean {
  if (!a) return false;
  if (a.status === 'TRIAL') return ms(a.trialFim) > agora;
  if (a.status === 'ATIVA') {
    if (a.origem === 'PAGA') return !a.periodoFim || ms(a.periodoFim) + (a.diasTolerancia ?? DIAS_TOLERANCIA_PADRAO) * 86_400_000 > agora;
    return !a.periodoFim || ms(a.periodoFim) > agora;
  }
  if (a.status === 'INADIMPLENTE') return !!a.periodoFim && ms(a.periodoFim) + (a.diasTolerancia ?? DIAS_TOLERANCIA_PADRAO) * 86_400_000 > agora;
  return false;
}

/** Motivo do bloqueio para a tela /assinatura */
export function motivoBloqueio(a: AssinaturaLicenca | null | undefined): string {
  if (!a) return 'Você ainda não tem uma assinatura ativa.';
  if (a.status === 'TRIAL' || (a.status === 'BLOQUEADO' && a.origem === 'TRIAL')) return 'Seu período de teste terminou.';
  if (a.origem === 'CORTESIA') return 'O seu período de cortesia terminou.';
  if (a.status === 'INADIMPLENTE' || (a.status === 'BLOQUEADO' && a.origem === 'PAGA')) return 'Pagamento em atraso.';
  if (a.status === 'PENDENTE_CONVERSAO') return 'O contrato de gestão com a Romatec terminou.';
  if (a.status === 'CANCELADA') return 'A assinatura foi cancelada.';
  return 'A assinatura está bloqueada.';
}

/** Dias inteiros até a data (0 = hoje), no fuso de Fortaleza */
export function diasAte(fim: Date | string | null | undefined, agora = Date.now()): number | null {
  if (!fim) return null;
  const dia = (t: number) => Math.floor((t - 3 * 3600_000) / 86_400_000);
  return dia(new Date(fim).getTime()) - dia(agora);
}

export interface CupomSaas {
  codigo: string; tipo: 'PERCENTUAL' | 'VALOR_FIXO' | 'PRECO_FIXO'; valor: number; planoAlvo?: string | null;
  limiteUsos: number; usosRealizados: number; validade?: Date | string | null; status: string; duracaoCiclos?: number | null;
  precosFixos?: Record<string, number> | null;
}

/** Cupom válido para o plano? (regras do AvalieImob: status ativo, validade, limite de usos; + plano-alvo) */
export function problemaCupom(c: CupomSaas | null | undefined, planoCodigo: string, agora = Date.now()): string | null {
  if (!c) return 'Cupom não encontrado';
  if (c.status !== 'ativo') return `Cupom ${c.status}`;
  if (c.validade && ms(c.validade) < agora) return 'Cupom expirado';
  if (c.usosRealizados >= c.limiteUsos) return 'Cupom esgotado';
  if (c.planoAlvo && c.planoAlvo !== planoCodigo) return 'Cupom não vale para este plano';
  if (c.tipo === 'PRECO_FIXO' && !(c.precosFixos && planoCodigo in c.precosFixos)) return 'Cupom não vale para este plano';
  return null;
}

/** Preço do ciclo com o cupom aplicado (nunca negativo) */
export function precoComCupom(preco: number, c: CupomSaas | null | undefined, planoCodigo: string): number {
  if (!c) return r2(preco);
  if (c.tipo === 'PERCENTUAL') return r2(Math.max(0, preco * (1 - c.valor / 100)));
  if (c.tipo === 'VALOR_FIXO') return r2(Math.max(0, preco - c.valor));
  return r2(c.precosFixos?.[planoCodigo] ?? preco);
}

/** Valor mensal efetivo da assinatura (override > plano; anual ÷ 12) — base do MRR */
export function valorMensal(a: { ciclo?: string | null; precoOverride?: number | string | null }, p: { precoMensal: number | string; precoAnual?: number | string | null }): number {
  if (a.precoOverride != null && a.precoOverride !== '') {
    const v = Number(a.precoOverride);
    return r2(a.ciclo === 'ANUAL' ? v / 12 : v);
  }
  if (a.ciclo === 'ANUAL' && p.precoAnual != null) return r2(Number(p.precoAnual) / 12);
  return r2(Number(p.precoMensal));
}

/** MRR = soma das assinaturas ATIVA pagas, normalizadas por mês (critério 12 do MD) */
export function calcularMrr(itens: { status: string; origem: string; ciclo?: string | null; precoOverride?: number | string | null; plano: { precoMensal: number | string; precoAnual?: number | string | null } }[]): number {
  return r2(itens.filter(a => a.status === 'ATIVA' && a.origem === 'PAGA').reduce((s, a) => s + valorMensal(a, a.plano), 0));
}

/** Perfis sujeitos à licença (admin e secretária são isentos) */
export const precisaLicenca = (perfil: string | null | undefined) => perfil === 'corretor' || perfil === 'empreendedor';

/** Procedimentos tRPC liberados mesmo bloqueado (paywall, sessão e o próprio cadastro) */
export const LIVRES_SEM_LICENCA = ['auth.', 'system.', 'saas.minha', 'saas.cupom', 'saas.planosPublicos', 'notificacoes.', 'cadastro.dados', 'cadastro.cartaoVendas'];
export const caminhoLivre = (path: string) => LIVRES_SEM_LICENCA.some(p => (p.endsWith('.') ? path.startsWith(p) : path === p || path.startsWith(`${p}`)));
