import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  destinatarios, eventoDaMudanca, inscricaoExpirada, SOM_POR_TIPO, textoNotificacao, TIPOS_NOTIFICACAO, urlDaNotificacao,
  type PayloadPush, type UsuarioDestino,
} from '../shared/notificacoes';
import { perfilDe, podeChamar } from '../shared/equipe';

// Banco local em memória (SQLite) para o registro/cancelamento das inscrições de push
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
const N = await import('./notificacoes');

const USUARIOS: UsuarioDestino[] = [
  { id: 1, role: 'admin', perfil: null, ativo: true },
  { id: 2, role: 'user', perfil: 'secretario', ativo: true },
  { id: 3, role: 'user', perfil: 'corretor', ativo: true },                 // habilitado no empreendimento 1
  { id: 4, role: 'user', perfil: 'corretor', ativo: true },                 // só no empreendimento 2
  { id: 5, role: 'user', perfil: 'empreendedor', ativo: true, empreendimentoSlug: 'bom-jardims' },
  { id: 6, role: 'user', perfil: 'empreendedor', ativo: true, empreendimentoSlug: 'outro' },
  { id: 7, role: 'user', perfil: 'corretor', ativo: false },                // inativo
];
const ACESSOS = [
  { usuarioId: 3, tipo: 'empreendimento' as const, refId: 1 },
  { usuarioId: 4, tipo: 'empreendimento' as const, refId: 2 },
  { usuarioId: 7, tipo: 'empreendimento' as const, refId: 1 },
];
const BJ = { empreendimentoId: 1, empreendimentoSlug: 'bom-jardims' };

/** Repositório falso: guarda em memória o que seria gravado */
function repoFalso(inscricoes: N.InscricaoPush[] = []) {
  const gravadas: N.NovaNotificacao[] = [];
  const removidas: string[] = [];
  const repo: N.RepoNotificacoes = {
    usuarios: async () => USUARIOS,
    acessos: async () => ACESSOS,
    inserir: async l => { gravadas.push(...l); return l.map((_, k) => gravadas.length - l.length + k + 1); },
    jaEmitida: async (tipo, chave) => gravadas.some(g => g.tipo === tipo && g.chave === chave),
    inscricoesDe: async ids => inscricoes.filter(i => ids.includes(i.usuarioId)),
    salvarInscricao: async () => {},
    removerInscricao: async e => { removidas.push(e); },
  };
  return { repo, gravadas, removidas };
}
const sub = (usuarioId: number, n = usuarioId): N.InscricaoPush => ({ usuarioId, endpoint: `https://push.exemplo/${n}`, p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) });

describe('notificações — qual mudança do lote vira evento', () => {
  it('reserva, venda/contrato e liberação; sem repetir dentro do mesmo grupo', () => {
    expect(eventoDaMudanca('disponivel', 'reservado')).toBe('reserva');
    expect(eventoDaMudanca(null, 'entrada')).toBe('reserva');
    expect(eventoDaMudanca('reservado', 'entrada')).toBeNull();          // continua reservado (agora com sinal)
    expect(eventoDaMudanca('entrada', 'vendido_parcelado')).toBe('venda_contrato');
    expect(eventoDaMudanca('disponivel', 'vendido_avista')).toBe('venda_contrato');
    expect(eventoDaMudanca('vendido_parcelado', 'quitado')).toBeNull();   // já era venda
    expect(eventoDaMudanca('reservado', 'disponivel')).toBe('liberacao');
    expect(eventoDaMudanca('bloqueado', 'disponivel')).toBe('liberacao');
    expect(eventoDaMudanca('disponivel', 'interesse')).toBeNull();
    expect(eventoDaMudanca('disponivel', 'disponivel')).toBeNull();
  });

  it('textos do sininho/push', () => {
    expect(textoNotificacao('atualizacao_sistema', { versao: '1.8.0' }).mensagem).toBe('Sistema atualizado para v1.8.0');
    expect(textoNotificacao('liberacao', { lote: 'B11', empreendimento: 'Bom Jardims', autor: 'Ana' }))
      .toEqual({ titulo: 'Chácara B11 · Bom Jardims liberada', mensagem: 'A Chácara B11 · Bom Jardims voltou a ficar disponível (por Ana) — oportunidade aberta.' });
  });
});

