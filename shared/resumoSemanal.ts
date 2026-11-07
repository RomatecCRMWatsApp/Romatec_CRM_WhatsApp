/**
 * Resumo semanal no WhatsApp do administrador (toda segunda de manhã): leads, visitas, vendas, dinheiro, equipe e
 * licenças da semana que passou. Aqui ficam as regras puras: o período e o texto da mensagem.
 */

export interface DadosResumoSemanal {
  inicio: string; // AAAA-MM-DD (segunda)
  fim: string;    // AAAA-MM-DD (domingo)
  leads: { novos: number; quentes: number; semResponsavel: number; porOrigem: { origem: string; n: number }[] };
  visitas: { realizadas: number; proximas7dias: number };
  vendas: { contratos: number; chacaras: string[]; cancelados: number; reservadasAgora: number };
  dinheiro: { recebido: number; vencidoTotal: number; parcelasVencidas: number; clientesEmAtraso: number; vencendo7dias: number };
  equipe: { ativos: number; usando: number; parados: string[]; maisMateriais: { nome: string; n: number }[] };
  licencas: { vencendo7dias: string[]; bloqueados: number; pedidosPendentes: number };
}

const DIA = 86_400_000;
const isoDia = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * A semana fechada antes de `agora` (horário de Brasília): de segunda a domingo. Numa segunda, é a semana anterior.
 * Também devolve a chave da semana (a segunda em que o resumo sai), usada para não mandar duas vezes.
 */
export function semanaAnterior(agora = Date.now()) {
  const br = agora - 3 * 3600_000;
  const hoje = new Date(isoDia(br) + 'T00:00:00Z');
  const diaSemana = (hoje.getUTCDay() + 6) % 7; // 0 = segunda
  const segundaAtual = hoje.getTime() - diaSemana * DIA;
  const inicio = segundaAtual - 7 * DIA, fim = segundaAtual - DIA;
  return { inicio: isoDia(inicio), fim: isoDia(fim), chave: isoDia(segundaAtual), ehSegunda: diaSemana === 0, horaBrasilia: new Date(br).getUTCHours() };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const ROTULO_ORIGEM: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram_ads: 'anúncio Instagram', instagram_dm: 'Direct', instagram_bio: 'link da bio', site: 'site', indicacao: 'indicação', evento: 'evento', sem_origem: 'sem origem',
};

/** O texto que vai no WhatsApp (negrito com *, como no app) */
export function textoResumoSemanal(d: DadosResumoSemanal, nome = 'José'): string {
  const l: string[] = [];
  l.push(`📊 *Resumo da semana · Romatec CRM*`);
  l.push(`${dataBr(d.inicio)} a ${dataBr(d.fim)}`);
  l.push('');
  l.push(`Bom dia, ${nome}! Como foi a semana:`);
  l.push('');
  // Leads
  l.push(`👥 *Leads:* ${plural(d.leads.novos, 'novo', 'novos')}${d.leads.quentes ? `, ${plural(d.leads.quentes, 'quente', 'quentes')}` : ''}`);
  if (d.leads.porOrigem.length) l.push(`   ${d.leads.porOrigem.map(o => `${ROTULO_ORIGEM[o.origem] ?? o.origem} ${o.n}`).join(' · ')}`);
  if (d.leads.semResponsavel) l.push(`   ⚠️ ${plural(d.leads.semResponsavel, 'lead aguardando', 'leads aguardando')} corretor`);
  // Visitas e vendas
  l.push(`🚗 *Visitas:* ${plural(d.visitas.realizadas, 'realizada', 'realizadas')}${d.visitas.proximas7dias ? `, ${plural(d.visitas.proximas7dias, 'agendada', 'agendadas')} para esta semana` : ''}`);
  l.push(`🏡 *Vendas:* ${plural(d.vendas.contratos, 'contrato novo', 'contratos novos')}${d.vendas.chacaras.length ? ` (${d.vendas.chacaras.slice(0, 8).join(', ')}${d.vendas.chacaras.length > 8 ? '…' : ''})` : ''}`);
  if (d.vendas.reservadasAgora) l.push(`   ${plural(d.vendas.reservadasAgora, 'chácara reservada', 'chácaras reservadas')} agora`);
  if (d.vendas.cancelados) l.push(`   ${plural(d.vendas.cancelados, 'cancelamento', 'cancelamentos')} na semana`);
  l.push('');
  // Dinheiro
  l.push(`💰 *Recebido na semana:* ${brl(d.dinheiro.recebido)}`);
  if (d.dinheiro.parcelasVencidas) l.push(`🔴 *Em atraso:* ${brl(d.dinheiro.vencidoTotal)} em ${plural(d.dinheiro.parcelasVencidas, 'parcela', 'parcelas')} (${plural(d.dinheiro.clientesEmAtraso, 'cliente', 'clientes')})`);
  else l.push(`🟢 Nenhuma parcela em atraso`);
  if (d.dinheiro.vencendo7dias) l.push(`📅 ${plural(d.dinheiro.vencendo7dias, 'parcela vence', 'parcelas vencem')} nos próximos 7 dias`);
  l.push('');
  // Equipe
  l.push(`🧑‍💼 *Equipe:* ${d.equipe.usando} de ${plural(d.equipe.ativos, 'corretor ativo', 'corretores ativos')} usando o sistema`);
  if (d.equipe.parados.length) l.push(`   Parados: ${d.equipe.parados.slice(0, 6).join(', ')}${d.equipe.parados.length > 6 ? ` e mais ${d.equipe.parados.length - 6}` : ''}`);
  if (d.equipe.maisMateriais.length) l.push(`   Mais divulgaram: ${d.equipe.maisMateriais.slice(0, 3).map(m => `${m.nome} (${m.n})`).join(', ')}`);
  // Licenças
  const avisosLicenca = [
    d.licencas.vencendo7dias.length ? `vencendo em 7 dias: ${d.licencas.vencendo7dias.slice(0, 5).join(', ')}` : null,
    d.licencas.bloqueados ? plural(d.licencas.bloqueados, 'bloqueado', 'bloqueados') : null,
    d.licencas.pedidosPendentes ? `${plural(d.licencas.pedidosPendentes, 'pedido', 'pedidos')} de prorrogação esperando a sua senha` : null,
  ].filter(Boolean);
  if (avisosLicenca.length) l.push(`🔑 *Licenças:* ${avisosLicenca.join('; ')}`);
  l.push('');
  l.push(`Detalhes no CRM: romateccrm.com/dashboard`);
  return l.join('\n');
}
