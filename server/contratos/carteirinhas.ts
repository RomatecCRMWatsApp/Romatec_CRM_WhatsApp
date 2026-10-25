/**
 * Carteirinhas do condomínio (PDF para a gráfica): tamanho cartão de crédito (CR80, 85,6 × 54 mm), frente e verso,
 * uma por pessoa — titular, cônjuge (automático quando casado/união estável) e até 6 dependentes.
 * O QR do verso abre a conferência pública (portaria): válida enquanto o contrato estiver assinado/ativo/quitado.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { contratos, empreendimentos, lotes } from '../../drizzle/schema';
import { rotuloParentesco } from '../../shared/contratos';
import { ContratoErro, contratoPorId, dependentesDo, pessoasDe } from './servico';

export const STATUS_COM_CARTEIRINHA = ['assinado', 'ativo', 'quitado'];
const MM = 72 / 25.4;
const CR80: [number, number] = [85.6 * MM, 53.98 * MM];
const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
export const linkCarteirinha = (codigo: string, n: number) => `${urlPublica()}/api/public/carteirinha/${codigo}/${n}`;

export interface PessoaCarteirinha { n: number; nome: string; vinculo: string }

/** Titular (1), cônjuge (2) e dependentes (3…): a numeração não muda quando um dependente é corrigido */
export async function pessoasDaCarteirinha(contratoId: number): Promise<PessoaCarteirinha[]> {
  const { comprador, conjuge } = await pessoasDe(contratoId);
  if (!comprador) throw new ContratoErro('SEM_COMPRADOR', 'Contrato sem comprador', 409);
  const out: PessoaCarteirinha[] = [{ n: 1, nome: comprador.nome, vinculo: 'Titular' }];
  if (conjuge) out.push({ n: 2, nome: conjuge.nome, vinculo: 'Cônjuge' });
  for (const d of await dependentesDo(contratoId)) out.push({ n: 2 + d.ordem, nome: d.nome, vinculo: `Dependente · ${rotuloParentesco(d.parentesco)}` });
  return out;
}

async function dadosDoContrato(contratoId: number) {
  const c = await contratoPorId(contratoId);
  const d: any = await getDb();
  const [emp] = await d.select().from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const [lote] = await d.select().from(lotes).where(eq(lotes.id, c.loteId)).limit(1);
  return { c, emp, lote };
}

