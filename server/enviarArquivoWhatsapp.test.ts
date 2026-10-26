import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';

const W = await import('./whatsapp/enviarArquivo');

const pdf = async () => Buffer.from(await (await PDFDocument.create()).save());
const docx = () => { const z = new PizZip(); z.file('word/document.xml', '<w:document/>'); return z.generate({ type: 'nodebuffer' }) as Buffer; };

describe('enviar arquivo pelo WhatsApp do sistema', () => {
  it('tipo pelo conteúdo (PDF/imagem) ou pelo nome (Word/Excel); o resto é recusado', async () => {
    expect(W.tipoDoArquivo(await pdf(), 'qualquer.bin')).toEqual({ extensao: 'pdf', mime: 'application/pdf' });
    expect(W.tipoDoArquivo(docx(), 'Contrato.DOCX')).toMatchObject({ extensao: 'docx' });
    expect(() => W.tipoDoArquivo(docx(), 'arquivo.zip')).toThrow(/Formato não aceito/);
    expect(() => W.tipoDoArquivo(Buffer.from('texto'), 'a.txt')).toThrow(/Formato não aceito/);
    expect(() => W.tipoDoArquivo(Buffer.alloc(0), 'a.pdf')).toThrow(/vazio/);
  });

  it('número com DDD vira 55DDNNNNNNNNN', () => {
    expect(W.foneWhatsapp('(99) 9 9181-1246')).toBe('5599991811246');
    expect(W.foneWhatsapp('5599991811246')).toBe('5599991811246');
    expect(() => W.foneWhatsapp('1234')).toThrow(/DDD/);
  });

  it('envia com nome limpo e legenda; sem Z-API, avisa', async () => {
    const enviados: any[] = [];
    W.envio.disponivel = () => true;
    W.envio.documento = async (fone, doc) => { enviados.push({ fone, ...doc }); return 'msg-1'; };
    const r = await W.enviarArquivoWhatsapp({ telefone: '99991811246', buf: await pdf(), nome: 'Balanço: 25/10.pdf', legenda: ' Olá, José! ', autorId: 1 });
    expect(r).toEqual({ ok: true, messageId: 'msg-1', nomeArquivo: 'Balanço- 25-10.pdf' });
    expect(enviados[0]).toMatchObject({ fone: '5599991811246', extensao: 'pdf', mime: 'application/pdf', legenda: 'Olá, José!' });
    W.envio.disponivel = () => false;
    await expect(W.enviarArquivoWhatsapp({ telefone: '99991811246', buf: await pdf(), nome: 'a.pdf', autorId: 1 })).rejects.toMatchObject({ status: 412 });
  });
});
