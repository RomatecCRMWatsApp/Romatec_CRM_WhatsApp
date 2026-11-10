/**
 * Texto do Contrato de Gestão (EMPREENDEDORA × GESTORA) e dos Recibos de Adiantamento, num só modelo de blocos
 * renderizado em PDF (escritor dos contratos, com a marca do empreendimento) e em Word (.docx editável).
 *
 * Base legal: Código Civil (prestação de serviços, arts. 593 a 609; corretagem, arts. 722 a 729; contrato preliminar,
 * arts. 462 a 466; preferência, arts. 513 a 520), Lei n.º 6.766/1979 (parcelamento do solo), Lei n.º 6.015/1973,
 * Lei n.º 6.530/1978 (corretagem), NBR 13133 (execução de levantamento topográfico), Norma Técnica para Georreferenciamento
 * de Imóveis Rurais do INCRA, CPC art. 784, III (título executivo), MP 2.200-2/2001 e Lei n.º 14.063/2020 (assinatura eletrônica).
 */
import { zipSync, strToU8 } from 'fflate';
import { escritor } from '../contratos/docsComissao';
import { brl, dataBR, dataExtenso, extenso, pct, reaisExtenso } from '../contratos/formato';
import { ESCRITORIO } from '../../shared/escritorio';
import { CATEGORIAS_APORTE, ROTULO_FORMA_APORTE, totalAgrimensura } from '../../shared/gestao';
import type { AporteGestao, DadosContratoGestao } from './servico';

type Trecho = { t: string; b?: boolean };
export type Bloco =
  | { k: 'cab'; t1: string; t2: string }
  | { k: 'faixa'; t: string }
  | { k: 'clau'; t: string }
  | { k: 'par'; tr: Trecho[]; recuo?: number }
  | { k: 'tab'; cab: string[]; linhas: string[][]; pesos?: number[]; direita?: number[] }
  | { k: 'ass'; blocos: { papel: string; nome: string; doc?: string }[] }
  | { k: 'quebra' };

const P = (t: string, recuo?: number): Bloco => ({ k: 'par', tr: [{ t }], recuo });
const PB = (...tr: Trecho[]): Bloco => ({ k: 'par', tr });
const C = (t: string): Bloco => ({ k: 'clau', t });
const reais = (v: number) => `R$ ${brl(v)} (${reaisExtenso(v)})`;
const pctExt = (v: number) => { const n = Math.round(v * 10000) / 100; return Number.isInteger(n) ? `${pct(v, 0)} (${extenso(n)} por cento)` : pct(v, 2); };
const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });

export const GESTORA = {
  nome: `${ESCRITORIO.razaoSocial.toUpperCase()} (${ESCRITORIO.fantasia.toUpperCase()})`,
  qualif: `pessoa jurídica de direito privado inscrita no CNPJ sob o n.º ${ESCRITORIO.cnpj}, registrada no ${ESCRITORIO.creciJ.replace('CRECI J-', 'CRECI/MA sob o n.º J-')}, com sede na ${ESCRITORIO.endereco}, neste ato representada por seu representante legal ${ESCRITORIO.responsavel}, corretor de imóveis (${ESCRITORIO.creciResponsavel}), avaliador imobiliário (CNAI 031161), Técnico em Agrimensura (CFT/MA 01209185369, credenciado no INCRA sob o código FQNS) e Técnico em Edificações`,
};

/** Qualificação da EMPREENDEDORA a partir da configuração jurídica (campos que faltam ficam de fora) */
export function qualificacaoEmpreendedora(g: DadosContratoGestao): { nome: string; qualif: string; doc: string } {
  const v = g.vend;
  if (g.vendedoraPj) {
    const nome = v.vend_razao_social || v.vend_nome || 'EMPREENDEDORA';
    return { nome, doc: v.vend_cnpj ? `CNPJ ${v.vend_cnpj}` : '', qualif: [v.vend_cnpj && `inscrita no CNPJ sob o n.º ${v.vend_cnpj}`, v.vend_endereco && `com sede em ${v.vend_endereco}`].filter(Boolean).join(', ') };
  }
  const nome = v.vend_nome || 'EMPREENDEDORA';
  const partes = [
    v.vend_nacionalidade, v.vend_estado_civil, v.vend_profissao,
    v.vend_nascimento && `nascida em ${v.vend_nascimento}`, v.vend_naturalidade && `natural de ${v.vend_naturalidade}`,
    v.vend_filiacao && `filha de ${v.vend_filiacao}`,
    v.vend_rg && `portadora do RG n.º ${v.vend_rg}`, v.vend_cnh && `CNH n.º ${v.vend_cnh}`, v.vend_cpf && `inscrita no CPF sob o n.º ${v.vend_cpf}`,
    v.vend_email && `e-mail ${v.vend_email}`, v.vend_telefone && `telefone ${v.vend_telefone}`,
    v.vend_endereco && `residente e domiciliada em ${v.vend_endereco}`,
  ].filter(Boolean);
  return { nome, doc: v.vend_cpf ? `CPF ${v.vend_cpf}` : '', qualif: partes.join(', ') };
}

