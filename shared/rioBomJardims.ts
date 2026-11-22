/**
 * O rio e a água no Bom Jardims (/bom-jardims/rio-e-agua): página para responder a pergunta mais comum —
 * o rio não passa dentro das chácaras; fica na área de preservação, que é área comum de todos; cada chácara tem
 * a concessão de uso de 10 metros lineares à margem; e a água da chácara vem do poço artesiano do condomínio.
 * Mesmas regras da ficha (shared/baseConhecimento.ts) e do contrato (shared/documentosCliente.ts).
 */
export const ROTA_RIO = '/bom-jardims/rio-e-agua';
export const CAMPANHA_RIO = 'BJ-RIO';
export const TITULO_RIO = 'O rio e a água — Condomínio de Chácaras Bom Jardims, Açailândia/MA';
export const DESCRICAO_RIO = 'O rio não passa dentro das chácaras: fica na área de preservação, que é área comum de todos os condôminos. Cada chácara tem 10 metros lineares à margem, e a água vem do poço artesiano do condomínio.';

export interface BlocoRio { titulo: string; itens: string[] }

export const BLOCOS_RIO: BlocoRio[] = [
  {
    titulo: 'O rio não passa dentro das chácaras',
    itens: [
      'Nenhuma chácara tem rio dentro do terreno.',
      'O rio corre na área de preservação permanente (APP), uma reserva de mata nativa protegida por lei, junto às chácaras.',
      'A flora e a fauna dessa área são preservadas: não se pode desmatar, cercar nem construir nela.',
    ],
  },
  {
    titulo: 'Uma área comum para todos os condôminos',
    itens: [
      'A área de vivência ao longo do rio é de todos os moradores do condomínio.',
      'O projeto prevê trilha ecológica, pontos de banho e o deck junto ao rio, que é da área comum e está em construção.',
      'Quiosques, vestiário e churrasqueiras de apoio ficam fora da faixa de preservação, conforme as regras ambientais.',
    ],
  },
  {
    titulo: '10 metros lineares à margem para cada chácara',
    itens: [
      'Cada chácara terá a concessão de uso de um trecho de 10 metros lineares à margem do rio.',
      'É uma concessão de uso, não é propriedade: o trecho continua sendo área de preservação.',
      'Só valem estruturas removíveis, como tenda e churrasqueira portátil.',
      'Não é área individual de 100 m², não inclui deck ou bangalô individual e não autoriza construir.',
    ],
  },
  {
    titulo: 'E a água da chácara?',
    itens: [
      'A água vem do poço artesiano do condomínio, com bombeamento automático para um reservatório elevado de 10.000 litros.',
      'A rede leva um ponto de água até a frente de cada chácara, com medição individual por hidrômetro.',
      'O hidrômetro e o cavalete são por conta do comprador.',
      'As obras estão em andamento: na visita mostramos o que já está pronto e o que está previsto.',
    ],
  },
];
