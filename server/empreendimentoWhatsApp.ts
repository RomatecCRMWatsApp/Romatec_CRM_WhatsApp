/**
 * Envio do folder da chácara (a página inteira: capa, mapa, medidas/coordenadas, QR Code e contato)
 * pelo WhatsApp. O painel desenha a página em JPEG; aqui validamos a imagem e o número digitado
 * e mandamos pela Z-API como imagem ou como PDF de uma página.
 * Só vai para o número informado — nunca automático para leads.
 */
import { normalizePhoneBR } from '../shared/telefone';
import { AVISO_RASCUNHO_MEMORIAL } from '../shared/lotes';

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Imagem maior que isso (bytes decodificados) é recusada antes de ir para a Z-API */
export const MAX_IMAGEM_BYTES = 8 * 1024 * 1024;

export type FormatoFolder = 'imagem' | 'pdf';

export interface DadosLegenda {
  empreendimento: string;
  municipio?: string | null;
  uf?: string | null;
  lote?: { codigo: string; quadra?: string | null; areaM2?: number | null } | null;
  disponiveis?: number;
}

/** "Chácara B13 · Quadra B · 3.025,11 m²" */
export function identificacaoChacara(lote: NonNullable<DadosLegenda['lote']>): string {
  return [`Chácara ${lote.codigo}`, lote.quadra ? `Quadra ${lote.quadra}` : '', lote.areaM2 ? `${n2(lote.areaM2)} m²` : ''].filter(Boolean).join(' · ');
}

/** Legenda: empreendimento, chácara, cidade e contato (sem preço) */
export function legendaChacara(d: DadosLegenda): string {
  const local = [d.municipio, d.uf].filter(Boolean).join('/');
  return [
    `🏡 *${d.empreendimento}*`,
    d.lote ? identificacaoChacara(d.lote) : `Mapa das chácaras${d.disponiveis ? ` · ${d.disponiveis} disponíveis` : ''}`,
    local ? `📍 ${local}` : '',
    '',
    'Romatec Consultoria Total · José Romário — CRECI/MA 4.705',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}

/** "folder-bom-jardims-B13.pdf" / "memorial-bom-jardims-C18.pdf" */
export function nomeArquivoFolder(slug: string, codigo?: string | null, tipo: 'folder' | 'memorial' = 'folder'): string {
  return `${tipo}-${slug}${codigo ? `-${codigo}` : ''}.pdf`.replace(/[^A-Za-z0-9._-]/g, '');
}


/** Legenda do memorial: lote/quadra + empreendimento + aviso de rascunho em destaque */
export function legendaMemorial(d: { lote: string; empreendimento: string; municipio?: string | null; uf?: string | null }): string {
  const local = [d.municipio, d.uf].filter(Boolean).join('/');
  return [
    `📐 *Memorial descritivo — ${d.lote}*`,
    d.empreendimento + (local ? ` · ${local}` : ''),
    '',
    `⚠️ *${AVISO_RASCUNHO_MEMORIAL.toUpperCase()}*`,
    'Para averiguação de dados, coordenadas e localização.',
  ].join('\n');
}

/** data:image/jpeg|png;base64,... → bytes + mime (lança se não for JPEG/PNG de verdade ou passar do limite) */
export function imagemDoDataUrl(dataUrl: string): { bytes: Buffer; base64: string; mime: 'image/jpeg' | 'image/png' } {
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+=*)$/.exec(String(dataUrl || '').trim());
  if (!m) throw new Error('Imagem inválida: esperado JPEG ou PNG em base64');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_IMAGEM_BYTES) throw new Error('Imagem grande demais para o WhatsApp');
  const ehJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const ehPng = bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47;
  if (m[1] === 'image/jpeg' ? !ehJpeg : !ehPng) throw new Error(`Imagem inválida: não é ${m[1] === 'image/jpeg' ? 'JPEG' : 'PNG'}`);
  return { bytes, base64: m[2], mime: m[1] as 'image/jpeg' | 'image/png' };
}

type Zapi = typeof import('./leads/zapiClient');

/** Valida o número digitado e manda o folder (imagem ou PDF) com a legenda; devolve o número normalizado */
export async function enviarFolderWhatsApp(
  input: { telefone: string; imagem: string; legenda: string; formato: FormatoFolder; nomeArquivo: string },
  deps: { enviarImagem?: Zapi['enviarImagem']; enviarDocumento?: Zapi['enviarDocumento'] } = {},
): Promise<string> {
  const telefone = normalizePhoneBR(input.telefone);
  if (!telefone) throw new Error('Número inválido: informe um celular com DDD, ex.: (99) 99181-1246');
  const img = imagemDoDataUrl(input.imagem);
  const zapi = deps.enviarImagem && deps.enviarDocumento ? null : await import('./leads/zapiClient');
  try {
    if (input.formato === 'pdf') {
      if (img.mime !== 'image/jpeg') throw new Error('Para PDF a página precisa vir em JPEG');
      const { pdfDeJpeg } = await import('./leads/pdfSimples');
      await (deps.enviarDocumento ?? zapi!.enviarDocumento)(telefone, {
        base64: pdfDeJpeg(img.bytes).toString('base64'), extensao: 'pdf', mime: 'application/pdf',
        nomeArquivo: input.nomeArquivo, legenda: input.legenda,
      });
    } else {
      await (deps.enviarImagem ?? zapi!.enviarImagem)(telefone, { base64: img.base64, mime: img.mime, legenda: input.legenda });
    }
  } catch (e: any) {
    const msg = e?.codigo ? `${e.codigo}: ${e.message}` : (e?.message || 'falha no envio');
    console.error(`[Empreendimento] ${input.nomeArquivo} não enviado para ${telefone}: ${msg}`);
    throw new Error(`WhatsApp não enviou o ${input.nomeArquivo.startsWith('memorial') ? 'memorial' : 'folder'} (${msg})`);
  }
  return telefone;
}