/** Descrição do imóvel (configuração jurídica) */
function imovel(g: DadosContratoGestao): string {
  const e = g.emp;
  return [
    e.emp_imovel_denominacao ? `imóvel denominado ${e.emp_imovel_denominacao}` : `imóvel do ${g.empreendimento.nome}`,
    e.emp_area_ha && `com área de ${e.emp_area_ha} ha${e.emp_perimetro_m ? ` e perímetro de ${e.emp_perimetro_m} m` : ''}`,
    e.emp_matricula_origem && `objeto da Matrícula n.º ${e.emp_matricula_origem}${e.emp_matricula_livro_fls ? `, ${e.emp_matricula_livro_fls}` : ''}${e.emp_cartorio_ri ? `, do ${e.emp_cartorio_ri}` : ''}`,
    e.emp_sigef && `georreferenciado e certificado no SIGEF/INCRA sob o n.º ${e.emp_sigef}`,
    e.emp_ccir && `cadastrado no INCRA (CCIR) sob o n.º ${e.emp_ccir}`,
    e.emp_cib && `e na Receita Federal sob o CIB ${e.emp_cib}`,
  ].filter(Boolean).join(', ');
}

const totalAportes = (a: AporteGestao[]) => Math.round(a.reduce((s, x) => s + x.valor, 0) * 100) / 100;

