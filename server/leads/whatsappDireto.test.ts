import { describe, it, expect } from 'vitest';
import { acaoWhatsappDireto, decidirEntrada, rotuloCanal } from './inbound';
import { tipoDoCanal } from './relatorio';

describe('WhatsApp direto (contato novo sem código)', () => {
  it('sem código, a captação não abre conversa: o bot de sempre responde', () => {
    expect(decidirEntrada({ temAtribuicao: false, funilSugerido: null, leadExiste: false, imoveisDoLead: [], imoveisMensagem: [] })).toEqual({ acao: 'nenhuma' });
  });

  it('depois da 1ª resposta do bot: marca a origem só quando ainda não tem', () => {
    expect(acaoWhatsappDireto({ origemCanal: null })).toBe('marcar');
    expect(acaoWhatsappDireto({})).toBe('marcar');
    expect(acaoWhatsappDireto({ origemCanal: 'meta_ctwa' })).toBe('nada');
    expect(acaoWhatsappDireto({ origemCanal: 'whatsapp_direto' })).toBe('nada');
    expect(acaoWhatsappDireto(null)).toBe('inserir');
  });

  it('conta como orgânico no relatório, com rótulo próprio', () => {
    expect(tipoDoCanal('whatsapp_direto')).toBe('organico');
    expect(rotuloCanal('whatsapp_direto')).toBe('WhatsApp direto');
  });
});
