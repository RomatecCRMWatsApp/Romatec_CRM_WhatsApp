import { describe, it, expect, vi } from 'vitest';
import {
  origemDoLead, filtrarLinhas, origensDisponiveis, textoListaLeads, pdfListaLeads, legendaPdf, formatarTelefone,
  nomeArquivoLista, telefonePadraoLista, MAX_LINHAS_TEXTO, deduplicarLinhas, chaveLead, nomeNormalizado, type LinhaLead,
} from './listaLeads';
import { caber, larguraTexto } from './pdfSimples';
import { enviarDocumento, ZApiError } from './zapiClient';

const linha = (over: Partial<LinhaLead> = {}): LinhaLead => ({
  id: 1, nome: 'Maria Souza', telefone: '+55 (99) 98888-7777', email: 'maria@exemplo.com', origem: 'Site (formulário)', entrada: '2026-10-19T15:00:00.000Z', ...over,
});

describe('Lista de leads — origem', () => {
  it('usa o canal de 1º toque; sem ele, o campo origem; empreendimento entra no rótulo', () => {
    expect(origemDoLead({ origemCanal: 'meta_leadads', empreendimentoSlug: 'bom-jardims' }, { 'bom-jardims': 'Condomínio de Chácaras Bom Jardims' }))
      .toBe('Meta Lead Ads · Condomínio de Chácaras Bom Jardims');
    expect(origemDoLead({ origemCanal: 'whatsapp_direto' })).toBe('WhatsApp direto');
    expect(origemDoLead({ origem: 'instagram_bio' })).toBe('Link da bio / landing');
    expect(origemDoLead({ origem: 'site' })).toBe('Site (formulário)');
    expect(origemDoLead({})).toBe('WhatsApp');
    expect(origemDoLead({ origem: 'whatsapp', empreendimentoSlug: 'novo' })).toBe('WhatsApp · novo');
  });
});

describe('Lista de leads — filtros e texto', () => {
  const linhas = [
    linha({ id: 1 }),
    linha({ id: 2, nome: 'João', email: '', telefone: '+55 (99) 97777-1111', origem: 'Meta Lead Ads · Bom Jardims' }),
    linha({ id: 3, nome: 'Ana', email: 'ana@x.com', telefone: '+55 (99) 96666-2222', origem: 'Meta Lead Ads' }),
  ];
  it('filtra por origem base (inclui as com empreendimento) e pela origem exata', () => {
    expect(filtrarLinhas(linhas, { origem: 'Meta Lead Ads' }).map(l => l.id)).toEqual([2, 3]);
    expect(filtrarLinhas(linhas, { origem: 'Meta Lead Ads · Bom Jardims' }).map(l => l.id)).toEqual([2]);
  });
  it('busca por nome, e-mail ou dígitos do telefone', () => {
    expect(filtrarLinhas(linhas, { search: 'joão' }).map(l => l.id)).toEqual([2]);
    expect(filtrarLinhas(linhas, { search: 'ana@' }).map(l => l.id)).toEqual([3]);
    expect(filtrarLinhas(linhas, { search: '96666' }).map(l => l.id)).toEqual([3]);
  });
  it('origens do filtro com contagem (base + com empreendimento)', () => {
    expect(origensDisponiveis(linhas)).toEqual([
      { origem: 'Meta Lead Ads', total: 2 },
      { origem: 'Meta Lead Ads · Bom Jardims', total: 1 },
      { origem: 'Site (formulário)', total: 1 },
    ]);
  });
  it('texto do WhatsApp: cabeçalho, uma linha por lead, corta no limite', () => {
    const t = textoListaLeads(linhas, { situacao: 'ativos' }, new Date('2026-10-20T15:00:00Z'));
    expect(t).toContain('*Lista de leads — Romatec*');
    expect(t).toContain('3 leads · leads ativos');
    expect(t).toContain('1. *Maria Souza* — +55 (99) 98888-7777 — maria@exemplo.com');
    expect(t).toContain('2. *João* — +55 (99) 97777-1111\n    Meta Lead Ads · Bom Jardims');
    const muitas = Array.from({ length: MAX_LINHAS_TEXTO + 5 }, (_, i) => linha({ id: i }));
    expect(textoListaLeads(muitas, { situacao: 'todos' })).toContain('… e mais 5 leads');
    expect(legendaPdf(linhas, { situacao: 'ativos', origem: 'Meta Lead Ads' })).toContain('origem: Meta Lead Ads');
  });
  it('telefone formatado, nome do arquivo e número padrão (José)', () => {
    expect(formatarTelefone('5599991811246')).toBe('+55 (99) 99181-1246');
    expect(nomeArquivoLista(new Date('2026-10-20T15:00:00Z'))).toBe('leads-romatec-2026-10-20.pdf');
    expect(telefonePadraoLista()).toBe('5599991811246');
  });
});

