/**
 * Registro do contrato no cartório: kit para protocolo (requerimento formal + contrato assinado + termos aditivos +
 * documentos das partes, em ZIP) e o acompanhamento do protocolo (status, número, prazo de referência, exigências,
 * matrícula, emolumentos, histórico). O protocolo em si é feito no e-Protocolo do ONR com certificado ICP-Brasil:
 * a integração automática por API depende de credenciamento da Romatec como integradora no ONR.
 */
import { and, eq } from 'drizzle-orm';
import { zipSync } from 'fflate';
import { getDb } from './db';
import { contratoAditivos, contratos, empreendimentos, lotes, registrosCartorio, users } from '../drizzle/schema';
import { ROTULO_REGISTRO, STATUS_REGISTRO, prazoDoRegistro, type StatusRegistro } from '../shared/cartorio';

export class CartorioErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'CartorioErro'; } }
async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new CartorioErro('Banco indisponível', 503);
  return d;
}
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export async function situacaoRegistro(contratoId: number) {
  const d = await banco();
  const [r]: any[] = await d.select().from(registrosCartorio).where(eq(registrosCartorio.contratoId, contratoId)).limit(1);
  if (!r) return null;
  const us: any[] = r.atualizadoPor ? await d.select({ name: users.name }).from(users).where(eq(users.id, r.atualizadoPor)).limit(1) : [];
  return {
    status: r.status as StatusRegistro, rotulo: ROTULO_REGISTRO[r.status as StatusRegistro] ?? r.status, cartorio: r.cartorio ?? null, protocolo: r.protocolo ?? null,
    dataProtocolo: r.dataProtocolo ?? null, prazo: prazoDoRegistro(r.dataProtocolo), exigencias: r.exigencias ?? null, matricula: r.matricula ?? null,
    emolumentos: r.emolumentos != null ? Number(r.emolumentos) : null, registradoEm: r.registradoEm ?? null, observacoes: r.observacoes ?? null,
    historico: (r.historicoJson ? JSON.parse(r.historicoJson) : []) as { em: string; status: string; por: string | null; nota: string | null }[],
    atualizadoPor: us[0]?.name ?? null,
  };
}

export interface DadosRegistro {
  status: StatusRegistro; cartorio?: string | null; protocolo?: string | null; dataProtocolo?: string | null; exigencias?: string | null;
  matricula?: string | null; emolumentos?: number | null; registradoEm?: string | null; observacoes?: string | null;
}

export async function atualizarRegistro(contratoId: number, e: DadosRegistro, autor: { id: number; nome: string | null }) {
  if (!STATUS_REGISTRO.includes(e.status)) throw new CartorioErro('Situação inválida');
  if ((e.status === 'protocolado' || e.status === 'exigencia') && (!e.protocolo || !e.dataProtocolo)) throw new CartorioErro('Informe o número e a data do protocolo');
  if (e.status === 'exigencia' && !e.exigencias?.trim()) throw new CartorioErro('Descreva a exigência do cartório');
  if (e.status === 'registrado' && (!e.matricula || !e.registradoEm)) throw new CartorioErro('Informe a matrícula/registro e a data');
  const d = await banco();
  const [c]: any[] = await d.select({ id: contratos.id }).from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new CartorioErro('Contrato não encontrado', 404);
  const atual = await situacaoRegistro(contratoId);
  const historico = [...(atual?.historico ?? [])];
  if (!atual || atual.status !== e.status || (e.exigencias && e.exigencias !== atual.exigencias)) {
    historico.push({ em: new Date().toISOString(), status: e.status, por: autor.nome, nota: e.status === 'exigencia' ? (e.exigencias ?? null) : e.status === 'protocolado' ? `Protocolo ${e.protocolo}` : e.status === 'registrado' ? `Matrícula ${e.matricula}` : null });
  }
  const valores = {
    status: e.status, cartorio: e.cartorio || null, protocolo: e.protocolo || null, dataProtocolo: e.dataProtocolo || null, exigencias: e.exigencias || null,
    matricula: e.matricula || null, emolumentos: e.emolumentos != null ? String(e.emolumentos) : null, registradoEm: e.registradoEm || null,
    observacoes: e.observacoes || null, historicoJson: JSON.stringify(historico.slice(-50)), atualizadoPor: autor.id, updatedAt: new Date(),
  };
  if (atual) await d.update(registrosCartorio).set(valores as any).where(eq(registrosCartorio.contratoId, contratoId));
  else await d.insert(registrosCartorio).values({ contratoId, ...valores } as any);
  return { ok: true as const };
}

