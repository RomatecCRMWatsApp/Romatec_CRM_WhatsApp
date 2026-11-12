/**
 * Biblioteca de legislação do portal jurídico: os dispositivos que regem o empreendimento (loteamento de chácaras,
 * associação, regras de uso, compra e venda, registro, posse, assinatura digital), organizados por tema.
 * As ementas são RESUMOS para orientar a consulta — o texto vigente é sempre o oficial (link "Texto oficial").
 */

export type TemaLegislacao = "inadimplencia" | "associacao" | "condominio" | "contratos" | "registro" | "posse" | "digital";

export interface Dispositivo {
  id: string;
  tema: TemaLegislacao;
  norma: string;
  dispositivo: string;
  ementa: string;
  /** Quando citar: defesa, notificação, requerimento, parecer… */
  uso: string;
  url?: string;
  palavras?: string;
}

export interface Doutrina { tema: TemaLegislacao; autor: string; obra: string }

const PLANALTO = "https://www.planalto.gov.br/ccivil_03";
export const URL_NORMA = {
  l6766: `${PLANALTO}/leis/l6766.htm`,
  l6015: `${PLANALTO}/leis/l6015compilada.htm`,
  cc: `${PLANALTO}/leis/2002/l10406compilada.htm`,
  cpc: `${PLANALTO}/_ato2015-2018/2015/lei/l13105.htm`,
  cdc: `${PLANALTO}/leis/l8078compilado.htm`,
  cf: `${PLANALTO}/constituicao/constituicao.htm`,
  l9514: `${PLANALTO}/leis/l9514.htm`,
  l14382: `${PLANALTO}/_ato2019-2022/2022/lei/l14382.htm`,
  l13786: `${PLANALTO}/_ato2015-2018/2018/lei/l13786.htm`,
  l13465: `${PLANALTO}/_ato2015-2018/2017/lei/l13465.htm`,
  dl58: `${PLANALTO}/decreto-lei/del058.htm`,
  l12651: `${PLANALTO}/_ato2011-2014/2012/lei/l12651.htm`,
  mp2200: `${PLANALTO}/mpv/antigas_2001/2200-2.htm`,
  l14063: `${PLANALTO}/_ato2019-2022/2020/lei/l14063.htm`,
  lgpd: `${PLANALTO}/_ato2015-2018/2018/lei/l13709.htm`,
  l6530: `${PLANALTO}/leis/l6530.htm`,
} as const;

export const TEMAS_LEGISLACAO: { id: TemaLegislacao; rotulo: string; resumo: string }[] = [
  { id: "inadimplencia", rotulo: "Inadimplência e consolidação do bem", resumo: "Mora, intimação pelo cartório, resolução do compromisso, cancelamento do registro e restituição." },
  { id: "associacao", rotulo: "Associação e estatuto", resumo: "Constituição, estatuto, assembleia, exclusão de associado e contribuições em loteamento." },
  { id: "condominio", rotulo: "Condomínio, regimento e diretrizes de uso", resumo: "Condomínio de lotes, convenção, regimento interno, deveres, multas, vizinhança e áreas de preservação." },
  { id: "contratos", rotulo: "Compra e venda e corretagem", resumo: "Compromisso de compra e venda de lote, quadro-resumo, cláusulas, consumidor e corretagem." },
  { id: "registro", rotulo: "Registro de imóveis", resumo: "Registro do loteamento e do compromisso, matrícula, cancelamento e adjudicação compulsória extrajudicial." },
  { id: "posse", rotulo: "Posse e reintegração", resumo: "Proteção possessória, liminar de reintegração e benfeitorias." },
  { id: "digital", rotulo: "Assinatura digital e dados pessoais", resumo: "Validade do documento eletrônico, certificado ICP-Brasil e LGPD." },
];