export async function carteirinhasPdf(contratoId: number): Promise<{ pdf: Buffer; nome: string }> {
  const { c, emp, lote } = await dadosDoContrato(contratoId);
  if (!STATUS_COM_CARTEIRINHA.includes(c.status)) throw new ContratoErro('STATUS', 'As carteirinhas saem depois do contrato assinado', 409);
  const pessoas = await pessoasDaCarteirinha(contratoId);
  const { novoKit, qrPng, quebrar, texto, textoCentro, COR } = await import('../financeiro/render/comum');
  const { CONTATO_PADRAO } = await import('../financeiro/render/documentos');
  const k = await novoKit({ titulo: `Carteirinhas ${c.numero}` });
  const [W, H] = CR80;
  const unidade = `Chácara ${c.loteCodigo}${lote?.quadra ? ` · Quadra ${lote.quadra}` : ''}`;
  for (const p of pessoas) {
    // Frente: fundo verde, marca, nome, vínculo e unidade
    const f = k.doc.addPage(CR80);
    f.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COR.verde });
    f.drawRectangle({ x: 0, y: H - 3, width: W, height: 3, color: COR.dourado });
    const lw = 26 * MM, lh = (lw * k.logo.height) / k.logo.width;
    f.drawImage(k.logo, { x: 4 * MM, y: H - 4 * MM - lh, width: lw, height: lh });
    const xT = 4 * MM + lw + 3 * MM, larg = W - xT - 4 * MM;
    texto(f, 'CARTEIRINHA DO CONDOMÍNIO', xT, H - 8 * MM, 5.6, k.fb, COR.dourado);
    texto(f, String(emp?.nome ?? '').toUpperCase(), xT, H - 11.2 * MM, 4.6, k.f, COR.creme, larg);
    const linhasNome = quebrar(k.fb, p.nome.toUpperCase(), 9, W - 8 * MM).slice(0, 2);
    let y = 20 * MM;
    linhasNome.forEach((l, i) => texto(f, l, 4 * MM, y - i * 11, 9, k.fb, COR.branco));
    y -= linhasNome.length * 11 + 2;
    texto(f, p.vinculo, 4 * MM, y, 6.8, k.fb, COR.dourado);
    texto(f, `${unidade} · Contrato ${c.numero}`, 4 * MM, 4 * MM, 5.6, k.f, COR.creme, W - 8 * MM);

    // Verso: QR da portaria, regras de uso e contatos
    const v = k.doc.addPage(CR80);
    v.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COR.creme });
    v.drawRectangle({ x: 0, y: 0, width: W, height: 3, color: COR.dourado });
    const lado = 30 * MM;
    const qr = await qrPng(k, linkCarteirinha(c.codigoVerificacao, p.n));
    v.drawImage(qr, { x: 4 * MM, y: (H - lado) / 2, width: lado, height: lado });
    const xv = 4 * MM + lado + 4 * MM, lv = W - xv - 4 * MM;
    const regras = [
      'Uso pessoal e intransferível.', 'Apresente na portaria com um documento com foto.',
      'Aponte a câmera para o QR para conferir se está válida.',
    ];
    let yv = H - 7 * MM;
    for (const r of regras) for (const l of quebrar(k.f, r, 5.4, lv)) { texto(v, l, xv, yv, 5.4, k.f, COR.verde); yv -= 7.2; }
    yv -= 3;
    texto(v, `Administração: ${CONTATO_PADRAO.atendimento}`, xv, yv, 5.2, k.fb, COR.verde, lv);
    texto(v, `Vendas: ${CONTATO_PADRAO.vendas}`, xv, yv - 7, 5.2, k.fb, COR.verde, lv);
    textoCentro(v, `${p.n.toString().padStart(2, '0')} · ${c.numero}`, xv + lv / 2, 4.5 * MM, 4.6, k.f, COR.cinza);
  }
  return { pdf: Buffer.from(await k.doc.save()), nome: `CARTEIRINHAS-${c.numero}.pdf` };
}

/** Conferência pública (QR da portaria): nome, vínculo, unidade e se está válida — sem CPF */
export async function conferirCarteirinha(codigo: string, n: number): Promise<{ status: number; html: string }> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pagina = (ok: boolean, titulo: string, linhas: string[]) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0c3320;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{max-width:420px;width:100%;background:#fffdf6;color:#1d2a22;border-radius:18px;padding:24px}h1{margin:0 0 8px;font-size:22px;color:${ok ? '#0c6b3c' : '#9b1c1c'}}p{margin:6px 0;line-height:1.5}small{color:#5c6b61}</style></head>
<body><main><h1>${ok ? '✓' : '✕'} ${esc(titulo)}</h1>${linhas.map(l => `<p>${l}</p>`).join('')}<p><small>Conferido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</small></p></main></body></html>`;
  const naoAchou = { status: 404, html: pagina(false, 'Carteirinha não encontrada', ['Confirme com a administração do condomínio.']) };
  if (!/^[A-Z0-9]{6,20}$/.test(codigo) || !(n >= 1 && n <= 8)) return naoAchou;
  try {
    const d: any = await getDb();
    const [c] = await d.select({ id: contratos.id }).from(contratos).where(eq(contratos.codigoVerificacao, codigo)).limit(1);
    if (!c) return naoAchou;
    const { c: ctr, emp, lote } = await dadosDoContrato(c.id);
    const p = (await pessoasDaCarteirinha(c.id)).find(x => x.n === n);
    if (!p) return { status: 404, html: pagina(false, 'Carteirinha não está mais válida', ['Esta pessoa não consta mais no contrato.']) };
    const ok = STATUS_COM_CARTEIRINHA.includes(ctr.status);
    return {
      status: 200,
      html: pagina(ok, ok ? 'Carteirinha válida' : 'Carteirinha não está válida', [
        `<b>${esc(p.nome)}</b> · ${esc(p.vinculo)}`,
        `${esc(String(emp?.nome ?? ''))} · Chácara ${esc(ctr.loteCodigo)}${lote?.quadra ? ` · Quadra ${esc(lote.quadra)}` : ''}`,
        ok ? 'Acesso liberado.' : 'Contrato sem efeito no momento — fale com a administração.',
      ]),
    };
  } catch { return naoAchou; }
}
