/**
 * Termos aditivos em lote para os contratos já assinados de um empreendimento (só o administrador, com a senha):
 *
 * - REGISTRO: saiu o registro do parcelamento no Cartório de Registro de Imóveis (Lei n.º 6.766/1979, art. 18).
 *   O termo inclui no CPCV o número do registro, a data, o cartório, a matrícula do empreendimento e, se já aberta,
 *   a matrícula individual da chácara. Opcionalmente grava esses dados no cadastro do empreendimento: os contratos
 *   novos e o talão já saem com o registro.
 * - LIBERAÇÃO: a chácara fica liberada para transferência (cessão de direitos a terceiros e, quitada, escritura
 *   definitiva), a partir da data e com o fundamento informados (ex.: termo de verificação e aceite das obras).
 *
 * Cada contrato recebe o seu Termo Aditivo (número seguinte do contrato), com o link de assinatura no WhatsApp do
 * comprador — o mesmo fluxo do termo de renegociação (server/financeiro/renegociacao.ts): código de 6 dígitos,
 * aceite e manifesto de evidências anexado ao PDF. Textos para revisão do jurídico antes do uso.
 */
import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { contratoAditivos, contratos, empJuridico, empreendimentos, lotes } from '../../drizzle/schema';
import { ContratoErro, juridicoDe } from './servico';

export const TIPOS_ADITIVO_LOTE = ['registro', 'liberacao'] as const;
export type TipoAditivoLote = typeof TIPOS_ADITIVO_LOTE[number];
export const TITULO_ADITIVO: Record<TipoAditivoLote, string> = { registro: 'Registro do loteamento', liberacao: 'Liberação para transferência' };
const STATUS_COM_ADITIVO = ['assinado', 'ativo'];

export interface DadosRegistro {
  numeroRegistro: string; dataRegistro: string; cartorio: string; matriculaEmpreendimento: string; livroFolhas?: string | null;
  /** Matrícula individual de cada chácara (código → matrícula), se já abertas */
  matriculas?: Record<string, string> | null;
  /** Grava no cadastro do empreendimento (contratos novos e talão) */
  atualizarCadastro?: boolean;
  observacao?: string | null;
}
export interface DadosLiberacao {
  dataLiberacao: string;
  /** Ato que libera (ex.: "Termo de Verificação e Aceite das Obras n.º 12/2027, emitido pela Prefeitura de Açailândia em 10/03/2027") */
  fundamento: string;
  observacao?: string | null;
}

const s = (v: unknown) => String(v ?? '').trim();
const br = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const porExtenso = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new ContratoErro('DB', 'Banco indisponível', 503);
  return d;
}

export function validarDados(tipo: TipoAditivoLote, dados: any): string | null {
  const data = /^\d{4}-\d{2}-\d{2}$/;
  if (tipo === 'registro') {
    if (s(dados.numeroRegistro).length < 2) return 'Informe o número do registro (ex.: R-1 da matrícula)';
    if (!data.test(s(dados.dataRegistro))) return 'Informe a data do registro';
    if (s(dados.cartorio).length < 5) return 'Informe o Cartório de Registro de Imóveis';
    if (s(dados.matriculaEmpreendimento).length < 1) return 'Informe a matrícula do empreendimento';
    return null;
  }
  if (!data.test(s(dados.dataLiberacao))) return 'Informe a data da liberação';
  if (s(dados.fundamento).length < 10) return 'Descreva o ato que libera a transferência (ex.: termo de aceite das obras)';
  return null;
}

/** Pontos principais (página de assinatura do comprador e lista do escritório) */
export function pontosDoTermo(tipo: TipoAditivoLote, dados: any, lote: string): string[] {
  if (tipo === 'registro') {
    const mat = s(dados.matriculas?.[lote]);
    return [
      `Loteamento registrado: ${s(dados.numeroRegistro)} da matrícula n.º ${s(dados.matriculaEmpreendimento)}, em ${br(s(dados.dataRegistro))}`,
      `Cartório: ${s(dados.cartorio)}`,
      mat ? `Matrícula individual da sua chácara (${lote}): n.º ${mat}` : `A matrícula individual da chácara ${lote} será informada quando aberta pelo cartório`,
      'As demais cláusulas do contrato continuam valendo, sem nenhuma mudança de preço ou de parcelas',
    ];
  }
  return [
    `Chácara ${lote} liberada para transferência a partir de ${br(s(dados.dataLiberacao))}`,
    `Fundamento: ${s(dados.fundamento)}`,
    'Cessão de direitos a terceiros: com anuência prévia por escrito e o comprador em dia com as parcelas',
    'Escritura definitiva: após a quitação do preço, com ITBI e emolumentos pagos pelo comprador',
    'As demais cláusulas do contrato continuam valendo, sem nenhuma mudança de preço ou de parcelas',
  ];
}

