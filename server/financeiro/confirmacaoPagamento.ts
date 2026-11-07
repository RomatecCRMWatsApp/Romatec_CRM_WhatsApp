/**
 * Confirmação automática de pagamento no WhatsApp (padrão da Gestão de PA do ZAYRA):
 * - Comprador: mensagem de gratidão com versículo + o recibo em PDF.
 * - Administrador: aviso de recebimento (quem, parcela, total do dia e se o comprador foi avisado).
 *
 * Dispara para todo pagamento novo (webhook do Asaas, sincronização, Pix InfinitePay, lançamento manual): todos passam
 * por emitirRecibo → enviarRecibo. Envio único: a tentativa é reservada no banco (envioTentativas) antes de enviar,
 * e o que já foi entregue fica em envioJson (não repete). WhatsApp fora do ar: o vigia tenta a cada 10 min, até 6
 * vezes, por 3 dias. Sem a chave do Asaas do empreendimento, nada é enviado ao cliente (como antes).
 */
import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos, empreendimentos, recibos, users } from '../../drizzle/schema';
import { ORIGEM_BAIXA, textoAvisoAdmin, textoConfirmacao, type DadosConfirmacao } from '../../shared/confirmacaoPagamento';
import { LINHA_PUBLICIDADE } from '../../shared/escritorio';
import { telefoneWhatsApp } from '../../shared/contratos';
import { perfilDe } from '../../shared/equipe';
import { rotuloParcela } from './dados';
import { configAsaas } from './asaas';

export const MAX_TENTATIVAS = 6;
const JANELA_MS = 3 * 86_400_000;
const ABERTAS = ['prevista', 'emitida', 'vencida'];

type Enviador = { texto: (tel: string, txt: string) => Promise<unknown>; documento: (tel: string, doc: { base64: string; extensao: string; mime: string; nomeArquivo: string; legenda?: string }) => Promise<unknown> };
let enviadorTeste: Enviador | null = null;
/** Testes: troca o WhatsApp por um falso */
export const definirEnviadorConfirmacao = (e: Enviador | null) => { enviadorTeste = e; };
async function enviador(): Promise<Enviador> {
  if (enviadorTeste) return enviadorTeste;
  const z = await import('../leads/zapiClient');
  return { texto: (t, m) => z.enviarTexto(t, m), documento: (t, d) => z.enviarDocumento(t, d as any) };
}

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new Error('Banco indisponível');
  return d;
}

/** Quem recebe o aviso: AVISO_PAGAMENTO_WHATSAPP (lista) tem prioridade; senão, administradores ativos com telefone */
export async function numerosDoAdministrador(): Promise<string[]> {
  const env = String(process.env.AVISO_PAGAMENTO_WHATSAPP ?? '').split(',').map(s => telefoneWhatsApp(s.trim())).filter(Boolean) as string[];
  if (env.length) return Array.from(new Set(env));
  const d = await banco();
  const us: any[] = await d.select({ telefone: users.telefone, perfil: users.perfil, role: users.role, ativo: users.ativo }).from(users);
  return Array.from(new Set(us.filter(u => perfilDe(u) === 'admin' && !(u.ativo === false || u.ativo === 0)).map(u => telefoneWhatsApp(u.telefone)).filter(Boolean) as string[]));
}

const formaDe = (f: unknown) => {
  const s = String(f ?? '').toUpperCase();
  return s === 'PIX' ? 'Pix' : s === 'BOLETO' ? 'Boleto' : s === 'DINHEIRO' ? 'Dinheiro' : s === 'CARTAO' || s === 'CARTÃO' ? 'Cartão' : s === 'TRANSFERENCIA' ? 'Transferência' : s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Boleto';
};

