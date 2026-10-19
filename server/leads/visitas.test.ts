import { describe, it, expect } from 'vitest';
import { etapaDepoisDaVisita, acoesDaVisita, quandoPorExtenso, mensagemLembrete, respostaConfirma } from './visitas';

const H = 3600_000;
// 2026-10-19 é segunda-feira; 13h UTC = 10h em Açailândia
const seg10h = Date.UTC(2026, 9, 19, 13);

describe('Funil depois da visita', () => {
  it('agendar leva para "Visita agendada"; realizada para "Visitou"; não volta etapa', () => {
    expect(etapaDepoisDaVisita('qualificado', 'agendada')).toBe('visita_agendada');
    expect(etapaDepoisDaVisita(null, 'agendada')).toBe('visita_agendada');
    expect(etapaDepoisDaVisita('visita_agendada', 'realizada')).toBe('visitou');
    expect(etapaDepoisDaVisita('proposta', 'agendada')).toBeNull();
    expect(etapaDepoisDaVisita('proposta', 'realizada')).toBeNull();
    expect(etapaDepoisDaVisita('perdido', 'agendada')).toBeNull();
    expect(etapaDepoisDaVisita('qualificado', 'cancelada')).toBeNull();
  });
});

describe('Avisos automáticos', () => {
  const base = { status: 'agendada', createdAt: seg10h - 3 * 24 * H };
  it('véspera: lembra o cliente (só com 12 h de antecedência e das 8h às 20h)', () => {
    expect(acoesDaVisita({ ...base, quando: seg10h + 20 * H }, seg10h)).toEqual(['lembrar_cliente']);
    expect(acoesDaVisita({ ...base, quando: seg10h + 30 * H }, seg10h)).toEqual([]); // ainda longe
    expect(acoesDaVisita({ ...base, quando: seg10h + 10 * H, createdAt: seg10h - H }, seg10h)).toEqual([]); // marcada com menos de 12 h
    expect(acoesDaVisita({ ...base, quando: seg10h + 20 * H, lembreteClienteAt: new Date() }, seg10h)).toEqual([]); // já foi
    const seg22h = Date.UTC(2026, 9, 20, 1);
    expect(acoesDaVisita({ ...base, quando: seg22h + 12 * H }, seg22h)).toEqual([]); // de noite não
  });
  it('2 h antes: avisa o corretor (também se confirmada)', () => {
    expect(acoesDaVisita({ ...base, quando: seg10h + H, lembreteClienteAt: new Date() }, seg10h)).toEqual(['avisar_corretor']);
    expect(acoesDaVisita({ ...base, status: 'confirmada', quando: seg10h + H }, seg10h)).toEqual(['avisar_corretor']);
  });
  it('3 h depois sem resultado: pergunta ao corretor como foi', () => {
    const v = { ...base, quando: seg10h - 4 * H, lembreteClienteAt: new Date(), avisoCorretorAt: new Date() };
    expect(acoesDaVisita(v, seg10h)).toEqual(['pedir_resultado']);
    expect(acoesDaVisita({ ...v, resultadoPedidoAt: new Date() }, seg10h)).toEqual([]);
  });
  it('visita fechada (realizada, não veio, cancelada) não gera aviso', () => {
    for (const status of ['realizada', 'nao_veio', 'cancelada']) expect(acoesDaVisita({ ...base, status, quando: seg10h + H }, seg10h)).toEqual([]);
  });
});

describe('Mensagens', () => {
  it('data por extenso no horário do Maranhão', () => {
    expect(quandoPorExtenso(seg10h + 5 * H, seg10h)).toBe('hoje às 15h');
    expect(quandoPorExtenso(seg10h + 24 * H - 30 * 60_000, seg10h)).toBe('amanhã às 9h30');
    expect(quandoPorExtenso(seg10h + 4 * 24 * H, seg10h)).toBe('sexta, 23/10 às 10h');
  });
  it('lembrete pede SIM, sem preço e sem escassez', () => {
    const m = mensagemLembrete({ nome: 'maria souza', quando: seg10h + 24 * H, local: 'Portaria do condomínio', imovel: 'Bom Jardims' }, seg10h);
    expect(m).toMatch(/^Oi, Maria! Passando para lembrar da sua visita amanhã às 10h \(Bom Jardims — Portaria do condomínio\)/);
    expect(m).toContain('*SIM*');
    expect(m).not.toMatch(/R\$|últimas|poucas unidades|reservad/i);
  });
  it('o que conta como confirmação', () => {
    for (const t of ['sim', 'Sim!', 'SIM', 'confirmo', 'Confirmado', 'ok', 'vou sim', '👍', 'combinado']) expect(respostaConfirma(t)).toBe(true);
    for (const t of ['simone', 'sim, mas pode ser às 16h?', 'não', 'quero remarcar', 'oi', '']) expect(respostaConfirma(t)).toBe(false);
  });
});
