import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compararVersao, lerReleaseNotes, problemaRelease, releaseParaPerfil } from '../shared/releases';
import { podeChamar } from '../shared/equipe';

const MD = `# Notas

## 1.4.0 — 2026-10-24
tipo: minor
obrigatoria: sim
titulo: Cadastro completo

### Novo
- Foto de perfil
- Perfis de acesso

### Correções
- Login aceita CPF

## 1.3.2 - 2026-10-20
### Avisos
- Manutenção às 22h
`;

describe('notas de versão (RELEASE_NOTES.md)', () => {
  it('lê os blocos do topo para baixo, com meta e seções', () => {
    const [a, b] = lerReleaseNotes(MD);
    expect(a).toEqual({
      versao: '1.4.0', data: '2026-10-24', tipo: 'minor', obrigatoria: true, titulo: 'Cadastro completo', publico: 'todos',
      itens: { novo: ['Foto de perfil', 'Perfis de acesso'], melhorias: [], correcoes: ['Login aceita CPF'], avisos: [] },
    });
    expect(b).toMatchObject({ versao: '1.3.2', tipo: 'patch', obrigatoria: false, titulo: 'Atualização 1.3.2', itens: { avisos: ['Manutenção às 22h'] } });
  });

  it('recusa cabeçalho inválido e versão sem itens', () => {
    expect(() => lerReleaseNotes('## 1.4 — hoje\n### Novo\n- x')).toThrow(/Cabeçalho inválido/);
    expect(() => lerReleaseNotes('## 1.4.0 — 2026-10-24\ntitulo: x')).toThrow(/sem itens/);
    expect(() => lerReleaseNotes('# só título')).toThrow(/nenhuma versão/);
  });

  it('o RELEASE_NOTES.md do repositório é válido e bate com o package.json', () => {
    const [topo] = lerReleaseNotes(readFileSync(join(process.cwd(), 'RELEASE_NOTES.md'), 'utf8'));
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(topo.versao).toBe(pkg.version);
  });

  it('semver: compara número a número (1.10.0 > 1.9.9)', () => {
    expect(compararVersao('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compararVersao('1.7.0', '1.7.0')).toBe(0);
    expect(compararVersao('1.6.9', '1.7.0')).toBeLessThan(0);
  });

  it('publicação pelo admin: versão maior que a atual, título e itens', () => {
    const itens = { novo: ['x'], melhorias: [], correcoes: [], avisos: [] };
    expect(problemaRelease({ versao: '1.7.1', titulo: 'Aviso', itens }, '1.7.0')).toBeNull();
    expect(problemaRelease({ versao: '1.7.0', titulo: 'Aviso', itens }, '1.7.0')).toMatch(/maior que 1.7.0/);
    expect(problemaRelease({ versao: '1.7', titulo: 'Aviso', itens }, '1.7.0')).toMatch(/formato/);
    expect(problemaRelease({ versao: '1.7.1', titulo: ' ', itens }, '1.7.0')).toMatch(/título/);
    expect(problemaRelease({ versao: '1.7.1', titulo: 'A', itens: { ...itens, novo: [] } }, '1.7.0')).toMatch(/item/);
  });

  it('público: todos ou só o perfil escolhido', () => {
    expect(releaseParaPerfil('todos', 'corretor')).toBe(true);
    expect(releaseParaPerfil('corretor', 'corretor')).toBe(true);
    expect(releaseParaPerfil('admin', 'corretor')).toBe(false);
  });

  it('empreendedor recebe as novidades, mas não publica', () => {
    expect(podeChamar('empreendedor', 'novidades.naoLidas')).toBe(true);
    expect(podeChamar('empreendedor', 'novidades.marcarLida')).toBe(true);
    expect(podeChamar('empreendedor', 'novidades.definirDescanso')).toBe(true);
    expect(podeChamar('empreendedor', 'novidades.publicar')).toBe(false);
  });
});