describe('notificações — destinatários (escopo de permissão)', () => {
  it('lote: admin, secretário, corretor habilitado e o empreendedor do empreendimento; autor e inativo fora', () => {
    expect(destinatarios('reserva', USUARIOS, ACESSOS, perfilDe as any, { ...BJ, autorId: 2 })).toEqual([1, 3, 5]);
  });
  it('corretor NÃO recebe de empreendimento não habilitado', () => {
    const ids = destinatarios('venda_contrato', USUARIOS, ACESSOS, perfilDe as any, { ...BJ, autorId: null });
    expect(ids).toContain(3);
    expect(ids).not.toContain(4);
    expect(ids).not.toContain(6);
    expect(destinatarios('liberacao', USUARIOS, ACESSOS, perfilDe as any, { empreendimentoId: 2, empreendimentoSlug: 'outro' })).toEqual([1, 2, 4, 6]);
  });
  it('sistema atualizado: todos os ativos', () => {
    expect(destinatarios('atualizacao_sistema', USUARIOS, [], perfilDe as any)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('toque abre o lote (equipe) ou o painel do empreendedor', () => {
    expect(urlDaNotificacao('reserva', { empreendimentoSlug: 'bom-jardims', lote: 'B11' }, 'corretor')).toBe('/empreendimentos/bom-jardims?lote=B11');
    expect(urlDaNotificacao('reserva', { empreendimentoSlug: 'bom-jardims', lote: 'B11' }, 'empreendedor')).toBe('/empreendedor?notificacoes=1');
    expect(urlDaNotificacao('atualizacao_sistema', {}, 'admin')).toBe('/dashboard?notificacoes=1');
  });
});

describe('notificações — evento gera sininho e push para os destinatários certos', () => {
  it('reserva no Bom Jardims: grava e manda push só para quem pode ver; corretor de outro empreendimento fica de fora', async () => {
    const { repo, gravadas } = repoFalso([sub(1), sub(3), sub(4), sub(5)]);
    const enviados: [number, PayloadPush][] = [];
    const r = await N.notificarMudancaLote({ loteId: 9, codigo: 'B11', ...BJ, empreendimentoNome: 'Bom Jardims', de: 'disponivel', para: 'reservado', autorId: 2, autorNome: 'Ana' },
      repo, async (i, p) => { enviados.push([i.usuarioId, p]); });
    expect(r?.tipo).toBe('reserva');
    expect(gravadas.map(g => g.usuarioId)).toEqual([1, 3, 5]);
    expect(enviados.map(e => e[0]).sort()).toEqual([1, 3, 5]);              // o 4 tem push, mas não tem acesso
    const doCorretor = enviados.find(e => e[0] === 3)![1];
    expect(doCorretor).toMatchObject({ tipo: 'reserva', titulo: 'Chácara B11 · Bom Jardims reservada', url: '/empreendimentos/bom-jardims?lote=B11' });
    expect(doCorretor.id).toBeGreaterThan(0);
    expect(enviados.find(e => e[0] === 5)![1].url).toBe('/empreendedor?notificacoes=1');
  });

  it('mudança que não é evento não grava nada', async () => {
    const { repo, gravadas } = repoFalso();
    expect(await N.notificarMudancaLote({ loteId: 9, codigo: 'B11', ...BJ, de: 'vendido_parcelado', para: 'quitado' }, repo, null)).toBeNull();
    expect(gravadas).toHaveLength(0);
  });

  it('push recusado com 410/404 apaga a inscrição; outros erros não', async () => {
    const { repo, removidas } = repoFalso([sub(1, 10), sub(1, 11), sub(3, 30)]);
    const r = await N.notificarMudancaLote({ loteId: 9, codigo: 'A01', ...BJ, de: 'reservado', para: 'disponivel' }, repo, async i => {
      if (i.endpoint.endsWith('/10')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      if (i.endpoint.endsWith('/30')) throw Object.assign(new Error('Erro do serviço'), { statusCode: 500 });
    });
    expect(removidas).toEqual(['https://push.exemplo/10']);
    expect(r).toMatchObject({ tipo: 'liberacao', enviados: 1, removidos: 1 });
    expect(inscricaoExpirada(404)).toBe(true);
    expect(inscricaoExpirada(429)).toBe(false);
  });

  it('sistema atualizado: uma vez por versão', async () => {
    const { repo, gravadas } = repoFalso();
    await N.notificarAtualizacaoSistema('1.8.0', repo, null);
    await N.notificarAtualizacaoSistema('1.8.0', repo, null);
    expect(gravadas).toHaveLength(6);
    expect(gravadas[0]).toMatchObject({ tipo: 'atualizacao_sistema', chave: 'v1.8.0', mensagem: 'Sistema atualizado para v1.8.0' });
    await N.notificarAtualizacaoSistema('1.8.1', repo, null);
    expect(gravadas).toHaveLength(12);
  });
});

describe('Web Push — registro e cancelamento da inscrição (banco)', () => {
  let db: any, schema: any;
  beforeAll(async () => {
    db = await (await import('./db')).getDb();
    schema = await import('../drizzle/schema');
  });
  const linhas = async () => (await db.select().from(schema.pushInscricoes)) as any[];

  it('inscrever é idempotente por aparelho; outra pessoa no mesmo aparelho assume a inscrição', async () => {
    const repo = N.repoBanco();
    await repo.salvarInscricao(sub(3, 1), 'Chrome Android');
    await repo.salvarInscricao(sub(3, 1), 'Chrome Android');
    expect(await linhas()).toHaveLength(1);
    await repo.salvarInscricao({ ...sub(4, 1), p256dh: 'q'.repeat(20) }, 'Chrome Android');
    const [l] = await linhas();
    expect(l).toMatchObject({ usuarioId: 4, p256dh: 'q'.repeat(20), endpoint: 'https://push.exemplo/1' });
    expect(l.endpointHash).toHaveLength(64);
    expect((await repo.inscricoesDe([4])).map(i => i.endpoint)).toEqual(['https://push.exemplo/1']);
    expect(await repo.inscricoesDe([3])).toEqual([]);
  });

  it('cancelar só apaga a inscrição da própria pessoa', async () => {
    const repo = N.repoBanco();
    await repo.salvarInscricao(sub(5, 2), null);
    await repo.removerInscricao('https://push.exemplo/2', 3);   // não é dele
    expect(await linhas()).toHaveLength(2);
    await repo.removerInscricao('https://push.exemplo/2', 5);
    expect((await linhas()).map(l => l.usuarioId)).toEqual([4]);
  });

  it('sininho: grava, lista e marca como lida só as da pessoa', async () => {
    const repo = N.repoBanco();
    await db.insert(schema.users).values([{ id: 1, openId: 'a', name: 'José' }, { id: 3, openId: 'c', name: 'Maria' }] as any).catch(() => {});
    const ids = await repo.inserir([
      { usuarioId: 3, tipo: 'reserva', titulo: 'T1', mensagem: 'M1', url: '/x' },
      { usuarioId: 3, tipo: 'liberacao', titulo: 'T2', mensagem: 'M2', url: '/y' },
      { usuarioId: 1, tipo: 'reserva', titulo: 'T3', mensagem: 'M3', url: '/z' },
    ]);
    expect(ids.every(i => i > 0)).toBe(true);
    let l = await N.listarDoUsuario(3);
    expect(l.naoLidas).toBe(2);
    expect(l.itens.map(i => i.titulo)).toEqual(['T2', 'T1']);
    await N.marcarLidas(3, [ids[2]]);                            // é do usuário 1: não mexe
    expect((await N.listarDoUsuario(1)).naoLidas).toBe(1);
    await N.marcarLidas(3, [ids[0]]);
    expect((await N.listarDoUsuario(3)).naoLidas).toBe(1);
    await N.marcarLidas(3);
    l = await N.listarDoUsuario(3);
    expect(l.naoLidas).toBe(0);
    expect(l.itens.every(i => i.lida)).toBe(true);
  });
});

describe('notificações — sons e acesso', () => {
  it('cada tipo tem um som próprio e o arquivo existe (trocável em client/public/sons)', () => {
    const sons = TIPOS_NOTIFICACAO.map(t => SOM_POR_TIPO[t]);
    expect(new Set(sons).size).toBe(TIPOS_NOTIFICACAO.length);
    const conteudos = sons.map(s => {
      const arq = path.resolve(__dirname, '../client/public', s.slice(1));
      expect(fs.existsSync(arq)).toBe(true);
      const b = fs.readFileSync(arq);
      expect(b.subarray(0, 4).toString()).toBe('RIFF');
      return b.toString('base64');
    });
    expect(new Set(conteudos).size).toBe(sons.length);              // sons de fato diferentes
  });
  it('todos os perfis (inclusive empreendedor) usam o sininho; o service worker trata push e toque', () => {
    for (const p of ['admin', 'secretario', 'corretor', 'empreendedor'] as const) {
      expect(podeChamar(p, 'notificacoes.listar')).toBe(true);
      expect(podeChamar(p, 'notificacoes.inscreverPush')).toBe(true);
    }
    const sw = fs.readFileSync(path.resolve(__dirname, '../client/public/sw.js'), 'utf8');
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain("addEventListener('notificationclick'");
    expect(sw).toContain('openWindow');
  });
  it('sem chaves VAPID o push fica desligado (o sininho continua)', () => {
    const [a, b] = [process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY];
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    expect(N.pushConfigurado()).toBe(false);
    process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv';
    expect(N.pushConfigurado()).toBe(true);
    process.env.VAPID_PUBLIC_KEY = a ?? ''; process.env.VAPID_PRIVATE_KEY = b ?? '';
  });
});
