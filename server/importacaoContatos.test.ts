import { describe, expect, it } from 'vitest';
import {
  contatosMarcados, extrairRespostas, lerArquivoContatos, lerCsv, lerVcf, montarRetomada, nomeSemMarcador, proximaPergunta,
  respostaQualificacao, respostasDosSlots, retomadaQuente, telefoneBr, temMarcador, TEXTO_RETOMADA_PADRAO,
} from '../shared/importacaoContatos';
import { emQualificacao } from './autoresposta/qualificacaoRetomada';
import { podeAbrir } from '../shared/equipe';

describe('marcador e telefone', () => {
  it('reconhece o final CCBJ em vários formatos e limpa o nome', () => {
    for (const n of ['Maria Souza CCBJ', 'Maria Souza - ccbj', 'Maria SouzaCCBJ', 'Maria Souza ccbj ']) {
      expect(temMarcador(n, 'CCBJ')).toBe(true);
      expect(nomeSemMarcador(n, 'CCBJ')).toBe('Maria Souza');
    }
    expect(temMarcador('CCBJ Maria', 'CCBJ')).toBe(false);
    expect(temMarcador('Maria', 'CCBJ')).toBe(false);
  });

  it('padroniza o telefone com 55 e recusa números estranhos', () => {
    expect(telefoneBr('(99) 9 9126-3738')).toBe('5599991263738');
    expect(telefoneBr('+55 99 99126-3738')).toBe('5599991263738');
    expect(telefoneBr('99 3538-1234')).toBe('559935381234');
    expect(telefoneBr('12345')).toBeNull();
    // Salvo sem DDD (vale o 99 de Açailândia) e com código de operadora
    expect(telefoneBr('99192-9669')).toBe('5599991929669');
    expect(telefoneBr('98500-0160')).toBe('5599985000160');
    expect(telefoneBr('3538-1234')).toBe('559935381234');
    expect(telefoneBr('(015 99) 99177-7243')).toBe('5599991777243');
    expect(telefoneBr('0 99 99177-7243')).toBe('5599991777243');
    expect(telefoneBr('(011) 98877-6655')).toBe('5511988776655');
    expect(telefoneBr('+1 415 555 0100')).toBeNull();
  });

  it('só os marcados, um por número (com e sem o 9)', () => {
    const r = contatosMarcados([
      { nome: 'João CCBJ', telefone: '(99) 99111-2222' },
      { nome: 'João CCBJ', telefone: '+55 99 9111-2222' },
      { nome: 'Pedro', telefone: '99 98888-7777' },
      { nome: 'Ana CCBJ', telefone: '123' },
    ], 'CCBJ');
    expect(r.contatos).toEqual([{ nome: 'João', telefone: '5599991112222', nomeOriginal: 'João CCBJ' }]);
    expect(r.semTelefone).toEqual(['Ana CCBJ']);
  });
});

describe('arquivos', () => {
  it('lê vCard do Android (quoted-printable, vários telefones)', () => {
    const vcf = [
      'BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Concei=C3=A7=C3=A3o;Maria;;;',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Maria Concei=C3=A7=C3=A3o CCBJ', 'TEL;CELL:+55 99 99111-2222', 'TEL;HOME:99 3538-1234', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Pedro Lima', 'TEL;TYPE=CELL:99988887777', 'END:VCARD',
    ].join('\r\n');
    const c = lerVcf(vcf);
    expect(c).toEqual([
      { nome: 'Maria Conceição CCBJ', telefone: '+55 99 99111-2222' },
      { nome: 'Maria Conceição CCBJ', telefone: '99 3538-1234' },
      { nome: 'Pedro Lima', telefone: '99988887777' },
    ]);
    expect(lerArquivoContatos(vcf)).toHaveLength(3);
  });

  it('lê o CSV do Google Contatos (nome em partes, vários números na célula)', () => {
    const csv = [
      'First Name,Middle Name,Last Name,Phone 1 - Label,Phone 1 - Value,Phone 2 - Value',
      'Carlos,,Silva CCBJ,Mobile,+55 99 99111-0000 ::: +55 99 98111-0001,',
      '"Ana, a vizinha",,,Mobile,(99) 98222-3333,',
    ].join('\n');
    expect(lerCsv(csv)).toEqual([
      { nome: 'Carlos Silva CCBJ', telefone: '+55 99 99111-0000' },
      { nome: 'Carlos Silva CCBJ', telefone: '+55 99 98111-0001' },
      { nome: 'Ana, a vizinha', telefone: '(99) 98222-3333' },
    ]);
  });

  it('lê planilha simples em português com ponto e vírgula', () => {
    expect(lerCsv('Nome;Telefone\nLuiza CCBJ;99 99100-2000\n')).toEqual([{ nome: 'Luiza CCBJ', telefone: '99 99100-2000' }]);
  });
});

