/**
 * Documentos para o cliente (Vendas › Documentos para o cliente): contrato, Estatuto, anexos e modelos de carteirinha
 * e crachá, cada um com página pública só de leitura (/documentos/:emp/:doc). Os PDFs viram imagens no servidor
 * (server/documentosCliente.ts) — sem texto para copiar, sem arquivo para baixar ou editar. O link sai com o ?c= de quem
 * compartilha: a página mostra o contato desse corretor.
 */

export const EMPREENDIMENTOS_DOCS = ['bom-jardims'] as const;
export type EmpDocs = typeof EMPREENDIMENTOS_DOCS[number];

/** pdf = páginas renderizadas do documento; cartao = modelo desenhado na própria página */
export type FormaDoc = 'pdf' | 'cartao';

export interface DocumentoCliente {
  slug: string;
  titulo: string;
  subtitulo: string;
  forma: FormaDoc;
  /** Pontos principais mostrados acima do documento */
  destaques: string[];
  /** Texto pronto do WhatsApp; {link} vira o link */
  textoWhatsapp: string;
}

export const DOCUMENTOS_CLIENTE: DocumentoCliente[] = [
  {
    slug: 'contrato', forma: 'pdf',
    titulo: 'Contrato de Promessa de Compra e Venda',
    subtitulo: 'Minuta do contrato (CPCV v3.1) com um cliente de exemplo — o seu sai com os seus dados e a chácara escolhida',
    destaques: [
      'Venda na planta de parcelamento já registrado; cada aprovação (Equatorial, matrículas individuais, licenças) entra por termo aditivo',
      'Energia: rede, postes e iluminação executados pelo empreendimento no projeto aprovado na Equatorial; a ligação é entre o comprador e a Equatorial',
      'Água: poço artesiano, reservatório e rede com ponto na frente de cada chácara; hidrômetro e cavalete por conta do comprador, tarifa pela média CAEMA × SAAE',
      'Esgoto: sistema individual obrigatório (fossa séptica + sumidouro ou filtro anaeróbio — ABNT NBR 7229 e NBR 13969)',
      'Área de vivência (Quadra F) privada, como reserva de preservação, com espaço exclusivo de 100 m² por chácara',
      'Liberação para cercar e construir depois da entrada e da 3ª parcela, com vistoria de medição (a 1ª é gratuita)',
      'Foro da Comarca de Açailândia/MA',
    ],
    textoWhatsapp: '📄 *Contrato do Condomínio de Chácaras Bom Jardims*\n\nVeja a minuta completa do contrato de compra e venda (só leitura):\n{link}',
  },
  {
    slug: 'intermediacao', forma: 'pdf',
    titulo: 'Contrato de Intermediação Imobiliária',
    subtitulo: 'Assinado junto com o contrato de compra e venda: ciência da corretagem do corretor (modelo de exemplo)',
    destaques: [
      'A corretagem já está incluída no preço da chácara, sem acréscimo ao valor contratado',
      'Paga no ato do sinal pela plataforma de pagamentos do empreendimento — nunca em espécie nem direto ao corretor',
      'Devida pelo resultado útil da intermediação (Código Civil, arts. 722 a 729; Lei n.º 6.530/1978)',
      'Não é restituída em caso de desistência (Lei n.º 6.766/1979, art. 32-A, V)',
    ],
    textoWhatsapp: '🤝 *Contrato de Intermediação — Bom Jardims*\n\nVeja o modelo do contrato de intermediação que acompanha a compra (só leitura):\n{link}',
  },
  {
    slug: 'estatuto', forma: 'pdf',
    titulo: 'Estatuto da Associação',
    subtitulo: 'Estatuto e Regimento Interno da associação dos proprietários (Anexo III do contrato)',
    destaques: [
      'Contribuição associativa mensal de R$ 100,00',
      'Água faturada pela média das tarifas residenciais da CAEMA e do SAAE, com hidrômetro individual',
      'Quadra F: área privada e reserva de preservação da flora e da fauna — sem desmatar, caçar ou poluir o córrego',
      'Espaço exclusivo de 100 m² por chácara só com estruturas removíveis (tenda e churrasqueira)',
      'Carteirinhas: 1ª via gratuita; reimpressão R$ 25,00',
    ],
    textoWhatsapp: '📘 *Estatuto da Associação — Bom Jardims*\n\nRegras de convivência, contribuição e uso das áreas comuns (só leitura):\n{link}',
  },
  {
    slug: 'diretrizes', forma: 'pdf',
    titulo: 'Checklist de restrições — Diretrizes de Uso',
    subtitulo: 'O que é permitido, permitido com condições e proibido nas chácaras (Anexo IV do contrato)',
    destaques: [
      'Uso das chácaras: residência, segunda edificação, locação por temporada',
      'Criação de animais e as condições de cada uma',
      'Integram o Estatuto e só mudam por decisão da Assembleia Geral',
    ],
    textoWhatsapp: '✅ *Diretrizes de Uso — Bom Jardims*\n\nVeja o que pode e o que não pode nas chácaras (só leitura):\n{link}',
  },
  {
    slug: 'tarifa-agua', forma: 'pdf',
    titulo: 'Tabela tarifária da água',
    subtitulo: 'Anexo VIII do contrato — tarifa residencial pela média CAEMA × SAAE',
    destaques: [
      'Faixas de consumo residenciais, com a média das duas concessionárias',
      'Tabelas de origem anexadas para conferência',
      'Leitura do hidrômetro individual de cada chácara',
    ],
    textoWhatsapp: '💧 *Tarifa da água — Bom Jardims*\n\nTabela pela média CAEMA × SAAE (só leitura):\n{link}',
  },
  {
    slug: 'tabela', forma: 'pdf',
    titulo: 'Tabela de pagamento (exemplo)',
    subtitulo: 'Anexo II do contrato com uma simulação de exemplo — os valores da sua chácara saem no seu contrato',
    destaques: [
      'Entrada parcelada e saldo em parcelas mensais, direto com a empreendedora',
      'Vencimentos e reajuste conforme o contrato',
      'Documento de exemplo, sem valor de cobrança',
    ],
    textoWhatsapp: '💰 *Tabela de pagamento — exemplo*\n\nVeja como fica a entrada e as parcelas (só leitura):\n{link}',
  },
  {
    slug: 'carne', forma: 'pdf',
    titulo: 'Modelo de carnê',
    subtitulo: 'Como chegam as parcelas: boleto e PIX em cada folha (modelo sem valor)',
    destaques: [
      'Carnê anual com 12 parcelas',
      'Cada parcela com boleto e PIX',
      'Modelo zerado: não é pagável',
    ],
    textoWhatsapp: '🧾 *Modelo do carnê — Bom Jardims*\n\nVeja como chegam as parcelas (só leitura):\n{link}',
  },
  {
    slug: 'carteirinha', forma: 'cartao',
    titulo: 'Carteirinha do condomínio',
    subtitulo: 'Modelo da carteirinha do titular, do cônjuge e dos dependentes',
    destaques: [
      'Frente com foto, nome, vínculo e chácara; verso com QR de autenticidade',
      'Emitida para o titular, o cônjuge e até 6 dependentes depois do contrato assinado',
      '1ª via gratuita; reimpressão R$ 25,00',
    ],
    textoWhatsapp: '🪪 *Carteirinha do Condomínio Bom Jardims*\n\nVeja o modelo da carteirinha de acesso:\n{link}',
  },
  {
    slug: 'cracha-visitante', forma: 'cartao',
    titulo: 'Crachá de visitante',
    subtitulo: 'Modelo do crachá entregue na portaria a visitantes e convidados',
    destaques: [
      'Entregue na portaria com a identificação do visitante',
      'Numerado e devolvido na saída',
      'Uso durante a visita, junto com um documento com foto',
    ],
    textoWhatsapp: '🏷️ *Crachá de visitante — Bom Jardims*\n\nVeja o modelo do crachá da portaria:\n{link}',
  },
];

export const documentoCliente = (slug: string) => DOCUMENTOS_CLIENTE.find(d => d.slug === slug) ?? null;
export const empDocsValido = (emp: string): emp is EmpDocs => (EMPREENDIMENTOS_DOCS as readonly string[]).includes(emp);

/** Link público do documento, com o ?c= de quem compartilha */
export function linkDocumento(base: string, emp: string, doc: string, ref?: string | null): string {
  const u = new URL(`${base.replace(/\/$/, '')}/documentos/${emp}/${doc}`);
  if (ref) u.searchParams.set('c', ref);
  return u.toString();
}

export const linkIndiceDocumentos = (base: string, emp: string, ref?: string | null) => {
  const u = new URL(`${base.replace(/\/$/, '')}/documentos/${emp}`);
  if (ref) u.searchParams.set('c', ref);
  return u.toString();
};
