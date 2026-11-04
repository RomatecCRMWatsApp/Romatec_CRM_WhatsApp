import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { normalizarCarimbo, aplicarCarimbo, linhasCarimbo, carimboDoCadastro, assinaturaDoCarimbo } = await import('../shared/carimbo');
const S = await import('./carimbo');
const { faixaCorretor, textosCorretor } = await import('./materialFormatado');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;

const cartao = { nome: 'Ana Silva', creci: 'CRECI/MA 9.999', telefones: ['(99) 9 8888-7777'], whatsapp: '5599988887777', email: 'ana@cad.com', fotoUrl: null, papel: 'Corretor(a)', instagram: 'avalieimob' };

describe('Meu carimbo', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, creci, telefone) VALUES (7, 'u7', 'Ana Silva', 'user', '9999', '99988887777')`);
  });

  it('valida e limpa o que foi digitado', () => {
    expect(normalizarCarimbo({ nome: '  Ana   Corretora ', telefone: '99 98888-7777', instagram: 'https://instagram.com/Ana.Imoveis/', email: ' ANA@Mail.com ' }))
      .toEqual({ nome: 'Ana Corretora', telefone: '(99) 9 8888-7777', instagram: 'ana.imoveis', email: 'ana@mail.com' });
    expect(normalizarCarimbo({ nome: 'Ana', telefone: '', instagram: '', email: '' })).toEqual({ nome: 'Ana', telefone: null, instagram: null, email: null });
    expect(() => normalizarCarimbo({ nome: 'A' })).toThrow(/nome/);
    expect(() => normalizarCarimbo({ nome: 'Ana', telefone: '123' })).toThrow(/WhatsApp/);
    expect(() => normalizarCarimbo({ nome: 'Ana', email: 'ana@' })).toThrow(/E-mail/);
    expect(() => normalizarCarimbo({ nome: 'Ana', instagram: '@ana imoveis!' })).toThrow(/Instagram/);
  });

  it('o carimbo vence o cadastro, mas o CRECI continua o do cadastro', () => {
    const a = aplicarCarimbo(cartao, null, { nome: 'Ana C.', telefone: '(99) 9 1111-2222', instagram: 'ana.imoveis', email: 'ana@mail.com' });
    expect(linhasCarimbo(a)).toEqual({ nome: 'Ana C. · CRECI/MA 9.999', detalhe: 'WhatsApp (99) 9 1111-2222  ·  @ana.imoveis', email: 'ana@mail.com' });
    // Sem Instagram no carimbo, não aparece o institucional
    expect(linhasCarimbo(aplicarCarimbo(cartao, null, { nome: 'Ana', telefone: null, instagram: null, email: null })).detalhe).toBe('');
    expect(carimboDoCadastro(cartao, 'ana.cad')).toEqual({ nome: 'Ana Silva', telefone: '(99) 9 8888-7777', instagram: 'ana.cad', email: 'ana@cad.com' });
  });

  it('a legenda (texto do WhatsApp) sai com o carimbo; sem Instagram/e-mail no carimbo, não aparecem', () => {
    const a = aplicarCarimbo(cartao, null, { nome: 'Ana C.', telefone: '(99) 9 1111-2222', instagram: 'ana.imoveis', email: 'ana@mail.com' });
    expect(assinaturaDoCarimbo(a)).toBe('—\n👤 *Ana C.* · Corretor(a)\n🪪 CRECI/MA 9.999\n📲 WhatsApp: (99) 9 1111-2222\n📸 @ana.imoveis\n✉️ ana@mail.com');
    const b = aplicarCarimbo(cartao, null, { nome: 'Ana C.', telefone: null, instagram: null, email: null });
    expect(assinaturaDoCarimbo(b)).toBe('—\n👤 *Ana C.* · Corretor(a)\n🪪 CRECI/MA 9.999');
  });

  it('salva uma vez e devolve o salvo; a faixa das mídias sai com ele', async () => {
    expect((await S.meuCarimbo(7)).salvo).toBe(false);
    await S.salvarCarimbo(7, { nome: 'Ana Corretora', telefone: '99911112222', instagram: '@ana.imoveis', email: 'ana@mail.com' });
    await S.salvarCarimbo(7, { nome: 'Ana Corretora', telefone: '99911112222', instagram: '@ana.imoveis', email: 'contato@ana.com' });
    const m = await S.meuCarimbo(7);
    expect(m).toMatchObject({ salvo: true, creci: 'CRECI/MA 9.999', carimbo: { nome: 'Ana Corretora', telefone: '(99) 9 1111-2222', instagram: 'ana.imoveis', email: 'contato@ana.com' } });
    const d = await S.dadosDoCarimbo(7);
    const t = textosCorretor({ cartao: d.cartao, instagram: d.instagram, email: d.email, link: 'https://romateccrm.com/x', empreendimento: null });
    expect(t).toEqual({ nome: 'Ana Corretora · CRECI/MA 9.999', detalhe: 'WhatsApp (99) 9 1111-2222  ·  @ana.imoveis', email: 'contato@ana.com' });
    const png = await faixaCorretor(1080, 190, { cartao: d.cartao, instagram: d.instagram, email: d.email, link: 'https://romateccrm.com/x', empreendimento: null });
    expect((await sharp(png).metadata()).height).toBe(190);
  });
});
