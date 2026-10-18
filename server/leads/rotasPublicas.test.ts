import { describe, it, expect } from 'vitest';
import { appRouter } from '../routers';

// Regressão: o padrão IMV-\d{4} perdeu a barra invertida e a landing recusava todo código
describe('Rotas públicas da captação', () => {
  const caller = appRouter.createCaller({ user: null, req: { headers: {} } as any, res: {} as any } as any);

  it('properties.byCodigo aceita IMV-0001 (sem banco devolve null, não erro de validação)', async () => {
    await expect(caller.properties.byCodigo({ codigo: 'IMV-0001' })).resolves.toBeNull();
    await expect(caller.properties.byCodigo({ codigo: 'imv-0012' })).resolves.toBeNull();
  });

  it('properties.byCodigo recusa código fora do padrão', async () => {
    await expect(caller.properties.byCodigo({ codigo: 'IMV-dddd' })).rejects.toThrow();
    await expect(caller.properties.byCodigo({ codigo: 'IMV-12' })).rejects.toThrow();
  });
});
