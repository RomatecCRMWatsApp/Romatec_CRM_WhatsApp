/** Plano das campanhas do Instagram em PDF (mesmo escritor dos documentos do escritório) */
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (iso: string) => iso.split('-').reverse().join('/');
const n = (v: number) => v.toLocaleString('pt-BR');
/** A fonte do PDF (Times, WinAnsi) não tem emoji: troca os marcadores por texto e tira o resto */
const MARCAS: [RegExp, string][] = [[/✅|☑️|✔️/g, '•'], [/👉|📲|📍|🏡|🚧|💰|🚗|🌳|🤝|💸|🎯|📝|📅|📎|⚠️?/g, ''], [/→/g, '›'], [/1️⃣/g, '1)'], [/2️⃣/g, '2)'], [/3️⃣/g, '3)']];
const EMOJI = new RegExp('[\\u{1F000}-\\u{1FFFF}\\u{2600}-\\u{27BF}\\u{FE0F}\\u{200D}\\u{20E3}]', 'gu');
export function semEmoji(t: string): string {
  let s = t;
  for (const [re, por] of MARCAS) s = s.replace(re, por);
  return s.replace(EMOJI, '').replace(/ {2,}/g, ' ').replace(/^ /gm, '');
}

export async function planoCampanhaPdf(i: any, r: any): Promise<Buffer> {
  const { escritor } = await import('./contratos/docsComissao');
  const titulo = `Plano de campanhas no Instagram — ${i.dados.nome}`;
  const w = await escritor(titulo, 'bomjardims', titulo);
  const p = r.plano;
  w.cabecalho('PLANO DE CAMPANHAS NO INSTAGRAM', `${i.dados.nome} · ${br(p.inicio)} a ${br(p.termino)} · vendas + seguidores`);
  if (r.anterior?.metricas) {
    const m = r.anterior.metricas;
    w.clausula('1. CAMPANHA ANTERIOR');
    w.tabela(['Indicador', 'Valor'], [
      ['Campanha', r.anterior.nome || '—'], ['Gasto', brl(r.anterior.gasto)], ['Resultados', n(r.anterior.resultados)], ['Custo por resultado', brl(m.custoPorResultado)],
      ['CPM', m.cpm != null ? brl(m.cpm) : '—'], ['Frequência', m.frequencia != null ? n(m.frequencia) : '—'],
      ['Resultados por 1.000 alcançados', m.resultadosPorMilAlcancados != null ? n(m.resultadosPorMilAlcancados) : '—'], ['Criativo vencedor', r.anterior.criativoVencedor || '—'],
    ], { pesos: [1, 2], size: 8.6 });
  }
  w.clausula('2. ORÇAMENTO E PROJEÇÃO');
  w.tabela(['Campanha', 'Total', 'Por dia', 'Projeção'], [
    ['Vendas (WhatsApp)', brl(p.vendas.total), brl(p.vendas.porDia), p.vendas.conversas ? `${n(p.vendas.conversas.min)} a ${n(p.vendas.conversas.max)} conversas (de ${brl(p.vendas.faixa[0])} a ${brl(p.vendas.faixa[1])} cada)` : '—'],
    ['Seguidores', brl(p.seguidores.total), brl(p.seguidores.porDia), p.seguidores.novos ? `${n(p.seguidores.novos.min)} a ${n(p.seguidores.novos.max)} seguidores (de ${brl(p.seguidores.faixa[0])} a ${brl(p.seguidores.faixa[1])} cada)` : '—'],
    ['Total', brl(p.orcamento), brl(p.porDia), `${p.dias} dia(s), orçamento total com término em ${br(p.termino)}`],
  ], { pesos: [1.3, 1, 1, 2.6], size: 8.4 });
  w.paragrafo(`Vendas em dois conjuntos: frio (cidade + ~40 km) ${brl(p.vendas.conjuntos.frio)} e remarketing ${brl(p.vendas.conjuntos.remarketing)}.`);
  if (p.seguidores.perfilNoFim) w.paragrafo(`Perfil ao fim da campanha: de ${n(p.seguidores.perfilNoFim.min)} a ${n(p.seguidores.perfilNoFim.max)} seguidores.`);
  if (p.alertaMeta) w.paragrafo([{ t: 'Expectativa honesta: ', b: true }, { t: semEmoji(p.alertaMeta) }]);
  w.clausula('3. CONFIGURAÇÃO NO GERENCIADOR DE ANÚNCIOS (SÓ INSTAGRAM)');
  w.paragrafo([{ t: 'Vendas', b: true }]); for (const t of r.config.vendas) w.paragrafo(`• ${semEmoji(t)}`);
  w.paragrafo([{ t: 'Seguidores', b: true }]); for (const t of r.config.seguidores) w.paragrafo(`• ${semEmoji(t)}`);
  w.paragrafo([{ t: 'Orçamento', b: true }]); for (const t of r.config.orcamento) w.paragrafo(`• ${semEmoji(t)}`);
  w.paragrafo([{ t: 'Perfil antes da campanha de seguidores', b: true }]); for (const t of r.config.perfil) w.paragrafo(`• ${semEmoji(t)}`);
  w.clausula('4. REGRAS DE CORTE');
  w.tabela(['Quando', 'Sinal', 'Ação'], r.regras.map((x: any) => [x.quando, x.sinal, x.acao].map(semEmoji)), { pesos: [1, 2, 2], size: 8.6 });
  w.clausula('5. TEXTOS');
  const bloco = (rot: string, t: string) => { w.paragrafo([{ t: rot, b: true }]); for (const l of semEmoji(t).split('\n')) w.paragrafo(l.trim() || ' '); };
  bloco(`Anúncio de vendas · título "${r.textos.tituloVendas}" · botão ${r.textos.ctaVendas}`, r.textos.anuncioVendas);
  bloco(`Anúncio de seguidores · botão ${r.textos.ctaSeguidores}`, r.textos.anuncioSeguidores);
  bloco('Mensagem automática do WhatsApp', r.textos.mensagemAutomatica);
  bloco('Legenda do Reels de vendas', r.textos.legendaVendas);
  bloco('Legenda do Reels de seguidores', r.textos.legendaSeguidores);
  w.paragrafo([{ t: 'Ganchos fixos no topo dos vídeos: ', b: true }, { t: `vendas "${r.textos.ganchoVendas.join(' / ')}" · seguidores "${r.textos.ganchoSeguidores.join(' / ')}".` }]);
  for (const a of r.textos.avisos) w.paragrafo(`Atenção: ${semEmoji(a)}`);
  return w.salvar();
}
