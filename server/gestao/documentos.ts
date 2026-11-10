/**
 * PDFs finais do Contrato de Gestão e dos Recibos de Adiantamento, já com os comprovantes e documentos de origem
 * de cada recibo anexados (rotas de download e geração avulsa usam estas funções).
 */
import { blocosContrato, blocosParaPdf, blocosRecibo, numeroRecibo } from './contrato';
import { anexarAoPdf } from './anexosRecibo';
import { arquivosDoAporte, type AporteGestao, type DadosContratoGestao } from './servico';

/** Recibo avulso + seus anexos */
export async function pdfRecibo(g: DadosContratoGestao, a: AporteGestao): Promise<Buffer> {
  const pdf = await blocosParaPdf(blocosRecibo(g, a), `Recibo de Adiantamento ${numeroRecibo(a)} — ${g.numero}`,
    `Recibo de Adiantamento n.º ${numeroRecibo(a)} · Contrato de Gestão n.º ${g.numero}`);
  return anexarAoPdf(pdf, [{ recibo: numeroRecibo(a), contrato: g.numero, arquivos: await arquivosDoAporte(a) }]);
}

/** Contrato completo; os anexos dos recibos do Anexo I entram ao final, na ordem dos recibos */
export async function pdfContrato(g: DadosContratoGestao): Promise<Buffer> {
  const pdf = await blocosParaPdf(blocosContrato(g), `Contrato de Gestão ${g.numero} — ${g.empreendimento.nome}`, `Contrato de Gestão n.º ${g.numero} · documento interno`);
  const grupos = [];
  for (const a of g.aportes) grupos.push({ recibo: numeroRecibo(a), contrato: g.numero, arquivos: await arquivosDoAporte(a) });
  return anexarAoPdf(pdf, grupos);
}
