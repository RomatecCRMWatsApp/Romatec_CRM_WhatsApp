/**
 * Correção de posicionamento das assinaturas (só administrador, com a senha): quando os carimbos de um contrato já
 * assinado saíram no lugar errado (sobrepostos, em tabela, em documento anexado), refaz a via a partir da versão
 * congelada no envio para assinatura (antes de qualquer carimbo), localizando de novo cada linha de assinatura, e
 * recoloca o carimbo de cada pessoa com os MESMOS dados da assinatura dela (data/hora, IP, código). Ninguém assina de
 * novo: as evidências (código no WhatsApp, leitura, aceite) são as originais. Gera nova versão, novo manifesto com o
 * novo SHA-256 e a nota da correção, e registra tudo na trilha de auditoria. Só assinatura eletrônica avançada:
 * PDF com assinatura digital ICP/gov.br não pode ser regravado.
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { assinaturaSignatarios, contratos, contratoVersoes, empreendimentos } from '../../drizzle/schema';
import type { Caixa } from './pdf';
import { juridicoDe } from '../contratos/servico';

export class CorrecaoErro extends Error { constructor(m: string, public status = 409) { super(m); this.name = 'CorrecaoErro'; } }

const json = (v: unknown): any => { if (typeof v !== 'string') return v ?? {}; try { return JSON.parse(v); } catch { return {}; } };

export interface ResultadoCorrecao { versao: number; caixas: number; porPessoa: { nome: string; papel: string; caixas: number; paginas: number[] }[]; quadroAcrescentado: boolean; sha256: string }

export async function corrigirPosicionamento(contratoId: number, usuarioId: number): Promise<ResultadoCorrecao> {
  const d: any = await getDb();
  if (!d) throw new CorrecaoErro('Banco indisponível', 503);
  const A = await import('./servico');
  const P = await import('./pdf');
  const { localizarAssinaturas, caixasSemSobreposicao } = await import('./autoPosicao');
  const { temAssinaturaDigital } = await import('./icp');
  const { lerArquivo } = await import('../contratos/arquivos');
  const { ESCRITORIO } = await import('../../shared/escritorio');

  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new CorrecaoErro('Contrato não encontrado', 404);
  if (!['assinado', 'ativo', 'quitado'].includes(String(c.status)) || !c.manifestoArquivo) throw new CorrecaoErro('A correção é para contrato com todas as assinaturas concluídas');
  const sigs: any[] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, contratoId));
  if (!sigs.length || sigs.some(s => s.status !== 'assinado')) throw new CorrecaoErro('Há assinatura pendente: a correção é feita depois que todos assinarem');
  if (sigs.some(s => s.metodo !== 'avancada')) throw new CorrecaoErro('Há assinatura digital ICP-Brasil/gov.br no arquivo: ele não pode ser regravado. Use a página de assinaturas ou um aditivo.');

  // Base: a última versão congelada no envio para assinatura (sem nenhum carimbo)
  const ultimaBase = (await d.select().from(contratoVersoes).where(and(eq(contratoVersoes.contratoId, contratoId), eq(contratoVersoes.etapa, 'para_assinatura'))).orderBy(asc(contratoVersoes.versao))).at(-1);
  if (!ultimaBase) throw new CorrecaoErro('Versão enviada para assinatura não encontrada', 404);
  const arq = await lerArquivo(ultimaBase.arquivo);
  if (!arq) throw new CorrecaoErro('Arquivo da versão enviada para assinatura não encontrado', 404);
  let pdf: Buffer = arq.buf;
  if (temAssinaturaDigital(pdf)) throw new CorrecaoErro('A versão enviada já tem assinatura digital: não pode ser regravada');

  // Posições de novo, no PDF congelado: só linhas de assinatura (traço + nome), sem sobreposição
  let caixas: Caixa[] = caixasSemSobreposicao(await localizarAssinaturas(pdf, sigs.map(s => ({
    papel: s.papel, nome: s.nome, apelidos: s.papel === 'intermediadora' ? [ESCRITORIO.fantasia, ESCRITORIO.razaoSocial, ESCRITORIO.responsavel] : [],
  }))));
  // Quem não tem linha de assinatura no PDF ganha o quadro de assinaturas no fim (como no envio)
  const sem = sigs.filter(s => !caixas.some(cx => cx.papel === s.papel));
  if (sem.length) {
    const r = await P.paginaDeAssinaturas(pdf, sem.map(s => ({ papel: s.papel, nome: s.nome, cpf: s.cpf, metodo: s.metodo })), { numero: c.numero, marca: (await juridicoDe(c.empreendimentoId)).marcaSlug, codigo: c.codigoVerificacao });
    pdf = r.pdf;
    caixas = [...caixas, ...r.caixas];
  }

  // Carimbo de cada pessoa com os dados ORIGINAIS da assinatura dela
  for (const s of sigs) {
    const e = json(s.evidenciasJson);
    const quando = s.assinadoEm ? new Date(s.assinadoEm) : new Date(e.quando ?? Date.now());
    for (const cx of caixas.filter(x => x.papel === s.papel)) {
      pdf = await P.carimbarAvancada(pdf, cx, { nome: s.nome, cpf: s.cpf, quando, ip: String(e.ip ?? '—'), codigo: c.codigoVerificacao });
    }
  }

  const anterior = { versao: null as number | null, sha256: c.hashAtual as string | null };
  const v = await A.novaVersao(contratoId, 'correcao_posicionamento', pdf);
  await A.salvarPosicoes(caixas, { contratoId });
  const [emp]: any[] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const quandoBr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
  const chave = await A.gravarManifesto(contratoId, pdf, sigs, emp?.nome ?? '', {
    sufixo: `-v${v.versao}`,
    nota: `Posicionamento dos carimbos corrigido em ${quandoBr} pelo administrador, sobre a versão enviada para assinatura (v${ultimaBase.versao}), com os mesmos dados de cada assinatura; nenhum signatário assinou de novo. SHA-256 anterior: ${String(anterior.sha256 ?? '').slice(0, 16)}…`,
  });
  await d.update(contratos).set({ manifestoArquivo: chave }).where(eq(contratos.id, contratoId));
  const porPessoa = sigs.map(s => {
    const cs = caixas.filter(x => x.papel === s.papel);
    return { nome: String(s.nome), papel: String(s.papel), caixas: cs.length, paginas: Array.from(new Set(cs.map(x => x.pagina))).sort((a, b) => a - b) };
  });
  await A.evento(contratoId, null, 'posicionamento_corrigido', {
    detalhe: { usuarioId, versaoBase: Number(ultimaBase.versao), versaoNova: v.versao, caixas: caixas.length, quadroAcrescentado: sem.length > 0, shaAnterior: anterior.sha256, shaNovo: v.sha256, porPessoa },
  });
  return { versao: v.versao, caixas: caixas.length, porPessoa, quadroAcrescentado: sem.length > 0, sha256: v.sha256 };
}
