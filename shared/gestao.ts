/**
 * Contrato de Gestão do Empreendimento (EMPREENDEDORA × GESTORA J R P Bezerra Ltda / Romatec Consultoria Total).
 * Parâmetros editáveis no CRM (Vendas › Contrato de gestão, só administrador) e adiantamentos que a GESTORA paga
 * com recursos próprios — cada um vira um Recibo de Adiantamento no Anexo I do contrato.
 */
import { z } from 'zod';

export const CATEGORIAS_APORTE = {
  agrimensura: 'Agrimensura e topografia',
  obras: 'Obras de infraestrutura',
  materiais: 'Materiais e marcos',
  documentacao: 'Documentação, cartório e taxas',
  licencas: 'Licenças e órgãos públicos',
  tributos: 'Tributos do imóvel (ITR e outros)',
  marketing: 'Marketing e vendas',
  servicos: 'Serviços de terceiros',
  outro: 'Outro',
} as const;
export type CategoriaAporte = keyof typeof CATEGORIAS_APORTE;

export const FORMAS_PAGAMENTO_APORTE = ['pix', 'transferencia', 'dinheiro', 'boleto', 'cartao', 'cheque'] as const;
export const ROTULO_FORMA_APORTE: Record<(typeof FORMAS_PAGAMENTO_APORTE)[number], string> = {
  pix: 'PIX', transferencia: 'Transferência bancária', dinheiro: 'Dinheiro', boleto: 'Boleto', cartao: 'Cartão', cheque: 'Cheque',
};

export const PARAMETROS_PADRAO = {
  comissaoPct: 0.05,
  corretorParceiroPct: 0.02,
  valorPorLote: 800,
  /** null: usa a quantidade de lotes cadastrada no empreendimento */
  qtdLotes: null as number | null,
  /** Parte de cada recebimento do empreendimento que a GESTORA pode reter até quitar os adiantamentos */
  retencaoAportesPct: 0.5,
  prazoMinimoMeses: 60,
  multaRescisaoPct: 0.05,
  dataContrato: '',
  testemunha1Nome: '', testemunha1Cpf: '', testemunha2Nome: '', testemunha2Cpf: '',
  observacoes: '',
};
export type ParametrosGestao = typeof PARAMETROS_PADRAO;

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');
export const parametrosSchema = z.object({
  comissaoPct: z.number().min(0).max(0.2),
  corretorParceiroPct: z.number().min(0).max(0.1),
  valorPorLote: z.number().min(0).max(100_000),
  qtdLotes: z.number().int().min(1).max(5000).nullable(),
  retencaoAportesPct: z.number().min(0).max(1),
  prazoMinimoMeses: z.number().int().min(1).max(600),
  multaRescisaoPct: z.number().min(0).max(0.2),
  dataContrato: z.union([dataIso, z.literal('')]),
  testemunha1Nome: z.string().trim().max(120), testemunha1Cpf: z.string().trim().max(20),
  testemunha2Nome: z.string().trim().max(120), testemunha2Cpf: z.string().trim().max(20),
  observacoes: z.string().trim().max(2000),
});

export const aporteSchema = z.object({
  data: dataIso,
  valor: z.number().positive().max(100_000_000),
  descricao: z.string().trim().min(3).max(500),
  categoria: z.enum(Object.keys(CATEGORIAS_APORTE) as [CategoriaAporte, ...CategoriaAporte[]]),
  favorecido: z.string().trim().max(200).optional().default(''),
  formaPagamento: z.enum(FORMAS_PAGAMENTO_APORTE),
  comprovante: z.string().trim().max(200).optional().default(''),
});
export type DadosAporte = z.infer<typeof aporteSchema>;

/** Valor total dos serviços de agrimensura */
export const totalAgrimensura = (p: Pick<ParametrosGestao, 'valorPorLote'>, qtdLotes: number) => Math.round(p.valorPorLote * qtdLotes * 100) / 100;

/** Número do contrato de gestão do empreendimento: GE-2026-0001 */
export const numeroContratoGestao = (empreendimentoId: number, ano: number) => `GE-${ano}-${String(empreendimentoId).padStart(4, '0')}`;
