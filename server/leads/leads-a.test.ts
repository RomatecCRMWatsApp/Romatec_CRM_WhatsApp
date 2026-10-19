import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extrairAtribuicao, mensagemPreenchida, linkWhatsApp, normalizarCodigoCampanha } from './atribuicao';
import { validarSlot, mesclarSlots, slotsPendentes, tagsDoLead, slotsDeRespostas, parseNumeroBR, tipoImovelDe } from './slots';
import { montarAviso, notificarLead, _resetAntiSpam, formatarTelefone, type DadosAviso } from './notificacao';
import { enviarTexto, ZApiError } from './zapiClient';
import { montarAbertura, decidirEntrada, precoPublico, jaProcessada, RODAPE_LGPD } from './inbound';
import { assistenteNome, canaisNotificacao, telefonesNotificacao } from './config';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Atribuição pela mensagem do WhatsApp', () => {
  it('imóvel + campanha → comprador', () => {
    expect(extrairAtribuicao('Olá! Tenho interesse no imóvel IMV-0012 (#IG-OUT26-CHAC). Pode me passar mais informações?'))
      .toEqual({ imovelCodigos: ['IMV-0012'], campanhaCodigo: 'IG-OUT26-CHAC', funilSugerido: 'comprador' });
  });

  it('vários imóveis, minúsculas e repetidos', () => {
    expect(extrairAtribuicao('quero ver imv-0003 e IMV-0007, e de novo IMV-0003').imovelCodigos).toEqual(['IMV-0003', 'IMV-0007']);
  });

  it('"quero vender minha chácara" sem código → proprietário', () => {
    expect(extrairAtribuicao('Boa tarde, quero vender minha chácara').funilSugerido).toBe('proprietario');
    expect(extrairAtribuicao('Olá! Quero vender/avaliar meu imóvel (#IG-CAPT-OUT26).'))
      .toEqual({ imovelCodigos: [], campanhaCodigo: 'IG-CAPT-OUT26', funilSugerido: 'proprietario' });
  });

  it('mensagem comum não tem atribuição', () => {
    expect(extrairAtribuicao('Oi, tudo bem?')).toEqual({ imovelCodigos: [], campanhaCodigo: null, funilSugerido: null });
    expect(extrairAtribuicao(undefined).imovelCodigos).toEqual([]);
  });

  it('mensagem pré-preenchida e link wa.me', () => {
    const m = mensagemPreenchida({ funil: 'comprador', imovelCodigo: 'IMV-0012', campanhaCodigo: 'IG-OUT26-CHAC' });
    expect(m).toBe('Olá! Tenho interesse no imóvel IMV-0012 (#IG-OUT26-CHAC). Pode me passar mais informações?');
    expect(extrairAtribuicao(m).campanhaCodigo).toBe('IG-OUT26-CHAC'); // ida e volta
    expect(mensagemPreenchida({ funil: 'proprietario', campanhaCodigo: 'IG-CAPT' })).toBe('Olá! Quero vender/avaliar meu imóvel (#IG-CAPT).');
    expect(linkWhatsApp('+55 (99) 99181-1246', 'Olá IMV-0001')).toBe('https://wa.me/5599991811246?text=Ol%C3%A1%20IMV-0001');
  });

  it('código de campanha normalizado', () => {
    expect(normalizarCodigoCampanha('#ig out26 chac')).toBe('IG-OUT26-CHAC');
    expect(normalizarCodigoCampanha('ab')).toBeNull();
    expect(normalizarCodigoCampanha('código!')).toBeNull();
  });
});