/** PDF do termo (mesma marca e escritor dos documentos do contrato) */
async function termoPdf(contratoId: number, numero: number, tipo: TipoAditivoLote, dados: any, hoje: string): Promise<Buffer> {
  const { escritor } = await import('./docsComissao');
  const d = await banco();
  const [ct]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  const [emp]: any[] = await d.select({ nome: empreendimentos.nome, municipio: empreendimentos.municipio, uf: empreendimentos.uf }).from(empreendimentos).where(eq(empreendimentos.id, ct.empreendimentoId)).limit(1);
  const j: any = await juridicoDe(Number(ct.empreendimentoId));
  const { pessoasDoContrato } = await import('../financeiro/servico');
  const { comprador, conjuge } = await pessoasDoContrato(contratoId);
  const v = j.vendedora as Record<string, unknown>;
  const pj = j.vendedoraTipo === 'PJ';
  const vendedora = s(pj ? v.vend_razao_social : v.vend_nome);
  const vendDoc = pj ? `inscrita no CNPJ sob o n.º ${s(v.vend_cnpj)}` : `inscrita no CPF sob o n.º ${s(v.vend_cpf)}`;
  const cpf = (x: unknown) => s(x).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const end = comprador ? [s(comprador.logradouro), s(comprador.numero) && `n.º ${s(comprador.numero)}`, s(comprador.bairro), [s(comprador.cidade), s(comprador.uf)].filter(Boolean).join('/')].filter(Boolean).join(', ') : '';
  const lote = s(ct.loteCodigo);
  const titulo = TITULO_ADITIVO[tipo];
  const w = await escritor(`Termo Aditivo n.º ${numero} — CPCV ${s(ct.numero)}`, String(j.marcaSlug ?? 'bomjardims'), `Termo Aditivo n.º ${numero} ao CPCV n.º ${s(ct.numero)} · ${titulo}`);
  w.cabecalho(`TERMO ADITIVO N.º ${numero} AO INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA N.º ${s(ct.numero)}`,
    `${titulo} · ${s(emp?.nome)} · Chácara ${lote}`);
  w.paragrafo([{ t: 'Pelo presente instrumento particular, de um lado, ' }, { t: vendedora, b: true }, { t: `, ${vendDoc}, doravante denominada ` }, { t: 'PROMITENTE VENDEDORA', b: true },
    { t: '; e, de outro lado, ' }, { t: s(comprador?.nome), b: true }, { t: `, inscrito(a) no CPF sob o n.º ${cpf(comprador?.cpfCnpj)}${end ? `, residente e domiciliado(a) na ${end}` : ''}` },
    { t: conjuge?.nome ? `, e seu cônjuge/companheiro(a) ${s(conjuge.nome)}, CPF n.º ${cpf(conjuge.cpfCnpj)}` : '' }, { t: ', doravante denominado(a) ' },
    { t: 'PROMISSÁRIO(A) COMPRADOR(A)', b: true },
    { t: `, partes no Instrumento Particular de Compromisso de Compra e Venda n.º ${s(ct.numero)} (o "CPCV"), relativo à Chácara ${lote} do ${s(emp?.nome)}, ${s(emp?.municipio) || 'Açailândia'}/${s(emp?.uf) || 'MA'}, resolvem celebrar o presente Termo Aditivo, que se regerá pelas cláusulas seguintes.` }]);

  if (tipo === 'registro') {
    const mat = s(dados.matriculas?.[lote]);
    w.clausula('CLÁUSULA 1ª — DO OBJETO');
    w.paragrafo([{ t: '1.1. O presente Termo Aditivo tem por objeto incluir no CPCV os dados do ' }, { t: 'registro do parcelamento do solo', b: true },
      { t: ` do ${s(emp?.nome)}, realizado nos termos do art. 18 da Lei n.º 6.766/1979: ` },
      { t: `${s(dados.numeroRegistro)} na matrícula n.º ${s(dados.matriculaEmpreendimento)}${s(dados.livroFolhas) ? ` (${s(dados.livroFolhas)})` : ''} do ${s(dados.cartorio)}, em ${br(s(dados.dataRegistro))}`, b: true }, { t: '.' }]);
    w.paragrafo(mat
      ? [{ t: `1.2. A Chácara ${lote}, objeto do CPCV, passa a corresponder à ` }, { t: `matrícula individual n.º ${mat}`, b: true }, { t: ` do mesmo Cartório, que substitui, para todos os fins, a referência ao imóvel de origem.` }]
      : `1.2. A matrícula individual da Chácara ${lote} será aberta pelo Cartório a partir do registro; aberta, o seu número será comunicado ao(à) PROMISSÁRIO(A) COMPRADOR(A) e passa a integrar o CPCV independentemente de novo aditivo.`);
    w.clausula('CLÁUSULA 2ª — DOS EFEITOS');
    w.paragrafo('2.1. Ficam atualizadas as referências do CPCV e do seu Quadro-Resumo ao registro do parcelamento, à matrícula do empreendimento e à matrícula da unidade, que passam a ser as indicadas na Cláusula 1ª.');
    w.paragrafo('2.2. O registro não altera o preço, as parcelas, os vencimentos nem as demais obrigações financeiras do CPCV. Quitado o preço, a PROMITENTE VENDEDORA outorgará a escritura definitiva, na forma do CPCV e do art. 26, § 6º, da Lei n.º 6.766/1979, com o ITBI, os emolumentos e as despesas de registro a cargo do(a) PROMISSÁRIO(A) COMPRADOR(A).');
    w.paragrafo('2.3. O(A) PROMISSÁRIO(A) COMPRADOR(A) poderá registrar o CPCV e este Termo na matrícula da unidade (Lei n.º 6.766/1979, art. 26 e art. 32), às suas expensas.');
  } else {
    w.clausula('CLÁUSULA 1ª — DO OBJETO');
    w.paragrafo([{ t: `1.1. O presente Termo Aditivo tem por objeto registrar a ` }, { t: `liberação da Chácara ${lote} para transferência`, b: true },
      { t: ` a partir de ${br(s(dados.dataLiberacao))}, com fundamento em: ${s(dados.fundamento)}.` }]);
    w.clausula('CLÁUSULA 2ª — DA CESSÃO DE DIREITOS');
    w.paragrafo('2.1. A partir da liberação, o(a) PROMISSÁRIO(A) COMPRADOR(A) poderá ceder os direitos e obrigações do CPCV a terceiro, desde que esteja em dia com as parcelas e obtenha a anuência prévia e por escrito da PROMITENTE VENDEDORA, mediante instrumento de cessão com a qualificação completa do(a) cessionário(a), que assumirá integralmente o CPCV, e o pagamento da taxa de cessão prevista no CPCV, quando houver.');
    w.paragrafo('2.2. A cessão feita sem a anuência da PROMITENTE VENDEDORA não lhe produz efeitos, permanecendo o(a) PROMISSÁRIO(A) COMPRADOR(A) responsável por todas as obrigações do CPCV.');
    w.clausula('CLÁUSULA 3ª — DA ESCRITURA DEFINITIVA');
    w.paragrafo('3.1. Quitado o preço, a PROMITENTE VENDEDORA outorgará a escritura definitiva ao(à) PROMISSÁRIO(A) COMPRADOR(A) ou ao(à) cessionário(a) regularmente anuído(a), em até 60 (sessenta) dias do pedido, sendo o ITBI, os emolumentos, as certidões e as despesas de registro a cargo do(a) adquirente.');
  }
  if (s(dados.observacao)) { w.clausula('CLÁUSULA ESPECÍFICA'); w.paragrafo(s(dados.observacao)); }
  w.clausula('DA RATIFICAÇÃO E DA AUSÊNCIA DE NOVAÇÃO');
  w.paragrafo('Este Termo não importa novação (Código Civil, arts. 360 e 361). Permanecem em pleno vigor todas as demais cláusulas e condições do CPCV e de seus anexos, que as partes ratificam, salvo no que for expressamente alterado por este instrumento.');
  w.clausula('DAS DISPOSIÇÕES GERAIS');
  w.paragrafo('As partes reconhecem a validade da assinatura eletrônica deste instrumento, realizada mediante código de confirmação enviado ao WhatsApp cadastrado do(a) PROMISSÁRIO(A) COMPRADOR(A), com registro de evidências anexado a este documento (Medida Provisória n.º 2.200-2/2001, art. 10, § 2º; Lei n.º 14.063/2020). Os dados pessoais são tratados exclusivamente para a execução do contrato (Lei n.º 13.709/2018, art. 7º, V). Fica eleito o foro da Comarca de Açailândia/MA, com renúncia a qualquer outro, por mais privilegiado que seja.');
  w.paragrafo(`Açailândia/MA, ${porExtenso(hoje)}.`, { antes: 8, depois: 4 });
  w.assinaturas([
    { papel: 'PROMITENTE VENDEDORA', nome: vendedora, doc: pj ? `CNPJ ${s(v.vend_cnpj)}` : `CPF ${s(v.vend_cpf)}` },
    { papel: 'PROMISSÁRIO(A) COMPRADOR(A) — assinatura eletrônica', nome: s(comprador?.nome), doc: `CPF ${cpf(comprador?.cpfCnpj)}` },
  ]);
  return w.salvar();
}

