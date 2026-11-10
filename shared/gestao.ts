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
  valorPorLote: 850,
  /** null: usa a quantidade de lotes cadastrada no empreendimento */
  qtdLotes: null as number | null,
  /** Unidades locadas além dos lotes (área administrativa e stand de vendas, na entrada) */
  unidadesExtras: 1,
  /** Piqueteamento e locação dos pontos de banho na lâmina d'água do rio */
  pontosBanhoQtd: 85,
  valorPontoBanho: 200,
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
  unidadesExtras: z.number().int().min(0).max(100),
  pontosBanhoQtd: z.number().int().min(0).max(5000),
  valorPontoBanho: z.number().min(0).max(100_000),
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
  /** Valor total contratado do serviço (opcional): o recibo mostra o saldo a pagar */
  valorContratado: z.number().positive().max(100_000_000).nullable().optional().default(null),
  /** Documento de origem (orçamento, medição, proposta) */
  referencia: z.string().trim().max(300).optional().default(''),
});
export type DadosAporte = z.infer<typeof aporteSchema>;

/** Arquivos anexos a um recibo: comprovante do pagamento e documento de origem (medição, boletim de horas, orçamento) */
export const TIPOS_ANEXO_APORTE = { comprovante: 'Comprovante de pagamento', origem: 'Documento de origem' } as const;
export type TipoAnexoAporte = keyof typeof TIPOS_ANEXO_APORTE;
export const MAX_BYTES_ANEXO_APORTE = 10 * 1024 * 1024;
export const anexoAporteSchema = z.object({
  tipo: z.enum(['comprovante', 'origem']),
  nome: z.string().trim().min(1).max(160),
  mime: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
  /** Conteúdo em base64 (até 10 MB) */
  conteudoBase64: z.string().min(8).max(Math.ceil(MAX_BYTES_ANEXO_APORTE / 3) * 4 + 8),
  /** Descrição que sai no recibo, ex.: "Boletim de horas da máquina — Construsul" */
  descricao: z.string().trim().max(200).optional().default(''),
});
export type DadosAnexoAporte = z.infer<typeof anexoAporteSchema>;
/** Ordem dos anexos no recibo: comprovantes primeiro, depois os documentos de origem (estável dentro de cada tipo) */
export const ordenarAnexos = <T extends { tipo: string }>(xs: readonly T[]): T[] =>
  [...xs].sort((p, q) => (p.tipo === 'comprovante' ? 0 : 1) - (q.tipo === 'comprovante' ? 0 : 1));

/** Valor total da locação dos lotes (só a parte por lote) */
export const totalAgrimensura = (p: Pick<ParametrosGestao, 'valorPorLote'>, qtdLotes: number) => Math.round(p.valorPorLote * qtdLotes * 100) / 100;

/** Serviços de topografia a receber: locação das unidades (lotes + área administrativa/stand) e pontos de banho no rio */
export function totaisTopografia(p: Pick<ParametrosGestao, 'valorPorLote' | 'unidadesExtras' | 'pontosBanhoQtd' | 'valorPontoBanho'>, qtdLotes: number) {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const unidades = qtdLotes + (p.unidadesExtras ?? 0);
  const locacao = r2(p.valorPorLote * unidades), banho = r2((p.pontosBanhoQtd ?? 0) * (p.valorPontoBanho ?? 0));
  return { unidades, locacao, banho, total: r2(locacao + banho) };
}

/** Número do contrato de gestão do empreendimento: GE-2026-0001 */
export const numeroContratoGestao = (empreendimentoId: number, ano: number) => `GE-${ano}-${String(empreendimentoId).padStart(4, '0')}`;

/** Termos aditivos ao Contrato de Gestão (Cláusula 13.2): tipo → objeto padrão e frase do valor */
export const TIPOS_ADITIVO_GESTAO = {
  adiantamentos: { rotulo: 'Reconhecimento de adiantamentos', objeto: 'o reconhecimento de adiantamentos feitos pela GESTORA com recursos próprios em favor do EMPREENDIMENTO, nos termos da Cláusula 5ª do Contrato de Gestão', valor: 'total dos adiantamentos ora reconhecidos, que a EMPREENDEDORA confessa dever à GESTORA e que serão ressarcidos na forma da Cláusula 5ª do Contrato de Gestão' },
  receber: { rotulo: 'Valores a receber', objeto: 'o reconhecimento de valores a receber pela GESTORA da EMPREENDEDORA', valor: 'devidos pela EMPREENDEDORA à GESTORA, corrigidos pelo IPCA/IBGE e ressarcidos na forma da Cláusula 5ª do Contrato de Gestão' },
  engenharia: { rotulo: 'Frente de engenharia, obra ou serviço do condomínio (Cláusulas 4ª-A e 4ª-B)', objeto: 'a fixação do escopo, do valor, do prazo e das condições de frente de serviço de engenharia, de obra civil ou de serviço ao condomínio do EMPREENDIMENTO, nos termos das Cláusulas 4ª-A e 4ª-B do Contrato de Gestão, antes do seu início', valor: 'pela frente de serviço ora contratada, medido e pago na forma das Cláusulas 4ª-A e 4ª-B do Contrato de Gestão e deste termo' },
  servicos: { rotulo: 'Novos serviços e atribuições', objeto: 'a inclusão de novos serviços, atribuições e responsabilidades da GESTORA', valor: 'pelos serviços ora incluídos, pagos com os recursos das vendas do EMPREENDIMENTO, por retenção na forma da Cláusula 5.3, ou diretamente pela EMPREENDEDORA em até 10 (dez) dias da medição' },
  valores: { rotulo: 'Ajuste de valores, prazos e condições', objeto: 'o ajuste de quantidades, valores, prazos e condições do Contrato de Gestão', valor: 'valor ajustado por este termo' },
  transferencia: { rotulo: 'Transferência do imóvel', objeto: 'a formalização das condições da transferência do imóvel prevista na Cláusula 7ª do Contrato de Gestão', valor: 'valor ajustado para a transferência, na forma deste termo' },
  outro: { rotulo: 'Outro', objeto: 'ajustes ao Contrato de Gestão', valor: 'valor ajustado por este termo' },
} as const;
export type TipoAditivoGestao = keyof typeof TIPOS_ADITIVO_GESTAO;

export const aditivoGestaoSchema = z.object({
  tipo: z.enum(Object.keys(TIPOS_ADITIVO_GESTAO) as [TipoAditivoGestao, ...TipoAditivoGestao[]]),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD'),
  objeto: z.string().trim().max(500).optional().default(''),
  texto: z.string().trim().max(8000).optional().default(''),
  valor: z.number().min(0).max(100_000_000).nullable().optional().default(null),
  aportes: z.array(z.number().int().positive()).max(500).optional().default([]),
});
export type DadosAditivoGestao = z.infer<typeof aditivoGestaoSchema>;