/** Dados da mensagem a partir do recibo */
export async function dadosDaConfirmacao(reciboId: number) {
  const d = await banco();
  const [r]: any[] = await d.select().from(recibos).where(eq(recibos.id, reciboId)).limit(1);
  if (!r) throw new Error('Recibo não encontrado');
  const [c]: any[] = await d.select().from(cobrancas).where(eq(cobrancas.id, r.cobrancaId)).limit(1);
  const [ct]: any[] = await d.select().from(contratos).where(eq(contratos.id, r.contratoId)).limit(1);
  const [emp]: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, ct.empreendimentoId)).limit(1);
  const { pessoasDoContrato } = await import('./servico');
  const { comprador, conjuge } = await pessoasDoContrato(Number(r.contratoId));
  const abertas: any[] = await d.select({ valor: cobrancas.valor }).from(cobrancas).where(and(eq(cobrancas.contratoId, r.contratoId), inArray(cobrancas.status, ABERTAS)));
  const valor = Number(r.valorPago);
  const devido = Number(c?.valor ?? valor);
  const dados: DadosConfirmacao = {
    numeroPagamento: Number(r.id), comprador: String(comprador?.nome ?? 'Comprador'), contrato: String(ct.numero), lote: String(ct.loteCodigo),
    empreendimento: String(emp?.nome ?? 'empreendimento'),
    parcelas: [{ rotulo: c ? rotuloParcela({ tipo: c.tipo, numero: Number(c.numero), total: Number(c.total) } as any) : 'Parcela', vencimento: String(c?.vencimentoOriginal ?? c?.vencimento ?? r.pagoEm), valor: devido, quitada: valor + 0.009 >= devido, falta: Math.max(0, Math.round((devido - valor) * 100) / 100) }],
    valorRecebido: valor, pagoEm: String(r.pagoEm).slice(0, 10), hora: null, forma: formaDe(c?.formaPagamento),
    abertas: { qtd: abertas.length, valor: Math.round(abertas.reduce((s, x) => s + Number(x.valor), 0) * 100) / 100 },
    reciboNumero: String(r.numero), assinatura: LINHA_PUBLICIDADE,
  };
  const telefones = Array.from(new Set([comprador?.telefone1, conjuge?.telefone1].map(telefoneWhatsApp).filter(Boolean) as string[]));
  return { r, dados, telefones, empreendimentoId: Number(emp?.id ?? 0), slug: String(emp?.slug ?? 'bom-jardims') };
}

/** Total recebido hoje no empreendimento (recibos com pagamento de hoje) */
async function recebidoHoje(empreendimentoId: number, hoje: string) {
  const d = await banco();
  const rs: any[] = await d.select({ valor: recibos.valorPago, contratoId: recibos.contratoId, cancelado: recibos.canceladoEm, pagoEm: recibos.pagoEm }).from(recibos);
  const cs: any[] = await d.select({ id: contratos.id }).from(contratos).where(eq(contratos.empreendimentoId, empreendimentoId));
  const ids = new Set(cs.map(c => Number(c.id)));
  const doDia = rs.filter(x => !x.cancelado && ids.has(Number(x.contratoId)) && String(x.pagoEm).slice(0, 10) === hoje);
  return { total: Math.round(doDia.reduce((s, x) => s + Number(x.valor), 0) * 100) / 100, qtd: doDia.length };
}

type Progresso = { texto?: string[]; pdf?: string[]; admin?: boolean; motivo?: string | null };
const lerProgresso = (v: unknown): Progresso => { try { return (typeof v === 'string' ? JSON.parse(v) : v) ?? {}; } catch { return {}; } };

/**
 * Envia (ou completa) a confirmação de um recibo. `forcar` = reenvio pelo escritório (manda de novo ao comprador).
 * Sem telefone do comprador: não há o que tentar de novo; o administrador é avisado do motivo.
 */
