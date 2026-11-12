/**
 * Inadimplência no portal jurídico (Lei n.º 6.766/1979, arts. 32 e 32-A; CPCV, Cláusulas 7ª, 8ª e 9ª):
 * 1. Alerta: contratos com parcelas vencidas e não pagas; a partir de GATILHO_PARCELAS (1) o caso vai para o jurídico.
 * 2. Notificação extrajudicial de constituição em mora (prazo de 30 dias para purgar), com os valores atualizados pelos
 *    encargos da Cláusula 7ª (mesmo cálculo da 2ª via).
 * 3. Requerimento ao Oficial: do Registro de Imóveis (intimação do art. 32, § 1º, com o compromisso registrado) ou de
 *    Títulos e Documentos (notificação extrajudicial, Lei n.º 6.015/1973, art. 160) enquanto o compromisso não estiver
 *    registrado.
 * 4. Ata de constatação do inadimplemento e da resolução (decorrido o prazo sem purgação): resolução de pleno direito,
 *    retorno do imóvel à VENDEDORA, restituição pelo art. 32-A e desocupação em 30 dias.
 * Os documentos ficam guardados (juridicoDocumentos) e são assinados com certificado digital ICP-Brasil pelos
 * advogados, pelo administrador e pelo empreendedor (assinaturas incrementais no mesmo PDF).
 */
import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos, empreendimentos, juridicoDocumentos, users } from '../../drizzle/schema';

export class JuridicoErro extends Error { constructor(m: string, public status = 400) { super(m); this.name = 'JuridicoErro'; } }

/** A partir da 1ª parcela vencida e não paga o caso já vai para o jurídico (CPCV, Cláusula 8ª) */
export const GATILHO_PARCELAS = 1;
export const TIPOS_DOC = ['notificacao', 'requerimento', 'ata', 'avulso'] as const;
export type TipoDoc = typeof TIPOS_DOC[number];
export const ROTULO_DOC: Record<TipoDoc, string> = {
  notificacao: 'Notificação extrajudicial de constituição em mora', requerimento: 'Requerimento de intimação ao Oficial',
  ata: 'Ata de constatação do inadimplemento e resolução do contrato', avulso: 'Documento avulso',
};
const ABERTAS = ['prevista', 'emitida', 'vencida'];
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const s = (v: unknown) => String(v ?? '').trim();
const cpfFmt = (v: unknown) => s(v).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const porExtenso = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const json = (v: unknown): any => { if (typeof v !== 'string') return v ?? null; try { return JSON.parse(v); } catch { return null; } };

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new JuridicoErro('Banco indisponível', 503);
  return d;
}

export interface ParcelaAtraso { id: number; rotulo: string; vencimento: string; valor: number; atualizado: number; dias: number }

