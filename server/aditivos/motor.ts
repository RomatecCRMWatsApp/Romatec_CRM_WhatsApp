/**
 * Motor de Termos Aditivos: o mesmo modelo de termo para qualquer instrumento do CRM — Contrato de Gestão
 * (EMPREENDEDORA × GESTORA) e Compromissos de Compra e Venda (PROMITENTE VENDEDORA × COMPRADOR).
 *
 * Estrutura: cabeçalho com o número por extenso ("SEGUNDO TERMO ADITIVO…"), preâmbulo com as partes qualificadas,
 * objeto, alterações e inclusões (cada parágrafo do texto vira um item numerado), valor quando houver, ratificação
 * sem novação (Código Civil, arts. 360 e 361), assinatura eletrônica (MP 2.200-2/2001; Lei n.º 14.063/2020) e foro.
 * Renderiza em PDF e Word pelos mesmos renderizadores do Contrato de Gestão.
 */
import { brl, dataExtenso, reaisExtenso } from '../contratos/formato';
import type { Bloco } from '../gestao/contrato';

export interface ParteAditivo {
  /** Denominação no instrumento (EMPREENDEDORA, GESTORA, PROMITENTE VENDEDORA…) */
  papel: string;
  nome: string;
  /** Qualificação depois do nome (", inscrita no CPF…, residente…") */
  qualif: string;
  /** Linha da assinatura (CPF/CNPJ) */
  doc?: string;
  /** Rótulo na linha de assinatura, se diferente do papel */
  rotuloAssinatura?: string;
}

export interface TermoAditivo {
  numero: number;
  /** "Contrato de Prestação de Serviços de Gestão n.º GE-2026-0001" */
  instrumento: string;
  /** Linha de contexto do cabeçalho (empreendimento, unidade) */
  contexto: string;
  partes: ParteAditivo[];
  /** Objeto, completando "O presente Termo Aditivo tem por objeto …" */
  objeto: string;
  /** Texto das alterações: cada parágrafo (separado por linha em branco ou quebra) vira um item 2.n */
  texto: string;
  /** Blocos extras dentro da Cláusula 2ª (ex.: tabela dos recibos), depois dos itens de texto */
  extras?: Bloco[];
  /** Valor do termo, com a frase que o descreve ("a receber pela GESTORA…") */
  valor?: { valor: number; descricao: string } | null;
  local: string;
  /** AAAA-MM-DD */
  data: string;
  /** Frase de assinatura eletrônica específica (ex.: código no WhatsApp do comprador) */
  assinaturaEletronica?: string;
  testemunhas?: { nome: string; cpf: string }[];
}

const ORDINAIS = ['', 'PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'QUARTO', 'QUINTO', 'SEXTO', 'SÉTIMO', 'OITAVO', 'NONO', 'DÉCIMO',
  'DÉCIMO PRIMEIRO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCEIRO', 'DÉCIMO QUARTO', 'DÉCIMO QUINTO', 'DÉCIMO SEXTO', 'DÉCIMO SÉTIMO',
  'DÉCIMO OITAVO', 'DÉCIMO NONO', 'VIGÉSIMO'];
/** 2 → "SEGUNDO"; acima de 20, "N.º 21" */
export const ordinalAditivo = (n: number) => (ORDINAIS[n] ? `${ORDINAIS[n]} TERMO ADITIVO` : `TERMO ADITIVO N.º ${n}`);

/** Parágrafos do texto livre (linhas em branco ou quebras simples separam); numeração digitada pela pessoa é removida */
export function paragrafosDe(texto: string): string[] {
  return String(texto ?? '').split(/\n+/).map(l => l.trim().replace(/^\d+(\.\d+)*[.)]?\s+/, '')).filter(l => l.length > 1);
}