export function blocosContrato(g: DadosContratoGestao): Bloco[] {
  const p = g.parametros, E = qualificacaoEmpreendedora(g);
  const data = p.dataContrato || hojeIso();
  const local = `${g.empreendimento.municipio}/${g.empreendimento.uf}`;
  const agr = totalAgrimensura(p, g.qtdLotes);
  const b: Bloco[] = [];

  b.push({ k: 'cab', t1: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GESTÃO INTEGRAL DE EMPREENDIMENTO IMOBILIÁRIO, DE AGRIMENSURA E OUTRAS AVENÇAS',
    t2: `Contrato n.º ${g.numero} · ${g.empreendimento.nome} · ${local}` });
  b.push(PB({ t: 'Pelo presente instrumento particular, de um lado, ' }, { t: E.nome, b: true }, { t: `${E.qualif ? `, ${E.qualif}` : ''}, titular dos direitos sobre o imóvel adiante descrito, doravante denominada ` }, { t: 'EMPREENDEDORA', b: true },
    { t: '; e, de outro lado, ' }, { t: GESTORA.nome, b: true }, { t: `, ${GESTORA.qualif}, doravante denominada ` }, { t: 'GESTORA', b: true },
    { t: '; têm entre si justo e contratado o presente Contrato de Gestão, que se regerá pelas cláusulas e condições seguintes.' }));

  b.push(C('CLÁUSULA 1ª — DO IMÓVEL E DO EMPREENDIMENTO'));
  b.push(P(`1.1. O objeto deste contrato é o ${g.empreendimento.nome}, implantado no ${imovel(g)}, doravante denominado EMPREENDIMENTO, composto de ${g.qtdLotes} (${extenso(g.qtdLotes)}) lotes conforme o projeto de parcelamento vigente.`));
  if (g.emp.emp_titulo_aquisitivo) b.push(P(`1.2. Título da EMPREENDEDORA: ${g.emp.emp_titulo_aquisitivo}.`));
  if (g.emp.emp_onus_declarados || g.emp.emp_inventario_situacao) b.push(P(`1.3. Situação declarada pela EMPREENDEDORA: ${[g.emp.emp_onus_declarados, g.emp.emp_inventario_situacao].filter(Boolean).join('; ')}. A EMPREENDEDORA responde pela regularização desses itens e por qualquer ônus não declarado.`));

  b.push(C('CLÁUSULA 2ª — DO OBJETO'));
  b.push(P('2.1. A EMPREENDEDORA contrata a GESTORA, com exclusividade, para a gestão integral do EMPREENDIMENTO, compreendendo:'));
  [
    '(a) planejamento, desenvolvimento e acompanhamento do parcelamento: projetos, aprovações municipais, licenciamento ambiental e suas condicionantes, registro do loteamento e abertura das matrículas individuais;',
    '(b) gestão comercial e de vendas: definição de tabela e condições com a EMPREENDEDORA, marketing, atendimento, CRM, credenciamento e coordenação de corretores e imobiliárias parceiras, visitas e propostas;',
    '(c) gestão contratual: elaboração dos compromissos de compra e venda, aditivos, termos de concessão, distratos e cessões, com assinatura eletrônica e controle dos documentos;',
    '(d) gestão financeira das vendas: emissão de carnês e boletos, conciliação, cobrança amigável dos compradores e prestação de contas à EMPREENDEDORA;',
    '(e) acompanhamento e fiscalização das obras de infraestrutura (vias, drenagem, água, energia, portal e áreas comuns);',
    '(f) serviços técnicos de agrimensura e topografia, na forma da Cláusula 4ª;',
    '(g) relacionamento com cartórios, órgãos públicos, concessionárias e a associação dos proprietários.',
  ].forEach(t => b.push(P(t, 18)));

  b.push(C('CLÁUSULA 3ª — DA REMUNERAÇÃO DA GESTÃO'));
  b.push(PB({ t: '3.1. Pela gestão integral, a EMPREENDEDORA pagará à GESTORA ' }, { t: `${pctExt(p.comissaoPct)} sobre o valor de cada alienação de unidade do EMPREENDIMENTO`, b: true },
    { t: ', qualquer que seja a modalidade ou quem a tenha intermediado, inclusive: (a) venda realizada pela GESTORA; (b) venda intermediada por corretor ou imobiliária parceira; (c) venda direta pela EMPREENDEDORA ou por pessoa por ela indicada; (d) concessão, permuta, dação em pagamento, doação ou cessão de unidade a terceiro indicado pela EMPREENDEDORA; e (e) venda de unidades em bloco ou da área remanescente.' }));
  b.push(P('3.2. A base de cálculo é o preço total contratado da unidade (entrada e saldo). Nas hipóteses da alínea (d), sem preço, a base é o valor da tabela de vendas vigente na data do respectivo termo.'));
  b.push(P(`3.3. Nas vendas intermediadas por corretor ou imobiliária parceira, a corretagem do intermediador, de até ${pctExt(p.corretorParceiroPct)} do valor da venda, é paga pela GESTORA a partir da remuneração da Cláusula 3.1, sem acréscimo para a EMPREENDEDORA.`));
  b.push(P('3.4. A remuneração é devida na assinatura de cada contrato de alienação e paga na forma do Contrato de Comissão firmado em cada venda, que integra este instrumento, preferencialmente por retenção automática (split) na plataforma de pagamentos no recebimento da entrada. Nas hipóteses da alínea (d), sem fluxo financeiro, a EMPREENDEDORA pagará a remuneração em até 10 (dez) dias da assinatura do termo.'));
  b.push(P('3.5. A remuneração decorre do resultado útil da gestão (Código Civil, art. 725) e não será restituída em caso de desistência, distrato a pedido ou inadimplemento do comprador, ressalvada a devolução integral ao comprador por arrependimento no prazo legal (CDC, art. 49).'));
  b.push(P('3.6. A EMPREENDEDORA comunicará à GESTORA, em até 48 (quarenta e oito) horas, qualquer negociação direta de unidade, para formalização pelo sistema da GESTORA. A alienação não comunicada não afasta a remuneração, que será acrescida de multa de 20% (vinte por cento) sobre o seu valor.'));

  b.push(C('CLÁUSULA 4ª — DOS SERVIÇOS DE AGRIMENSURA E TOPOGRAFIA'));
  b.push(P('4.1. Serviços já executados pela GESTORA: levantamento georreferenciado e certificação da área no SIGEF/INCRA, levantamento planialtimétrico, projeto de parcelamento com mapa e quadro de áreas, e locação dos eixos das vias do EMPREENDIMENTO.'));
  b.push(P('4.2. Serviços a executar: (a) locação individual de cada lote, com implantação de marcos nos vértices; (b) pontos de locação da faixa marginal do córrego/rio (Área de Preservação Permanente) e da área de vivência; (c) memoriais descritivos e plantas individuais dos lotes; e (d) emissão do Termo de Responsabilidade Técnica (TRT) no Conselho Federal dos Técnicos Industriais.'));
  b.push(PB({ t: '4.3. Pelos serviços de agrimensura e topografia, a EMPREENDEDORA pagará à GESTORA ' }, { t: `${reais(p.valorPorLote)} por lote, totalizando ${reais(agr)} para os ${g.qtdLotes} (${extenso(g.qtdLotes)}) lotes`, b: true },
    { t: ', incluídos os pontos de locação do rio e da área de vivência, sem acréscimo. O quadro de quantidades consta do Anexo II.' }));
  b.push(P('4.4. O pagamento é devido por lote locado e entregue com o respectivo memorial, apurado em boletim de medição, e será feito com os recursos das vendas do EMPREENDIMENTO, por retenção na forma da Cláusula 5.3, ou diretamente pela EMPREENDEDORA em até 10 (dez) dias da medição.'));
  b.push(P('4.5. Os serviços seguem a NBR 13133 (execução de levantamento topográfico), a Norma Técnica para Georreferenciamento de Imóveis Rurais do INCRA, a Lei n.º 6.015/1973 e a Lei n.º 6.766/1979, sob a responsabilidade técnica de José Romário Pinto Bezerra, Técnico em Agrimensura, CFT/MA 01209185369, credenciado no INCRA (FQNS).'));
  b.push(P('4.6. A relocação de marcos removidos ou danificados por terceiros, compradores ou obras após a entrega será cobrada à parte, pelo mesmo valor unitário por lote.'));

  b.push(C('CLÁUSULA 5ª — DOS ADIANTAMENTOS COM RECURSOS PRÓPRIOS DA GESTORA'));
  b.push(P('5.1. A GESTORA poderá antecipar, com recursos próprios, despesas do EMPREENDIMENTO, tais como obras de infraestrutura, materiais e marcos, serviços de terceiros, taxas, emolumentos, licenças, tributos do imóvel e marketing, registrando cada desembolso no CRM com o respectivo comprovante.'));
  b.push(P('5.2. Cada adiantamento é documentado por Recibo de Adiantamento (Anexo I), assinado pelas partes, e constitui crédito da GESTORA contra a EMPREENDEDORA, líquido, certo e exigível, que a EMPREENDEDORA reconhece e confessa dever, para os fins do art. 784, III, do Código de Processo Civil.'));
  b.push(PB({ t: '5.3. Os adiantamentos e os serviços da Cláusula 4ª serão ressarcidos com prioridade pelos recebimentos do EMPREENDIMENTO: fica a GESTORA autorizada a reter, de cada valor recebido das vendas (entradas e parcelas) que transite pela plataforma de pagamentos, ' },
    { t: `até ${pctExt(p.retencaoAportesPct)} da parte destinada à EMPREENDEDORA`, b: true }, { t: ', até a quitação integral, com demonstrativo mensal.' }));
  b.push(P('5.4. Os valores adiantados serão corrigidos monetariamente pelo IPCA/IBGE desde cada desembolso até o ressarcimento, sem juros remuneratórios. Em caso de extinção deste contrato, o saldo será exigível de imediato.'));
  if (g.aportes.length) b.push(P(`5.5. Até a data deste instrumento, os adiantamentos somam ${reais(totalAportes(g.aportes))}, conforme os ${g.aportes.length} (${extenso(g.aportes.length)}) recibos do Anexo I. Novos adiantamentos serão documentados por recibos numerados em sequência, que integram este contrato.`));

  b.push(C('CLÁUSULA 6ª — DA PRESTAÇÃO DE CONTAS'));
  b.push(P('6.1. Os recebimentos das vendas serão feitos em nome da EMPREENDEDORA na plataforma de pagamentos indicada pela GESTORA, com divisão automática (split) das remunerações e retenções deste contrato. A GESTORA prestará contas mensalmente, por relatório no CRM, com vendas, recebimentos, inadimplência, retenções, adiantamentos e saldo.'));
  b.push(P('6.2. A EMPREENDEDORA poderá solicitar, a qualquer tempo, o extrato e os comprovantes de qualquer lançamento, que serão disponibilizados em até 5 (cinco) dias úteis.'));

  b.push(C('CLÁUSULA 7ª — DA PROMESSA DE TRANSFERÊNCIA DO IMÓVEL'));
  b.push(P('7.1. A EMPREENDEDORA promete transferir à GESTORA, ou a sociedade incorporadora ou loteadora por ela indicada e de que participe, a titularidade do imóvel descrito na Cláusula 1ª, ou da área remanescente e das unidades ainda não alienadas, para fins de registro do loteamento, regularização e continuidade do EMPREENDIMENTO, tão logo concluídos: (a) a adjudicação ou partilha do imóvel em nome da EMPREENDEDORA; (b) o cancelamento dos ônus que gravam o imóvel; e (c) as aprovações necessárias ao registro.'));
  b.push(P('7.2. A transferência será formalizada por escritura pública, em instrumento definitivo que fixará o preço e a forma de pagamento (compra e venda, dação em pagamento dos créditos da GESTORA previstos neste contrato, permuta por unidades ou integralização de capital), preservados integralmente os contratos já firmados com os compradores e o direito da EMPREENDEDORA ao preço das unidades vendidas antes da transferência.'));
  b.push(P('7.3. Até a transferência, a GESTORA terá direito de preferência, em igualdade de condições, em qualquer alienação do imóvel ou da área remanescente (Código Civil, arts. 513 a 520), e a EMPREENDEDORA não alienará nem onerará o imóvel a terceiros sem anuência expressa da GESTORA, ressalvadas as vendas de unidades feitas na forma deste contrato.'));
  b.push(P('7.4. As despesas da transferência (ITBI, escritura, registro e emolumentos) serão suportadas na forma do instrumento definitivo. Esta promessa obriga as partes, seus herdeiros e sucessores, aplicando-se, no que couber, os arts. 462 a 466 do Código Civil.'));

  b.push(C('CLÁUSULA 8ª — DAS OBRIGAÇÕES DA GESTORA'));
  b.push(P('8.1. Compete à GESTORA: (a) executar os serviços com diligência e técnica, observadas as normas legais e técnicas aplicáveis; (b) manter o CRM, os contratos e os documentos do EMPREENDIMENTO organizados e acessíveis à EMPREENDEDORA; (c) prestar contas na forma da Cláusula 6ª; (d) responder pelos corretores e prestadores que contratar e pelo repasse das corretagens da Cláusula 3.3; (e) guardar sigilo e tratar os dados pessoais conforme a Cláusula 12ª.'));

  b.push(C('CLÁUSULA 9ª — DAS OBRIGAÇÕES DA EMPREENDEDORA'));
  b.push(P('9.1. Compete à EMPREENDEDORA: (a) outorgar à GESTORA os poderes e procurações necessários à execução deste contrato; (b) fornecer documentos e assinar, em até 5 (cinco) dias úteis, os instrumentos que dependam da sua assinatura; (c) cumprir as condicionantes da licença ambiental e manter em dia os tributos do imóvel; (d) não contratar outra gestora, incorporadora ou imobiliária para o EMPREENDIMENTO durante a vigência deste contrato; (e) pagar as remunerações, os serviços e os ressarcimentos previstos neste contrato.'));

  b.push(C('CLÁUSULA 10ª — DAS RESPONSABILIDADES'));
  b.push(P('10.1. A GESTORA responde pela correção técnica dos serviços que executa e pelos danos que causar por culpa ou dolo na execução deste contrato, limitada a sua responsabilidade ao valor das remunerações recebidas nos últimos 12 (doze) meses, salvo dolo.'));
  b.push(P('10.2. A EMPREENDEDORA, na qualidade de titular do imóvel, responde pela titularidade, pela evicção, pelos ônus e passivos do imóvel (inclusive ambientais e tributários anteriores a este contrato), pelas condicionantes da licença ambiental e pelas obrigações assumidas perante os compradores nos compromissos de compra e venda.'));
  b.push(P('10.3. A GESTORA não responde pela inadimplência dos compradores, por atos ou demoras de órgãos públicos, cartórios e concessionárias, nem por caso fortuito ou força maior (Código Civil, art. 393).'));
  b.push(P('10.4. Cada parte responde, com exclusividade, pelas obrigações trabalhistas, previdenciárias e tributárias de seus empregados e contratados, sem qualquer vínculo entre estes e a outra parte.'));

  b.push(C('CLÁUSULA 11ª — DA EXCLUSIVIDADE, DO PRAZO E DA RESCISÃO'));
  b.push(P(`11.1. Este contrato vigora, com exclusividade, a partir da assinatura, pelo prazo mínimo de ${p.prazoMinimoMeses} (${extenso(p.prazoMinimoMeses)}) meses e, em qualquer caso, até a alienação da última unidade, o registro do loteamento e a quitação de todos os créditos da GESTORA.`));
  b.push(P('11.2. O descumprimento de qualquer cláusula, não sanado em 15 (quinze) dias da notificação, autoriza a parte prejudicada a rescindir o contrato, sem prejuízo de perdas e danos.'));
  b.push(PB({ t: '11.3. Extinto o contrato por qualquer motivo, permanecem devidas à GESTORA: (a) a remuneração sobre as alienações já contratadas, inclusive sobre parcelas futuras; (b) os serviços de agrimensura executados; e (c) o saldo dos adiantamentos, corrigido. Na rescisão imotivada ou por culpa da EMPREENDEDORA, esta pagará ainda multa compensatória de ' },
    { t: `${pctExt(p.multaRescisaoPct)} sobre o valor de tabela das unidades não alienadas`, b: true }, { t: ' na data da rescisão.' }));

  b.push(C('CLÁUSULA 12ª — DO SIGILO E DA PROTEÇÃO DE DADOS'));
  b.push(P('12.1. As partes guardarão sigilo sobre as informações deste contrato e do EMPREENDIMENTO e tratarão os dados pessoais de compradores, corretores e demais titulares somente para a execução deste contrato e o cumprimento de obrigações legais, observada a Lei n.º 13.709/2018 (LGPD).'));

  b.push(C('CLÁUSULA 13ª — DAS DISPOSIÇÕES GERAIS E DO FORO'));
  b.push(P('13.1. Integram este contrato os Anexos I (Recibos de Adiantamento) e II (Quadro dos serviços de agrimensura), os Contratos de Comissão de cada venda e os aditivos que as partes firmarem. Alterações somente valem por escrito. A tolerância de uma parte não importa novação ou renúncia.'));
  b.push(P('13.2. As partes reconhecem a validade da assinatura eletrônica deste instrumento e de seus anexos (MP n.º 2.200-2/2001 e Lei n.º 14.063/2020). Assinado pelas partes e por 2 (duas) testemunhas, este contrato constitui título executivo extrajudicial (CPC, art. 784, III).'));
  b.push(P(`13.3. As partes elegem o foro da Comarca de ${local}, com renúncia a qualquer outro, por mais privilegiado que seja.`));
  if (p.observacoes) b.push(P(`13.4. ${p.observacoes}`));
  b.push(P(`E, por estarem justas e contratadas, as partes assinam o presente instrumento. ${local}, ${dataExtenso(data)}.`));
  b.push({ k: 'ass', blocos: [
    { papel: 'EMPREENDEDORA', nome: E.nome, doc: E.doc || undefined },
    { papel: `GESTORA — ${ESCRITORIO.fantasia}`, nome: ESCRITORIO.responsavel, doc: `CNPJ ${ESCRITORIO.cnpj} · ${ESCRITORIO.creciJ}` },
    { papel: 'Testemunha 1', nome: p.testemunha1Nome || 'Nome:', doc: p.testemunha1Cpf ? `CPF ${p.testemunha1Cpf}` : 'CPF:' },
    { papel: 'Testemunha 2', nome: p.testemunha2Nome || 'Nome:', doc: p.testemunha2Cpf ? `CPF ${p.testemunha2Cpf}` : 'CPF:' },
  ] });

  // Anexo I — recibos
  b.push({ k: 'quebra' });
  b.push({ k: 'cab', t1: 'ANEXO I — RECIBOS DE ADIANTAMENTO', t2: `Contrato de Gestão n.º ${g.numero} · Cláusula 5ª` });
  if (!g.aportes.length) b.push(P('Nenhum adiantamento registrado até esta data. Os recibos serão emitidos pelo CRM a cada desembolso da GESTORA e integram este contrato.'));
  else {
    b.push({ k: 'tab', cab: ['Recibo', 'Data', 'Descrição', 'Valor (R$)', 'Situação'], pesos: [0.8, 1, 4.4, 1.4, 1.2], direita: [3],
      linhas: [...g.aportes.map(a => [`${a.numero}`, dataBR(a.data), a.descricao, brl(a.valor), a.ressarcidoEm ? `ressarcido ${dataBR(a.ressarcidoEm)}` : 'a ressarcir']),
        ['TOTAL', '', '', brl(totalAportes(g.aportes)), '']] });
    for (const a of g.aportes) { b.push({ k: 'quebra' }); b.push(...blocosRecibo(g, a, true)); }
  }

  // Anexo II — agrimensura
  b.push({ k: 'quebra' });
  b.push({ k: 'cab', t1: 'ANEXO II — QUADRO DOS SERVIÇOS DE AGRIMENSURA E TOPOGRAFIA', t2: `Contrato de Gestão n.º ${g.numero} · Cláusula 4ª` });
  b.push({ k: 'tab', cab: ['Serviço', 'Situação', 'Quantidade', 'Valor unitário (R$)', 'Total (R$)'], pesos: [4, 1.4, 1.2, 1.6, 1.4], direita: [2, 3, 4],
    linhas: [
      ['Georreferenciamento e certificação SIGEF/INCRA, levantamento e projeto', 'executado', '—', '—', 'incluído'],
      ['Locação dos eixos das vias', 'executado', '—', '—', 'incluído'],
      ['Locação individual dos lotes, com marcos nos vértices', 'a executar', String(g.qtdLotes), brl(p.valorPorLote), brl(agr)],
      ['Pontos de locação da faixa do rio (APP) e área de vivência', 'a executar', '—', '—', 'incluído'],
      ['Memoriais descritivos e plantas individuais; TRT', 'a executar', String(g.qtdLotes), '—', 'incluído'],
      ['TOTAL DOS SERVIÇOS', '', '', '', brl(agr)],
    ] });
  b.push(P(`Valor total: ${reais(agr)}. Pagamento por lote locado e entregue, conforme boletim de medição (Cláusula 4.4).`));
  return b;
}