describe('Slots de qualificação', () => {
  it('valor fora do enum é descartado', () => {
    expect(validarSlot('comprador', 'forma_pagamento', 'À vista')).toBe('a_vista');
    expect(validarSlot('comprador', 'forma_pagamento', 'cartão de crédito')).toBeNull();
    expect(validarSlot('comprador', 'slot_que_nao_existe', 'x')).toBeNull();
    expect(validarSlot('proprietario', 'documentacao', 'escritura sem registro')).toBe('escritura_sem_registro');
  });

  it('números em formato brasileiro', () => {
    expect(parseNumeroBR('R$ 30.000,00')).toBe(30000);
    expect(parseNumeroBR('30 mil')).toBe(30000);
    expect(parseNumeroBR('1,5 milhão')).toBe(1500000);
    expect(parseNumeroBR('150000')).toBe(150000);
    expect(validarSlot('comprador', 'valor_entrada', 'abc')).toBeNull();
  });

  it('obrigatórios condicionais: entrada só se não for à vista; crédito só se financiamento', () => {
    const base = mesclarSlots('comprador', {}, { objetivo: 'morar', forma_pagamento: 'a_vista', prazo_compra: '1_3m', faixa_valor: '200 mil', quer_visita: 'sim' }, 'ia').slots;
    expect(slotsPendentes('comprador', base)).toEqual([]);
    const fin = mesclarSlots('comprador', base, { forma_pagamento: 'financiamento' }, 'ia').slots;
    expect(slotsPendentes('comprador', fin)).toEqual(['valor_entrada', 'credito_aprovado']);
  });

  it('slots rurais só para imóvel rural', () => {
    expect(slotsPendentes('comprador', {}, { tipoImovel: 'rural' })).toContain('rural_atividade');
    expect(slotsPendentes('comprador', {}, { tipoImovel: 'casa' })).not.toContain('rural_atividade');
    expect(slotsPendentes('proprietario', mesclarSlots('proprietario', {}, { tipo_imovel: 'rural' }, 'ia').slots)).toContain('rural_georref');
  });

  it('mesclar guarda fonte e não apaga o que já existe', () => {
    const r1 = mesclarSlots('comprador', {}, { objetivo: 'morar', forma_pagamento: 'xyz' }, 'form', new Date('2026-10-18T10:00:00Z'));
    expect(r1.aceitos).toEqual(['objetivo']);
    expect(r1.recusados).toEqual(['forma_pagamento']);
    const r2 = mesclarSlots('comprador', r1.slots, { quer_visita: 'sim' }, 'manual');
    expect(r2.slots.objetivo).toEqual({ valor: 'morar', fonte: 'form', at: '2026-10-18T10:00:00.000Z' });
    expect(r2.slots.quer_visita.fonte).toBe('manual');
  });

  it('tags de oportunidade do proprietário', () => {
    const s = mesclarSlots('proprietario', {}, { documentacao: 'posse', quer_avaliacao: 'sim' }, 'ia').slots;
    expect(tagsDoLead('proprietario', s)).toEqual(['oportunidade_regularizacao', 'oportunidade_ptam']);
    expect(tagsDoLead('comprador', s)).toEqual([]);
  });

  it('respostas do formulário (Meta/Bom Jardims) e do bot antigo viram slots', () => {
    expect(slotsDeRespostas({ finalidade: 'Lazer de fim de semana', prazo: 'Até 3 meses', pagamento: 'À vista', cidade: 'Imperatriz' }))
      .toEqual({ prazo_compra: '1_3m', forma_pagamento: 'a_vista', regiao_interesse: 'Imperatriz' });
    expect(slotsDeRespostas({ isMoradiaOuInvestimento: 'moradia', entradaDisponivel: 'R$ 20.000', valorImovelPretendido: '250 mil' }))
      .toEqual({ objetivo: 'morar', valor_entrada: '20000', faixa_valor: '250000' });
  });

  it('tipo do cadastro → enum', () => {
    expect(tipoImovelDe('Chácara')).toBe('chacara');
    expect(tipoImovelDe('Fazenda')).toBe('rural');
    expect(tipoImovelDe('Terreno')).toBe('lote_urbano');
    expect(tipoImovelDe('')).toBeNull();
  });
});

describe('Configuração', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('nome do assistente: padrão "Assistente Romatec", configurável e nunca ZAYRA por padrão', () => {
    delete process.env.ASSISTENTE_NOME;
    expect(assistenteNome()).toBe('Assistente Romatec');
    process.env.ASSISTENTE_NOME = 'Rô';
    expect(assistenteNome()).toBe('Rô');
  });

  it('canais: padrão telegram; aceita whatsapp e lista; ignora lixo', () => {
    delete process.env.NOTIFY_CANAIS;
    expect(canaisNotificacao()).toEqual(['telegram']);
    process.env.NOTIFY_CANAIS = 'whatsapp';
    expect(canaisNotificacao()).toEqual(['whatsapp']);
    process.env.NOTIFY_CANAIS = 'telegram, whatsapp, sms';
    expect(canaisNotificacao()).toEqual(['telegram', 'whatsapp']);
    process.env.NOTIFY_CANAIS = 'sms';
    expect(canaisNotificacao()).toEqual(['telegram']);
  });

  it('telefones do José', () => {
    process.env.NOTIFY_PHONES = '+55 99 99181-1246, +5599981234567';
    expect(telefonesNotificacao()).toEqual(['5599991811246', '5599981234567']);
  });
});