/** Parcelas vencidas e não pagas de um contrato, atualizadas até hoje pelos encargos da Cláusula 7ª */
export async function parcelasEmAtraso(contratoId: number, hoje: string): Promise<ParcelaAtraso[]> {
  const d = await banco();
  const cobs: any[] = await d.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const { calcularEncargos } = await import('../financeiro/encargos');
  const { indicesIpcaMap } = await import('../financeiro/servico');
  const { rotuloParcela } = await import('../financeiro/dados');
  const ipca = await indicesIpcaMap().catch(() => new Map());
  return cobs
    .filter(c => ABERTAS.includes(String(c.status)) && String(c.vencimentoOriginal ?? c.vencimento).slice(0, 10) < hoje && c.tipo !== 'antecipacao')
    .map(c => {
      const venc = String(c.vencimentoOriginal ?? c.vencimento).slice(0, 10);
      const valor = Number(c.valorOriginal ?? c.valor);
      const e = calcularEncargos(valor, venc, hoje, ipca);
      return { id: Number(c.id), rotulo: rotuloParcela({ tipo: c.tipo, numero: Number(c.numero), total: Number(c.total) } as any), vencimento: venc, valor, atualizado: e.total, dias: e.dias };
    })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** Painel de inadimplência do empreendimento: contratos com parcela vencida (alerta a partir do gatilho) */
export async function inadimplentes(empreendimentoId: number, hoje: string, gatilho = GATILHO_PARCELAS) {
  const d = await banco();
  const cs: any[] = await d.select().from(contratos).where(and(eq(contratos.empreendimentoId, empreendimentoId), inArray(contratos.status, ['ativo', 'assinado'])));
  const docs: any[] = cs.length ? await d.select({ id: juridicoDocumentos.id, contratoId: juridicoDocumentos.contratoId, tipo: juridicoDocumentos.tipo, criadoEm: juridicoDocumentos.criadoEm, assinaturasJson: juridicoDocumentos.assinaturasJson })
    .from(juridicoDocumentos).where(inArray(juridicoDocumentos.contratoId, cs.map(c => Number(c.id)))) : [];
  const { pessoasDe } = await import('../contratos/servico');
  const out = [];
  for (const c of cs) {
    const ps = await parcelasEmAtraso(Number(c.id), hoje);
    if (!ps.length) continue;
    const { comprador } = await pessoasDe(Number(c.id)).catch(() => ({ comprador: null as any }));
    out.push({
      contratoId: Number(c.id), numero: String(c.numero), lote: String(c.loteCodigo), comprador: s(comprador?.nome) || '—',
      parcelas: ps, qtd: ps.length, valor: Math.round(ps.reduce((a, p) => a + p.valor, 0) * 100) / 100, atualizado: Math.round(ps.reduce((a, p) => a + p.atualizado, 0) * 100) / 100,
      maiorAtraso: Math.max(...ps.map(p => p.dias)), alerta: ps.length >= gatilho,
      documentos: docs.filter(x => Number(x.contratoId) === Number(c.id)).map(x => ({ id: Number(x.id), tipo: String(x.tipo), criadoEm: new Date(x.criadoEm).toISOString(), assinaturas: (json(x.assinaturasJson) ?? []).length })),
    });
  }
  return out.sort((a, b) => Number(b.alerta) - Number(a.alerta) || b.maiorAtraso - a.maiorAtraso);
}

/** Dados das partes para os documentos */
async function partes(contratoId: number) {
  const d = await banco();
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new JuridicoErro('Contrato não encontrado', 404);
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const { juridicoDe, pessoasDe } = await import('../contratos/servico');
  const j: any = await juridicoDe(Number(c.empreendimentoId));
  const v = (j.vendedora ?? {}) as Record<string, unknown>;
  const pj = j.vendedoraTipo === 'PJ';
  const { comprador, conjuge } = await pessoasDe(contratoId);
  const advs: any[] = await d.select({ nome: users.name, oab: users.oab, oabUf: users.oabUf, ativo: users.ativo, perfil: users.perfil })
    .from(users).where(eq(users.empreendimentoSlug, String(emp?.slug ?? '')));
  const endereco = (p: any) => p ? [s(p.logradouro), s(p.numero) && `n.º ${s(p.numero)}`, s(p.complemento), s(p.bairro), [s(p.cidade), s(p.uf)].filter(Boolean).join('/'), s(p.cep) && `CEP ${s(p.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')}`].filter(Boolean).join(', ') : '';
  return {
    c, emp, defaults: (j.defaults ?? {}) as Record<string, any>, marca: String(j.marcaSlug ?? 'bomjardims'),
    vendedora: { nome: s(pj ? v.vend_razao_social : v.vend_nome) || 'PROMITENTE VENDEDORA', doc: pj ? `CNPJ ${s(v.vend_cnpj)}` : `CPF ${cpfFmt(v.vend_cpf)}` },
    comprador: { nome: s(comprador?.nome) || 'COMPRADOR(A)', cpf: cpfFmt(comprador?.cpfCnpj), endereco: endereco(comprador) },
    conjuge: conjuge?.nome ? { nome: s(conjuge.nome), cpf: cpfFmt(conjuge.cpfCnpj) } : null,
    advogados: advs.filter(a => a.perfil === 'juridico' && !(a.ativo === false || a.ativo === 0)).map(a => ({ nome: s(a.nome), oab: a.oab ? `OAB/${s(a.oabUf)} ${s(a.oab)}` : 'OAB' })),
  };
}

export interface OpcoesDoc { via?: 'ri' | 'rtd'; dataIntimacao?: string | null; protocolo?: string | null; observacao?: string | null }

/** Gera o PDF do documento (sem assinatura digital; as assinaturas ICP entram depois, uma por pessoa) */
export async function pdfDocumento(contratoId: number, tipo: Exclude<TipoDoc, 'avulso'>, hoje: string, o: OpcoesDoc = {}): Promise<{ pdf: Buffer; titulo: string; dados: any }> {
  const P = await partes(contratoId);
  const ps = await parcelasEmAtraso(contratoId, hoje);
  if (!ps.length && tipo !== 'ata') throw new JuridicoErro('Este contrato não tem parcela vencida em aberto', 409);
  const { escritor } = await import('../contratos/docsComissao');
  const numero = s(P.c.numero), lote = s(P.c.loteCodigo), empNome = s(P.emp?.nome);
  const local = `${s(P.emp?.municipio) || 'Açailândia'}/${s(P.emp?.uf) || 'MA'}`;
  const totalOrig = ps.reduce((a, p) => a + p.valor, 0), totalAtual = ps.reduce((a, p) => a + p.atualizado, 0);
  const registrado = P.defaults.emp_parcelamento_registrado === true;
  const via = o.via ?? (registrado ? 'ri' : 'rtd');
  const oficial = via === 'ri' ? `Oficial do Registro de Imóveis — ${s(P.defaults.emp_cartorio_ri) || `Comarca de ${local}`}` : `Oficial do Registro de Títulos e Documentos da Comarca de ${local}`;
  const titulos: Record<string, string> = {
    notificacao: `Notificação extrajudicial — constituição em mora — ${numero}`,
    requerimento: `Requerimento de ${via === 'ri' ? 'intimação' : 'notificação'} ao Oficial — ${numero}`,
    ata: `Ata de constatação do inadimplemento e resolução — ${numero}`,
  };
  const w = await escritor(titulos[tipo], P.marca, `${ROTULO_DOC[tipo]} · CPCV n.º ${numero} · Chácara ${lote}`);
  const tabelaAtraso = () => {
    w.tabela(['Parcela', 'Vencimento', 'Valor original', 'Atraso', `Atualizado até ${br(hoje)}`],
      [...ps.map(p => [p.rotulo, br(p.vencimento), brl(p.valor), `${p.dias} dia(s)`, brl(p.atualizado)]), ['TOTAL', '', brl(totalOrig), '', brl(totalAtual)]],
      { pesos: [1.6, 1, 1.1, 0.8, 1.3], direita: [2, 3, 4] });
  };
  const qualifComprador = `${P.comprador.nome}${P.comprador.cpf ? `, inscrito(a) no CPF sob o n.º ${P.comprador.cpf}` : ''}${P.comprador.endereco ? `, residente e domiciliado(a) na ${P.comprador.endereco}` : ''}${P.conjuge ? `, e seu cônjuge/companheiro(a) ${P.conjuge.nome}, CPF n.º ${P.conjuge.cpf}` : ''}`;
  const advTxt = P.advogados.length ? `, por seus advogados ${P.advogados.map(a => `${a.nome} (${a.oab})`).join(' e ')}` : ', por seus advogados';
  const blocosAss = () => w.assinaturas([
    ...P.advogados.map(a => ({ papel: 'Advogado(a) — assinatura digital ICP-Brasil', nome: a.nome.toUpperCase(), doc: a.oab })),
    { papel: 'PROMITENTE VENDEDORA — assinatura digital ICP-Brasil', nome: P.vendedora.nome.toUpperCase(), doc: P.vendedora.doc },
  ]);
  const fecho = () => w.paragrafo(`${local}, ${porExtenso(hoje)}.`, { antes: 8, depois: 4 });

  if (tipo === 'notificacao') {
    w.cabecalho('NOTIFICAÇÃO EXTRAJUDICIAL', `Constituição em mora · Lei n.º 6.766/1979, art. 32 · CPCV n.º ${numero}`);
    w.paragrafo([{ t: 'NOTIFICANTE: ', b: true }, { t: `${P.vendedora.nome}, ${P.vendedora.doc}, promitente vendedora do ${empNome}${advTxt}.` }]);
    w.paragrafo([{ t: 'NOTIFICADO(A): ', b: true }, { t: `${qualifComprador}.` }]);
    w.clausula('1. DOS FATOS');
    w.paragrafo(`1.1. O(A) NOTIFICADO(A) celebrou com a NOTIFICANTE o Instrumento Particular de Compromisso de Compra e Venda n.º ${numero} (o "CPCV"), relativo à Chácara ${lote} do ${empNome}, ${local}, e encontra-se em atraso no pagamento das seguintes prestações, vencidas e não pagas:`);
    tabelaAtraso();
    w.paragrafo('1.2. Os valores atualizados compreendem a correção monetária pelo IPCA/IBGE, a multa moratória de 2% (dois por cento) e os juros de mora de 1% (um por cento) ao mês, pro rata die, previstos na Cláusula 7ª do CPCV, e serão novamente atualizados até a data do efetivo pagamento.');
    w.clausula('2. DA CONSTITUIÇÃO EM MORA E DO PRAZO PARA PURGAÇÃO');
    w.paragrafo([{ t: '2.1. Pela presente, fica o(a) NOTIFICADO(A) ' }, { t: 'CONSTITUÍDO(A) EM MORA', b: true }, { t: ' e ' }, { t: 'INTIMADO(A) a satisfazer, no prazo de 30 (trinta) dias contados do recebimento desta', b: true },
      { t: ', as prestações vencidas e as que se vencerem até a data do pagamento, com os encargos acima e as custas da intimação (Lei n.º 6.766/1979, art. 32, caput e § 1º; CPCV, Cláusula 8ª, item 8.1).' }]);
    w.paragrafo('2.2. O pagamento será feito exclusivamente por boleto bancário ou PIX emitidos pela plataforma de pagamentos do empreendimento, em nome da NOTIFICANTE, que serão enviados ao(à) NOTIFICADO(A) mediante solicitação pelos contatos do Quadro-Resumo, vedado o pagamento em espécie ou a terceiros.');
    w.clausula('3. DAS CONSEQUÊNCIAS DA NÃO PURGAÇÃO');
    w.paragrafo([{ t: '3.1. Decorrido o prazo sem a purgação da mora, ' }, { t: 'o CPCV será considerado rescindido de pleno direito', b: true },
      { t: ' (Lei n.º 6.766/1979, art. 32; CPCV, Cláusula 8ª), com o cancelamento do registro do compromisso, quando houver (art. 32, § 3º), e o retorno do imóvel à disponibilidade da NOTIFICANTE.' }]);
    w.paragrafo('3.2. Os valores pagos serão restituídos na forma do art. 32-A da Lei n.º 6.766/1979 e da Cláusula 9ª do CPCV, deduzidos a fruição do imóvel, a cláusula penal e as despesas administrativas, os débitos de tributos e contribuições associativas e a comissão de corretagem, e o(a) NOTIFICADO(A) deverá restituir a posse livre de pessoas e coisas em até 30 (trinta) dias da resolução (Cláusula 9.4), sob pena de reintegração de posse.');
    w.paragrafo('3.3. Purgada a mora no prazo, o contrato convalesce e segue em vigor (CPCV, Cláusula 8.2).');
    if (o.observacao) w.paragrafo(`Observação: ${o.observacao}`, { antes: 4 });
    fecho(); blocosAss();
    return { pdf: await w.salvar(), titulo: titulos[tipo], dados: { via, parcelas: ps.length, totalAtualizado: Math.round(totalAtual * 100) / 100 } };
  }

  if (tipo === 'requerimento') {
    w.cabecalho(`ILUSTRÍSSIMO(A) SENHOR(A) ${oficial.toUpperCase()}`, `Requerimento de ${via === 'ri' ? 'intimação — Lei n.º 6.766/1979, art. 32, § 1º' : 'notificação extrajudicial — Lei n.º 6.015/1973, art. 160'}`);
    w.paragrafo([{ t: `${P.vendedora.nome}`, b: true }, { t: `, ${P.vendedora.doc}, promitente vendedora do ${empNome}${advTxt}, vem, respeitosamente, à presença de Vossa Senhoria, ` },
      { t: via === 'ri' ? 'com fundamento no art. 32, § 1º, da Lei n.º 6.766/1979, REQUERER A INTIMAÇÃO' : 'com fundamento no art. 160 da Lei n.º 6.015/1973, REQUERER A NOTIFICAÇÃO EXTRAJUDICIAL', b: true },
      { t: ` de ${qualifComprador}, promissário(a) comprador(a) da Chácara ${lote} pelo Instrumento Particular de Compromisso de Compra e Venda n.º ${numero}, nos termos da notificação anexa, que integra este requerimento.` }]);
    w.paragrafo(`O(A) intimando(a) está em mora quanto a ${ps.length} prestação(ões), que somam ${brl(totalOrig)} de valor original e ${brl(totalAtual)} atualizados até ${br(hoje)} (Cláusula 7ª do CPCV), discriminadas na notificação.`);
    w.paragrafo(via === 'ri'
      ? 'Requer seja o(a) intimando(a) intimado(a) a satisfazer, no prazo de 30 (trinta) dias, as prestações vencidas e as que se vencerem até a data do pagamento, com os juros convencionados e as custas de intimação, e, decorrido o prazo sem o pagamento, seja expedida a certidão respectiva e averbado o cancelamento do registro do compromisso (Lei n.º 6.766/1979, art. 32, §§ 1º e 3º).'
      : 'Requer seja o(a) notificando(a) notificado(a) do inteiro teor da notificação anexa, com a entrega pessoal no endereço indicado, e a expedição da certidão da notificação, com a data do recebimento, para fins de contagem do prazo de 30 (trinta) dias para a purgação da mora previsto no CPCV (Cláusula 8ª) e no art. 32 da Lei n.º 6.766/1979.');
    w.paragrafo('Requer, ainda, que eventuais comunicações sejam dirigidas aos advogados signatários. Nestes termos, pede deferimento.');
    if (o.observacao) w.paragrafo(`Observação: ${o.observacao}`, { antes: 4 });
    fecho(); blocosAss();
    return { pdf: await w.salvar(), titulo: titulos[tipo], dados: { via, oficial, parcelas: ps.length } };
  }

  // Ata: decorrido o prazo sem purgação
  const intimado = o.dataIntimacao && /^\d{4}-\d{2}-\d{2}$/.test(o.dataIntimacao) ? o.dataIntimacao : null;
  if (!intimado) throw new JuridicoErro('Informe a data em que o(a) comprador(a) foi intimado(a)/notificado(a)', 400);
  const fimPrazo = new Date(Date.parse(`${intimado}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  if (fimPrazo >= hoje) throw new JuridicoErro(`O prazo de 30 dias para purgar a mora só termina em ${br(fimPrazo)}: a ata é lavrada depois dessa data`, 409);
  w.cabecalho('ATA DE CONSTATAÇÃO DO INADIMPLEMENTO E DA RESOLUÇÃO DO CONTRATO', `CPCV n.º ${numero} · Chácara ${lote} · Lei n.º 6.766/1979, arts. 32 e 32-A`);
  w.paragrafo([{ t: `Aos ${porExtenso(hoje)}, em ${local}, ` }, { t: `${P.vendedora.nome}`, b: true }, { t: `, ${P.vendedora.doc}, promitente vendedora do ${empNome}${advTxt}, lavra a presente ata para constar o seguinte:` }]);
  w.clausula('1. DA MORA E DA INTIMAÇÃO');
  w.paragrafo(`1.1. ${qualifComprador}, promissário(a) comprador(a) da Chácara ${lote} pelo CPCV n.º ${numero}, foi intimado(a)/notificado(a) em ${br(intimado)}${o.protocolo ? ` (protocolo/certidão n.º ${o.protocolo})` : ''} para, no prazo de 30 (trinta) dias, satisfazer as prestações vencidas, com os encargos da Cláusula 7ª do CPCV.`);
  if (ps.length) { w.paragrafo('1.2. Permanecem vencidas e não pagas as seguintes prestações:'); tabelaAtraso(); }
  w.clausula('2. DO DECURSO DO PRAZO SEM PURGAÇÃO E DA RESOLUÇÃO');
  w.paragrafo([{ t: `2.1. O prazo para a purgação da mora encerrou-se em ${br(fimPrazo)} sem o pagamento. Em consequência, ` }, { t: 'o CPCV n.º ' + numero + ' está rescindido de pleno direito', b: true },
    { t: ' (Lei n.º 6.766/1979, art. 32; CPCV, Cláusula 8ª), e o imóvel retorna à disponibilidade da PROMITENTE VENDEDORA, livre para nova comercialização, observado o cancelamento do registro do compromisso, quando houver (art. 32, § 3º).' }]);
  w.clausula('3. DA RESTITUIÇÃO E DA POSSE');
  w.paragrafo('3.1. Os valores pagos serão restituídos na forma do art. 32-A da Lei n.º 6.766/1979 e da Cláusula 9ª do CPCV, em demonstrativo apartado, deduzidos a fruição do imóvel (até 0,75% ao mês sobre o valor atualizado do contrato, desde a imissão na posse), a cláusula penal e as despesas administrativas, os débitos de tributos e contribuições associativas e a comissão de corretagem, pagos nos prazos do art. 32-A, § 1º.');
  w.paragrafo('3.2. O(A) ex-promissário(a) comprador(a) deverá restituir a posse livre de pessoas e coisas em até 30 (trinta) dias, sob pena de pagar a fruição em dobro até a desocupação, sem prejuízo da reintegração de posse (Cláusula 9.4), observado o regime das benfeitorias da Cláusula 9.3.');
  w.paragrafo('3.3. Dê-se ciência ao(à) ex-promissário(a) comprador(a) pelos contatos do Quadro-Resumo.');
  if (o.observacao) w.paragrafo(`Observação: ${o.observacao}`, { antes: 4 });
  w.paragrafo('Nada mais havendo, lavrou-se a presente ata, assinada digitalmente com certificados ICP-Brasil.', { antes: 6 });
  fecho(); blocosAss();
  return { pdf: await w.salvar(), titulo: titulos[tipo], dados: { intimado, fimPrazo, protocolo: o.protocolo ?? null, parcelas: ps.length } };
}

async function gravar(empreendimentoId: number, contratoId: number | null, tipo: TipoDoc, titulo: string, pdf: Buffer, autorId: number, dados: unknown) {
  const { salvarArquivo } = await import('../contratos/arquivos');
  const chave = `juridico/${empreendimentoId}/${tipo}-${contratoId ?? 'avulso'}-${Date.now()}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const d = await banco();
  const r: any = await d.insert(juridicoDocumentos).values({
    empreendimentoId, contratoId, tipo, titulo: titulo.slice(0, 250), pdfArquivo: chave, sha256: sha(pdf), assinaturasJson: '[]', dadosJson: JSON.stringify(dados ?? {}), criadoPor: autorId, criadoEm: new Date(),
  } as any);
  return { id: Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0) };
}

/** Gera e guarda o documento de um contrato (no histórico do contrato) */
export async function gerarDocumento(contratoId: number, tipo: Exclude<TipoDoc, 'avulso'>, autorId: number, hoje: string, o: OpcoesDoc = {}) {
  const { pdf, titulo, dados } = await pdfDocumento(contratoId, tipo, hoje, o);
  const d = await banco();
  const [c]: any[] = await d.select({ empreendimentoId: contratos.empreendimentoId }).from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  const r = await gravar(Number(c.empreendimentoId), contratoId, tipo, titulo, pdf, autorId, { ...dados, opcoes: o });
  const { evento } = await import('../assinatura/servico');
  await evento(contratoId, null, 'juridico_documento', { detalhe: { documentoId: r.id, tipo, usuarioId: autorId } });
  return r;
}

/** Ofício, alteração, solicitação… enviado em PDF para assinar com certificado */
export async function salvarAvulso(empreendimentoId: number, titulo: string, pdf: Buffer, autorId: number, contratoId: number | null = null) {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new JuridicoErro('Envie um arquivo PDF');
  if (titulo.trim().length < 3) throw new JuridicoErro('Dê um título ao documento');
  return gravar(empreendimentoId, contratoId, 'avulso', titulo.trim(), pdf, autorId, {});
}

export async function documentosDo(empreendimentoId: number) {
  const d = await banco();
  const rs: any[] = await d.select().from(juridicoDocumentos).where(eq(juridicoDocumentos.empreendimentoId, empreendimentoId)).orderBy(desc(juridicoDocumentos.id));
  const ids = Array.from(new Set(rs.map(r => Number(r.contratoId)).filter(Boolean)));
  const cs: any[] = ids.length ? await d.select({ id: contratos.id, numero: contratos.numero, lote: contratos.loteCodigo }).from(contratos).where(inArray(contratos.id, ids)) : [];
  return rs.map(r => {
    const c = cs.find(x => Number(x.id) === Number(r.contratoId));
    return {
      id: Number(r.id), tipo: String(r.tipo), rotuloTipo: ROTULO_DOC[r.tipo as TipoDoc] ?? r.tipo, titulo: String(r.titulo), contrato: c ? `${c.numero} · Chácara ${c.lote}` : null,
      assinaturas: (json(r.assinaturasJson) ?? []) as { usuarioId: number; nome: string; cpf: string | null; emissor: string; em: string }[],
      url: `/api/juridico/documentos/${r.id}.pdf`, criadoEm: new Date(r.criadoEm).toISOString(),
    };
  });
}

export async function documentoPorId(id: number) {
  const d = await banco();
  const [r]: any[] = await d.select().from(juridicoDocumentos).where(eq(juridicoDocumentos.id, id)).limit(1);
  if (!r) throw new JuridicoErro('Documento não encontrado', 404);
  return r;
}

export async function pdfDoDocumento(id: number) {
  const r = await documentoPorId(id);
  const { lerArquivo } = await import('../contratos/arquivos');
  const a = await lerArquivo(r.pdfArquivo);
  if (!a) throw new JuridicoErro('Arquivo não encontrado', 404);
  return { buf: a.buf, nome: `${String(r.titulo).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'documento'}.pdf`, empreendimentoId: Number(r.empreendimentoId) };
}

/** Assina o documento com o certificado digital do usuário (incremental: as assinaturas anteriores continuam válidas) */
export async function assinarDocumento(id: number, usuario: { id: number; name?: string | null }, senha: string, pfxAgora: Buffer | null = null) {
  const r = await documentoPorId(id);
  const assinaturas: any[] = json(r.assinaturasJson) ?? [];
  if (assinaturas.some(a => Number(a.usuarioId) === Number(usuario.id))) throw new JuridicoErro('Você já assinou este documento', 409);
  const { lerArquivo, salvarArquivo } = await import('../contratos/arquivos');
  const a = await lerArquivo(r.pdfArquivo);
  if (!a) throw new JuridicoErro('Arquivo não encontrado', 404);
  const { assinarComMeuCertificado } = await import('../certificado/servico');
  const { pdf, info } = await assinarComMeuCertificado(usuario.id, a.buf, senha, { motivo: String(r.titulo).slice(0, 120), pfxAgora });
  const chave = `juridico/${r.empreendimentoId}/${r.tipo}-${r.contratoId ?? 'avulso'}-${Date.now()}-ass${assinaturas.length + 1}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const nova = { usuarioId: usuario.id, nome: info.nome, cpf: info.cpf, emissor: info.emissor, em: new Date().toISOString() };
  const d = await banco();
  await d.update(juridicoDocumentos).set({ pdfArquivo: chave, sha256: sha(pdf), assinaturasJson: JSON.stringify([...assinaturas, nova]), atualizadoEm: new Date() } as any).where(eq(juridicoDocumentos.id, id));
  if (r.contratoId) {
    const { evento } = await import('../assinatura/servico');
    await evento(Number(r.contratoId), null, 'juridico_assinado', { detalhe: { documentoId: id, tipo: r.tipo, nome: info.nome } });
  }
  return { ok: true as const, assinaturas: assinaturas.length + 1, nome: info.nome };
}
