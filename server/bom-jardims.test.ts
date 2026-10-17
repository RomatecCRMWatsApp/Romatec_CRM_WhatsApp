import { describe, it, expect } from 'vitest';
import { scoreBomJardims, moraPerto, bomJardimsWelcome, bomJardimsLeadSchema, BOM_JARDIMS_CONSENT_TEXT } from './bom-jardims';
import { toEmpreendimentoPublico, statusEfetivo } from './empreendimentos';
import seed from './data/bom-jardims/seed.json';

const emp = (precosPublicos: boolean) => ({
  id: 1, slug: 'bom-jardims', nome: 'Condomínio de Chácaras Bom Jardims', fase: 'pre_lancamento',
  municipio: 'Açailândia', uf: 'MA', endereco: 'x', lat: '-4.9254537', lon: '-47.3826563', areaHa: '41.1045',
  totalLotes: 84, lotesComercializaveis: 82, precosPublicos, createdAt: new Date(), updatedAt: new Date(),
});

const lote = (over: Record<string, any> = {}) => ({
  id: 1, empreendimentoId: 1, codigo: 'A01', quadra: 'A', numero: 1, areaM2: '3025.11', perimetroM: '220.01',
  destinacao: 'chacara', comercializavel: true, status: 'disponivel', reservadoAte: null,
  precoAvistaRef: '120000.00', precoFinanciadoRef: '160000.00', latCentro: '0', lonCentro: '0', dossiePdf: null,
  updatedAt: new Date(), ...over,
}) as any;

describe('Bom Jardims - trava de preço', () => {
  it('com precosPublicos=false nenhum valor sai na API pública', () => {
    const out = toEmpreendimentoPublico(emp(false) as any, [lote(), lote({ codigo: 'A02' })]);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/precoAvista|precoFinanciado|120000|160000/i);
    expect(out.precosPublicos).toBe(false);
    expect(out.lotes[0]).not.toHaveProperty('precoAvista');
  });

  it('só com precosPublicos=true o valor aparece', () => {
    const out = toEmpreendimentoPublico(emp(true) as any, [lote()]);
    expect(out.lotes[0].precoAvista).toBe(120000);
  });

  it('seed do repositório não tem preço', () => {
    expect(JSON.stringify(seed)).not.toMatch(/preco|120000|160000/i);
  });
});

describe('Bom Jardims - dados do pacote', () => {
  it('84 lotes, 82 comercializáveis, A03 e B14 fora da venda', () => {
    expect(seed.lotes).toHaveLength(84);
    expect(seed.lotes.filter(l => l.comercializavel)).toHaveLength(82);
    const fora = seed.lotes.filter(l => !l.comercializavel).map(l => l.codigo).sort();
    expect(fora).toEqual(['A03', 'B14']);
  });

  it('resumo conta 82 disponíveis', () => {
    const rows = seed.lotes.map((l, i) => lote({ id: i, codigo: l.codigo, comercializavel: l.comercializavel, status: l.status }));
    const out = toEmpreendimentoPublico(emp(false) as any, rows);
    expect(out.resumo.disponivel).toBe(82);
    expect(out.resumo.nao_comercializavel).toBe(2);
  });

  it('reserva vencida volta a aparecer como disponível', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(statusEfetivo(lote({ status: 'reservado', reservadoAte: new Date('2026-10-19') }), now)).toBe('disponivel');
    expect(statusEfetivo(lote({ status: 'reservado', reservadoAte: new Date('2026-10-21') }), now)).toBe('reservado');
    expect(statusEfetivo(lote({ comercializavel: false }), now)).toBe('nao_comercializavel');
  });
});

describe('Bom Jardims - pontuação (§8.2)', () => {
  it('soma prazo, pagamento, cidade e chácara clicada', () => {
    expect(scoreBomJardims({ prazo: 'imediato', pagamento: 'avista', cidade: 'Açailândia', loteCodigo: 'B07' })).toBe(70);
    expect(scoreBomJardims({ prazo: '3m', cidade: 'Imperatriz - MA' })).toBe(35);
    expect(scoreBomJardims({ prazo: 'pesquisando', cidade: 'São Luís' })).toBe(0);
  });

  it('reconhece cidades próximas com ou sem acento', () => {
    expect(moraPerto('acailandia')).toBe(true);
    expect(moraPerto('São Francisco do Brejão')).toBe(true);
    expect(moraPerto('Belém')).toBe(false);
    expect(moraPerto(undefined)).toBe(false);
  });
});

describe('Bom Jardims - formulário e mensagem', () => {
  const base = { nome: 'Maria Souza', phone: '(99) 9 9181-1246', consent: true };

  it('aceita o mínimo e campos opcionais vazios', () => {
    expect(bomJardimsLeadSchema.safeParse({ ...base, email: '', cidade: '' }).success).toBe(true);
  });

  it('exige consentimento e valida chácara', () => {
    expect(bomJardimsLeadSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(bomJardimsLeadSchema.safeParse({ ...base, loteCodigo: 'Z99' }).success).toBe(false);
    expect(bomJardimsLeadSchema.safeParse({ ...base, loteCodigo: 'B07' }).success).toBe(true);
  });

  it('mensagem 7.1 cita o corretor com CRECI e não fala de preço', () => {
    const msg = bomJardimsWelcome('maria souza');
    expect(msg).toContain('Maria');
    expect(msg).toContain('CRECI/MA 4.705');
    expect(msg).not.toMatch(/R\$|valor|preço|parcela|entrada/i);
  });

  it('texto de consentimento é o do §8.3', () => {
    expect(BOM_JARDIMS_CONSENT_TEXT).toContain('Lei n.º 13.709/2018');
  });
});