describe('retomada e qualificação', () => {
  it('monta a mensagem com o primeiro nome (ou sem nome)', () => {
    expect(montarRetomada(TEXTO_RETOMADA_PADRAO, 'Maria Souza')).toMatch(/^Oi, Maria, tudo bem\? Aqui é o José Romário/);
    expect(montarRetomada(TEXTO_RETOMADA_PADRAO, 'Cliente')).toMatch(/^Oi, tudo bem\?/);
    expect(montarRetomada('Olá {nome}!', 'Ana')).toBe('Olá Ana!');
    // Nome de usuário do WhatsApp (minúsculo ou com número) não vira "Oi, metalmixma"
    expect(montarRetomada(TEXTO_RETOMADA_PADRAO, 'metalmixma')).toMatch(/^Oi, tudo bem\?/);
    expect(montarRetomada(TEXTO_RETOMADA_PADRAO, 'mesquitadeidson')).toMatch(/^Oi, tudo bem\?/);
    expect(montarRetomada(TEXTO_RETOMADA_PADRAO, 'dinesson26')).toMatch(/^Oi, tudo bem\?/);
    expect(montarRetomada(TEXTO_RETOMADA_PADRAO, 'Júnior')).toMatch(/^Oi, Júnior,/);
    expect(TEXTO_RETOMADA_PADRAO).toContain('SAIR');
  });

  it('entende as respostas, com respostas curtas só para a pergunta da vez', () => {
    expect(extrairRespostas('quero pra investir', 'finalidade')).toEqual({ finalidade: 'investimento' });
    expect(extrairRespostas('Pra lazer no fim de semana com a família', 'finalidade')).toEqual({ finalidade: 'lazer' });
    expect(extrairRespostas('casa', 'finalidade')).toEqual({ finalidade: 'morar' });
    expect(extrairRespostas('casa', 'prazo')).toEqual({});
    expect(extrairRespostas('agora', 'prazo')).toEqual({ prazo: 'imediato' });
    expect(extrairRespostas('ainda estou pesquisando', 'prazo')).toEqual({ prazo: 'pesquisando' });
    expect(extrairRespostas('uns 2 meses', 'prazo')).toEqual({ prazo: '3m' });
    expect(extrairRespostas('ano que vem', 'prazo')).toEqual({ prazo: '12m' });
    expect(extrairRespostas('à vista no pix', 'pagamento')).toEqual({ pagamento: 'avista' });
    expect(extrairRespostas('parcelado', 'pagamento')).toEqual({ pagamento: 'parcelado' });
    // Resposta completa de uma vez
    expect(extrairRespostas('Quero morar, pretendo fechar em 3 meses, parcelado', 'finalidade')).toEqual({ finalidade: 'morar', prazo: '3m', pagamento: 'parcelado' });
    expect(extrairRespostas('bom dia', 'finalidade')).toEqual({});
  });

  it('faz a próxima pergunta e encerra conforme o prazo', () => {
    expect(proximaPergunta({ finalidade: 'lazer' })).toBe('prazo');
    expect(respostaQualificacao({ nome: 'Ana', respostas: { finalidade: 'lazer' } })).toMatch(/pra quando você pensa em fechar/);
    const quente = { finalidade: 'morar', prazo: '3m', pagamento: 'parcelado' };
    expect(retomadaQuente(quente)).toBe(true);
    const fim = respostaQualificacao({ nome: 'Ana', respostas: quente, link: 'https://x/o/bom-jardims', corretor: 'José Romário' });
    expect(fim).toMatch(/Obrigado, Ana! Já passei suas respostas para o José/);
    expect(fim).toContain('https://x/o/bom-jardims');
    expect(respostaQualificacao({ respostas: { finalidade: 'investimento', prazo: 'pesquisando', pagamento: 'avista' } })).toMatch(/sem pressa/);
  });

  it('só qualifica quem veio da retomada e ainda não terminou', () => {
    expect(emQualificacao({ tags: ['CCBJ', 'retomada'] })).toBe(true);
    expect(emQualificacao({ tags: ['CCBJ', 'retomada', 'qualificado_retomada'] })).toBe(false);
    expect(emQualificacao({ tags: null })).toBe(false);
    expect(respostasDosSlots({ finalidade: { valor: 'lazer' }, outro: { valor: 'x' } })).toEqual({ finalidade: 'lazer' });
  });

  it('leads importados: administrador e secretária; importar o arquivo, só o administrador', () => {
    expect(podeAbrir('admin', '/leads/importados')).toBe(true);
    expect(podeAbrir('secretario', '/leads/importados')).toBe(true);
    expect(podeAbrir('corretor', '/leads/importados')).toBe(false);
    expect(podeAbrir('admin', '/leads/importar')).toBe(true);
    expect(podeAbrir('secretario', '/leads/importar')).toBe(false);
  });
});

