/**
 * Confirmação de pagamento no WhatsApp (mesmo padrão da Gestão de PA do ZAYRA, aprovado pelo CEO em 07/11/2026):
 * gratidão ao comprador com um versículo em rodízio e aviso de recebimento ao administrador. Regras puras (texto).
 */

/** Versículos (ARC) aprovados pelo CEO — um por pagamento, em rodízio (índice = nº do recibo módulo 11) */
export const VERSICULOS: { texto: string; ref: string }[] = [
  { texto: 'Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.', ref: '1 Tessalonicenses 5:18' },
  { texto: 'Louvai ao Senhor, porque ele é bom, porque a sua benignidade dura para sempre.', ref: 'Salmos 107:1' },
  { texto: 'Eu te louvarei, Senhor, de todo o meu coração; contarei todas as tuas maravilhas.', ref: 'Salmos 9:1' },
  { texto: 'E a paz de Deus, para a qual também fostes chamados em um corpo, domine em vossos corações; e sede agradecidos.', ref: 'Colossenses 3:15' },
  { texto: 'Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento.', ref: 'Provérbios 3:5' },
  { texto: 'Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.', ref: 'Salmos 37:5' },
  { texto: 'Confia no Senhor e faze o bem; habitarás na terra e, verdadeiramente, serás alimentado.', ref: 'Salmos 37:3' },
  { texto: 'Tu conservarás em paz aquele cuja mente está firme em ti; porque ele confia em ti.', ref: 'Isaías 26:3' },
  { texto: 'Confia ao Senhor as tuas obras, e teus pensamentos serão estabelecidos.', ref: 'Provérbios 16:3' },
  { texto: 'O meu Deus, segundo as suas riquezas, suprirá todas as vossas necessidades em glória, por Cristo Jesus.', ref: 'Filipenses 4:19' },
  { texto: 'O Senhor te abençoe e te guarde; o Senhor faça resplandecer o seu rosto sobre ti e tenha misericórdia de ti.', ref: 'Números 6:24-25' },
];

export const versiculoDo = (n: number) => VERSICULOS[((Math.trunc(n) % VERSICULOS.length) + VERSICULOS.length) % VERSICULOS.length];

/** Saudação pelo horário de Brasília, alternando para não repetir a mesma mensagem em série (anti-bloqueio) */
export function saudacao(agora: number, semente: number): string {
  const h = new Date(agora - 3 * 3600_000).getUTCHours();
  const doHorario = h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
  return ['Olá', 'Oi', doHorario, doHorario][((semente % 4) + 4) % 4];
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const primeiro = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
const titulo = (n: string) => primeiro(n).charAt(0).toUpperCase() + primeiro(n).slice(1).toLowerCase();

export interface ParcelaPaga { rotulo: string; vencimento: string; valor: number; quitada: boolean; falta?: number }
export interface DadosConfirmacao {
  numeroPagamento: number;
  comprador: string;
  contrato: string;
  lote: string;
  empreendimento: string;
  parcelas: ParcelaPaga[];
  valorRecebido: number;
  pagoEm: string;          // AAAA-MM-DD
  hora?: string | null;    // HH:MM (só quando conhecida)
  forma: string;           // Pix, Boleto, Dinheiro…
  abertas: { qtd: number; valor: number };
  reciboNumero: string;
  assinatura: string;      // Romatec Consultoria Total · CRECI J-1234
}

const linhaParcela = (p: ParcelaPaga) =>
  `${p.rotulo} (venc. ${br(p.vencimento)}) — ${brl(p.valor)} ${p.quitada ? '✔️ quitada' : `· falta ${brl(p.falta ?? 0)}`}`;

/** Mensagem ao comprador */
export function textoConfirmacao(d: DadosConfirmacao, agora = Date.now()): string {
  const v = versiculoDo(d.numeroPagamento);
  const ref = d.parcelas.length === 1 ? `📄 Referente a: ${linhaParcela(d.parcelas[0])}` : `📄 Referente a:\n${d.parcelas.map(p => `   • ${linhaParcela(p)}`).join('\n')}`;
  const situacao = d.abertas.qtd === 0
    ? '🎉 Com este pagamento, *todas as suas parcelas estão quitadas*. Parabéns!'
    : `📌 Parcelas em aberto: ${d.abertas.qtd} (${brl(d.abertas.valor)}).`;
  return [
    `${saudacao(agora, d.numeroPagamento)}, ${titulo(d.comprador)}! 🙏`,
    '',
    `Recebemos o seu pagamento. Muito obrigado pela confiança e pelo compromisso com o ${d.empreendimento}!`,
    '',
    '✅ *Pagamento confirmado*',
    `👤 Comprador: ${d.comprador.toUpperCase()} (contrato ${d.contrato})`,
    `🏡 Chácara: ${d.lote} — ${d.empreendimento}`,
    ref,
    `💰 Valor recebido: *${brl(d.valorRecebido)}*`,
    `📅 Pago em: ${br(d.pagoEm)}${d.hora ? ` às ${d.hora}` : ''} · ${d.forma}`,
    `🧾 Recibo: ${d.reciboNumero} (em PDF logo abaixo)`,
    '',
    situacao,
    '',
    `📖 _"${v.texto}"_ (${v.ref})`,
    '',
    'Deus abençoe você e sua família!',
    d.assinatura,
  ].join('\n');
}

export interface DadosAvisoAdmin extends DadosConfirmacao {
  origem: string;
  hoje: { total: number; qtd: number };
  avisado: { ok: boolean; motivo?: string | null };
}

/** Aviso ao administrador (sem precisar abrir o sistema) */
export function textoAvisoAdmin(d: DadosAvisoAdmin): string {
  return [
    `💰 *Pagamento recebido — ${d.empreendimento}*`,
    '',
    `👤 ${d.comprador.toUpperCase()} (${d.contrato}) · Chácara ${d.lote}`,
    ...d.parcelas.map(p => `   📄 ${linhaParcela(p)}`),
    `   📌 em aberto: ${d.abertas.qtd} parcela(s) · ${brl(d.abertas.valor)}`,
    '',
    `💵 Total: *${brl(d.valorRecebido)}* · ${d.forma} · ${br(d.pagoEm)}`,
    `🔎 Origem: ${d.origem}`,
    `📊 Recebido hoje no empreendimento: ${brl(d.hoje.total)} (${d.hoje.qtd} pagamento${d.hoje.qtd === 1 ? '' : 's'})`,
    '',
    d.avisado.ok ? `✅ ${titulo(d.comprador)} avisado(a) no WhatsApp` : `⚠️ ${titulo(d.comprador)} não avisado(a): ${d.avisado.motivo ?? 'motivo não informado'}`,
  ].join('\n');
}

/** Rótulo da origem da baixa, para o aviso do administrador */
export const ORIGEM_BAIXA: Record<string, string> = {
  webhook: 'Asaas — baixa automática do boleto/Pix',
  sincronizacao: 'Asaas — sincronização',
  pagamento_manual: 'Lançamento manual no Financeiro',
  infinitepay: 'Pix InfinitePay',
  reenvio: 'Reenvio pelo escritório',
  vigia: 'Reenvio automático (WhatsApp estava fora)',
  compensacao: 'Compensação em outra parcela',
};