/** Contratos que recebem o termo: assinados/ativos do empreendimento, sem termo do mesmo tipo assinado ou aguardando */
export async function previaLote(empreendimentoId: number, tipo: TipoAditivoLote) {
  const d = await banco();
  const cs: any[] = await d.select().from(contratos).where(and(eq(contratos.empreendimentoId, empreendimentoId), inArray(contratos.status, STATUS_COM_ADITIVO)));
  if (!cs.length) return [];
  const ads: any[] = await d.select().from(contratoAditivos).where(inArray(contratoAditivos.contratoId, cs.map(c => Number(c.id))));
  const { pessoasDoContrato } = await import('../financeiro/servico');
  const { foneAditivo } = await import('../financeiro/renegociacao');
  const out = [];
  for (const c of cs) {
    const deste = ads.filter(a => Number(a.contratoId) === Number(c.id) && a.tipo === tipo && a.status !== 'cancelado');
    const { comprador } = await pessoasDoContrato(Number(c.id)).catch(() => ({ comprador: null as any }));
    out.push({
      contratoId: Number(c.id), contrato: s(c.numero), lote: s(c.loteCodigo), comprador: s(comprador?.nome) || '—',
      temWhatsapp: !!foneAditivo(comprador?.telefone1),
      situacao: deste.some(a => a.status === 'assinado') ? 'assinado' as const : deste.some(a => a.status === 'aguardando') ? 'aguardando' as const : 'recebe' as const,
      aditivoId: deste[0] ? Number(deste[0].id) : null,
    });
  }
  return out.sort((a, b) => a.lote.localeCompare(b.lote));
}

