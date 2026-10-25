/**
 * Contrato modelo (v1.14): a MINUTA do CPCV preenchida com o cliente fictício padrão — casado, chácara A01,
 * entrada 6× + saldo 120× — para mostrar todas as cláusulas e condicionantes. Tudo com marca d'água
 * "MINUTA — SEM VALOR CONTRATUAL". Não grava nada no banco (nem contrato, nem lead, nem versão).
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { empreendimentos, lotes } from '../../drizzle/schema';
import { memorialDoLote, type RuaMemorial } from '../lotes/memorial';
import type { XY } from '../../shared/utm';
import { montarContexto, type EntradaContexto } from './contexto';
import { gerarContratoPdf } from './gerar';
import type { DadosUnidade } from './anexosLote';
import { carregarCamadas } from './mapaEmpreendimento';
import { hojeIso } from './formato';
import { ContratoErro, condicoesDe, credenciaisDoUsuario, juridicoDe, planoEscolhido, responsavelTecnicoId } from './servico';

const json = <T>(v: unknown): T | null => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : (v as T));

/** Cliente fictício padrão (casado, para aparecerem as cláusulas do cônjuge) */
export const CLIENTE_EXEMPLO = {
  comprador: {
    nome: 'Cliente Exemplo', cpfCnpj: '00000000000', nacionalidade: 'brasileira', estadoCivil: 'casado', regimeBens: 'comunhao_parcial',
    profissao: 'profissão do cliente', nascimento: '1980-01-01', sexo: 'M', rg: '00.000.000', rgOrgao: 'SSP', rgUf: 'MA', email: 'cliente@exemplo.com',
    telefone1: '99900000000', cep: '65930000', logradouro: 'Rua Exemplo', numero: '00', bairro: 'Centro', cidade: 'Açailândia', uf: 'MA',
  },
  conjuge: {
    nome: 'Cônjuge Exemplo', cpfCnpj: '00000000000', nacionalidade: 'brasileira', estadoCivil: 'casado', profissao: 'profissão do cônjuge',
    sexo: 'F', rg: '00.000.000', rgOrgao: 'SSP', rgUf: 'MA',
  },
} as const;

const proximoDia10 = () => {
  const d = new Date(Date.now() - 3 * 3600_000);
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 10));
  return alvo.toISOString().slice(0, 10);
};

const cache = new Map<string, { em: number; pdf: Buffer }>();
const VALIDADE_MS = 30 * 60_000;

export async function contratoModelo(slug: string, loteCodigo = 'A01', usuarioId?: number | null): Promise<Buffer> {
  const chave = `${slug}:${loteCodigo}:${usuarioId ?? 0}:${hojeIso()}`;
  const c = cache.get(chave);
  if (c && Date.now() - c.em < VALIDADE_MS) return c.pdf;

  const d = (await getDb()) as any;
  if (!d) throw new ContratoErro('DB', 'Banco indisponível', 503);
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new ContratoErro('EMPREENDIMENTO', 'Empreendimento não encontrado', 404);
  const j = await juridicoDe(emp.id);
  const cond = await condicoesDe(emp.id);
  const todos: any[] = await d.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const lote = todos.find(l => l.codigo === loteCodigo);
  if (!lote) throw new ContratoErro('LOTE', `Chácara ${loteCodigo} não encontrada`, 404);

  const geom = (l: any) => json<XY[]>(l.verticesUtm) ?? [];
  const lm = (l: any) => ({ codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: Number(l.areaM2 ?? 0), perimetroM: Number(l.perimetroM ?? 0), verticesUtm: geom(l) });
  const ruas = (json<RuaMemorial[]>(emp.ruas) ?? []) as RuaMemorial[];
  const perimetroUtm = json<{ verticesUtm: XY[] }>(emp.perimetro)?.verticesUtm ?? null;
  const fuso = emp.utmFuso ?? 23;
  const memorial = geom(lote).length >= 3
    ? memorialDoLote(lm(lote), todos.filter(l => geom(l).length >= 3).map(lm), { nome: emp.nome, municipio: emp.municipio, uf: emp.uf, fuso, matricula: emp.registroMatricula, ruas, perimetroUtm })
    : { titulo: `Chácara ${lote.codigo}`, cabecalho: [], descricao: 'Geometria da unidade ainda não importada do DXF.', vertices: [] };
  const viaFrente = lote.viaFrente || memorial.vertices.map(v => v.confronta).find(t => /^a /.test(t))?.replace(/^a /, '') || '';

  const resp = await responsavelTecnicoId(j.defaults);
  const corretor = resp ? await credenciaisDoUsuario(resp) : { nome: '', cpf: '', creci: '', creciUf: 'MA', creciValidade: '', certidaoCodigo: '', certidaoEmissao: '', certidaoValidade: '' };
  const plano = planoEscolhido({ modalidade: 'financiado', entradaParcelas: Math.min(6, cond.entradaMaxParcelas), prazo: Math.max(...cond.prazos), dataPrimeiroPagamento: proximoDia10() },
    Number(lote.areaM2), lote.precoTabela != null ? Number(lote.precoTabela) : null, cond, false);

  const entrada: EntradaContexto = {
    contrato: { numero: `${String(emp.slug).slice(0, 2).toUpperCase()}-MODELO`, codigoVerificacao: 'MODELO000000', modoAssinatura: 'eletronica', dataGeracao: hojeIso() },
    juridico: { defaults: j.defaults, vendedoraTipo: j.vendedoraTipo === 'PJ' ? 'PJ' : 'PF', vendedora: j.vendedora, modeloVersao: j.modeloVersao },
    overrides: null,
    lote: { codigo: lote.codigo, quadra: lote.quadra, numero: lote.numero, areaM2: Number(lote.areaM2), perimetroM: Number(lote.perimetroM ?? 0),
      descricao: lote.memorialTexto || memorial.descricao, viaFrente, matricula: lote.matricula ?? '' },
    plano, comprador: { ...CLIENTE_EXEMPLO.comprador }, conjuge: { ...CLIENTE_EXEMPLO.conjuge }, corretor, parceiro: null,
  } as any;
  const unidade: DadosUnidade = {
    codigo: lote.codigo, quadra: lote.quadra, numero: lote.numero, areaM2: Number(lote.areaM2), perimetroM: Number(lote.perimetroM ?? 0),
    verticesUtm: geom(lote), memorial, outros: todos.filter(l => l.id !== lote.id && geom(l).length >= 3).map(l => ({ codigo: l.codigo, verticesUtm: geom(l) })),
    perimetroUtm, ruas, fuso, responsavelTecnico: emp.responsavelTecnico ?? null, camadas: await carregarCamadas(emp.slug, fuso),
  };
  const { pdf } = await gerarContratoPdf(montarContexto(entrada), plano, { alvo: 'minuta', modelo: j.modeloCpcv, marca: j.marcaSlug, unidade });
  cache.set(chave, { em: Date.now(), pdf });
  return pdf;
}
