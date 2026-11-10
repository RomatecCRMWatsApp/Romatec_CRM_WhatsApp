import { describe, expect, it } from 'vitest';
import { releaseParaPerfil } from '../shared/releases';
import { destinatarios } from '../shared/notificacoes';

describe('quem recebe cada aviso', () => {
  it('atualização do sistema: escritório sempre; corretor/empreendedor só quando a versão é para eles', () => {
    for (const p of ['admin', 'secretario']) expect(releaseParaPerfil('equipe', p)).toBe(true);
    expect(releaseParaPerfil('equipe', 'corretor')).toBe(false);
    // "Só administrador" (contrato de gestão, taxas, valores): nem a secretária vê
    expect(releaseParaPerfil('admin', 'admin')).toBe(true);
    for (const p of ['secretario', 'corretor', 'empreendedor', null]) expect(releaseParaPerfil('admin', p as any)).toBe(false);
    expect(releaseParaPerfil('corretor', 'secretario')).toBe(true);
    expect(releaseParaPerfil('equipe', 'empreendedor')).toBe(false);
    expect(releaseParaPerfil('corretor', 'corretor')).toBe(true);
    expect(releaseParaPerfil('corretor', 'empreendedor')).toBe(false);
    expect(releaseParaPerfil('usuarios', 'empreendedor')).toBe(true);
    expect(releaseParaPerfil('todos', 'corretor')).toBe(true);
  });

  it('novidade do empreendimento: corretor com o empreendimento, o empreendedor dele e o escritório; quem fez fica de fora', () => {
    const usuarios = [
      { id: 1, role: 'admin', perfil: 'admin' }, { id: 2, perfil: 'secretario' }, { id: 3, perfil: 'corretor' }, { id: 4, perfil: 'corretor' },
      { id: 5, perfil: 'empreendedor', empreendimentoSlug: 'bom-jardims' }, { id: 6, perfil: 'empreendedor', empreendimentoSlug: 'outro' },
    ];
    const acessos = [{ usuarioId: 3, tipo: 'empreendimento', refId: 9 }] as any;
    const perfil = (u: any) => u.perfil;
    const ids = destinatarios('empreendimento', usuarios as any, acessos, perfil, { empreendimentoId: 9, empreendimentoSlug: 'bom-jardims', autorId: 2 });
    expect(ids).toContain(1);
    expect(ids).toContain(5);
    expect(ids).not.toContain(2); // quem fez
    expect(ids).not.toContain(6); // empreendedor de outro empreendimento
    expect(ids).toContain(3);     // corretor com o empreendimento liberado
  });
});
