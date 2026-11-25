import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  pautasDoDia, temaDoDia, trocarMidia, condicoesValidas, sugerirTemas, semanaIso, type MidiaCatalogo,
} from '../shared/pautaDiaria';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
const F = await import('./criativos/fabrica');
const { getDb } = await import('./db');
const { materiais, criativosPautas } = await import('../drizzle/schema');

const midia = (id: number, tipo: 'video' | 'imagem', temas: string[], extra: Partial<MidiaCatalogo> = {}): MidiaCatalogo =>
  ({ id, titulo: `m${id}`, arquivo: `https://x/${id}`, tipo, dur: tipo === 'video' ? 20 : null, temas, temTexto: false, bloqueada: false, ...extra });
const CAT: MidiaCatalogo[] = [
  ...Array.from({ length: 8 }, (_, i) => midia(i + 1, 'video', i % 2 ? ['natureza', 'rio'] : ['obra', 'portal'])),
  ...Array.from({ length: 8 }, (_, i) => midia(i + 20, 'imagem', i % 2 ? ['rio'] : ['portal', 'mapa'])),
  midia(90, 'imagem', ['rio'], { bloqueada: true }), midia(91, 'video', ['rio'], { temTexto: true }),
];

describe('pautas do dia (porta do pauta_diaria.py)', () => {
  it('tema pelo dia da semana e 4 peças: ADS, ORG, CAR e STORY', () => {
    expect(temaDoDia('2026-11-23')).toBe('obra'); // segunda
    expect(temaDoDia('2026-11-26')).toBe('pagamento'); // quinta
    expect(temaDoDia('2026-11-29')).toBe('familia'); // domingo
    const ps = pautasDoDia(CAT, '2026-11-24', new Map());
    expect(ps.map(p => p.nome)).toEqual(['BJ_2026-11-24_natureza_ADS', 'BJ_2026-11-24_natureza_ORG', 'BJ_2026-11-24_natureza_CAR', 'BJ_2026-11-24_natureza_STORY']);
    expect(ps[0].midias).toHaveLength(5);
    expect(ps[1].midias).toHaveLength(4);
    expect(ps[2].midias.every(m => m.tipo === 'imagem')).toBe(true);
    // Mídia bloqueada ou com texto queimado nunca entra; nenhuma mídia se repete dentro da peça
    const todas = ps.flatMap(p => p.midias.map(m => m.id));
    expect(todas).not.toContain(90);
    expect(todas).not.toContain(91);
    for (const p of ps) expect(new Set(p.midias.map(m => m.id)).size).toBe(p.midias.length);
    // Os dois Reels não dividem mídia (biblioteca com sobra)
    expect(ps[0].midias.some(m => ps[1].midias.some(o => o.id === m.id))).toBe(false);
    // Preço só no ADS (o STORY só na quinta)
    expect(ps.map(p => p.temPreco)).toEqual([true, false, false, false]);
    expect(ps[1].legenda).not.toMatch(/R\$/);
    // Vídeo: trecho do meio
    const v = ps[0].midias.find(m => m.tipo === 'video')!;
    expect(v.ini! + v.dur / 2).toBeCloseTo(10, 1);
  });

  it('mesma data gera as mesmas pautas; o orgânico de quinta não leva preço no gancho', () => {
    expect(pautasDoDia(CAT, '2026-11-26', new Map())).toEqual(pautasDoDia(CAT, '2026-11-26', new Map()));
    const q = pautasDoDia(CAT, '2026-11-26', new Map());
    expect(q[0].gancho.join(' ')).toMatch(/R\$ 10 mil/);
    expect(q[1].gancho.join(' ')).not.toMatch(/R\$/);
    expect(q[3].temPreco).toBe(true);
  });

  it('condições vindas da configuração entram no selo e na legenda', () => {
    const [ads] = pautasDoDia(CAT, '2026-11-24', new Map(), { entrada: 'R$ 12 mil', parcelas: '150x', handle: '@bomjardims' });
    expect(ads.selo?.titulo).toBe('Entrada de R$ 12 mil + 150x');
    expect(ads.legenda).toMatch(/150x/);
    expect(ads.final?.handle).toBe('@bomjardims');
  });

  it('evita mídia usada há menos de 14 dias', () => {
    const hist = new Map<number, string>([[1, '2026-11-20'], [2, '2026-11-20'], [3, '2026-11-01']]);
    const ids = pautasDoDia(CAT, '2026-11-24', hist).flatMap(p => p.midias.map(m => m.id));
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
  });

  it('troca a mídia por outra fora da peça', () => {
    const [ads] = pautasDoDia(CAT, '2026-11-24', new Map());
    const nova = trocarMidia(ads, 0, CAT, new Map(), 'x');
    expect(nova.midias[0].id).not.toBe(ads.midias[0].id);
    expect(ads.midias.map(m => m.id)).not.toContain(nova.midias[0].id);
    expect(nova.midias.slice(1)).toEqual(ads.midias.slice(1));
  });

  it('condições valem 30 dias; temas sugeridos pelo título; semana ISO', () => {
    expect(condicoesValidas(null, '2026-11-24')).toBe(false);
    expect(condicoesValidas('2026-11-01', '2026-11-24')).toBe(true);
    expect(condicoesValidas('2026-10-20', '2026-11-24')).toBe(false);
    expect(sugerirTemas('Drone do rio ao pôr do sol')).toEqual(expect.arrayContaining(['rio', 'natureza']));
    expect(sugerirTemas('Portal de entrada')).toContain('portal');
    expect(semanaIso('2026-01-01')).toBe(1);
  });
});