describe('Lista de leads — sem repetidos', () => {
  it('mesmo número (em formatos diferentes) com nomes diferentes vira 1 lead', () => {
    const r = deduplicarLinhas([
      linha({ id: 1, nome: 'Maria Souza', fone: '5599988887777', entrada: '2026-10-10T10:00:00.000Z' }),
      linha({ id: 2, nome: 'maria', fone: '99988887777', entrada: '2026-10-18T10:00:00.000Z' }),
      linha({ id: 3, nome: 'Mariazinha', fone: '559988887777', entrada: '2026-10-01T10:00:00.000Z' }), // antigo, sem o 9
      linha({ id: 4, nome: 'Outra Pessoa', fone: '5599977776666' }),
    ]);
    expect(r).toHaveLength(2);
    const maria = r.find(l => l.id === 2)!;
    expect(maria.nome).toBe('maria'); // o mais recente
    expect(maria.entrada).toBe('2026-10-18T10:00:00.000Z');
  });
  it('sem telefone, colapsa pelo nome (sem acento/maiúsculas/espaços)', () => {
    const r = deduplicarLinhas([
      linha({ id: 1, nome: 'José  Conceição', fone: '', telefone: '' }),
      linha({ id: 2, nome: 'jose conceicao', fone: '', telefone: '' }),
      linha({ id: 3, nome: 'Sem nome', fone: '', telefone: '' }),
      linha({ id: 4, nome: 'Sem nome', fone: '', telefone: '' }),
    ]);
    expect(r.map(l => l.id).sort()).toEqual([2, 3, 4]); // "Sem nome" sem telefone não colapsa
  });
  it('merge: fica com o e-mail e a origem de quem tiver; nome válido; entrada mais recente', () => {
    const [l] = deduplicarLinhas([
      linha({ id: 1, nome: 'Ana Lima', fone: '5599966665555', email: 'ana@x.com', origem: 'Meta Lead Ads · Bom Jardims', entrada: '2026-10-01T10:00:00.000Z' }),
      linha({ id: 2, nome: 'Sem nome', fone: '5599966665555', email: '', origem: 'WhatsApp', entrada: '2026-10-19T10:00:00.000Z' }),
    ]);
    expect(l).toMatchObject({ id: 2, nome: 'Ana Lima', email: 'ana@x.com', origem: 'Meta Lead Ads · Bom Jardims', entrada: '2026-10-19T10:00:00.000Z' });
  });
  it('contagem (texto e PDF) usa a lista sem repetidos', () => {
    const r = deduplicarLinhas([linha({ id: 1, fone: '5599911112222' }), linha({ id: 2, fone: '99911112222' }), linha({ id: 3, fone: '5599933334444' })]);
    expect(r).toHaveLength(2);
    expect(textoListaLeads(r, { situacao: 'ativos' })).toContain('2 leads · leads ativos');
    expect(pdfListaLeads(r, { situacao: 'ativos' }).toString('latin1')).toContain('(2 leads ');
    expect(origensDisponiveis(r)).toEqual([{ origem: 'Site (formulário)', total: 2 }]);
  });
  it('chave: telefone normalizado; sem telefone, nome', () => {
    expect(chaveLead({ id: 1, nome: 'X', telefone: '+55 (99) 99181-1246' })).toBe('tel:5599991811246');
    expect(chaveLead({ id: 1, nome: 'X', telefone: '', fone: '991811246' })).toBe('tel:991811246');
    expect(chaveLead({ id: 1, nome: ' Ána ', telefone: '' })).toBe('nome:ana');
    expect(nomeNormalizado('  JOÃO   da  Silva ')).toBe('joao da silva');
  });
});