/** Requerimento formal ao Oficial do Registro de Imóveis */
async function requerimentoPdf(contratoId: number, cartorio: string | null): Promise<Buffer> {
  const d = await banco();
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const [lote]: any[] = await d.select().from(lotes).where(and(eq(lotes.empreendimentoId, c.empreendimentoId), eq(lotes.codigo, c.loteCodigo))).limit(1);
  const { juridicoDe } = await import('./contratos/servico');
  const { pessoasDoContrato } = await import('./financeiro/servico');
  const { escritor } = await import('./contratos/docsComissao');
  const j: any = await juridicoDe(Number(c.empreendimentoId));
  const { comprador, conjuge } = await pessoasDoContrato(contratoId);
  const s = (v: unknown) => String(v ?? '').trim();
  const cpf = (v: unknown) => s(v).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const v = j.vendedora as Record<string, unknown>;
  const vendedora = s(j.vendedoraTipo === 'PJ' ? v.vend_razao_social : v.vend_nome);
  const vendDoc = j.vendedoraTipo === 'PJ' ? `CNPJ ${s(v.vend_cnpj)}` : `CPF ${s(v.vend_cpf)}`;
  const matricula = s(lote?.matricula) || s(emp?.registroMatricula);
  const end = comprador ? [s(comprador.logradouro), s(comprador.numero) && `n.º ${s(comprador.numero)}`, s(comprador.bairro), [s(comprador.cidade), s(comprador.uf)].filter(Boolean).join('/')].filter(Boolean).join(', ') : '';
  const w = await escritor(`Requerimento de registro — CPCV ${s(c.numero)}`, String(j.marcaSlug ?? 'bomjardims'), `Requerimento de registro · CPCV n.º ${s(c.numero)}`);
  w.paragrafo([{ t: `Ilustríssimo(a) Senhor(a) Oficial do ${cartorio || s(emp?.registroCartorio) || 'Cartório de Registro de Imóveis da Comarca de Açailândia/MA'}`, b: true }], { antes: 6, depois: 14 });
  w.paragrafo([{ t: s(comprador?.nome), b: true }, { t: `, inscrito(a) no CPF sob o n.º ${cpf(comprador?.cpfCnpj)}${end ? `, residente e domiciliado(a) na ${end}` : ''}` },
    ...(conjuge ? [{ t: `, e seu cônjuge/companheiro(a) ${s(conjuge.nome)}, CPF ${cpf(conjuge.cpfCnpj)}` }] : []),
    { t: ', na qualidade de promissário(a) comprador(a), vem, respeitosamente, requerer o ' }, { t: 'REGISTRO', b: true },
    { t: ` do Instrumento Particular de Compromisso de Compra e Venda n.º ${s(c.numero)}, celebrado com ${vendedora} (${vendDoc}), promitente vendedora, que tem por objeto a Chácara ${s(c.loteCodigo)}${lote?.quadra ? ` (Quadra ${s(lote.quadra)}, Lote ${s(lote.numero)})` : ''}, com área de ${Number(lote?.areaM2 ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m², do ${s(emp?.nome)}, Açailândia/MA${matricula ? `, objeto da matrícula n.º ${matricula}` : ''}.` }]);
  w.paragrafo('O registro é requerido nos termos dos arts. 25 e 26 da Lei n.º 6.766/1979, do art. 167, inciso I, da Lei n.º 6.015/1973 e do art. 1.417 do Código Civil, para que o compromisso, irretratável, confira ao(à) promissário(a) comprador(a) direito real oponível a terceiros.');
  w.paragrafo('Instruem o presente requerimento: (i) via do instrumento particular de compromisso de compra e venda assinada eletronicamente, com o manifesto de assinaturas e o código de verificação de autenticidade; (ii) os termos aditivos assinados, se houver; (iii) os documentos de identificação e qualificação das partes; e (iv) o comprovante de recolhimento dos emolumentos.');
  w.paragrafo(`A autenticidade e a integridade do instrumento podem ser conferidas em ${(process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '')}/c/v/${s(c.codigoVerificacao)}, pelo código ${s(c.codigoVerificacao)} e pelo SHA-256 da via assinada.`);
  w.paragrafo('Nestes termos, pede deferimento.', { antes: 6 });
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const [ano, mes, dia] = hojeBR().split('-').map(Number);
  w.paragrafo(`Açailândia/MA, ${dia} de ${meses[mes - 1]} de ${ano}.`, { antes: 8 });
  w.assinaturas([{ papel: 'Requerente — promissário(a) comprador(a)', nome: s(comprador?.nome), doc: `CPF ${cpf(comprador?.cpfCnpj)}` }]);
  return w.salvar();
}