describe('aviso no WhatsApp do José', () => {
  it('lead qualificado: nome, telefone, respostas, quente, link do cliente e do CRM', async () => {
    const { textoAviso } = await import('./autoresposta/avisoWhatsapp');
    const t = textoAviso({ motivo: 'qualificado', leadId: 7, nome: 'Maria', telefone: '5599991112222', empreendimento: 'Condomínio de Chácaras Bom Jardims', resumo: 'Morar · Imediato · Parcelado direto', quente: true, base: 'https://romateccrm.com' });
    expect(t).toMatch(/^✅ \*Lead qualificado pelo robô\* · Condomínio de Chácaras Bom Jardims/);
    expect(t).toContain('👤 Maria · (99) 9 9111-2222');
    expect(t).toContain('📋 Morar · Imediato · Parcelado direto');
    expect(t).toContain('🔥 Quer fechar em até 3 meses');
    expect(t).toContain('https://wa.me/5599991112222');
    expect(t).toContain('https://romateccrm.com/leads/lead/7');
    const v = textoAviso({ motivo: 'visita', leadId: 8, telefone: '5599991113333', empreendimento: 'Bom Jardims', detalhe: '"posso ir sábado?"', base: 'https://x' });
    expect(v).toMatch(/^🚗 \*Cliente pediu visita\*/);
    expect(v).toContain('💬 "posso ir sábado?"');
    expect(v).not.toContain('Sem pressa');
  });
});

describe('motivo da fila parada (tela)', () => {
  it('explica limite do dia, horário e domingo', async () => {
    const { motivoDoRitmo } = await import('./leads/importacaoContatos');
    const ter10h = Date.UTC(2026, 10, 24, 13), ter21h = Date.UTC(2026, 10, 25, 0), dom = Date.UTC(2026, 10, 29, 13);
    expect(motivoDoRitmo({ agora: ter10h, enviadosHoje: 38, temPendente: true })).toMatch(/Limite do dia atingido \(38 de 30/);
    expect(motivoDoRitmo({ agora: ter10h, enviadosHoje: 4, temPendente: true })).toMatch(/Enviando: 4 de 30/);
    expect(motivoDoRitmo({ agora: ter21h, enviadosHoje: 0, temPendente: true })).toMatch(/Fora do horário/);
    expect(motivoDoRitmo({ agora: dom, enviadosHoje: 0, temPendente: true })).toMatch(/Domingo/);
    expect(motivoDoRitmo({ agora: ter10h, enviadosHoje: 0, temPendente: false })).toMatch(/Fila vazia/);
    expect(motivoDoRitmo({ agora: ter10h, enviadosHoje: 0, temPendente: false, temPausado: true })).toMatch(/Pausado por você/);
    const { ritmoAtivo } = await import('./leads/importacaoContatos');
    expect(ritmoAtivo(motivoDoRitmo({ agora: ter10h, enviadosHoje: 4, temPendente: true }))).toBe(true);
    expect(ritmoAtivo(motivoDoRitmo({ agora: ter21h, enviadosHoje: 4, temPendente: true }))).toBe(false);
  });
});
