/**
 * Dados das tabelas de comissão (corretor 2% e escritório 5%) de um empreendimento: chácaras à venda com o preço de
 * tabela e o valor à vista, a chácara de exemplo e as linhas de cada forma de pagamento. Usado pela Área do corretor,
 * pelo painel do empreendedor e pelo PDF (/api/comissao/tabela.pdf).
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { condicoesPagamento, empreendimentos, lotes } from '../../drizzle/schema';
import { exigirAcesso, pctComissaoCorretor, type PermissoesUsuario } from '../permissoes';
import { condicoesDaLinha, seloDoLote, simular, type CondicoesPagamento } from '../../shared/simulador';
import { PRAZO_REPASSE_DIAS_UTEIS, podeVerTabelaComissao, tabelaComissao, type TipoTabelaComissao } from '../../shared/tabelaComissao';

export class TabelaComissaoErro extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export async function dadosTabelaComissao(slug: string, tipo: TipoTabelaComissao, lote: string | undefined, permissoes: PermissoesUsuario) {
  if (!podeVerTabelaComissao(permissoes.perfil, tipo)) {
    throw new TabelaComissaoErro(tipo === 'corretor' ? 'A tabela de comissão do corretor não está liberada para o seu perfil.' : 'A tabela de comissão do escritório é só do administrador, da secretaria e do empreendedor.', 403);
  }
  const db: any = await getDb();
  if (!db) throw new TabelaComissaoErro('Banco indisponível', 503);
  const [emp]: any[] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new TabelaComissaoErro('Empreendimento não encontrado', 404);
  try { exigirAcesso(permissoes, 'empreendimento', emp.id, emp.nome); } catch { throw new TabelaComissaoErro(`Sem acesso ao ${emp.nome}`, 403); }
  const [cond]: any[] = await db.select().from(condicoesPagamento)
    .where(and(eq(condicoesPagamento.empreendimentoId, emp.id), eq(condicoesPagamento.ativo, true)))
    .orderBy(desc(condicoesPagamento.vigenteDesde), desc(condicoesPagamento.id)).limit(1);
  if (!cond) throw new TabelaComissaoErro('Condições de pagamento não cadastradas para este empreendimento', 412);
  const c = condicoesDaLinha(cond) as CondicoesPagamento;
  // Corretor: o % do vínculo dele (ou o padrão do empreendimento); escritório: a comissão total
  const pct = tipo === 'escritorio' ? c.comissaoTotalPct
    : permissoes.perfil === 'corretor' ? pctComissaoCorretor(permissoes, emp.id, c.comissaoCorretorPct) : c.comissaoCorretorPct;
  const todos: any[] = await db.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const chacaras = todos
    .filter(l => seloDoLote(l) === 'disponivel' && num(l.areaM2))
    .map(l => {
      const s = simular(num(l.areaM2)!, 1, c, num(l.precoTabela));
      return { codigo: String(l.codigo), areaM2: num(l.areaM2)!, preco: s.preco, avista: s.avistaTotal.valor };
    })
    .sort((a, b) => a.preco - b.preco || a.codigo.localeCompare(b.codigo));
  const cod = lote?.toUpperCase();
  const exemplo = chacaras.find(x => x.codigo === cod) ?? chacaras[0] ?? null;
  return {
    tipo,
    empreendimento: { nome: String(emp.nome), slug: String(emp.slug) },
    pct,
    chacaras,
    faixa: chacaras.length ? { menor: chacaras[0].preco, maior: chacaras[chacaras.length - 1].preco } : null,
    exemplo,
    linhas: exemplo ? tabelaComissao(exemplo.preco, exemplo.avista, pct, c.entradaMaxParcelas) : [],
    entradaMaxParcelas: c.entradaMaxParcelas,
    repasseDiasUteis: PRAZO_REPASSE_DIAS_UTEIS,
  };
}