/** Grava os dados do registro no cadastro do empreendimento (contratos novos e talão) e as matrículas das chácaras */
async function atualizarCadastroRegistro(empreendimentoId: number, dados: DadosRegistro) {
  const d = await banco();
  const [j]: any[] = await d.select().from(empJuridico).where(eq(empJuridico.empreendimentoId, empreendimentoId)).limit(1);
  if (j) {
    const defaults = typeof j.defaultsJson === 'string' ? JSON.parse(j.defaultsJson || '{}') : (j.defaultsJson ?? {});
    const novos = {
      ...defaults, emp_registro_parcelamento: s(dados.numeroRegistro), emp_registro_data: br(s(dados.dataRegistro)), emp_cartorio_ri: s(dados.cartorio),
      emp_matricula_empreendimento: s(dados.matriculaEmpreendimento), ...(s(dados.livroFolhas) ? { emp_matricula_livro_fls: s(dados.livroFolhas) } : {}),
    };
    await d.update(empJuridico).set({ defaultsJson: novos, atualizadoEm: new Date() } as any).where(eq(empJuridico.empreendimentoId, empreendimentoId));
  }
  for (const [codigo, matricula] of Object.entries(dados.matriculas ?? {})) {
    if (!s(matricula)) continue;
    await d.update(lotes).set({ matricula: s(matricula) } as any).where(and(eq(lotes.empreendimentoId, empreendimentoId), eq(lotes.codigo, codigo.toUpperCase())));
  }
}