export function blocosAditivo(t: TermoAditivo): Bloco[] {
  const b: Bloco[] = [];
  const P = (s: string): Bloco => ({ k: 'par', tr: [{ t: s }] });
  b.push({ k: 'cab', t1: `${ordinalAditivo(t.numero)} AO ${t.instrumento.toUpperCase()}`, t2: t.contexto });
  const pre: { t: string; b?: boolean }[] = [{ t: 'Pelo presente instrumento particular, de um lado, ' }];
  t.partes.forEach((p, i) => {
    if (i > 0) pre.push({ t: i === t.partes.length - 1 ? '; e, de outro lado, ' : '; ' });
    pre.push({ t: p.nome, b: true }, { t: `${p.qualif ? `, ${p.qualif}` : ''}, doravante ${/\(A\)/.test(p.papel) ? 'denominado(a)' : 'denominada'} ` }, { t: p.papel, b: true });
  });
  pre.push({ t: `; partes no ${t.instrumento}, resolvem celebrar o presente ${ordinalAditivo(t.numero).toLowerCase().replace(/^./, c => c.toUpperCase())}, que se regerá pelas cláusulas seguintes.` });
  b.push({ k: 'par', tr: pre });

  b.push({ k: 'clau', t: 'CLÁUSULA 1ª — DO OBJETO' });
  b.push(P(`1.1. O presente Termo Aditivo tem por objeto ${t.objeto.replace(/\.$/, '')}.`));

  const itens = paragrafosDe(t.texto);
  let c = 2;
  if (itens.length || t.extras?.length) {
    b.push({ k: 'clau', t: `CLÁUSULA ${c}ª — DAS ALTERAÇÕES E INCLUSÕES` });
    itens.forEach((s, i) => b.push(P(`${c}.${i + 1}. ${s}`)));
    if (t.extras?.length) b.push(...t.extras);
    c++;
  }
  if (t.valor && t.valor.valor > 0) {
    b.push({ k: 'clau', t: `CLÁUSULA ${c}ª — DO VALOR` });
    b.push({ k: 'par', tr: [{ t: `${c}.1. ` }, { t: `R$ ${brl(t.valor.valor)} (${reaisExtenso(t.valor.valor)})`, b: true }, { t: `, ${t.valor.descricao.replace(/\.$/, '')}.` }] });
    c++;
  }
  b.push({ k: 'clau', t: `CLÁUSULA ${c}ª — DA RATIFICAÇÃO E DA AUSÊNCIA DE NOVAÇÃO` });
  b.push(P(`${c}.1. Este Termo Aditivo integra o ${t.instrumento} e não importa novação (Código Civil, arts. 360 e 361). Permanecem em pleno vigor todas as demais cláusulas e condições do instrumento e de seus anexos e aditivos anteriores, que as partes ratificam, salvo no que for expressamente alterado por este termo.`));
  c++;
  b.push({ k: 'clau', t: `CLÁUSULA ${c}ª — DAS DISPOSIÇÕES GERAIS E DO FORO` });
  b.push(P(`${c}.1. ${t.assinaturaEletronica ?? 'As partes reconhecem a validade da assinatura eletrônica deste instrumento (Medida Provisória n.º 2.200-2/2001 e Lei n.º 14.063/2020).'} Os dados pessoais são tratados exclusivamente para a execução do contrato (Lei n.º 13.709/2018, art. 7º, V). Fica eleito o foro da Comarca de ${t.local}, com renúncia a qualquer outro, por mais privilegiado que seja.`));
  b.push(P(`${t.local}, ${dataExtenso(t.data)}.`));
  b.push({ k: 'ass', blocos: [
    ...t.partes.map(p => ({ papel: p.rotuloAssinatura ?? p.papel, nome: p.nome, doc: p.doc })),
    ...(t.testemunhas ?? []).map((x, i) => ({ papel: `Testemunha ${i + 1}`, nome: x.nome || 'Nome:', doc: x.cpf ? `CPF ${x.cpf}` : 'CPF:' })),
  ] });
  return b;
}