describe('Aviso ao José', () => {
  beforeEach(() => _resetAntiSpam());
  const base: DadosAviso = {
    tipo: 'novo_lead', leadId: 7, nome: 'Maria Souza', telefone: '5599988887777', funil: 'comprador', score: 62, classe: 'morno',
    imovel: { codigo: 'IMV-0012', titulo: 'Chácara 5.000 m² Nova Esperança', preco: 85000 },
    origem: 'Meta Lead Ads', campanhaCodigo: 'IG-OUT26-CHAC', detalhes: ['💰 Financiamento (crédito em análise)'],
  };

  it('layout do §9', () => {
    const t = montarAviso(base);
    expect(t).toContain('🟢 NOVO LEAD — COMPRADOR · Score 62 (MORNO 🟡)');
    expect(t).toContain('👤 Maria Souza · +55 99 9 8888-7777');
    expect(t).toContain('🏡 IMV-0012 — Chácara 5.000 m² Nova Esperança (R$');
    expect(t).toContain('📣 Origem: Meta Lead Ads · #IG-OUT26-CHAC');
    expect(t).toContain('💬 Responder: https://wa.me/5599988887777');
    expect(formatarTelefone('5599991811246')).toBe('+55 99 9 9181-1246');
  });

  it('sem preço (exibir_preco = false) → "Valor sob consulta"', () => {
    expect(montarAviso({ ...base, imovel: { ...base.imovel!, preco: null } })).toContain('(Valor sob consulta)');
  });

  it('proprietário mostra o imóvel que quer vender e as tags', () => {
    const t = montarAviso({ ...base, funil: 'proprietario', imovel: null, imovelProprietario: 'Fazenda · Grajaú/MA · 120 ha · Doc: posse', tags: ['oportunidade_regularizacao'] });
    expect(t).toContain('PROPRIETÁRIO');
    expect(t).toContain('🏠 Quer vender: Fazenda · Grajaú/MA · 120 ha · Doc: posse');
    expect(t).toContain('🏷️ Tags: oportunidade_regularizacao');
  });

  it('mesmo texto no Telegram e no WhatsApp', async () => {
    const tg = vi.fn(async () => {}); const wa = vi.fn(async () => {});
    const r = await notificarLead(base, { canais: ['telegram', 'whatsapp'], enviadores: { telegram: tg, whatsapp: wa } });
    expect(r).toMatchObject({ enviado: true, canais: ['telegram', 'whatsapp'] });
    expect(tg.mock.calls[0][0]).toBe(wa.mock.calls[0][0]);
  });

  it('WhatsApp falhou → cai no Telegram sem quebrar', async () => {
    const tg = vi.fn(async () => {});
    const wa = vi.fn(async () => { throw new ZApiError('ZAPI_HTTP_400', 'Instance not found'); });
    const r = await notificarLead(base, { canais: ['whatsapp'], enviadores: { telegram: tg, whatsapp: wa } });
    expect(r.enviado).toBe(true);
    expect(r.canais).toEqual(['telegram']);
    expect(r.erros[0]).toContain('Instance not found');
  });

  it('tudo falhou → não lança, só reporta', async () => {
    const falha = vi.fn(async () => { throw new Error('fora do ar'); });
    const r = await notificarLead(base, { canais: ['telegram'], enviadores: { telegram: falha } });
    expect(r).toMatchObject({ enviado: false, canais: [] });
  });

  it('anti-spam: 1 aviso por lead a cada 10 min, exceto quente/visita/humano', async () => {
    const tg = vi.fn(async () => {});
    const t0 = 1_000_000;
    await notificarLead(base, { canais: ['telegram'], enviadores: { telegram: tg }, now: t0 });
    expect((await notificarLead({ ...base, tipo: 'recorrente' }, { canais: ['telegram'], enviadores: { telegram: tg }, now: t0 + 60_000 })).pulado).toBe('anti_spam');
    expect((await notificarLead({ ...base, tipo: 'quente' }, { canais: ['telegram'], enviadores: { telegram: tg }, now: t0 + 60_000 })).enviado).toBe(true);
    expect((await notificarLead({ ...base, tipo: 'recorrente' }, { canais: ['telegram'], enviadores: { telegram: tg }, now: t0 + 11 * 60_000 })).enviado).toBe(true);
  });
});