export const DISPOSITIVOS: Dispositivo[] = [
  // ── Inadimplência e consolidação do bem ──────────────────────────────────────────────────────
  { id: "6766-32", tema: "inadimplencia", norma: "Lei n.º 6.766/1979", dispositivo: "art. 32, caput e §§ 1º a 3º", url: URL_NORMA.l6766,
    ementa: "Vencida e não paga a prestação, o contrato é considerado rescindido 30 dias depois de constituído em mora o devedor. A mora se constitui por intimação do Oficial do Registro de Imóveis, a requerimento do credor, para pagar as prestações vencidas e as que vencerem até o pagamento, juros convencionados e custas. Purgada a mora, o contrato convalesce; com a certidão de não pagamento, o vendedor requer o cancelamento da averbação.",
    uso: "Base da notificação, do requerimento de intimação, da ata de resolução e do pedido de cancelamento.", palavras: "mora rescisão purgação intimação prazo 30 dias" },
  { id: "6766-32a", tema: "inadimplencia", norma: "Lei n.º 6.766/1979", dispositivo: "art. 32-A, incisos I a V e §§ 1º e 2º (Lei n.º 13.786/2018)", url: URL_NORMA.l6766,
    ementa: "Na resolução por fato imputado ao adquirente, restituem-se os valores pagos, deduzidos: fruição do imóvel (até 0,75% sobre o valor atualizado do contrato, desde a transmissão da posse), cláusula penal e despesas administrativas (até 10% do valor atualizado do contrato), encargos moratórios das prestações pagas em atraso, débitos de tributos e contribuições do lote e comissão de corretagem integrada ao preço. Pagamento em até 12 parcelas, após a carência (obras concluídas: até 12 meses da formalização da resolução; obras em andamento: até 180 dias do prazo de conclusão). Nova venda do lote só se registra comprovado o início da restituição.",
    uso: "Memorial da restituição; resposta a pedido de devolução integral; defesa em ação de rescisão.", palavras: "restituição devolução distrato fruição multa cláusula penal carência" },
  { id: "6766-34", tema: "inadimplencia", norma: "Lei n.º 6.766/1979", dispositivo: "art. 34", url: URL_NORMA.l6766,
    ementa: "Rescindido o contrato por inadimplemento do adquirente, as benfeitorias necessárias ou úteis por ele feitas no imóvel devem ser indenizadas, sem efeito cláusula em contrário.",
    uso: "Acerto de contas na retomada da chácara; resposta a pedido de indenização por construção.", palavras: "benfeitorias indenização construção" },
  { id: "6766-35", tema: "inadimplencia", norma: "Lei n.º 6.766/1979", dispositivo: "art. 35", url: URL_NORMA.l6766,
    ementa: "No cancelamento do registro por inadimplemento, pago mais de 1/3 do preço, o Oficial menciona o fato e a quantia paga; novo registro do mesmo lote depende da prova da restituição ou de depósito à disposição do antigo adquirente no Registro de Imóveis.",
    uso: "Antes de registrar a revenda de chácara retomada.", palavras: "um terço revenda novo registro depósito" },
  { id: "6766-49", tema: "inadimplencia", norma: "Lei n.º 6.766/1979", dispositivo: "art. 49", url: URL_NORMA.l6766,
    ementa: "Intimações e notificações da lei são pessoais; recusada a assinatura ou estando o destinatário em lugar incerto e não sabido, faz-se por edital.",
    uso: "Comprador que não é encontrado ou se recusa a receber.", palavras: "edital lugar incerto recusa intimação pessoal" },
  { id: "6015-251a", tema: "inadimplencia", norma: "Lei n.º 6.015/1973 (Registros Públicos)", dispositivo: "art. 251-A (Lei n.º 14.382/2022)", url: URL_NORMA.l6015,
    ementa: "Procedimento extrajudicial de cancelamento do registro do compromisso de compra e venda por falta de pagamento: a requerimento do promitente vendedor, o promitente comprador é intimado pelo Oficial (pessoalmente, por procurador, pelo Títulos e Documentos ou por edital) para pagar em 30 dias; purgada a mora, o contrato segue; sem pagamento, o Oficial certifica e averba o cancelamento. A certidão do cancelamento é prova para a liminar de reintegração de posse (§ 6º).",
    uso: "Requerimento de intimação e de cancelamento no Registro de Imóveis; pedido de liminar possessória.", palavras: "cancelamento registro compromisso extrajudicial liminar reintegração" },
  { id: "dl58-14", tema: "inadimplencia", norma: "Decreto-Lei n.º 58/1937", dispositivo: "art. 14", url: URL_NORMA.dl58,
    ementa: "Regra equivalente para os compromissos de lotes regidos pelo decreto-lei (loteamentos anteriores à Lei n.º 6.766/1979): rescisão 30 dias depois de constituído em mora o devedor.",
    uso: "Somente se o loteamento ou o contrato for regido pelo regime antigo.", palavras: "loteamento antigo" },
  { id: "cc-394", tema: "inadimplencia", norma: "Código Civil", dispositivo: "arts. 394, 395, 397 e 401", url: URL_NORMA.cc,
    ementa: "Mora é o pagamento fora do tempo, lugar e forma devidos; o devedor responde pelos prejuízos, juros, correção e honorários; sem termo, a mora se constitui por interpelação; purga-se a mora oferecendo a prestação com os prejuízos até o dia da oferta.",
    uso: "Fundamento geral da constituição em mora e dos encargos cobrados.", palavras: "mora interpelação purgação encargos juros" },
  { id: "cc-474", tema: "inadimplencia", norma: "Código Civil", dispositivo: "arts. 474 e 475", url: URL_NORMA.cc,
    ementa: "A cláusula resolutiva expressa opera de pleno direito; a tácita depende de interpelação judicial. A parte lesada pelo inadimplemento pode pedir a resolução ou exigir o cumprimento, com perdas e danos.",
    uso: "Ata de resolução; escolha entre resolver o contrato ou cobrar a dívida.", palavras: "cláusula resolutiva resolução de pleno direito cumprimento" },
  { id: "cc-389", tema: "inadimplencia", norma: "Código Civil", dispositivo: "arts. 389, 406 e 408 a 413", url: URL_NORMA.cc,
    ementa: "Inadimplida a obrigação, o devedor responde por perdas e danos, juros, atualização monetária e honorários; cláusula penal exigível pela mora, limitada ao valor da obrigação e reduzível pelo juiz se manifestamente excessiva.",
    uso: "Memorial de cálculo do débito; defesa da multa contratual.", palavras: "juros multa cláusula penal perdas e danos correção" },
  { id: "stj-76", tema: "inadimplencia", norma: "STJ", dispositivo: "Súmula 76",
    ementa: "A falta de registro do compromisso de compra e venda de imóvel não dispensa a prévia interpelação para constituir em mora o devedor.",
    uso: "Contrato não registrado: notificar pelo Títulos e Documentos antes de resolver.", palavras: "sem registro interpelação notificação" },
  { id: "stj-543", tema: "inadimplencia", norma: "STJ", dispositivo: "Súmula 543",
    ementa: "Na resolução de promessa de compra e venda submetida ao CDC, a restituição das parcelas é imediata: integral, se a culpa for do vendedor; parcial, se o comprador deu causa ao desfazimento. Súmula anterior à Lei n.º 13.786/2018 — para contratos posteriores, há o regime específico do art. 32-A da Lei n.º 6.766/1979.",
    uso: "Contraponto em ação do comprador pedindo devolução imediata.", palavras: "restituição imediata consumidor devolução" },
  { id: "cdc-53", tema: "inadimplencia", norma: "Código de Defesa do Consumidor", dispositivo: "art. 53", url: URL_NORMA.cdc,
    ementa: "Nos contratos de compra e venda de imóveis em prestações, é nula a cláusula que estabeleça a perda total das prestações pagas em benefício do credor que pleitear a resolução por inadimplemento.",
    uso: "Fundamenta por que sempre há memorial de restituição.", palavras: "perda das prestações nulidade" },
  { id: "9514-26", tema: "inadimplencia", norma: "Lei n.º 9.514/1997", dispositivo: "arts. 26 e 27", url: URL_NORMA.l9514,
    ementa: "Consolidação da propriedade em nome do credor fiduciário: vencida e não paga a dívida e intimado o devedor sem purgação da mora (prazo de 15 dias), o Oficial averba a consolidação; seguem os leilões do art. 27. Só se aplica a contrato com alienação fiduciária em garantia — no compromisso de compra e venda, o caminho é a resolução e o cancelamento (Lei n.º 6.766/1979, art. 32).",
    uso: "Somente em venda com alienação fiduciária; distinguir do compromisso.", palavras: "alienação fiduciária consolidação leilão" },

  // ── Associação e estatuto ─────────────────────────────────────────────────────────────────────
  { id: "cf-5-xvii", tema: "associacao", norma: "Constituição Federal", dispositivo: "art. 5º, XVII a XXI", url: URL_NORMA.cf,
    ementa: "Plena liberdade de associação para fins lícitos; criação independe de autorização; dissolução ou suspensão só por decisão judicial; ninguém será compelido a associar-se ou a permanecer associado; associações autorizadas representam seus filiados.",
    uso: "Limites da cobrança de não associados; legitimidade da associação.", palavras: "liberdade de associação compelido" },
  { id: "cc-53", tema: "associacao", norma: "Código Civil", dispositivo: "arts. 53 a 61", url: URL_NORMA.cc,
    ementa: "Associação é união de pessoas para fins não econômicos. O estatuto deve conter denominação, fins, sede, admissão, demissão e exclusão de associados, direitos e deveres, fontes de recursos, órgãos deliberativos, alteração do estatuto e dissolução (art. 54). Exclusão só com justa causa, direito de defesa e recurso (art. 57). Compete privativamente à assembleia geral destituir administradores e alterar o estatuto (art. 59); 1/5 dos associados pode convocá-la (art. 60).",
    uso: "Conferência do estatuto; validade de assembleia; exclusão de associado.", palavras: "estatuto assembleia exclusão associado quórum convocação" },
  { id: "6766-36a", tema: "associacao", norma: "Lei n.º 6.766/1979", dispositivo: "art. 36-A (Lei n.º 13.465/2017)", url: URL_NORMA.l6766,
    ementa: "As atividades das associações de proprietários, titulares de direitos ou moradores em loteamentos ou empreendimentos assemelhados, sem fins lucrativos, equiparam-se à administração de imóveis; os titulares de direitos sobre os lotes sujeitam-se ao rateio das despesas, nos termos do ato constitutivo.",
    uso: "Cobrança da contribuição associativa; fundamento do estatuto.", palavras: "contribuição associativa rateio taxa de manutenção" },
  { id: "6766-2-8", tema: "associacao", norma: "Lei n.º 6.766/1979", dispositivo: "art. 2º, § 8º (Lei n.º 13.465/2017)", url: URL_NORMA.l6766,
    ementa: "Loteamento de acesso controlado: controle de acesso regulamentado por ato do Poder Público municipal, vedado impedir o acesso de pedestres ou condutores não residentes identificados ou cadastrados.",
    uso: "Portaria, cadastro de visitantes e regras de acesso.", palavras: "portaria acesso controlado visitantes" },
  { id: "stf-492", tema: "associacao", norma: "STF", dispositivo: "Tema 492 (RE 695.911)",
    ementa: "É inconstitucional a cobrança de taxa de manutenção de loteamento de proprietário não associado até a Lei n.º 13.465/2017 (ou lei municipal anterior); depois dela, é possível a cotização de quem, já tendo lote, adira ao ato constitutivo da entidade, ou de novos adquirentes, se o ato constitutivo da obrigação estiver registrado no Registro de Imóveis.",
    uso: "Fundamenta a cláusula de adesão no CPCV e o registro do ato constitutivo.", palavras: "taxa de manutenção não associado cotização" },
  { id: "stj-882", tema: "associacao", norma: "STJ", dispositivo: "Tema 882 (recursos repetitivos)",
    ementa: "As taxas de manutenção criadas por associações de moradores não obrigam os não associados ou que a elas não anuíram.",
    uso: "Contrapor com a adesão expressa no contrato e o registro (STF, Tema 492).", palavras: "taxa associação não associado anuência" },
  { id: "6015-114", tema: "associacao", norma: "Lei n.º 6.015/1973", dispositivo: "arts. 114 e 120", url: URL_NORMA.l6015,
    ementa: "Os atos constitutivos e o estatuto das associações são registrados no Registro Civil das Pessoas Jurídicas, com os requisitos do art. 120.",
    uso: "Registro e alterações do estatuto.", palavras: "registro civil pessoa jurídica estatuto" },

  // ── Condomínio, regimento e diretrizes de uso ─────────────────────────────────────────────────
  { id: "cc-1358a", tema: "condominio", norma: "Código Civil", dispositivo: "art. 1.358-A (Lei n.º 13.465/2017)", url: URL_NORMA.cc,
    ementa: "Pode haver, em terrenos, partes de propriedade exclusiva e partes comuns (condomínio de lotes); aplica-se, no que couber, o regime do condomínio edilício; a fração ideal pode ser proporcional à área, ao potencial construtivo ou a outro critério da instituição.",
    uso: "Se o empreendimento for instituído como condomínio de lotes.", palavras: "condomínio de lotes fração ideal" },
  { id: "cc-1333", tema: "condominio", norma: "Código Civil", dispositivo: "arts. 1.333 e 1.334", url: URL_NORMA.cc,
    ementa: "A convenção é subscrita por titulares de no mínimo 2/3 das frações ideais e é oponível a terceiros após o registro; deve dispor sobre contribuições, administração, competência das assembleias, sanções e o regimento interno.",
    uso: "Validade e força obrigatória do regimento e das diretrizes de uso.", palavras: "convenção regimento interno oponível" },
  { id: "cc-1336", tema: "condominio", norma: "Código Civil", dispositivo: "arts. 1.335 e 1.336", url: URL_NORMA.cc,
    ementa: "Direitos e deveres do condômino: contribuir para as despesas, não fazer obras que comprometam a segurança, não alterar a forma externa e não usar a unidade de modo prejudicial ao sossego, salubridade e segurança. Atraso: juros de 1% ao mês e multa de até 2%. Descumprimento de outros deveres: multa de até 5 vezes a contribuição.",
    uso: "Notificação por infração às diretrizes de uso; cobrança de contribuições.", palavras: "deveres multa sossego obra contribuição" },
  { id: "cc-1337", tema: "condominio", norma: "Código Civil", dispositivo: "art. 1.337", url: URL_NORMA.cc,
    ementa: "Condômino que reiteradamente descumpre deveres pode ser multado em até 5 vezes a contribuição, por 3/4 dos demais; conduta antissocial reiterada, até 10 vezes, até deliberação da assembleia.",
    uso: "Infrator contumaz das regras de uso (som, animais, obras).", palavras: "antissocial reiterado multa" },
  { id: "cc-1348", tema: "condominio", norma: "Código Civil", dispositivo: "arts. 1.347 a 1.351", url: URL_NORMA.cc,
    ementa: "Síndico e suas competências (cumprir e fazer cumprir convenção, regimento e decisões da assembleia; impor multas); assembleia anual de orçamento e contas; quóruns, incluindo 2/3 para alterar a convenção.",
    uso: "Atas, quórum de alteração das regras e prestação de contas.", palavras: "síndico assembleia quórum alteração" },
  { id: "cc-1277", tema: "condominio", norma: "Código Civil", dispositivo: "arts. 1.277 a 1.281 e 1.299", url: URL_NORMA.cc,
    ementa: "Direito de vizinhança: o proprietário ou possuidor pode fazer cessar interferências prejudiciais à segurança, ao sossego e à saúde causadas pelo uso de propriedade vizinha; o direito de construir respeita o direito dos vizinhos e os regulamentos administrativos.",
    uso: "Conflitos entre chácaras (barulho, fumaça, cercas, construções).", palavras: "vizinhança sossego barulho construção" },
  { id: "6766-26", tema: "condominio", norma: "Lei n.º 6.766/1979", dispositivo: "arts. 26, VII, e 45", url: URL_NORMA.l6766,
    ementa: "O compromisso deve declarar as restrições urbanísticas convencionais do loteamento; o loteador, ainda que já tenha vendido todos os lotes, e os vizinhos são partes legítimas para impedir construção em desacordo com restrições legais ou contratuais.",
    uso: "Fazer valer as diretrizes de uso e de construção contra o adquirente.", palavras: "restrições urbanísticas diretrizes construção embargo" },
  { id: "12651-4", tema: "condominio", norma: "Lei n.º 12.651/2012 (Código Florestal)", dispositivo: "arts. 4º e 7º", url: URL_NORMA.l12651,
    ementa: "Áreas de Preservação Permanente, entre elas as faixas marginais de cursos d'água naturais (largura mínima conforme a largura do rio, a partir de 30 metros); a vegetação da APP deve ser mantida pelo proprietário ou possuidor.",
    uso: "Diretrizes de uso das chácaras à beira do rio; uso da área de banho.", palavras: "APP rio margem preservação ambiental" },

  // ── Compra e venda e corretagem ───────────────────────────────────────────────────────────────
  { id: "6766-25", tema: "contratos", norma: "Lei n.º 6.766/1979", dispositivo: "arts. 25, 26, 26-A e 37", url: URL_NORMA.l6766,
    ementa: "Compromissos de compra e venda de lotes são irretratáveis e dão direito à adjudicação compulsória (art. 25); requisitos do contrato (art. 26); quadro-resumo obrigatório com preço, forma de pagamento, corretagem, consequências do desfazimento e prazos (art. 26-A, Lei n.º 13.786/2018); vedada a venda de lote de loteamento não registrado (art. 37).",
    uso: "Conferência do CPCV e do quadro-resumo; defesa de validade do contrato.", palavras: "compromisso quadro-resumo requisitos irretratável" },
  { id: "cc-421", tema: "contratos", norma: "Código Civil", dispositivo: "arts. 421, 421-A e 422", url: URL_NORMA.cc,
    ementa: "Liberdade contratual nos limites da função social; nos contratos paritários presume-se a simetria e a alocação de riscos definida pelas partes; os contratantes devem guardar probidade e boa-fé.",
    uso: "Defesa das cláusulas pactuadas; interpretação do contrato.", palavras: "boa-fé função social liberdade contratual" },
  { id: "cc-1417", tema: "contratos", norma: "Código Civil", dispositivo: "arts. 462 a 464 e 1.417 a 1.418", url: URL_NORMA.cc,
    ementa: "Contrato preliminar; promessa de compra e venda sem arrependimento, registrada, gera direito real à aquisição; o promitente comprador pode exigir a outorga da escritura definitiva ou a adjudicação.",
    uso: "Escritura definitiva após a quitação; adjudicação.", palavras: "promessa escritura definitiva adjudicação direito real" },
  { id: "cdc-51", tema: "contratos", norma: "Código de Defesa do Consumidor", dispositivo: "arts. 46, 51 e 54", url: URL_NORMA.cdc,
    ementa: "Cláusulas abusivas são nulas; o consumidor deve ter conhecimento prévio do conteúdo; no contrato de adesão, as cláusulas que limitam direitos devem vir em destaque.",
    uso: "Revisão de cláusulas; defesa contra alegação de abusividade.", palavras: "abusiva adesão destaque consumidor" },
  { id: "cc-722", tema: "contratos", norma: "Código Civil", dispositivo: "arts. 722 a 729", url: URL_NORMA.cc,
    ementa: "Contrato de corretagem: a remuneração é devida quando o corretor obtém o resultado previsto, ainda que o negócio não se efetive por arrependimento das partes.",
    uso: "Comissão do corretor; dedução da corretagem na restituição.", palavras: "corretagem comissão corretor" },
  { id: "6530", tema: "contratos", norma: "Lei n.º 6.530/1978", dispositivo: "arts. 3º e 6º", url: URL_NORMA.l6530,
    ementa: "Compete ao corretor de imóveis (inscrito no CRECI) intermediar compra, venda, permuta e locação de imóveis.",
    uso: "Regularidade da intermediação e do contrato de corretagem.", palavras: "CRECI corretor intermediação" },

  // ── Registro de imóveis ───────────────────────────────────────────────────────────────────────
  { id: "6766-18", tema: "registro", norma: "Lei n.º 6.766/1979", dispositivo: "arts. 18 e 19", url: URL_NORMA.l6766,
    ementa: "Aprovado o projeto, o loteador o submete ao Registro de Imóveis em até 180 dias, com os documentos do art. 18; o Oficial publica edital para impugnações.",
    uso: "Regularidade do loteamento; conferência de documentos.", palavras: "registro do loteamento edital impugnação" },
  { id: "6015-167", tema: "registro", norma: "Lei n.º 6.015/1973", dispositivo: "arts. 167, 169, 172 e 176", url: URL_NORMA.l6015,
    ementa: "Atos de registro e averbação (incluindo os compromissos de compra e venda e seu cancelamento), registro na circunscrição do imóvel e regime da matrícula.",
    uso: "Registro do CPCV e das averbações na matrícula do lote.", palavras: "matrícula averbação registro compromisso" },
  { id: "6015-250", tema: "registro", norma: "Lei n.º 6.015/1973", dispositivo: "arts. 248 a 251-A", url: URL_NORMA.l6015,
    ementa: "Cancelamento do registro: por decisão judicial, a requerimento das partes, a requerimento do interessado com documento hábil; procedimento extrajudicial por falta de pagamento do compromisso (art. 251-A).",
    uso: "Cancelamento do registro do CPCV resolvido.", palavras: "cancelamento averbação" },
  { id: "6015-216b", tema: "registro", norma: "Lei n.º 6.015/1973", dispositivo: "art. 216-B (Lei n.º 14.382/2022)", url: URL_NORMA.l6015,
    ementa: "Adjudicação compulsória extrajudicial no Registro de Imóveis, a requerimento do promitente comprador (ou do promitente vendedor), representado por advogado, quando o outro não outorga a escritura.",
    uso: "Comprador quitado sem escritura; vendedor que quer transferir a propriedade.", palavras: "adjudicação compulsória extrajudicial escritura" },

  // ── Posse e reintegração ──────────────────────────────────────────────────────────────────────
  { id: "cc-1210", tema: "posse", norma: "Código Civil", dispositivo: "arts. 1.196, 1.200, 1.210 e 1.219 a 1.222", url: URL_NORMA.cc,
    ementa: "Conceito de posse e posse justa; o possuidor tem direito a ser mantido na posse em caso de turbação e restituído no de esbulho; possuidor de boa-fé tem direito à indenização das benfeitorias necessárias e úteis e pode retê-las.",
    uso: "Retomada da chácara após a resolução; discussão de benfeitorias.", palavras: "esbulho turbação benfeitorias retenção" },
  { id: "cpc-560", tema: "posse", norma: "Código de Processo Civil", dispositivo: "arts. 554 a 566", url: URL_NORMA.cpc,
    ementa: "Ações possessórias: o possuidor tem direito a ser reintegrado em caso de esbulho; provados posse, esbulho, data e perda da posse (art. 561), o juiz defere a liminar de reintegração (art. 562).",
    uso: "Ação de reintegração de posse com a certidão de cancelamento (LRP, art. 251-A, § 6º).", palavras: "reintegração liminar esbulho possessória" },
  { id: "cpc-726", tema: "posse", norma: "Código de Processo Civil", dispositivo: "arts. 726 a 729", url: URL_NORMA.cpc,
    ementa: "Notificação e interpelação judiciais para manifestar formalmente a vontade a outrem sobre assunto juridicamente relevante.",
    uso: "Alternativa judicial à notificação pelo cartório.", palavras: "notificação judicial interpelação" },

  // ── Assinatura digital e dados pessoais ───────────────────────────────────────────────────────
  { id: "mp2200", tema: "digital", norma: "Medida Provisória n.º 2.200-2/2001", dispositivo: "art. 10, §§ 1º e 2º", url: URL_NORMA.mp2200,
    ementa: "Documentos eletrônicos assinados com certificado ICP-Brasil presumem-se verdadeiros em relação aos signatários; outros meios de comprovação de autoria são válidos se admitidos pelas partes.",
    uso: "Validade das peças assinadas com certificado digital no portal.", palavras: "ICP-Brasil certificado digital assinatura presunção" },
  { id: "14063", tema: "digital", norma: "Lei n.º 14.063/2020", dispositivo: "art. 4º", url: URL_NORMA.l14063,
    ementa: "Classifica as assinaturas eletrônicas em simples, avançada e qualificada (esta, com certificado ICP-Brasil).",
    uso: "Nível de assinatura exigido em cada documento.", palavras: "assinatura eletrônica avançada qualificada" },
  { id: "cpc-411", tema: "digital", norma: "Código de Processo Civil", dispositivo: "arts. 411 e 441", url: URL_NORMA.cpc,
    ementa: "Considera-se autêntico o documento cuja autoria é identificada por meio legal de certificação, inclusive eletrônico; documentos eletrônicos são admitidos no processo.",
    uso: "Prova em juízo dos contratos e peças assinadas eletronicamente.", palavras: "prova documento eletrônico autenticidade" },
  { id: "lgpd", tema: "digital", norma: "Lei n.º 13.709/2018 (LGPD)", dispositivo: "arts. 6º, 7º, V e VI, e 46", url: URL_NORMA.lgpd,
    ementa: "Princípios do tratamento de dados; tratamento autorizado para execução de contrato e para o exercício regular de direitos em processo judicial, administrativo ou arbitral; dever de segurança.",
    uso: "Uso dos dados do comprador na cobrança, na notificação e em juízo.", palavras: "dados pessoais privacidade base legal" },
];

