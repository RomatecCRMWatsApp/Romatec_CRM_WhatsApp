/**
 * Simulador de CBS/IBS no contrato — usa as calculadoras oficiais da Receita pela ponte do AvalieImob
 * (/api/integracoes/romatec/rtc/*, POST assinado com o mesmo HMAC do provisionamento; ver docs/receita-rtc/PONTE_CRM.md
 * no AvalieImob). O CRM não sugere NBS/CST/cClassTrib (pendência P-16: aguarda o contador): o administrador informa a cada
 * simulação e a tela repete os da última. Resultado é estimativa e fica guardado em simulacoesTributarias.
 */
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { contratos, simulacoesTributarias } from '../../drizzle/schema';
import { assinarCorpo, integracaoConfigurada, urlAvalieimob } from '../saas/avalieimob';

export const AVISO_FIXO = 'Estimativa baseada nas calculadoras oficiais da Receita Federal. Não substitui o sistema emissor nem a validação do contador.';
export const MSG_INDISPONIVEL = 'Calculadora da Receita indisponível no momento. Tente novamente.';
/** Açailândia/MA (IBGE) */
export const MUNICIPIO_PADRAO = { uf: 'MA', codigo: '2100055' };

export class RtcErro extends Error {
  constructor(msg: string, public status = 400) { super(msg); this.name = 'RtcErro'; }
}

export type Resposta = { status: number; json: any };

