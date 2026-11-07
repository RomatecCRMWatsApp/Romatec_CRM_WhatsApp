/**
 * Cobrança automática das parcelas no WhatsApp do comprador (régua). Regras puras: em que etapa cada parcela está
 * hoje e o texto de cada aviso.
 *
 *   antes  → 3 dias antes do vencimento      ("vence em 3 dias")
 *   dia    → no dia do vencimento            ("vence hoje")
 *   atraso → 3 dias depois, ainda em aberto   ("venceu, segue a 2ª via")
 *   final  → 10 dias depois, ainda em aberto  (último aviso automático; daí o escritório assume)
 *
 * Cada etapa tem uma janela curta (o dia exato e mais 2), para o servidor fora do ar não perder o aviso e para
 * dívida antiga não receber uma enxurrada quando a régua é ligada.
 */

export const ETAPAS_REGUA = ['antes', 'dia', 'atraso', 'final'] as const;
export type EtapaRegua = typeof ETAPAS_REGUA[number];

/** Dias em relação ao vencimento (negativo = antes) */
export const DIA_DA_ETAPA: Record<EtapaRegua, number> = { antes: -3, dia: 0, atraso: 3, final: 10 };
export const JANELA_DIAS = 2;

export const ROTULO_ETAPA: Record<EtapaRegua, string> = {
  antes: '3 dias antes', dia: 'No dia', atraso: '3 dias de atraso', final: '10 dias de atraso (último)',
};

/** Status de parcela que ainda pode ser cobrada */
export const STATUS_COBRAVEIS = ['prevista', 'emitida', 'vencida'] as const;
/** Contratos que recebem a régua (assinado em diante, sem os encerrados) */
export const CONTRATOS_COM_REGUA = ['assinado', 'ativo'] as const;

const DIA_MS = 86_400_000;
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA_MS);

/**
 * Etapa que cabe hoje para a parcela, ou null. `ja` = etapas já enviadas dessa parcela.
 * Pega a etapa mais adiantada cuja janela inclui hoje (se o servidor ficou fora, não manda "vence em 3 dias" depois do vencimento).
 */
export function etapaDeHoje(vencimento: string, hoje: string, ja: readonly string[] = []): EtapaRegua | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return null;
  const d = diasEntre(vencimento, hoje); // hoje - vencimento
  for (const e of [...ETAPAS_REGUA].reverse()) {
    const alvo = DIA_DA_ETAPA[e];
    if (d >= alvo && d <= alvo + JANELA_DIAS && !(alvo < 0 && d >= 0) && !ja.includes(e)) return e;
  }
  return null;
}

export interface DadosAviso {
  nome: string;
  parcela: string;       // "parcela 5/120" ou "entrada"
  valor: number;
  vencimento: string;    // AAAA-MM-DD
  empreendimento: string;
  chacara: string;
  linkPagamento: string | null; // boleto/fatura (Pix) da parcela
  linkPortal: string;            // portal do comprador (carnê, 2ª via)
  pixCopiaECola?: string | null;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d: string) => d.split('-').reverse().join('/');
const primeiro = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';

export function textoAviso(etapa: EtapaRegua, d: DadosAviso): string {
  const ola = `Olá, ${primeiro(d.nome)}!`;
  const quem = `${d.empreendimento}, chácara ${d.chacara}`;
  const pagar = d.linkPagamento ? `\n\n💳 Pagar (Pix ou boleto): ${d.linkPagamento}` : '';
  const pix = d.pixCopiaECola ? `\n\nPix copia e cola:\n${d.pixCopiaECola}` : '';
  const portal = `\n📄 Seu carnê e 2ª via: ${d.linkPortal}`;
  const assinatura = `\n\nRomatec Consultoria Total · CRECI J-1234\nDúvidas? É só responder esta mensagem.`;
  const valor = `${brl(d.valor)}`;
  switch (etapa) {
    case 'antes':
      return `${ola} 🌳\n\nPassando para lembrar: a ${d.parcela} da sua chácara (${quem}) vence em *${dataBr(d.vencimento)}*, no valor de *${valor}*.${pagar}${pix}${portal}${assinatura}`;
    case 'dia':
      return `${ola}\n\nA ${d.parcela} da sua chácara (${quem}) vence *hoje*, no valor de *${valor}*. Se já pagou, desconsidere esta mensagem.${pagar}${pix}${portal}${assinatura}`;
    case 'atraso':
      return `${ola}\n\nNão identificamos o pagamento da ${d.parcela} da sua chácara (${quem}), que venceu em ${dataBr(d.vencimento)} (${valor}). Pode ter sido só um esquecimento: a 2ª via atualizada está no seu carnê.${pagar}${portal}\n\nSe já pagou, por favor nos envie o comprovante por aqui.${assinatura}`;
    case 'final':
      return `${ola}\n\nA ${d.parcela} da sua chácara (${quem}), vencida em ${dataBr(d.vencimento)}, segue em aberto. Para evitar encargos maiores, regularize pelo seu carnê ou fale com a gente para combinarmos a melhor forma.${portal}\n\nNossa equipe vai entrar em contato.${assinatura}`;
  }
}

/** "entrada", "parcela 5/120", "à vista"… */
export function rotuloParcelaAviso(p: { tipo: string; numero: number; total: number }): string {
  if (p.tipo === 'entrada') return p.total > 1 ? `entrada (${p.numero}/${p.total})` : 'entrada';
  if (p.tipo === 'avista') return 'parcela à vista';
  if (p.tipo === 'renegociacao') return `parcela renegociada ${p.numero}/${p.total}`;
  return `parcela ${p.numero}/${p.total}`;
}
