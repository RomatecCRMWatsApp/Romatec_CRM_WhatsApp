/**
 * Política de privacidade pública (/privacidade): exigida pela Meta nos formulários de cadastro (Lead Ads) e
 * linkada no aviso de cookies. O texto fica aqui para a página e os testes usarem a mesma fonte.
 */
import { CONTATOS_ESCRITORIO, ESCRITORIO } from './escritorio';

export const ROTA_PRIVACIDADE = '/privacidade';
export const TITULO_PRIVACIDADE = 'Política de privacidade — Romatec Consultoria Total';
export const DESCRICAO_PRIVACIDADE = 'Como a Romatec Consultoria Total coleta, usa, guarda e protege os seus dados pessoais, e como exercer os seus direitos pela LGPD (Lei n.º 13.709/2018).';
export const ATUALIZADA_EM = '27/11/2026';
export const EMAIL_PRIVACIDADE = 'contato@consultoriaromatec.com.br';
export const WHATSAPP_PRIVACIDADE = CONTATOS_ESCRITORIO.jose.whatsapp;

export interface SecaoPrivacidade { titulo: string; paragrafos?: string[]; itens?: string[] }

export const SECOES_PRIVACIDADE: SecaoPrivacidade[] = [
  {
    titulo: '1. Quem cuida dos seus dados',
    paragrafos: [
      `O controlador dos dados é ${ESCRITORIO.razaoSocial} (${ESCRITORIO.fantasia}), CNPJ ${ESCRITORIO.cnpj}, ${ESCRITORIO.creciJ}, com sede na ${ESCRITORIO.endereco}.`,
      `O encarregado pelo tratamento de dados pessoais é ${ESCRITORIO.responsavel} (${ESCRITORIO.creciResponsavel}), pelo e-mail ${EMAIL_PRIVACIDADE} ou pelo WhatsApp (99) 9 9181-1246.`,
      'Esta política vale para o site, as páginas dos empreendimentos (como o Condomínio de Chácaras Bom Jardims), os formulários de anúncios no Facebook e no Instagram, o atendimento pelo WhatsApp e o atendimento presencial.',
    ],
  },
  {
    titulo: '2. Quais dados coletamos',
    itens: [
      'Dados de contato: nome, telefone/WhatsApp, e-mail e cidade.',
      'Respostas dos formulários: o que você procura, quando pretende comprar, como prefere pagar, o que é mais importante para você, onde mora e se quer fazer uma visita.',
      'Mensagens trocadas com a gente pelo WhatsApp, Instagram ou Facebook, inclusive áudios, fotos e documentos que você enviar.',
      'Dados da visita agendada: data, horário e local de encontro.',
      'Se você fizer uma proposta ou fechar negócio: CPF, RG, estado civil e dados do cônjuge, profissão, endereço, comprovantes e demais documentos exigidos para o contrato e o registro.',
      'De onde você veio (o anúncio ou o link que trouxe você até nós) e, só se você aceitar os cookies, dados de navegação nas páginas de divulgação (Google Analytics e Google Ads).',
    ],
  },
  {
    titulo: '3. Para que usamos e com qual base legal',
    itens: [
      'Responder ao seu contato, enviar valores, mapas e informações do empreendimento e agendar visitas, a seu pedido (procedimentos preliminares a um contrato, art. 7º, V, da LGPD).',
      'Elaborar propostas, contratos e documentos da compra (execução de contrato, art. 7º, V).',
      'Cumprir obrigações legais e regulatórias da atividade imobiliária, como as do COFECI/CRECI e da Lei n.º 9.613/1998 de prevenção à lavagem de dinheiro (art. 7º, II).',
      'Enviar novidades do empreendimento e retomar conversas com quem já falou com a gente, com mensagens individuais e sempre com a opção de sair (consentimento e legítimo interesse, art. 7º, I e IX).',
      'Medir o resultado das páginas e dos anúncios, somente se você aceitar os cookies (consentimento, art. 7º, I).',
    ],
  },
  {
    titulo: '4. Com quem compartilhamos',
    paragrafos: ['Não vendemos nem alugamos os seus dados. Eles só são compartilhados quando necessário para atender você:'],
    itens: [
      'Meta (WhatsApp, Facebook e Instagram), por onde as mensagens e os formulários passam.',
      'Serviços de hospedagem, banco de dados e armazenamento em nuvem que mantêm o nosso sistema funcionando.',
      'Google, somente se você aceitar os cookies nas páginas de divulgação.',
      'O corretor responsável pelo seu atendimento, que trabalha com a Romatec.',
      'A empreendedora ou proprietária do imóvel, quando houver proposta ou contrato.',
      'Cartórios, prefeitura, órgãos públicos e autoridades, quando a lei exigir ou para registrar a compra.',
    ],
  },
  {
    titulo: '5. Mensagens no WhatsApp',
    paragrafos: [
      'As mensagens são individuais e acompanhadas por uma pessoa da nossa equipe. Parte das respostas é automática (o nosso assistente responde dúvidas comuns e agenda visitas) e você pode pedir para falar com uma pessoa a qualquer momento.',
      'Para não receber mais mensagens, responda "sair" ou "não quero receber". O seu número sai da lista na hora.',
    ],
  },
  {
    titulo: '6. Por quanto tempo guardamos',
    paragrafos: [
      'Guardamos os dados pelo tempo necessário para o atendimento e o negócio. Se você pedir a exclusão, apagamos os dados que não precisamos guardar por lei.',
      'Documentos e registros de compra e venda são guardados pelos prazos exigidos em lei, como os 5 anos da Lei n.º 9.613/1998, e pelo tempo necessário para defender direitos em processos.',
    ],
  },
  {
    titulo: '7. Como protegemos',
    paragrafos: ['Acesso ao sistema só com login e senha, permissões por função (cada pessoa vê só o necessário), conexão criptografada (HTTPS), documentos sensíveis guardados de forma privada e registro de quem acessou e alterou as informações.'],
  },
  {
    titulo: '8. Os seus direitos',
    paragrafos: ['Pela LGPD (art. 18), você pode, a qualquer momento e sem custo:'],
    itens: [
      'Confirmar se tratamos os seus dados e ter acesso a eles.',
      'Corrigir dados incompletos, inexatos ou desatualizados.',
      'Pedir a anonimização, o bloqueio ou a exclusão de dados desnecessários ou tratados em desacordo com a lei.',
      'Pedir a portabilidade dos seus dados.',
      'Saber com quem compartilhamos os seus dados.',
      'Revogar o consentimento e deixar de receber mensagens.',
    ],
  },
  {
    titulo: '9. Cookies',
    paragrafos: ['Nas páginas de divulgação, os cookies do Google Analytics e do Google Ads só são carregados se você clicar em "Aceitar" no aviso de cookies. Se recusar ou não responder, nada é enviado ao Google. Para mudar a escolha, limpe os dados do site no seu navegador.'],
  },
  {
    titulo: '10. Crianças e adolescentes',
    paragrafos: ['Os nossos serviços e anúncios são destinados a maiores de 18 anos. Não coletamos dados de menores de propósito; se isso acontecer, apagamos assim que soubermos.'],
  },
  {
    titulo: '11. Fale com a gente',
    paragrafos: [
      `Para exercer os seus direitos ou tirar dúvidas, escreva para ${EMAIL_PRIVACIDADE} ou chame no WhatsApp (99) 9 9181-1246. Respondemos em até 15 dias.`,
      'Se não ficar satisfeito com a resposta, você pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd.',
    ],
  },
  {
    titulo: '12. Mudanças nesta política',
    paragrafos: [`Esta política pode ser atualizada. A data da última atualização aparece no início da página. Última atualização: ${ATUALIZADA_EM}.`],
  },
];
