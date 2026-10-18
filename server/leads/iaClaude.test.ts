import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { beta = { messages: { create } }; constructor(public opts: any) {} },
}));

import { chamarClaude, SCHEMA_RESPOSTA } from './iaQualificacao';

describe('Chamada ao Claude (SDK mockado)', () => {
  beforeEach(() => { create.mockReset(); delete process.env.ANTHROPIC_MODEL; });

  it('usa claude-sonnet-5-5 por padrão, JSON estrito, effort low e fallback no servidor', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] });
    const out = await chamarClaude({ system: 'SYS', mensagens: [{ role: 'user', content: 'oi' }] });
    expect(out).toBe('{"ok":true}');
    const req = create.mock.calls[0][0];
    expect(req.model).toBe('claude-sonnet-5-5');
    expect(req.system).toBe('SYS');
    expect(req.messages).toEqual([{ role: 'user', content: 'oi' }]);
    expect(req.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: SCHEMA_RESPOSTA } });
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.fallbacks).toBe('default');
    expect(req).not.toHaveProperty('thinking');
  });

  it('modelo configurável por ANTHROPIC_MODEL', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-opus-5-5';
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] });
    await chamarClaude({ system: 's', mensagens: [{ role: 'user', content: 'x' }] });
    expect(create.mock.calls[0][0].model).toBe('claude-opus-5-5');
  });

  it('recusa e resposta sem texto viram erro (contam como falha da IA)', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
    await expect(chamarClaude({ system: 's', mensagens: [{ role: 'user', content: 'x' }] })).rejects.toThrow('recusou');
    create.mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] });
    await expect(chamarClaude({ system: 's', mensagens: [{ role: 'user', content: 'x' }] })).rejects.toThrow('sem texto');
  });
});
