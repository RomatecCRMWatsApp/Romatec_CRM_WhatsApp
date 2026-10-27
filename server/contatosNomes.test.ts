import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const N = await import('./contatosNomes');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
let db: any;

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO contacts (id, name, phone, status) VALUES
    (1, 'Zez??o Seixas', '+5599991234567', 'active'),
    (2, '?????Marcio', '5599981332209', 'active'),
    (3, '~Ramos???????', '559991112222', 'active'),
    (4, 'Zenaide Medeiros', '+5599991274759', 'active'),
    (5, 'Jo??o Silva', '+5599900000000', 'active')`);
});

describe('nomes com "?"', () => {
  it('padrão do nome estragado: cada "??" vale uma letra acentuada, "????" um emoji', () => {
    expect(N.compativel('Zez??o Seixas', 'Zezão Seixas')).toBe(true);
    expect(N.compativel('Zez??o Seixas', 'Fulano de Tal')).toBe(false);
    expect(N.compativel('?????Marcio', '🌹 Marcio')).toBe(true);
    expect(N.compativel('~Ramos???????', '~Ramos🙏🏽✨')).toBe(true);
    expect(N.compativel('Zez??o', 'Zez??o')).toBe(false); // candidato também estragado não serve
  });

  it('telefone casa com e sem 55 e com e sem o 9', () => {
    expect(N.chaveTelefone('+55 99 99123-4567')).toBe(N.chaveTelefone('9991234567'));
    expect(N.chaveTelefone('559991112222')).toBe(N.chaveTelefone('99 9 9111-2222'));
  });

  it('vCard com quoted-printable UTF-8 e Windows-1252', () => {
    const vcf = [
      'BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Seixas;Zez=C3=A3o;;;',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Zez=C3=A3o Seixas', 'TEL;CELL:+55 99 99123-4567', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:2.1', 'FN;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:Jo=E3o Silva', 'TEL:(99) 90000-0000', 'END:VCARD',
    ].join('\r\n');
    const a = N.agendaVcf(vcf);
    expect(a.get(N.chaveTelefone('5599991234567')!)).toContain('Zezão Seixas');
    expect(a.get(N.chaveTelefone('5599900000000')!)).toContain('João Silva');
  });

  it('sugestão pela grafia: os 7 que não estavam na agenda', () => {
    const g = (s: string) => N.sugerirGrafia(s);
    expect(g('Alana Vit??ria')).toEqual({ nome: 'Alana Vitória', certeza: true });
    expect(g('Bruno Le??o Corretor')).toEqual({ nome: 'Bruno Leão Corretor', certeza: true });
    expect(g('A.Lu??s INEC BNB Credito Agro')).toEqual({ nome: 'A.Luís INEC BNB Credito Agro', certeza: true });
    expect(g('Aline Neres Advocacia e Consultoria Jur??dica')).toEqual({ nome: 'Aline Neres Advocacia e Consultoria Jurídica', certeza: true });
    expect(g('????Antonio Agfravd')).toEqual({ nome: 'Antonio Agfravd', certeza: true });
    expect(g('??????Suellen Lopez?????? CPC')).toEqual({ nome: 'Suellen Lopez CPC', certeza: true });
    expect(g('Adrianny Melissa ???????? Cuso De Direito')).toEqual({ nome: 'Adrianny Melissa Cuso De Direito', certeza: true });
    // Palavra fora da lista: palpite pelo contexto, sem certeza
    expect(g('Fulano Tr??s')).toEqual({ nome: 'Fulano Trís', certeza: false });
    expect(g('???????')).toBeNull();
  });

  it('sugestões pela agenda da Z-API e aplicação só em quem ainda está com "?"', async () => {
    const respostas = [[
      { phone: '5599991234567', name: 'Zezão Seixas', notify: 'Zezão' },
      { phone: '5599981332209', name: '🌹Marcio', notify: 'Marcio' },
      { phone: '559991112222', name: 'Pedro Ramos', notify: '' },
    ], []];
    const fetchFalso = (async () => new Response(JSON.stringify(respostas.shift() ?? []), { status: 200 })) as any;
    const agenda = await N.agendaZapi(fetchFalso, { ZAPI_INSTANCE_ID: 'i', ZAPI_TOKEN: 't' } as any);
    const s = N.sugerir(await N.contatosCorrompidos(), agenda);
    const porId = Object.fromEntries(s.map(x => [x.id, x]));
    expect(porId[1]).toMatchObject({ sugerido: 'Zezão Seixas', compativel: true });
    expect(porId[2]).toMatchObject({ sugerido: '🌹Marcio', compativel: true });
    expect(porId[3]).toMatchObject({ sugerido: 'Pedro Ramos', compativel: false }); // nome diferente: fica para o administrador decidir
    expect(porId[5]).toMatchObject({ sugerido: 'João Silva', origem: 'grafia', certeza: true }); // fora da agenda: pela grafia
    expect(s.some(x => x.id === 4)).toBe(false); // nome bom não entra
    const r = await N.aplicarNomes([{ id: 1, nome: 'Zezão Seixas' }, { id: 4, nome: 'Outro' }, { id: 2, nome: 'Ma??' }]);
    expect(r.aplicadas).toBe(1);
    expect(db.all(sql`SELECT name FROM contacts WHERE id IN (1, 4, 2) ORDER BY id`).map((x: any) => x.name)).toEqual(['Zezão Seixas', '?????Marcio', 'Zenaide Medeiros']);
  });
});
