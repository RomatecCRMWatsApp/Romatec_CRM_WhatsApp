/**
 * Robô do Bom Jardims, textos v2 (links das páginas com áudio): quem nunca editou já usa o padrão novo; o texto
 * gravado no banco igual ao padrão ANTIGO (salvo sem mudar nada) sai, para o padrão novo valer. Texto editado fica.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { autoRespostaTextos } from '../../../drizzle/schema';

export async function textosRoboV2(): Promise<number> {
  const db: any = await getDb();
  if (!db) return 0;
  let n = 0;
  try {
    for (const [intencao, t] of Object.entries(TEXTOS_ANTIGOS)) {
      const r: any = await db.delete(autoRespostaTextos).where(and(eq(autoRespostaTextos.intencao, intencao), eq(autoRespostaTextos.texto, t.texto), eq(autoRespostaTextos.ativo, true as any)));
      n += Number(r?.[0]?.affectedRows ?? r?.changes ?? 0);
    }
    if (n) console.log(`[Migration] textos do robô v2: ${n} texto(s) antigo(s) sem edição trocados pelo padrão novo`);
  } catch (e: any) { console.warn('[Migration] textosRoboV2:', e?.message); }
  return n;
}

/** Textos padrão até a v1.194 (para reconhecer o que foi salvo sem edição) */
export const TEXTOS_ANTIGOS: Record<string, { texto: string; midias: string[] }> = {
  primeiro_contato: {
    midias: ['OFERTA'],
    texto: 'Olá, {{nome}}! Tudo bem? 😊 Aqui é {{corretor}}, corretor do *Condomínio de Chácaras Bom Jardims*, em Açailândia.\n\n' +
      'Que bom que você se interessou! São *chácaras de 3.025 m²* (55 × 55 m) em condomínio fechado, com portal e guarita, poço próprio, energia e uma área de vivência com rio para os chacreiros.\n\n' +
      '💰 *Condição de lançamento:*\n• Entrada de *{{entrada_parcelas}}× {{entrada_parcela}}* sem juros\n• Saldo em *{{prazo_maior}}× fixas de {{parcela_maior}}*\n• Financiamento direto com a empreendedora, *sem banco*\n\n' +
      'Te mandei o folder aqui embaixo 👇 Veja também a sua oferta: {{link_oferta}}\n\nVocê procura chácara para lazer da família ou para morar?',
  },
  valores: {
    midias: ['CONDICOES'],
    texto: 'Segue a tabela completa da chácara padrão de *{{area}} m²*:\n\n🏷️ Preço de tabela: *{{preco}}*\n💵 À vista: *{{avista}}* (desconto de {{desconto_avista}})\n\n' +
      '*Parcelado:*\n1️⃣ Entrada 30%: *{{entrada_parcelas}}× {{entrada_parcela}}* sem juros (ou {{entrada_avista}} à vista)\n2️⃣ Saldo de {{saldo}} no prazo que preferir:\n{{tabela_prazos}}\n\n' +
      'Juros de {{juros_aa}} ao ano ({{juros_am}} ao mês), *parcelas fixas*. Se quiser antecipar parcelas, os juros são abatidos.\n\nQual prazo cabe melhor no seu orçamento?',
  },
  a_vista: {
    midias: [],
    texto: 'Ótima escolha, {{nome}}! À vista a chácara de 3.025 m² sai por *{{avista}}* — *{{desconto_avista}} de desconto* sobre a tabela.\n\n' +
      'Também dá para pagar a *entrada à vista por {{entrada_avista}}* (economia de {{economia_entrada}}) e parcelar só o saldo. Quer que eu simule as duas opções com a chácara que você gostou?',
  },
  escassez: {
    midias: ['STORY_ESCASSEZ'],
    texto: '{{nome}}, passando para te avisar: restam *somente {{disponiveis}} chácaras* e as melhores posições — perto do portal e da área de vivência — são as primeiras a sair. 🏃‍♂️\n\n' +
      'Com a reserva, a chácara que você escolher fica *garantida por 24 horas* enquanto organizamos a documentação.\n\n' +
      'A condição de *{{entrada_parcelas}}× {{entrada_parcela}} + {{prazo_maior}}× {{parcela_maior}}* é {{validade_condicao}}. Quer que eu separe uma para você?',
  },
  followup: {
    midias: [],
    texto: 'Oi, {{nome}}! Tudo certo? Ficou alguma dúvida sobre as chácaras do Bom Jardims?\n\nPosso te mandar o *mapa com as chácaras disponíveis* ou agendar uma *visita ao local* — é só me dizer o melhor dia. 🌳',
  },
  mapa: {
    midias: ['ESTRUTURA', 'MAPA'],
    texto: 'Aqui está o mapa do condomínio 🗺️ Cada chácara tem 3.025 m², com ruas de 12 m, portal com guarita, poço artesiano com bombeamento automático e reservatório elevado de 10.000 litros, rede elétrica com iluminação em LED e a área de vivência com rio e pontos de banho.\n\n' +
      'Hoje são *{{disponiveis}} chácaras disponíveis*. Me fala qual quadra te chamou mais atenção que eu te passo as livres nela.',
  },
  visita: {
    midias: [],
    texto: 'Perfeito! O condomínio fica na *Estrada do Piquiá dos Baianos, altura do km 15 da BR-222*, em Açailândia. 📍\n\n' +
      'Me diz o melhor dia e horário para você que eu confirmo a visita. Se preferir, te encontro no stand de vendas.',
  },
  juros: {
    midias: [],
    texto: 'Entendo, {{nome}}. Os juros são de *{{juros_aa}} ao ano* — bem abaixo do que bancos e consórcios costumam cobrar — e a *entrada não tem juros*.\n\n' +
      'As parcelas são *fixas*: {{parcela_maior}} do começo ao fim se pagas em dia. E se sobrar um dinheiro extra, você pode antecipar parcelas e pagar menos juros.',
  },
  documentacao: {
    midias: [],
    texto: 'A venda é feita por *contrato particular de promessa de compra e venda*, com quadro-resumo de todas as condições, assinatura digital e boletos/PIX emitidos em nome da empreendedora.\n\n' +
      'O empreendimento está em *fase de aprovação na Prefeitura*. Depois do registro do parcelamento, cada chácara terá sua matrícula individual e a escritura é feita após a quitação. Posso te enviar a minuta do contrato para você ler com calma.',
  },
  fechar: {
    midias: [],
    texto: 'Vamos garantir a sua, {{nome}}? Para a reserva preciso de:\n📄 RG/CNH e CPF (e do cônjuge, se casado)\n🏠 Comprovante de endereço\n📱 Telefone e e-mail\n\n' +
      'Assim que você me enviar, separo a chácara *{{lote}}* por 24 horas e já te mando o contrato para assinatura digital. ✍️',
  },
  chacara_especifica: {
    midias: [],
    texto: 'A chácara *{{lote}}* tem *{{area}} m²*:\n\n🏷️ Preço de tabela: *{{preco}}*\n💵 À vista: *{{avista}}*\n1️⃣ Entrada: *{{entrada_parcelas}}× {{entrada_parcela}}* sem juros (ou {{entrada_avista}} à vista)\n' +
      '2️⃣ Saldo de {{saldo}}:\n{{tabela_prazos}}\n\nQuer que eu separe a {{lote}} para você? A reserva vale 24 horas.',
  },
  optout: {
    midias: [],
    texto: 'Tudo bem, {{nome}}! Seu cadastro foi cancelado e não enviaremos mais mensagens. Obrigado! 😊',
  },
  ultimas_livres: {
    midias: [],
    texto: '{{nome}}, separei *3 chácaras que ainda estão livres* e são ótimas posições: *{{livres}}*. 🌳\n\n' +
      'Hoje são {{disponiveis}} disponíveis. A condição de *{{entrada_parcelas}}× {{entrada_parcela}} + {{prazo_maior}}× {{parcela_maior}}* é {{validade_condicao}}.\n\n' +
      'Veja a sua oferta e simule a que você gostar: {{link_oferta}}\n\nQuer que eu te mande os valores de alguma delas?',
  },
};