/** Recibo de Adiantamento (avulso ou dentro do Anexo I) */
export function blocosRecibo(g: DadosContratoGestao, a: AporteGestao, noAnexo = false): Bloco[] {
  const E = qualificacaoEmpreendedora(g);
  const local = `${g.empreendimento.municipio}/${g.empreendimento.uf}`;
  return [
    { k: 'cab', t1: `RECIBO DE ADIANTAMENTO N.º ${String(a.numero).padStart(3, '0')}/${a.data.slice(0, 4)}`, t2: `${noAnexo ? 'Anexo I do ' : ''}Contrato de Gestão n.º ${g.numero} · ${g.empreendimento.nome}` },
    PB({ t: 'Valor: ' }, { t: reais(a.valor), b: true }),
    PB({ t: 'A EMPREENDEDORA, ' }, { t: E.nome, b: true }, { t: `${E.doc ? `, ${E.doc}` : ''}, declara e reconhece que a GESTORA, ` }, { t: GESTORA.nome, b: true },
      { t: `, CNPJ ${ESCRITORIO.cnpj}, pagou com recursos próprios, em ${dataBR(a.data)}, a importância de ${reais(a.valor)}, referente a ` }, { t: a.descricao, b: true },
      { t: `, em favor do ${g.empreendimento.nome}.` }),
    P(`Categoria: ${CATEGORIAS_APORTE[a.categoria as keyof typeof CATEGORIAS_APORTE] ?? a.categoria}. Forma de pagamento: ${ROTULO_FORMA_APORTE[a.formaPagamento as keyof typeof ROTULO_FORMA_APORTE] ?? a.formaPagamento}.${a.favorecido ? ` Favorecido: ${a.favorecido}.` : ''}${a.comprovante ? ` Comprovante: ${a.comprovante}.` : ''}`),
    P('O valor constitui crédito da GESTORA, corrigido pelo IPCA/IBGE desde o desembolso, a ser ressarcido com os recebimentos do EMPREENDIMENTO nos termos da Cláusula 5ª do Contrato de Gestão, do qual este recibo é parte integrante.'),
    P(`${local}, ${dataExtenso(a.data)}.`),
    { k: 'ass', blocos: [
      { papel: 'EMPREENDEDORA', nome: E.nome, doc: E.doc || undefined },
      { papel: `GESTORA — ${ESCRITORIO.fantasia}`, nome: ESCRITORIO.responsavel, doc: `CNPJ ${ESCRITORIO.cnpj}` },
    ] },
  ];
}

