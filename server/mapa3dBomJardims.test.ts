import { describe, expect, it } from 'vitest';
import { posterCloudinary, VIDEOS_FIXOS, videosDaGaleria } from '../shared/mapa3dBomJardims';
import { LINKS_FIXOS, montarLink } from '../shared/linksDivulgacao';
import { metaDaRota } from './seo';

describe('campanha Mapa 3D (/bom-jardims/3d)', () => {
  const cl = 'https://res.cloudinary.com/x/video/upload/v1/romatec_materiais/drone.mp4';
  it('vídeos liberados da galeria primeiro, depois os fixos, sem imagem nem bloqueado nem repetido', () => {
    const v = videosDaGaleria([
      { titulo: 'Drone', tipo: 'video', url: cl, liberado: true },
      { titulo: 'Drone de novo', tipo: 'video', url: cl, liberado: true },
      { titulo: 'Com preço', tipo: 'video', url: 'https://res.cloudinary.com/x/video/upload/p.mp4', liberado: false },
      { titulo: 'Arte', tipo: 'feed', mime: 'image/png', url: 'https://res.cloudinary.com/x/image/upload/a.png', liberado: true },
    ]);
    expect(v.map(x => x.titulo)).toEqual([VIDEOS_FIXOS[0].titulo, 'Drone', ...VIDEOS_FIXOS.slice(1).map(f => f.titulo)]);
    expect(v[0].vertical).toBe(true);
    expect(v[1].poster).toBe('https://res.cloudinary.com/x/video/upload/so_1,w_960,c_limit,q_auto/v1/romatec_materiais/drone.jpg');
    expect(posterCloudinary('/bom-jardims/video.mp4')).toBeNull();
  });
  it('link de divulgação com UTM e ?c= e meta própria', () => {
    const l = LINKS_FIXOS.find(x => x.chave === 'fixo:mapa3d')!;
    expect(montarLink('https://romateccrm.com', l, 'ab12')).toBe('https://romateccrm.com/bom-jardims/3d?utm_source=instagram&utm_campaign=BJ-MAPA3D&c=ab12');
    const m = metaDaRota('/bom-jardims/3d');
    expect(m !== 'imovel' && m.path).toBe('/bom-jardims/3d');
  });
});
