import { describe, it, expect } from 'vitest';
import { tipoPorNome, tituloPorNome, bloqueadaPorNome, resourceTypeDe, problemaArquivo, agruparMateriais } from '../shared/materiais';

describe('Materiais — arquivos do pacote', () => {
  it('tipo pelo nome do arquivo', () => {
    expect(tipoPorNome('Feed_01_Em_Breve.png', 'image/png')).toBe('feed');
    expect(tipoPorNome('Status_04_Area_de_Vivencia.png', 'image/png')).toBe('status');
    expect(tipoPorNome('Video_Bom_Jardims_Status_Reels.mp4', 'video/mp4')).toBe('video');
    expect(tipoPorNome('Folder_Bom_Jardims_A4_trifold.pdf', 'application/pdf')).toBe('folder');
    expect(tipoPorNome('Mapa_de_Vendas_Bom_Jardims.png', 'image/png')).toBe('mapa');
    expect(tipoPorNome('Implantacao_Humanizada_Bom_Jardims_A1.pdf', 'application/pdf')).toBe('mapa');
    expect(tipoPorNome('Card_Bom_Jardims_1_Capa.png', 'image/png')).toBe('card');
    expect(tipoPorNome('Portal_R02_Perspectiva_Noite.png', 'image/png')).toBe('render');
    expect(tipoPorNome('foto.jpg', 'image/jpeg')).toBe('outro');
  });

  it('título legível', () => {
    expect(tituloPorNome('Feed_01_Em_Breve.png')).toBe('Feed 01 Em Breve');
    expect(tituloPorNome('pasta/Status-09_Pre_Lancamento.png')).toBe('Status 09 Pre Lancamento');
  });

  it('peças de condições/preço entram bloqueadas (regra do Bom Jardims: preço não publicar)', () => {
    expect(bloqueadaPorNome('Feed_06_Condicoes.png')).toBe(true);
    expect(bloqueadaPorNome('Status_06_Condicoes.png')).toBe(true);
    expect(bloqueadaPorNome('Tabela_Precos_Financiamento_Bom_Jardims.xlsx')).toBe(true);
    expect(bloqueadaPorNome('Feed_05_Estrutura.png')).toBe(false);
  });

  it('PDF vai como raw, vídeo como video', () => {
    expect(resourceTypeDe('application/pdf')).toBe('raw');
    expect(resourceTypeDe('video/mp4')).toBe('video');
    expect(resourceTypeDe('image/png')).toBe('image');
  });

  it('limites e tipos aceitos', () => {
    expect(problemaArquivo('image/png', 9 * 1024 * 1024)).toBeNull();
    expect(problemaArquivo('image/png', 11 * 1024 * 1024)).toContain('10 MB');
    expect(problemaArquivo('video/mp4', 60 * 1024 * 1024)).toBeNull();
    expect(problemaArquivo('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1000)).toContain('Tipo não aceito');
    expect(problemaArquivo('image/png', 0)).toBe('Arquivo vazio.');
  });

  it('agrupa empreendimento primeiro e ordena por tipo', () => {
    const m = (id: number, over: any) => ({ id, propertyId: null, empreendimentoSlug: null, tipo: 'outro', ordem: 0, titulo: `M${id}`, ...over });
    const grupos = agruparMateriais([
      m(1, { propertyId: 3, tipo: 'video' }),
      m(2, { empreendimentoSlug: 'bom-jardims', tipo: 'status' }),
      m(3, { empreendimentoSlug: 'bom-jardims', tipo: 'feed' }),
      m(4, { propertyId: 3, tipo: 'feed' }),
    ], { imoveis: new Map([[3, 'IMV-0003 — Casa']]), empreendimentos: new Map([['bom-jardims', 'Condomínio Bom Jardims']]) });
    expect(grupos.map(g => g.nome)).toEqual(['Condomínio Bom Jardims', 'IMV-0003 — Casa']);
    expect(grupos[0].itens.map(i => i.id)).toEqual([3, 2]);
    expect(grupos[1].itens.map(i => i.id)).toEqual([4, 1]);
  });
});