export async function enviarConfirmacao(reciboId: number, origem = 'webhook', o: { forcar?: boolean; agora?: number } = {}): Promise<{ enviado: boolean; erro?: string }> {
  const agora = o.agora ?? Date.now();
  const d = await banco();
  const info = await dadosDaConfirmacao(reciboId);
  const { r, dados, telefones } = info;
  if (r.canceladoEm) return { enviado: false, erro: 'Recibo cancelado' };
  if (!configAsaas(process.env, info.slug)) return { enviado: false, erro: 'Cobrança desligada (Asaas sem chave): nada é enviado ao cliente' };
  if (!o.forcar && r.enviadoEm) return { enviado: true };
  const tentativas = Number(r.envioTentativas ?? 0);
  if (!o.forcar && tentativas >= MAX_TENTATIVAS) return { enviado: false, erro: r.envioErro ?? 'Limite de tentativas' };
  // Reserva a tentativa (compare-and-swap): webhook, sincronização e vigia nunca enviam juntos
  const reserva: any = await d.update(recibos).set({ envioTentativas: tentativas + 1 } as any)
    .where(and(eq(recibos.id, reciboId), eq(recibos.envioTentativas, tentativas)));
  if (!Number(reserva?.[0]?.affectedRows ?? reserva?.affectedRows ?? reserva?.changes ?? 1)) return { enviado: false, erro: 'Envio em andamento' };

  const prog: Progresso = o.forcar ? {} : lerProgresso(r.envioJson);
  prog.texto ??= []; prog.pdf ??= [];
  const z = await enviador();
  let erro: string | null = null;
  if (!telefones.length) erro = 'comprador sem WhatsApp no cadastro';
  else {
    const { pdfRecibo } = await import('./servico');
    let pdf: Buffer | null = null;
    for (const tel of telefones) {
      try {
        if (!prog.texto.includes(tel)) { await z.texto(tel, textoConfirmacao(dados, agora)); prog.texto.push(tel); }
        if (!prog.pdf.includes(tel)) {
          pdf ??= await pdfRecibo(reciboId);
          await z.documento(tel, { base64: pdf.toString('base64'), extensao: 'pdf', mime: 'application/pdf', nomeArquivo: `${dados.reciboNumero}.pdf`, legenda: `Recibo ${dados.reciboNumero} · ${LINHA_PUBLICIDADE}` });
          prog.pdf.push(tel);
        }
      } catch (e: any) { erro = `WhatsApp do sistema não entregou (${String(e?.message ?? e).slice(0, 120)})`; break; }
    }
  }
  const compradorOk = !erro;
  // Aviso ao administrador: uma vez por recibo (ou de novo no reenvio forçado)
  if (!prog.admin && (compradorOk || !telefones.length || tentativas + 1 >= MAX_TENTATIVAS || o.forcar)) {
    try {
      const hoje = new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
      const aviso = textoAvisoAdmin({ ...dados, origem: ORIGEM_BAIXA[origem] ?? origem, hoje: await recebidoHoje(info.empreendimentoId, hoje), avisado: { ok: compradorOk, motivo: erro } });
      for (const tel of await numerosDoAdministrador()) await z.texto(tel, aviso);
      prog.admin = true;
    } catch (e: any) { erro ??= `aviso ao administrador não entregue (${String(e?.message ?? e).slice(0, 100)})`; }
  }
  prog.motivo = erro;
  const semTelefone = !telefones.length;
  await d.update(recibos).set({
    envioJson: JSON.stringify(prog), envioErro: erro ? erro.slice(0, 250) : null,
    ...(compradorOk ? { enviadoEm: new Date(agora) } : {}),
    // Sem telefone: tentar de novo não adianta
    ...(semTelefone ? { envioTentativas: MAX_TENTATIVAS } : {}),
  } as any).where(eq(recibos.id, reciboId));
  const { auditar } = await import('./servico');
  await auditar(compradorOk ? 'recibo_enviado' : 'recibo_envio_falhou', { contratoId: Number(r.contratoId), cobrancaId: Number(r.cobrancaId), origem, detalhe: { numero: dados.reciboNumero, destinos: telefones.length, erro } });
  return compradorOk ? { enviado: true } : { enviado: false, erro: erro ?? undefined };
}

/** Vigia: recibos dos últimos 3 dias ainda não entregues (WhatsApp estava fora), até 6 tentativas */
export async function vigiaConfirmacoes(agora = Date.now()) {
  const d = await banco();
  const pendentes: any[] = await d.select({ id: recibos.id }).from(recibos)
    .where(and(isNull(recibos.enviadoEm), isNull(recibos.canceladoEm), gte(recibos.criadoEm, new Date(agora - JANELA_MS)), lt(recibos.envioTentativas, MAX_TENTATIVAS)));
  let enviados = 0;
  for (const p of pendentes) {
    const r = await enviarConfirmacao(Number(p.id), 'vigia', { agora }).catch(() => ({ enviado: false }));
    if (r.enviado) enviados++;
  }
  return { pendentes: pendentes.length, enviados };
}

let iniciado = false;
export function iniciarVigiaConfirmacoes() {
  if (iniciado) return;
  iniciado = true;
  const tick = () => vigiaConfirmacoes().catch(e => console.warn('[Confirmação de pagamento] vigia:', e?.message));
  setInterval(tick, 10 * 60_000).unref?.();
}
