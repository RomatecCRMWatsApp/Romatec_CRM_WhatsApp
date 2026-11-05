import { describe, it, expect } from 'vitest';
import { tipoDoAudio } from './_core/voiceTranscription';

describe('tipoDoAudio (áudio do WhatsApp para a transcrição)', () => {
  it('tira os parâmetros do content-type do WhatsApp', () => {
    expect(tipoDoAudio('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(tipoDoAudio('Audio/MPEG')).toBe('audio/mpeg');
  });
  it('octet-stream usa a extensão da URL e, sem ela, ogg', () => {
    expect(tipoDoAudio('application/octet-stream', 'https://x.z-api.io/a/123.mp3?t=1')).toBe('audio/mpeg');
    expect(tipoDoAudio('application/octet-stream', 'https://x.z-api.io/a/123.opus')).toBe('audio/ogg');
    expect(tipoDoAudio(null, 'https://x/sem-extensao')).toBe('audio/ogg');
  });
});