describe('PDF da lista', () => {
  const xrefOk = (pdf: string) => {
    const inicio = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(inicio, inicio + 4)).toBe('xref');
    const offsets = Array.from(pdf.slice(inicio).matchAll(/^(\d{10}) 00000 n $/gm)).map(m => Number(m[1]));
    offsets.forEach((o, i) => expect(pdf.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
  };
  it('PDF válido com cabeçalho Romatec, data, colunas e acentos em WinAnsi', () => {
    const buf = pdfListaLeads([linha({ nome: 'José Conceição' })], { situacao: 'ativos' }, new Date('2026-10-20T15:00:00Z'));
    const pdf = buf.toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('(ROMATEC)');
    expect(pdf).toContain('(Lista de leads)');
    expect(pdf).toContain('20/10/2026');
    for (const c of ['(Nome)', '(Telefone)', '(E-mail)', '(Origem)']) expect(pdf).toContain(c);
    expect(pdf).toContain('(Jos\\351 Concei\\347\\343o)'); // é ç ã
    expect(pdf).toContain('/Count 1');
    xrefOk(pdf);
  });
  it('quebra em várias páginas e não quebra com lista vazia', () => {
    const muitas = Array.from({ length: 70 }, (_, i) => linha({ id: i, nome: `Lead ${i}` }));
    const pdf = pdfListaLeads(muitas, { situacao: 'todos' }).toString('latin1');
    expect(Number(pdf.match(/\/Count (\d+)/)![1])).toBeGreaterThan(1);
    xrefOk(pdf);
    const vazio = pdfListaLeads([], { situacao: 'ativos' }).toString('latin1');
    expect(vazio).toContain('(Nenhum lead neste filtro.)');
    xrefOk(vazio);
  });
  it('texto longo é cortado com reticências e emoji/parênteses não quebram o PDF', () => {
    const t = caber('Meta Lead Ads · Condomínio de Chácaras Bom Jardims com um nome muito comprido', 80);
    expect(t.endsWith('…')).toBe(true);
    expect(larguraTexto(t)).toBeLessThanOrEqual(80);
    const pdf = pdfListaLeads([linha({ nome: 'Ana (prima) 🔥' })], { situacao: 'ativos' }).toString('latin1');
    expect(pdf).toContain('(Ana \\(prima\\) )');
    xrefOk(pdf);
  });
});

describe('Z-API — envio de documento', () => {
  it('manda o PDF em base64 para /send-document/pdf com nome e legenda', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messageId: 'abc' }) });
    const id = await enviarDocumento('5599991811246', { base64: 'JVBERi0=', extensao: 'pdf', mime: 'application/pdf', nomeArquivo: 'leads.pdf', legenda: 'Lista' },
      { creds: { instanceId: 'I', token: 'T', clientToken: 'C' }, fetchImpl: fetchImpl as any });
    expect(id).toBe('abc');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.z-api.io/instances/I/token/T/send-document/pdf');
    expect(init.headers['Client-Token']).toBe('C');
    expect(JSON.parse(init.body)).toEqual({ phone: '5599991811246', document: 'data:application/pdf;base64,JVBERi0=', fileName: 'leads.pdf', caption: 'Lista' });
  });
  it('erro da Z-API vira ZApiError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'bad' }) });
    await expect(enviarDocumento('5599991811246', { base64: 'x', extensao: 'pdf', mime: 'application/pdf', nomeArquivo: 'a.pdf' },
      { creds: { instanceId: 'I', token: 'T' }, fetchImpl: fetchImpl as any })).rejects.toBeInstanceOf(ZApiError);
  });
});