/** Transporte (injetável nos testes) */
export const transporte = {
  async chamar(rota: string, corpo: Record<string, unknown>): Promise<Resposta> {
    const txt = JSON.stringify(corpo);
    const ts = String(Math.floor(Date.now() / 1000));
    const r = await fetch(`${urlAvalieimob()}/api/integracoes/romatec/rtc/${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Romatec-Timestamp': ts, 'X-Romatec-Signature': assinarCorpo(ts, txt) },
      body: txt, signal: AbortSignal.timeout(30_000),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  },
};

const textoDetalhe = (d: any): string => {
  if (!d) return '';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(x => (x?.campo ? `${x.campo}: ${x.msg}` : String(x?.msg ?? x))).join('; ');
  if (typeof d === 'object' && d.mensagem) return String(d.mensagem) + (Array.isArray(d.faltantes) && d.faltantes.length ? ` (faltam: ${d.faltantes.join(', ')})` : '');
  return String(d);
};

async function chamar(rota: string, corpo: Record<string, unknown>): Promise<any> {
  if (!integracaoConfigurada()) throw new RtcErro('A integração com o AvalieImob ainda não foi configurada.', 412);
  let r: Resposta;
  try { r = await transporte.chamar(rota, corpo); }
  catch { throw new RtcErro(MSG_INDISPONIVEL, 503); }
  if (r.status >= 200 && r.status < 300) return r.json;
  const det = textoDetalhe(r.json?.detail);
  if (r.status === 401) {
    console.warn('[ReceitaRTC] assinatura recusada pelo AvalieImob (confira o segredo e o relógio)');
    throw new RtcErro('A integração com o AvalieImob está mal configurada (assinatura recusada).', 502);
  }
  if (r.status === 404) throw new RtcErro('O simulador de CBS/IBS está desligado no AvalieImob.', 404);
  if (r.status === 409 || r.status === 422) throw new RtcErro(det || 'Dados inválidos para a simulação.', r.status);
  throw new RtcErro(MSG_INDISPONIVEL, 503);
}

/** Situação para a tela: sem integração ou simulador desligado → o bloco não aparece */
export async function situacao(): Promise<{ disponivel: boolean; motivo?: string }> {
  if (!integracaoConfigurada()) return { disponivel: false, motivo: 'sem_integracao' };
  try {
    const s = await chamar('status', {});
    return s?.ativo ? { disponivel: true } : { disponivel: false, motivo: 'desligado' };
  } catch (e: any) {
    if (e instanceof RtcErro && e.status === 404) return { disponivel: false, motivo: 'desligado' };
    return { disponivel: false, motivo: 'indisponivel' };
  }
}

export async function classificacoes(nbs: string, data: string): Promise<{ descricao: string; opcoes: { cst: string; cClassTrib: string; descricao: string }[] }> {
  const n = String(nbs).replace(/\D/g, '');
  if (n.length !== 9) throw new RtcErro('NBS: informe os 9 dígitos.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new RtcErro('Informe a data da operação.');
  const j = await chamar('classificacoes', { nbs: n, data });
  return { descricao: String(j?.descricao ?? ''), opcoes: Array.isArray(j?.opcoes) ? j.opcoes : [] };
}

/** Valor em texto com 2 casas, a partir de "1.234,56", "1234.56" ou número (nunca float no envio) */
export function valorTexto(v: string | number): string {
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new RtcErro('Valor da operação inválido.');
  const [i, d = ''] = s.split('.');
  const inteiro = i.replace(/^0+(?=\d)/, '');
  if (Number(inteiro) === 0 && Number(d || 0) === 0) throw new RtcErro('Informe o valor da operação.');
  return `${inteiro}.${(d + '00').slice(0, 2)}`;
}

export type PedidoSimulacao = {
  contratoId: number; dataOperacao: string; valor: string | number; nbs: string; cst?: string | null; cClassTrib: string;
};

const banco = async () => {
  const d = await getDb();
  if (!d) throw new RtcErro('Banco indisponível', 503);
  return d as any;
};

export async function simularContrato(usuario: { id: number; name?: string | null }, p: PedidoSimulacao) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dataOperacao)) throw new RtcErro('Confirme a data da operação.');
  const nbs = String(p.nbs).replace(/\D/g, '');
  const cst = String(p.cst ?? '').replace(/\D/g, '');
  const cClassTrib = String(p.cClassTrib).replace(/\D/g, '');
  if (nbs.length !== 9) throw new RtcErro('NBS: informe os 9 dígitos.');
  if (cst.length !== 3) throw new RtcErro('CST: informe os 3 dígitos.');
  if (cClassTrib.length !== 6) throw new RtcErro('cClassTrib: informe os 6 dígitos.');
  const valor = valorTexto(p.valor);
  const d = await banco();
  const [c]: any[] = await d.select({ id: contratos.id, numero: contratos.numero }).from(contratos).where(eq(contratos.id, p.contratoId)).limit(1);
  if (!c) throw new RtcErro('Contrato não encontrado.', 404);

  const r = await chamar('simular', {
    regime: 'REGULAR', data_operacao: p.dataOperacao, uf: MUNICIPIO_PADRAO.uf, codigo_municipio: MUNICIPIO_PADRAO.codigo,
    itens: [{ valor, nbs, cst, cClassTrib }], simples: null,
    origem: { tipo: 'contrato', id: String(c.numero || c.id) },
    solicitado_por: `usuário ${usuario.id} do CRM`,
  });
  const avisos: string[] = Array.isArray(r?.avisos) ? r.avisos.map(String) : [];
  if (!avisos.includes(AVISO_FIXO)) avisos.unshift(AVISO_FIXO);
  const resultado = { ...r, avisos };
  await d.insert(simulacoesTributarias).values({
    contratoId: c.id, regime: 'REGULAR', dataOperacao: p.dataOperacao, valor, nbs, cst, cClassTrib,
    situacao: String(r?.situacao ?? 'nao_calculado').slice(0, 24), idExterno: r?.id ? String(r.id).slice(0, 64) : null,
    resultadoJson: JSON.stringify(resultado), solicitadoPor: usuario.id,
  });
  return resultado;
}

const ler = (t: string) => { try { return JSON.parse(t); } catch { return {}; } };

/** Simulações do contrato (mais recente primeiro) e os códigos da última simulação feita no CRM, para repetir na tela */
export async function doContrato(contratoId: number) {
  const d = await banco();
  const lista: any[] = await d.select().from(simulacoesTributarias).where(eq(simulacoesTributarias.contratoId, contratoId))
    .orderBy(desc(simulacoesTributarias.id)).limit(10);
  const [ultima]: any[] = await d.select({ nbs: simulacoesTributarias.nbs, cst: simulacoesTributarias.cst, cClassTrib: simulacoesTributarias.cClassTrib })
    .from(simulacoesTributarias).orderBy(desc(simulacoesTributarias.id)).limit(1);
  return {
    aviso: AVISO_FIXO,
    ultimosCodigos: ultima ? { nbs: ultima.nbs, cst: ultima.cst ?? '', cClassTrib: ultima.cClassTrib } : null,
    simulacoes: lista.map(s => ({
      id: s.id, dataOperacao: s.dataOperacao, valor: s.valor, nbs: s.nbs, cst: s.cst, cClassTrib: s.cClassTrib, situacao: s.situacao,
      criadoEm: s.createdAt, resultado: ler(s.resultadoJson),
    })),
  };
}