// ───────────────────────────── Renderizadores ─────────────────────────────

export async function blocosParaPdf(blocos: Bloco[], titulo: string, rodape: string, marca = 'bomjardims'): Promise<Buffer> {
  const w = await escritor(titulo, marca, rodape);
  for (const b of blocos) {
    if (b.k === 'cab') w.cabecalho(b.t1, b.t2);
    else if (b.k === 'faixa') w.faixa(b.t);
    else if (b.k === 'clau') w.clausula(b.t);
    else if (b.k === 'par') w.paragrafo(b.tr, b.recuo ? { recuo: b.recuo } : {});
    else if (b.k === 'tab') w.tabela(b.cab, b.linhas, { pesos: b.pesos, direita: b.direita });
    else if (b.k === 'ass') w.assinaturas(b.blocos);
    else if (b.k === 'quebra') w.quebra();
  }
  return w.salvar();
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (t: string, o: { b?: boolean; sz?: number; cor?: string } = {}) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${o.b ? '<w:b/>' : ''}${o.cor ? `<w:color w:val="${o.cor}"/>` : ''}<w:sz w:val="${o.sz ?? 22}"/></w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
const para = (runs: string, o: { jc?: string; antes?: number; depois?: number; recuo?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.antes ?? 0}" w:after="${o.depois ?? 120}" w:line="300" w:lineRule="auto"/><w:jc w:val="${o.jc ?? 'both'}"/>${o.recuo ? `<w:ind w:left="${o.recuo}"/>` : ''}</w:pPr>${runs}</w:p>`;

/** Word (.docx) editável com o mesmo conteúdo */
export function blocosParaDocx(blocos: Bloco[]): Buffer {
  const corpo: string[] = [];
  for (const b of blocos) {
    if (b.k === 'cab') {
      corpo.push(para(run(b.t1, { b: true, sz: 26, cor: '0C3320' }), { jc: 'center', depois: 60 }));
      corpo.push(para(run(b.t2, { sz: 19, cor: '5C6B5F' }), { jc: 'center', depois: 240 }));
    } else if (b.k === 'faixa') corpo.push(para(run(b.t, { b: true, cor: '8B1A1A' }), { jc: 'left' }));
    else if (b.k === 'clau') corpo.push(para(run(b.t, { b: true, cor: '0C3320' }), { jc: 'left', antes: 160, depois: 80 }));
    else if (b.k === 'par') corpo.push(para(b.tr.map(t => run(t.t, { b: t.b })).join(''), { recuo: b.recuo ? b.recuo * 20 : 0 }));
    else if (b.k === 'tab') {
      const pesos = b.pesos ?? b.cab.map(() => 1), soma = pesos.reduce((x, y) => x + y, 0);
      const larg = pesos.map(w => Math.round((w / soma) * 9000));
      const cel = (t: string, i: number, cab: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${larg[i]}" w:type="dxa"/>${cab ? '<w:shd w:val="clear" w:color="auto" w:fill="0C3320"/>' : ''}</w:tcPr>${para(run(t, { b: cab || /^TOTAL/.test(t), sz: 18, cor: cab ? 'FFFFFF' : undefined }), { jc: b.direita?.includes(i) ? 'right' : 'left', depois: 40 })}</w:tc>`;
      const borda = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="C9A84C"/>`).join('') + '</w:tblBorders>';
      corpo.push(`<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>${borda}</w:tblPr><w:tblGrid>${larg.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
        `<w:tr>${b.cab.map((t, i) => cel(t, i, true)).join('')}</w:tr>${b.linhas.map(l => `<w:tr>${l.map((t, i) => cel(t, i, false)).join('')}</w:tr>`).join('')}</w:tbl>`);
      corpo.push(para('', { depois: 120 }));
    } else if (b.k === 'ass') {
      for (const a of b.blocos) {
        corpo.push(para(run('______________________________________________'), { jc: 'left', antes: 360, depois: 0 }));
        corpo.push(para(run(a.nome, { b: true, sz: 20 }) , { jc: 'left', depois: 0 }));
        corpo.push(para(run([a.papel, a.doc].filter(Boolean).join(' · '), { sz: 18, cor: '5C6B5F' }), { jc: 'left', depois: 120 }));
      }
    } else if (b.k === 'quebra') corpo.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  }
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo.join('')}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const arquivos = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(documento),
  };
  return Buffer.from(zipSync(arquivos));
}
