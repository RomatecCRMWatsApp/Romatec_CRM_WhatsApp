/**
 * Base de conhecimento (Ajuda): artigos em Markdown para treinar e consultar a equipe (corretores, secretária,
 * parceiros). O administrador edita na tela; os artigos iniciais abaixo entram uma vez, quando a base está vazia.
 */

export const CATEGORIAS_ARTIGO = ['empreendimento', 'vendas', 'financeiro', 'divulgacao', 'sistema'] as const;
export type CategoriaArtigo = (typeof CATEGORIAS_ARTIGO)[number];
export const ROTULO_CATEGORIA_ARTIGO: Record<CategoriaArtigo, string> = {
  empreendimento: 'Bom Jardims', vendas: 'Vendas e contratos', financeiro: 'Financeiro e cobrança', divulgacao: 'Divulgação', sistema: 'Uso do sistema',
};

/** todos = toda a equipe logada; escritorio = só administrador e secretária */
export const PUBLICOS_ARTIGO = ['todos', 'escritorio'] as const;
export type PublicoArtigo = (typeof PUBLICOS_ARTIGO)[number];

export interface ArtigoBase { slug: string; titulo: string; categoria: CategoriaArtigo; publico: PublicoArtigo; conteudo: string; ordem: number }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Slug a partir do título (a-z, 0-9 e hífen) */
export function slugDe(titulo: string): string {
  return norm(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'artigo';
}

/** Busca sem acento por todas as palavras, no título (peso maior) e no conteúdo */
export function buscarArtigos<T extends { titulo: string; conteudo: string }>(artigos: T[], termo: string): T[] {
  const palavras = norm(termo).split(/\s+/).filter(p => p.length > 1);
  if (!palavras.length) return artigos;
  return artigos
    .map(a => {
      const t = norm(a.titulo), c = norm(a.conteudo);
      if (!palavras.every(p => t.includes(p) || c.includes(p))) return null;
      const pontos = palavras.reduce((s, p) => s + (t.includes(p) ? 10 : 0) + Math.min(5, c.split(p).length - 1), 0);
      return { a, pontos };
    })
    .filter((x): x is { a: T; pontos: number } => !!x)
    .sort((x, y) => y.pontos - x.pontos)
    .map(x => x.a);
}

/** Quem pode ler o artigo */
export const podeLerArtigo = (publico: string, perfil: string | null | undefined) => publico !== 'escritorio' || perfil === 'admin' || perfil === 'secretario';

export const ARTIGOS_INICIAIS: ArtigoBase[] = [
  {
    slug: 'ficha-do-bom-jardims', titulo: 'Ficha do Condomínio de Chácaras Bom Jardims', categoria: 'empreendimento', publico: 'todos', ordem: 1,
    conteudo: `## O empreendimento
- **82 chácaras** em cerca de 41 ha, em Açailândia/MA.
- Tamanhos: **3.025 m²** (quadras A e B, 55 × 55 m), **3.140 m²** (quadras C e D) e **3.600 m²** junto à mata.
- Preço **a partir de R$ 160 mil** (chácara de 3.025 m²).
- Endereço: Estrada do Piquiá dos Baianos, altura do km 15 da BR-222. **17 km do centro**, menos de 28 min de carro.
- **Stand de vendas e administração:** chácara B14.
- **Lançamento oficial:** 14 de novembro de 2026.

## Infraestrutura (projeto; confira o estágio da obra antes de afirmar que está pronto)
- Portal com guarita e controle de acesso.
- 8 ruas internas de 12 m (9 m de rolamento + 1,50 m de calçada de cada lado).
- Poço artesiano com reservatório elevado de 10.000 L e hidrômetro individual.
- Energia elétrica e **sinal 5G** em todo o condomínio.
- Área de vivência: mata nativa junto ao córrego, trilha, pontos de banho e deck (em construção).

## Documentação
Área georreferenciada e certificada no SIGEF/INCRA, Licença de Operação da SEMMA e memorial descritivo de cada chácara.

## Onde mostrar ao cliente
- Página do empreendimento: romateccrm.com/bom-jardims
- Mapa 3D: romateccrm.com/bom-jardims/3d · Rota: romateccrm.com/bom-jardims/rota
- Formas de pagamento: romateccrm.com/bom-jardims/formas-de-pagamento`,
  },
  {
    slug: 'formas-de-pagamento', titulo: 'Formas de pagamento e planos de entrada', categoria: 'vendas', publico: 'todos', ordem: 2,
    conteudo: `Valores para a chácara de **R$ 160 mil** (3.025 m²). Juros de 6% a.a. efetivos (Tabela Price), **parcelas fixas sem correção**, financiamento direto com a empreendedora, sem banco.

| Forma | Como fica |
|---|---|
| **Condição de 30%** | Entrada de R$ 48 mil (6× de R$ 8.000 sem juros, ou R$ 45 mil à vista) + 120× de R$ 1.234,51 |
| **Plano A · 13º** | R$ 10 mil + 120× de R$ 1.234,51 + 10 reforços anuais de R$ 5.162,97 |
| **Plano B · Prazo longo** | R$ 10 mil + 180× de R$ 1.252,94, sem reforço |
| **Plano C · Entrada parcelada** | R$ 10 mil + 36× de R$ 1.055,56 sem juros + 120× de R$ 1.234,51 |
| **À vista** | R$ 150 mil (R$ 10 mil de desconto) |

No Plano C o cliente escolhe: **boleto único** (complemento e parcela juntos, R$ 2.290,07 por mês nos 3 primeiros anos) ou **sequencial** (paga primeiro o complemento da entrada e depois o financiamento).

## Regra que não muda
**Nunca** anuncie "R$ 10 mil de entrada + 120× de R$ 1.234,51" sozinho: essa parcela só existe com o reforço (Plano A) ou com o complemento (Plano C).

Faça sempre a simulação no simulador do CRM e envie o PDF ao cliente. Valores de out/2026, sujeitos a disponibilidade e a alteração.`,
  },
  {
    slug: 'regras-de-anuncio', titulo: 'Regras de anúncio e comunicação', categoria: 'divulgacao', publico: 'todos', ordem: 3,
    conteudo: `## Sempre
- **CRECI** junto do nome e do contato do corretor em toda peça.
- Valores com data e ressalva: "valores de out/2026, sujeitos a disponibilidade e a alteração".
- **"Imagem ilustrativa"** em perspectiva, projeto ou imagem do deck.
- Plano completo quando citar parcela.
- Usar o **seu link de divulgação** do CRM (com o seu código), para o lead cair com você.

## Nunca
- Prometer **valorização**, "retorno garantido" ou "escritura imediata".
- Falar em **reserva, sinal ou número de chácara** antes de o registro do loteamento estar confirmado (Lei 6.766/79). Até lá: "lista de interesse", "simulação", "atendimento".
- "Últimas unidades" ou escassez que não seja verdade.
- Falar mal de outro loteamento: comparar só dados objetivos e comprováveis (CONAR, art. 32).
- Dizer "8 vezes" para a entrada de 30% (são 6× de R$ 8.000).
- Citar comissão em material para o cliente.

## LGPD
Só guarde contato de quem autorizou. Toda mensagem em massa precisa da saída "responda SAIR". Nunca mostre CPF em material de divulgação.`,
  },
  {
    slug: 'do-lead-ao-contrato', titulo: 'Do lead ao contrato: o caminho no CRM', categoria: 'sistema', publico: 'todos', ordem: 4,
    conteudo: `1. **Lead chega** (WhatsApp, Instagram, site ou link de divulgação) e aparece em **Leads › Atender agora**. Responda rápido: o primeiro contato é o que mais vende.
2. **Qualifique** e mova o card no **Funil** (novo → em atendimento → qualificado → visita → proposta).
3. **Agende a visita** em **Leads › Agenda de visitas**.
4. **Simule** no simulador do empreendimento e envie o PDF da simulação.
5. **Contrato:** em **Vendas › Contratos › Novo**, escolha a chácara, a forma de pagamento (e, no Plano C, boleto único ou sequencial) e os dados do comprador.
6. **Assinatura eletrônica:** o comprador recebe o link, confirma pelo código no WhatsApp e assina.
7. **Carnê e portal:** com o contrato assinado, o comprador passa a ter o portal (/c/código) com boletos, recibos e documentos.

Dica: o resumo por IA do lead (no card) mostra a conversa e sugere a próxima mensagem.`,
  },
  {
    slug: 'portal-do-comprador', titulo: 'Portal do comprador: o que o cliente encontra', categoria: 'financeiro', publico: 'todos', ordem: 5,
    conteudo: `O comprador abre o portal pelo QR code do carnê ou pelo link **romateccrm.com/c/CÓDIGO**. Lá ele tem:

- **Parcelas:** boleto e PIX de cada parcela, barra de situação (pagas, em atraso e a vencer).
- **2ª via atualizada:** até 59 dias de atraso ele mesmo gera. Depois disso, precisa falar com a administração.
- **Recibos** de cada pagamento e os **carnês** de cada ano.
- **Imposto de Renda:** demonstrativo anual dos valores pagos para a ficha Bens e Direitos, com botão para imprimir ou salvar em PDF.
- **Antecipar:** simulação de antecipação de parcelas.
- **Documentos:** contrato assinado e demais documentos.
- **Obra:** fotos e percentual da obra publicados pelo escritório.
- **Chamados:** dúvidas e pedidos para o escritório, com resposta no próprio portal.

Oriente o cliente a pagar **somente** pelos boletos e PIX do portal, nunca em dinheiro ou a corretores.`,
  },
  {
    slug: 'cobranca-e-inadimplencia', titulo: 'Cobrança e inadimplência', categoria: 'financeiro', publico: 'escritorio', ordem: 6,
    conteudo: `- **Financeiro › Extrato:** um contrato por linha com recebido, vencido, a vencer, % pago e **dias de atraso**. Filtre por "Em atraso". A planilha (Excel) sai no botão ao lado.
- **A cobrar:** lista quem está vencido ou vence em breve, com a mensagem pronta. O envio pelo WhatsApp é sempre escolha do administrador.
- **Renegociação:** gera o termo aditivo, o comprador confirma pelo código no WhatsApp e assina.
- **Planilha do contador (DIMOB):** em Financeiro › Extrato, escolha o ano e clique em "Contador / DIMOB". Traz comprador, CPF/CNPJ, valor da operação, pago no ano e acumulado. O contador confere antes de transmitir.
- **NFS-e:** cada fatura paga do SaaS entra em SaaS e assinaturas › NFS-e. Com a Spedy em produção, emita por lá; o cartão mostra se está conectada e em qual ambiente.`,
  },
  {
    slug: 'divulgacao-no-instagram', titulo: 'Divulgação no Instagram e no WhatsApp', categoria: 'divulgacao', publico: 'todos', ordem: 7,
    conteudo: `- **Melhor horário** do @avalieimob: entre **20h e 22h**. Sábado é o melhor dia.
- **Reels** começam com a vinheta de **abertura** e terminam com a de **fechamento** (pasta bom-jardims/vinhetas). A vinheta de **explosão** é só para promoção ou lançamento, nunca em vídeo sobre a mata ou o córrego.
- No **status do WhatsApp**, use os textos prontos de **Campanhas de captação › Links de divulgação**: eles já levam o seu link.
- Peça para **compartilhar** ("manda para quem você levaria para tomar banho aqui"): compartilhamento é o que mais faz o Reel crescer.
- Kit de marca do Bom Jardims: cores verde mata, dourado e creme; títulos em Playfair Display e texto em Lato.`,
  },
  {
    slug: 'prospeccao-b2b', titulo: 'Prospecção B2B do AvalieImob', categoria: 'vendas', publico: 'escritorio', ordem: 8,
    conteudo: `Em **Vendas › Prospecção B2B** o escritório apresenta o AvalieImob (PTAM, NBR 14653) a imobiliárias, correspondentes, engenharia, cartórios, bancos e advocacia da região.

1. **Importar lista** (CSV) ou cadastrar a empresa.
2. **Ler site:** o CRM busca WhatsApp, e-mail e Instagram no site da empresa.
3. **Escrever mensagem:** a IA escreve a primeira mensagem com um fato da empresa. Revise antes.
4. **Aprovar e enviar:** só o administrador envia. Uma vez por empresa, só para celular, até 20 por dia.
5. **Respostas** aparecem no cartão. Quem responde **SAIR** sai da lista e recebe a confirmação.`,
  },
];