export const DOUTRINA: Doutrina[] = [
  { tema: "inadimplencia", autor: "Arnaldo Rizzardo", obra: "Promessa de Compra e Venda e Parcelamento do Solo Urbano" },
  { tema: "inadimplencia", autor: "Melhim Namem Chalhub", obra: "Alienação Fiduciária — Negócio Fiduciário" },
  { tema: "inadimplencia", autor: "Flávio Tartuce", obra: "Direito Civil, v. 3 — Teoria Geral dos Contratos e Contratos em Espécie" },
  { tema: "associacao", autor: "Flávio Tartuce", obra: "Direito Civil, v. 1 — Lei de Introdução e Parte Geral" },
  { tema: "associacao", autor: "Arnaldo Rizzardo", obra: "Promessa de Compra e Venda e Parcelamento do Solo Urbano" },
  { tema: "condominio", autor: "Caio Mário da Silva Pereira", obra: "Condomínio e Incorporações" },
  { tema: "condominio", autor: "J. Nascimento Franco", obra: "Condomínio" },
  { tema: "condominio", autor: "Flávio Tartuce", obra: "Direito Civil, v. 4 — Direito das Coisas" },
  { tema: "contratos", autor: "Arnaldo Rizzardo", obra: "Contratos" },
  { tema: "contratos", autor: "Flávio Tartuce", obra: "Direito Civil, v. 3 — Teoria Geral dos Contratos e Contratos em Espécie" },
  { tema: "registro", autor: "Walter Ceneviva", obra: "Lei dos Registros Públicos Comentada" },
  { tema: "registro", autor: "Vitor Frederico Kümpel e Carla Modina Ferrari", obra: "Tratado Notarial e Registral" },
  { tema: "posse", autor: "Sílvio de Salvo Venosa", obra: "Direito Civil — Direitos Reais" },
  { tema: "posse", autor: "Flávio Tartuce", obra: "Direito Civil, v. 4 — Direito das Coisas" },
  { tema: "digital", autor: "Patricia Peck Pinheiro", obra: "Direito Digital" },
];

/** Texto pronto para colar numa peça: "Lei n.º 6.766/1979, art. 32 — ementa" */
export const citacao = (d: Dispositivo) => `${d.norma}, ${d.dispositivo}: ${d.ementa}`;

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca por palavras (todas devem aparecer em norma, dispositivo, ementa, uso ou palavras-chave) */
export function buscarDispositivos(termo: string, tema?: TemaLegislacao | null): Dispositivo[] {
  const partes = normal(termo).split(/\s+/).filter(Boolean);
  return DISPOSITIVOS.filter(d => (!tema || d.tema === tema)
    && partes.every(p => normal(`${d.norma} ${d.dispositivo} ${d.ementa} ${d.uso} ${d.palavras ?? ""}`).includes(p)));
}