describe('Cliente Z-API (mock)', () => {
  const creds = { instanceId: 'INST', token: 'TOK', clientToken: 'CT' };

  it('envia texto com Client-Token e devolve o messageId', async () => {
    const fetchImpl = vi.fn(async (..._a: any[]) => json({ messageId: 'abc123' }));
    expect(await enviarTexto('+55 99 99181-1246', 'Olá', { creds, fetchImpl: fetchImpl as any })).toBe('abc123');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.z-api.io/instances/INST/token/TOK/send-text');
    expect(init.headers['Client-Token']).toBe('CT');
    expect(JSON.parse(init.body)).toEqual({ phone: '5599991811246', message: 'Olá' });
  });

  it('erros viram ZApiError com código', async () => {
    await expect(enviarTexto('5599991811246', 'x', { creds: {} })).rejects.toMatchObject({ codigo: 'ZAPI_NAO_CONFIGURADA' });
    await expect(enviarTexto('123', 'x', { creds })).rejects.toMatchObject({ codigo: 'TELEFONE_INVALIDO' });
    const notFound = vi.fn(async () => json({ error: 'Instance not found' }, 400));
    await expect(enviarTexto('5599991811246', 'x', { creds, fetchImpl: notFound as any })).rejects.toMatchObject({ codigo: 'ZAPI_HTTP_400', message: 'Instance not found' });
    const rede = vi.fn(async () => { throw new Error('ECONNRESET'); });
    await expect(enviarTexto('5599991811246', 'x', { creds, fetchImpl: rede as any })).rejects.toMatchObject({ codigo: 'ZAPI_REDE' });
  });

  it('timeout', async () => {
    const lento = vi.fn((_u: any, init: any) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    await expect(enviarTexto('5599991811246', 'x', { creds, fetchImpl: lento as any, timeoutMs: 20 })).rejects.toMatchObject({ codigo: 'ZAPI_TIMEOUT' });
  });
});

describe('Entrada pelo WhatsApp', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  const imovel = { id: 12, codigo: 'IMV-0012', titulo: 'Chácara Nova Esperança', cidade: 'Açailândia', areaM2: 5000, preco: 85000, exibirPreco: true, publicSlug: 'chacara-nova' };

  it('abertura do comprador com ficha e LGPD, sem "ZAYRA"', () => {
    delete process.env.ASSISTENTE_NOME;
    const m = montarAbertura({ funil: 'comprador', nome: 'maria souza', imovel });
    expect(m).toContain('Olá, Maria! Aqui é Assistente Romatec, da Romatec Consultoria Total.');
    expect(m).toContain('*Chácara Nova Esperança* (IMV-0012)');
    expect(m).toContain('📐 5.000 m²');
    expect(m).toMatch(/💰 R\$\s?85\.000/);
    expect(m).toContain(RODAPE_LGPD);
    expect(m).not.toMatch(/zayra/i);
  });

  it('exibir_preco = false → "Valor sob consulta" na abertura', () => {
    expect(montarAbertura({ funil: 'comprador', imovel: { ...imovel, exibirPreco: false } })).toContain('💰 Valor sob consulta');
    expect(precoPublico({ preco: null, exibirPreco: true })).toBe('Valor sob consulta');
  });

  it('abertura do proprietário chama o corretor', () => {
    const m = montarAbertura({ funil: 'proprietario', nome: 'Cliente' });
    expect(m).toContain('Olá! Aqui é');
    expect(m).toContain('José Romário (CRECI/MA 4.705)');
  });

  it('decisão: novo, recorrente com imóvel novo, nada a fazer', () => {
    expect(decidirEntrada({ temAtribuicao: false, funilSugerido: null, leadExiste: true, imoveisDoLead: [], imoveisMensagem: [] })).toEqual({ acao: 'nenhuma' });
    expect(decidirEntrada({ temAtribuicao: false, funilSugerido: null, leadExiste: false, imoveisDoLead: [], imoveisMensagem: [] })).toEqual({ acao: 'novo', funil: 'comprador', canal: 'whatsapp_direto' });
    expect(decidirEntrada({ temAtribuicao: true, funilSugerido: null, campanhaCanal: 'meta_ctwa', leadExiste: false, imoveisDoLead: [], imoveisMensagem: [12] }))
      .toEqual({ acao: 'novo', funil: 'comprador', canal: 'meta_ctwa' });
    expect(decidirEntrada({ temAtribuicao: true, funilSugerido: 'proprietario', leadExiste: false, imoveisDoLead: [], imoveisMensagem: [] }))
      .toEqual({ acao: 'novo', funil: 'proprietario', canal: 'whatsapp_direto' });
    expect(decidirEntrada({ temAtribuicao: true, funilSugerido: 'comprador', leadExiste: true, imoveisDoLead: [12], imoveisMensagem: [12, 15] }))
      .toEqual({ acao: 'existente', imoveisNovos: [15], canal: 'whatsapp_direto' });
  });

  it('webhook repetido (mesmo messageId) é ignorado', () => {
    expect(jaProcessada('MSG-1')).toBe(false);
    expect(jaProcessada('MSG-1')).toBe(true);
    expect(jaProcessada(undefined)).toBe(false);
  });
});
