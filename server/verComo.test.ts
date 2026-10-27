import { describe, expect, it } from 'vitest';
import { aplicarVerComo, bloquearEscritaRest, idPedido, MENSAGEM_SO_LEITURA } from './_core/verComo';
import { router, protectedProcedure, publicProcedure } from './_core/trpc';

const ADMIN = { id: 1, name: 'José', role: 'admin', perfil: null, ativo: true } as any;
const SECRETARIA = { id: 2, name: 'Sec', role: 'user', perfil: 'secretario', ativo: true } as any;
const CORRETOR = { id: 3, name: 'Ana', role: 'user', perfil: 'corretor', ativo: true } as any;
const EMPREENDEDORA = { id: 4, name: 'Valma', role: 'user', perfil: 'empreendedor', ativo: true } as any;
const DESATIVADO = { id: 5, name: 'Ex', role: 'user', perfil: 'corretor', ativo: false } as any;
const OUTRO_ADMIN = { id: 6, name: 'Adm2', role: 'admin', perfil: null, ativo: true } as any;
const POR_ID: Record<number, any> = { 1: ADMIN, 2: SECRETARIA, 3: CORRETOR, 4: EMPREENDEDORA, 5: DESATIVADO, 6: OUTRO_ADMIN };
const carregar = async (id: number) => POR_ID[id] ?? null;
const req = (id?: string, extra: Record<string, unknown> = {}) => ({ headers: id ? { 'x-ver-como': id } : {}, ...extra }) as any;

describe('ver como — quem pode e quem pode ser visto', () => {
  it('administrador vê como corretor, secretária e empreendedora; a requisição fica marcada', async () => {
    for (const alvo of [CORRETOR, SECRETARIA, EMPREENDEDORA]) {
      const r = req(String(alvo.id));
      expect(await aplicarVerComo(r, ADMIN, carregar)).toBe(alvo);
      expect(r.verComo).toEqual({ adminId: 1, adminNome: 'José', alvoId: alvo.id });
    }
  });
  it('quem não é administrador manda o cabeçalho e continua sendo ele mesmo', async () => {
    const r = req('3');
    expect(await aplicarVerComo(r, SECRETARIA, carregar)).toBe(SECRETARIA);
    expect(await aplicarVerComo(req('4'), CORRETOR, carregar)).toBe(CORRETOR);
    expect(r.verComo).toBeUndefined();
  });
  it('não vê como outro administrador, desativado, inexistente ou com cabeçalho inválido', async () => {
    expect(await aplicarVerComo(req('6'), ADMIN, carregar)).toBe(ADMIN);
    expect(await aplicarVerComo(req('5'), ADMIN, carregar)).toBe(ADMIN);
    expect(await aplicarVerComo(req('999'), ADMIN, carregar)).toBe(ADMIN);
    expect(await aplicarVerComo(req('3 OR 1=1'), ADMIN, carregar)).toBe(ADMIN);
    expect(idPedido(req('abc'))).toBeNull();
    expect(await aplicarVerComo(req('3'), { ...ADMIN, ativo: false }, carregar)).toMatchObject({ id: 1 });
  });
});

describe('ver como — só leitura', () => {
  const app = router({
    ler: publicProcedure.query(() => 'ok'),
    gravar: publicProcedure.mutation(() => 'gravou'),
    gravarLogado: protectedProcedure.mutation(() => 'gravou'),
  });
  it('tRPC: consulta passa, qualquer ação é recusada com o aviso', async () => {
    const caller = app.createCaller({ req: {} as any, res: {} as any, user: CORRETOR, verComo: { adminId: 1, adminNome: 'José', alvoId: 3 } });
    expect(await caller.ler()).toBe('ok');
    await expect(caller.gravar()).rejects.toThrow(MENSAGEM_SO_LEITURA);
    await expect(caller.gravarLogado()).rejects.toThrow(MENSAGEM_SO_LEITURA);
    // Fora do modo, a ação segue normal
    const normal = app.createCaller({ req: {} as any, res: {} as any, user: ADMIN, verComo: null });
    expect(await normal.gravar()).toBe('gravou');
  });
  it('REST: com o cabeçalho, só GET passa; webhooks e tRPC ficam com o bloqueio próprio', () => {
    const rodar = (method: string, path: string, id?: string) => {
      let passou = false, status = 0;
      const res: any = { status: (s: number) => { status = s; return res; }, json: () => res };
      bloquearEscritaRest({ method, path, headers: id ? { 'x-ver-como': id } : {} } as any, res, () => { passou = true; });
      return passou ? 'passou' : status;
    };
    expect(rodar('GET', '/api/financeiro/despesas.xlsx', '3')).toBe('passou');
    expect(rodar('POST', '/api/usuarios/3/documentos', '3')).toBe(403);
    expect(rodar('PUT', '/api/materiais/upload', '3')).toBe(403);
    expect(rodar('DELETE', '/api/qualquer', '3')).toBe(403);
    expect(rodar('POST', '/api/trpc/x', '3')).toBe('passou');
    expect(rodar('POST', '/api/webhook/zapi', '3')).toBe('passou');
    expect(rodar('POST', '/api/usuarios/3/documentos')).toBe('passou'); // sem o modo, normal
  });
});