/** Gera e envia o termo para cada contrato que ainda não tem (assinado ou aguardando) */
export async function gerarLote(empreendimentoId: number, tipo: TipoAditivoLote, dados: DadosRegistro | DadosLiberacao, autorId: number, o: { enviarWhatsapp?: boolean } = {}) {
  const erro = validarDados(tipo, dados);
  if (erro) throw new ContratoErro('DADOS', erro, 400);
  const d = await banco();
  const hoje = hojeBr();
  if (tipo === 'registro' && (dados as DadosRegistro).atualizarCadastro !== false) await atualizarCadastroRegistro(empreendimentoId, dados as DadosRegistro);
  const alvo = (await previaLote(empreendimentoId, tipo)).filter(p => p.situacao === 'recebe');
  const { salvarArquivo } = await import('./arquivos');
  const { enviarLink, linkAditivo, shaAditivo } = await import('../financeiro/renegociacao');
  const { auditar } = await import('../financeiro/servico');
  let gerados = 0, enviados = 0;
  const semWhatsapp: string[] = [], falhas: string[] = [];
  for (const p of alvo) {
    try {
      const todos: any[] = await d.select({ numero: contratoAditivos.numero }).from(contratoAditivos).where(eq(contratoAditivos.contratoId, p.contratoId));
      const numero = todos.reduce((m, a) => Math.max(m, Number(a.numero)), 0) + 1;
      const pdf = await termoPdf(p.contratoId, numero, tipo, dados, hoje);
      const chave = `aditivos/${p.contratoId}/aditivo-${numero}-${tipo}-${Date.now()}.pdf`;
      await salvarArquivo(chave, pdf, 'application/pdf');
      const token = randomBytes(16).toString('hex');
      const pontos = pontosDoTermo(tipo, dados, p.lote);
      await d.insert(contratoAditivos).values({
        contratoId: p.contratoId, numero, tipo, status: 'aguardando',
        dadosJson: JSON.stringify({ tipo, titulo: TITULO_ADITIVO[tipo], resumo: pontos[0], pontos, dados, data: hoje, lote: p.lote }),
        pdfArquivo: chave, pdfSha256: shaAditivo(pdf), token, criadoPor: autorId, criadoEm: new Date(),
      } as any);
      gerados++;
      await auditar('aditivo_criado', { contratoId: p.contratoId, usuarioId: autorId, origem: 'perfil', detalhe: { numero, tipo, lote: true } });
      if (o.enviarWhatsapp === false) continue;
      if (!p.temWhatsapp) { semWhatsapp.push(`${p.contrato} (${p.lote})`); continue; }
      const r = await enviarLink(p.contratoId, token, numero, tipo).catch(() => ({ enviado: false }));
      if (r.enviado) enviados++; else falhas.push(`${p.contrato}: WhatsApp não enviou — copie o link ${linkAditivo(token)}`);
    } catch (e: any) { falhas.push(`${p.contrato}: ${String(e?.message ?? e).slice(0, 160)}`); }
  }
  return { gerados, enviados, semWhatsapp, falhas, pulados: (await previaLote(empreendimentoId, tipo)).length - alvo.length };
}

/** Depois da assinatura: registro grava a matrícula da chácara (se veio no termo) */
export async function aplicarAditivoLote(aditivoId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.id, aditivoId)).limit(1);
  if (!a || a.status !== 'assinado') throw new ContratoErro('STATUS', 'Termo não assinado', 409);
  if (a.resultadoJson) return JSON.parse(a.resultadoJson) as { aplicado: true; matricula?: string | null };
  const x = JSON.parse(a.dadosJson);
  let matricula: string | null = null;
  if (x.tipo === 'registro') {
    matricula = s(x.dados?.matriculas?.[x.lote]) || null;
    if (matricula) {
      const [c]: any[] = await d.select({ loteId: contratos.loteId }).from(contratos).where(eq(contratos.id, a.contratoId)).limit(1);
      if (c?.loteId) await d.update(lotes).set({ matricula } as any).where(eq(lotes.id, c.loteId));
    }
  }
  const resultado = { aplicado: true as const, matricula };
  await d.update(contratoAditivos).set({ resultadoJson: JSON.stringify(resultado) } as any).where(eq(contratoAditivos.id, aditivoId));
  return resultado;
}

/** Painel do escritório: termos de registro/liberação do empreendimento, com o andamento das assinaturas */
export async function andamentoLote(empreendimentoId: number, tipo: TipoAditivoLote) {
  const lista = await previaLote(empreendimentoId, tipo);
  return {
    total: lista.length,
    assinados: lista.filter(p => p.situacao === 'assinado').length,
    aguardando: lista.filter(p => p.situacao === 'aguardando').length,
    semTermo: lista.filter(p => p.situacao === 'recebe').length,
    contratos: lista,
  };
}

