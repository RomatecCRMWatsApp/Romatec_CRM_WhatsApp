/** Campanha das obras do Bom Jardim (/obras-bom-jardim): textos e origem padrão (shared com a página e o servidor) */
import { z } from 'zod';

export const ROTA_OBRAS = '/obras-bom-jardim';
export const CAMPANHA_OBRAS = 'IG-OBRAS-NOV26';
export const MSG_VALOR_OBRAS = 'Olá, vi a campanha das obras do Bom Jardim e quero saber os valores';
export const LANCAMENTO_OBRAS = '14 de novembro';

export const TITULO_OBRAS = 'Obras iniciadas — Condomínio de Chácaras Bom Jardim (CCBJ), Açailândia/MA';
export const DESCRICAO_OBRAS = 'As obras começaram! Lançamento oficial em 14 de novembro. Só 82 chácaras a partir de 3.025 m², 100% documentado e liberado para vendas. Cadastre-se e agende sua visita.';

/** Sem UTM no link (ex.: compartilhado no direct), a página é da campanha do Instagram */
export function utmObras(u?: { source?: string; medium?: string; campaign?: string; content?: string } | null) {
  return { source: u?.source || 'instagram', medium: u?.medium, campaign: u?.campaign || CAMPANHA_OBRAS, content: u?.content };
}

// ─── Ficha completa: obrigatória antes do WhatsApp com os valores ─────────────────────────

export const FINALIDADES_OBRAS = [['morar', 'Morar'], ['lazer', 'Lazer de fim de semana'], ['investimento', 'Investimento']] as const;
export const PAGAMENTOS_OBRAS = [['avista', 'À vista'], ['parcelado', 'Parcelado direto']] as const;
export const PRAZOS_OBRAS = [['imediato', 'Imediato'], ['3m', 'Até 3 meses'], ['12m', 'Até 12 meses'], ['pesquisando', 'Só pesquisando']] as const;
const valores = <T extends readonly (readonly [string, string])[]>(l: T) => l.map(x => x[0]) as [T[number][0], ...T[number][0][]];
export const rotuloObras = (l: readonly (readonly [string, string])[], v: string) => l.find(x => x[0] === v)?.[1] ?? v;

/** Nome e sobrenome, WhatsApp, e-mail, cidade, finalidade, pagamento e prazo — tudo obrigatório */
export const fichaObrasSchema = z.object({
  nome: z.string().trim().max(120).refine(v => v.split(/\s+/).filter(p => p.length >= 2).length >= 2, 'Informe seu nome completo (nome e sobrenome)'),
  phone: z.string().trim().refine(v => { const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length === 11 && d[2] === '9'; }, 'Informe um celular com DDD (WhatsApp)'),
  email: z.string().trim().max(160).email('Informe um e-mail válido'),
  cidade: z.string().trim().min(2, 'Informe a cidade onde mora').max(80),
  finalidade: z.enum(valores(FINALIDADES_OBRAS), { message: 'Escolha para que é a chácara' }),
  pagamento: z.enum(valores(PAGAMENTOS_OBRAS), { message: 'Escolha a forma de pagamento' }),
  prazo: z.enum(valores(PRAZOS_OBRAS), { message: 'Escolha quando pretende comprar' }),
  consent: z.literal(true, { message: 'É preciso autorizar o contato' }),
});
export type FichaObras = z.infer<typeof fichaObrasSchema>;

/** Mensagem que o cliente manda ao corretor depois da ficha: o corretor já abre o WhatsApp sabendo quem é */
export function msgValorComFicha(f: Pick<FichaObras, 'nome' | 'cidade' | 'finalidade' | 'pagamento' | 'prazo'>): string {
  return `${MSG_VALOR_OBRAS}.\n\nSou ${f.nome.trim()}, de ${f.cidade.trim()}. Interesse: ${rotuloObras(FINALIDADES_OBRAS, f.finalidade).toLowerCase()} · pagamento ${rotuloObras(PAGAMENTOS_OBRAS, f.pagamento).toLowerCase()} · prazo: ${rotuloObras(PRAZOS_OBRAS, f.prazo).toLowerCase()}.`;
}
