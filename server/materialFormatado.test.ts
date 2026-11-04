import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { layoutFormato, recorteRodapeEfetivo } from '../shared/materiais';
import { caminhoLocal, imagemFormatada, nomeDownload, sondarVideo, textosCorretor, videoFormatado, type DadosCorretor } from './materialFormatado';
import { linkPublico } from './materiaisDownload';

const dados: DadosCorretor = {
  cartao: { nome: 'Ana Corretora', creci: 'CRECI/MA 9.999', telefones: ['(99) 9 8888-7777'], whatsapp: '5599988887777', email: null, fotoUrl: null, papel: 'Corretor(a)', instagram: 'avalieimob' },
  instagram: 'ana.imoveis', link: 'https://romateccrm.com/bom-jardims?c=abc', empreendimento: 'Condomínio de Chácaras Bom Jardims',
};

/** Arte 1080×1350 azul com o "rodapé do escritório" vermelho nos 10% de baixo */
async function arteComRodape() {
  const azul = await sharp({ create: { width: 1080, height: 1215, channels: 3, background: '#0000ff' } }).png().toBuffer();
  return sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#ff0000' } }).composite([{ input: azul, left: 0, top: 0 }]).png().toBuffer();
}
const temVermelho = async (img: Buffer) => {
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) n++;
  return n;
};

describe('formatos de download', () => {
  it('layout: feed, stories e quadrado no tamanho da rede; original mantém a largura', () => {
    expect(layoutFormato('feed', 800, 600)).toMatchObject({ w: 1080, h: 1350 });
    expect(layoutFormato('stories', 800, 600)).toMatchObject({ w: 1080, h: 1920, faixaH: 192 });
    expect(layoutFormato('quadrado', 800, 600)).toMatchObject({ w: 1080, h: 1080 });
    const o = layoutFormato('original', 1080, 1215);
    expect(o.w).toBe(1080); expect(o.areaH).toBe(1216); expect(o.h).toBe(o.areaH + o.faixaH);
    expect(layoutFormato('whatsapp', 2160, 2000).w).toBe(1080);
  });

  it('recorte padrão: artes cortam 14%, render e vídeo sem ajuste não cortam, ajuste manual vence', () => {
    expect(recorteRodapeEfetivo({ tipo: 'feed', mime: 'image/png', url: 'a.png' })).toBe(14);
    expect(recorteRodapeEfetivo({ tipo: 'render', mime: 'image/png', url: 'a.png' })).toBe(0);
    expect(recorteRodapeEfetivo({ tipo: 'video', mime: 'video/mp4', url: 'a.mp4' })).toBe(0);
    expect(recorteRodapeEfetivo({ tipo: 'feed', mime: 'image/png', url: 'a.png', recorteRodapePct: 0 })).toBe(0);
  });

  it('faixa usa o Instagram do próprio corretor (não o institucional)', () => {
    expect(textosCorretor(dados)).toEqual({ nome: 'Ana Corretora · CRECI/MA 9.999', detalhe: 'WhatsApp (99) 9 8888-7777  ·  @ana.imoveis' });
    expect(textosCorretor({ ...dados, instagram: null }).detalhe).toBe('WhatsApp (99) 9 8888-7777');
  });

  it('imagem: tira o rodapé do escritório e sai no tamanho de cada formato', async () => {
    const arte = await arteComRodape();
    expect(await temVermelho(arte)).toBeGreaterThan(100_000);
    for (const [f, w, h] of [['feed', 1080, 1350], ['stories', 1080, 1920], ['quadrado', 1080, 1080]] as const) {
      const out = await imagemFormatada(arte, f, 10, dados);
      const m = await sharp(out).metadata();
      expect([m.format, m.width, m.height]).toEqual(['jpeg', w, h]);
      expect(await temVermelho(out)).toBeLessThan(500);
    }
    const orig = await imagemFormatada(arte, 'original', 10, dados);
    expect((await sharp(orig).metadata()).width).toBe(1080);
    expect(await temVermelho(orig)).toBeLessThan(500);
  });

  it('vídeo: corta o rodapé e o cartão final, põe a faixa e o cartão do corretor', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mf-'));
    try {
      const src = path.join(dir, 'src.mp4'), out = path.join(dir, 'out.mp4');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=6:r=30', '-f', 'lavfi', '-i', 'sine=d=6',
        '-vf', 'drawbox=y=ih*0.9:w=iw:h=ih*0.1:color=red:t=fill', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src]);
      await videoFormatado(src, out, 'stories', 10, 2000, dados);
      const i = await sondarVideo(out);
      expect([i.w, i.h, i.audio]).toEqual([1080, 1920, true]);
      expect(i.duracao).toBeGreaterThan(6.7); expect(i.duracao).toBeLessThan(7.3); // 6 s − 2 s de cartão + 3 s do corretor
      const quadro = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', out, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']);
      expect(await temVermelho(quadro)).toBeLessThan(2000);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);

  it('arquivo do próprio site é lido do disco; fora da pasta pública, não', () => {
    const raiz = path.resolve('client/public');
    expect(caminhoLocal('https://romateccrm.com/bom-jardims/ig/reel-obras-parte2.mp4', [raiz])).toBe(path.join(raiz, 'bom-jardims/ig/reel-obras-parte2.mp4'));
    expect(caminhoLocal('https://romateccrm.com/../package.json', [raiz])).toBeNull();
    expect(caminhoLocal('https://evil.com/bom-jardims/ig/reel-obras-parte2.mp4', [raiz])).toBeNull();
    expect(existsSync(path.join(raiz, 'bom-jardims/ig/reel-obras-parte2.mp4'))).toBe(true);
  });

  it('link do QR e nome do arquivo', () => {
    expect(linkPublico({ empreendimentoSlug: 'bom-jardims' }, 'abc123XYZ')).toBe('https://romateccrm.com/bom-jardims?utm_source=whatsapp&utm_medium=material&c=abc123XYZ');
    expect(linkPublico({ codigoImovel: 'imv-0042' }, null)).toBe('https://romateccrm.com/i/IMV-0042?utm_source=whatsapp&utm_medium=material');
    expect(nomeDownload('Reel · Obras parte 2', 'stories', 'mp4')).toBe('Reel_Obras_parte_2_stories.mp4');
  });
});