describe('fila de aprovação', () => {
  beforeAll(async () => {
    const d: any = await getDb();
    const linhas = [
      ...Array.from({ length: 6 }, (_, i) => ({ titulo: `Drone rio ${i}`, tipo: 'video', url: `https://res.cloudinary.com/x/v${i}.mp4`, mime: 'video/mp4', temas: 'rio,natureza', duracaoMs: 20000 })),
      ...Array.from({ length: 6 }, (_, i) => ({ titulo: `Foto portal ${i}`, tipo: 'feed', url: `https://res.cloudinary.com/x/f${i}.jpg`, mime: 'image/jpeg', temas: 'portal' })),
      { titulo: 'Tabela de preços', tipo: 'feed', url: 'https://res.cloudinary.com/x/t.jpg', mime: 'image/jpeg', temas: 'rio' },
      { titulo: 'Folder', tipo: 'folder', url: 'https://res.cloudinary.com/x/f.pdf', mime: 'application/pdf' },
    ];
    for (const l of linhas) await d.insert(materiais).values({ empreendimentoSlug: 'bom-jardims', liberado: true, ordem: 0, ...l } as any);
    F.definirMontador(async p => (p.tipo === 'reels' ? [`https://cdn/${p.nome}.mp4`] : p.midias.map((_, i) => `https://cdn/${p.nome}_${i}.jpg`)));
  });

  it('catálogo: só imagens e vídeos; nome com "tabela/preço" fica bloqueado', async () => {
    const c = await F.catalogo();
    expect(c).toHaveLength(13);
    expect(c.find(i => i.titulo === 'Tabela de preços')).toMatchObject({ bloqueada: true });
    expect(c.find(i => i.titulo === 'Drone rio 0')).toMatchObject({ tipo: 'video', dur: 20, temas: ['rio', 'natureza'] });
  });

  it('gera, monta, aprova (com condições confirmadas), descarta e não duplica', async () => {
    const r = await F.gerarDoDia('2026-11-24');
    expect(r.criadas).toBe(4);
    await F.filaVazia();
    let fila = await F.listar(400);
    expect(fila.map(i => i.status)).toEqual(['pronta', 'pronta', 'pronta', 'pronta']);
    expect(fila[0].pecas[0]).toMatch(/_ADS\.mp4$/);
    expect(await F.gerarDoDia('2026-11-24')).toEqual({ criadas: 0, existentes: 4 });

    const ads = fila.find(i => i.nome.endsWith('_ADS'))!, org = fila.find(i => i.nome.endsWith('_ORG'))!;
    await expect(F.aprovar(ads.id, 1)).rejects.toThrow(/confirme/);
    await F.aprovar(org.id, 1);
    await F.confirmarCondicoes({ entrada: 'R$ 10 mil', parcelas: '180x', handle: '@avalieimob' }, 1);
    await F.aprovar(ads.id, 1);
    await expect(F.descartar(ads.id)).rejects.toThrow(/aprovada/);

    const car = fila.find(i => i.nome.endsWith('_CAR'))!;
    await F.editarLegenda(car.id, 'Nova legenda');
    await F.trocarMidia(car.id, 0);
    await F.filaVazia();
    fila = await F.listar(400);
    const car2 = fila.find(i => i.id === car.id)!;
    expect(car2).toMatchObject({ status: 'pronta', legenda: 'Nova legenda' });
    expect(car2.pauta.midias[0].id).not.toBe(car.pauta.midias[0].id);

    const story = fila.find(i => i.nome.endsWith('_STORY'))!;
    await F.descartar(story.id);
    // Refazer mantém as aprovadas e gera de novo as outras
    const r2 = await F.gerarDoDia('2026-11-24', undefined, true);
    expect(r2.criadas).toBe(2);
    await F.filaVazia();
    expect((await F.listar(400)).filter(i => i.data === '2026-11-24')).toHaveLength(4);
  });

  it('falha na montagem fica como erro e pode remontar', async () => {
    F.definirMontador(async () => { throw new Error('ffmpeg caiu'); });
    await F.gerarDoDia('2026-11-25');
    await F.filaVazia();
    const f = (await F.listar(400)).filter(i => i.data === '2026-11-25');
    expect(f.every(i => i.status === 'erro' && i.erro === 'ffmpeg caiu')).toBe(true);
    F.definirMontador(async () => ['https://cdn/ok.jpg']);
    await F.remontar(f[0].id);
    await F.filaVazia();
    expect((await F.listar(400)).find(i => i.id === f[0].id)?.status).toBe('pronta');
  });

  it('rotina só gera às 6h, ligada e uma vez por dia', async () => {
    const as6 = Date.parse('2026-11-27T09:30:00Z'); // 06:30 em Brasília
    expect(await F.rotinaFabrica(Date.parse('2026-11-27T08:00:00Z'))).toMatchObject({ gerado: false, motivo: 'fora do horário' });
    expect(await F.rotinaFabrica(as6)).toMatchObject({ gerado: false, motivo: 'desligada' });
    await F.ligarFabrica(true, 1);
    expect(await F.rotinaFabrica(as6)).toMatchObject({ gerado: true });
    expect(await F.rotinaFabrica(as6)).toMatchObject({ gerado: false, motivo: 'já gerado' });
    await F.filaVazia();
    const d: any = await getDb();
    expect((await d.select().from(criativosPautas)).some((r: any) => r.data === '2026-11-27')).toBe(true);
  });
});

describe.skipIf(!existsSync('/usr/bin/ffmpeg'))('montagem das fotos (sharp)', () => {
  it('carrossel 4:5 com cartão final', async () => {
    const sharp = (await import('sharp')).default;
    const os = await import('node:os'), path = await import('node:path'), fs = await import('node:fs/promises');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'car-'));
    const img = path.join(dir, 'a.jpg');
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#4a7' } }).jpeg().toFile(img);
    const { montarPeca } = await import('./criativos/montar');
    const p = pautasDoDia([midia(1, 'imagem', ['rio']), midia(2, 'imagem', ['rio'])], '2026-11-24', new Map())
      .find(x => x.tipo === 'carrossel')!;
    const saidas = await montarPeca(p, async () => img, dir);
    expect(saidas).toHaveLength(p.midias.length + 1);
    const meta = await sharp(saidas[0]).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