/** ZIP com tudo o que vai ao cartório */
export async function kitRegistro(contratoId: number): Promise<{ zip: Buffer; nome: string }> {
  const d = await banco();
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new CartorioErro('Contrato não encontrado', 404);
  if (!['assinado', 'ativo', 'quitado'].includes(c.status)) throw new CartorioErro('O kit de registro sai depois do contrato assinado por todos', 409);
  const { lerArquivo } = await import('./contratos/arquivos');
  const reg = await situacaoRegistro(contratoId);
  const arquivos: Record<string, Uint8Array> = {};
  arquivos['01-Requerimento-de-registro.pdf'] = new Uint8Array(await requerimentoPdf(contratoId, reg?.cartorio ?? null));
  if (c.pdfAtual) { const a = await lerArquivo(c.pdfAtual); if (a) arquivos[`02-Contrato-${c.numero}-assinado.pdf`] = new Uint8Array(a.buf); }
  if (c.manifestoArquivo) { const a = await lerArquivo(c.manifestoArquivo); if (a) arquivos['03-Manifesto-de-assinaturas.pdf'] = new Uint8Array(a.buf); }
  const ads: any[] = await d.select().from(contratoAditivos).where(and(eq(contratoAditivos.contratoId, contratoId), eq(contratoAditivos.status, 'assinado')));
  for (const a of ads) {
    const f = await lerArquivo(a.pdfAssinadoArquivo || a.pdfArquivo);
    if (f) arquivos[`04-Termo-aditivo-${a.numero}-assinado.pdf`] = new Uint8Array(f.buf);
  }
  const { listarAnexos, lerAnexo } = await import('./contratos/documentosContrato');
  for (const an of await listarAnexos(contratoId)) {
    const f = await lerAnexo(contratoId, an.id);
    if (!f) continue;
    const ext = f.mime === 'application/pdf' ? 'pdf' : 'jpg';
    const quem = an.alvo === 'dependente' ? `dependente-${an.dependente ?? an.dependenteId}` : an.alvo;
    arquivos[`05-Documentos/${quem}-${an.tipo}-${an.id}.${ext}`.replace(/[^\w./À-ÿ-]/g, '_')] = new Uint8Array(f.buf);
  }
  arquivos['LEIA-ME.txt'] = new TextEncoder().encode([
    `Kit de registro — contrato ${c.numero} · chácara ${c.loteCodigo}`,
    '',
    '1. Confira e assine o requerimento (01) — assinatura do comprador (ou procurador).',
    '2. Protocole no e-Protocolo do ONR (https://registradores.onr.org.br/) com certificado digital ICP-Brasil, ou presencialmente no cartório.',
    '3. Pague os emolumentos e anote no CRM: número e data do protocolo (aba do contrato › Registro em cartório).',
    '4. Havendo exigência, registre-a no CRM e responda no prazo indicado pelo cartório.',
    '5. Registrado, anote a matrícula/registro e a data — o comprador vê a situação no portal.',
  ].join('\r\n'));
  return { zip: Buffer.from(zipSync(arquivos, { level: 6 })), nome: `Kit-registro-${c.numero}.zip` };
}

export function registrarRotasCartorio(app: import('express').Express) {
  /** ZIP do kit de registro (administrador e secretária) */
  app.get('/api/contratos/:id/kit-registro.zip', async (req, res) => {
    try {
      const { sdk } = await import('./_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      const { perfilDe } = await import('../shared/equipe');
      if (!user || !['admin', 'secretario'].includes(String(perfilDe(user)))) return res.status(403).send('Sem permissão');
      const { zip, nome } = await kitRegistro(Number(req.params.id) || 0);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(zip);
    } catch (e: any) {
      if (e instanceof CartorioErro) return res.status(e.status).send(e.message);
      console.error('[Cartório] kit:', e);
      res.status(500).send('Falha ao montar o kit');
    }
  });
}
