import { getDb } from '../../db';

/**
 * Migration: Atualizar valores das messageVariations
 *
 * Corrige os valores de todos os imóveis nas messageVariations
 * ALACIDE → R$ 380.000,00
 * Mod_Vaz-01 → R$ 300.000,00
 * Mod_Vaz-02 → R$ 250.000,00
 * Mod_Vaz-03 → R$ 210.000,00
 * Condominio de Chácaras Giuliano → R$ 160.000,00
 */
export async function updateMessageValues(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[Migration] ⚠️  Database not available');
      return;
    }

    const campaignUpdates: Record<string, { valor: string; messages: string[] }> = {
      ALACIDE: {
        valor: 'R$ 380.000',
        messages: [
          'Ola, {NOME}! Tudo bem?\n\nA Romatec Imoveis tem uma oportunidade especial para você!\n\nALACIDE\n{ENDERECO}\n\nValor: R$ 380.000\n\nQuer saber mais? Responda SIM!Ola, {NOME}!',
          'Você esta procurando seu imovel dos sonhos? Temos o ALACIDE disponivel!\n\n{ENDERECO}\nValor: R$ 380.000\n\nResponda SIM para mais informacoes!,Oi {NOME}, boa tarde!',
          'A Romatec tem um imovel exclusivo:\n\nALACIDE\n{ENDERECO}\n\nValor: R$ 380.000\n\nPosso te enviar mais detalhes?',
        ],
      },
      'Mod_Vaz-01': {
        valor: 'R$ 300.000',
        messages: [
          'Ola, {NOME}! Tudo bem?\n\nA Romatec Imoveis tem uma oportunidade especial para você!\n\nMod_Vaz-01\n{ENDERECO}\n\nValor: R$ 300.000\n\nQuer saber mais? Responda SIM!Ola, {NOME}!',
          'Você esta procurando seu imovel dos sonhos? Temos o Mod_Vaz-01 disponivel!\n\n{ENDERECO}\nValor: R$ 300.000\n\nResponda SIM para mais informacoes!,Oi {NOME}, boa tarde!',
          'A Romatec tem um imovel exclusivo:\n\nMod_Vaz-01\n{ENDERECO}\n\nValor: R$ 300.000\n\nPosso te enviar mais detalhes?',
        ],
      },
      'Mod_Vaz-02': {
        valor: 'R$ 250.000',
        messages: [
          'Ola, {NOME}! Tudo bem?\n\nA Romatec Imoveis tem uma oportunidade especial para você!\n\nMod_Vaz-02\n{ENDERECO}\n\nValor: R$ 250.000\n\nQuer saber mais? Responda SIM!Ola, {NOME}!',
          'Você esta procurando seu imovel dos sonhos? Temos o Mod_Vaz-02 disponivel!\n\n{ENDERECO}\nValor: R$ 250.000\n\nResponda SIM para mais informacoes!,Oi {NOME}, boa tarde!',
          'A Romatec tem um imovel exclusivo:\n\nMod_Vaz-02\n{ENDERECO}\n\nValor: R$ 250.000\n\nPosso te enviar mais detalhes?',
        ],
      },
      'Mod_Vaz-03': {
        valor: 'R$ 210.000',
        messages: [
          'Ola, {NOME}! Tudo bem?\n\nA Romatec Imoveis tem uma oportunidade especial para você!\n\nMod_Vaz-03\n{ENDERECO}\n\nValor: R$ 210.000\n\nQuer saber mais? Responda SIM!Ola, {NOME}!',
          'Você esta procurando seu imovel dos sonhos? Temos o Mod_Vaz-03 disponivel!\n\n{ENDERECO}\nValor: R$ 210.000\n\nResponda SIM para mais informacoes!,Oi {NOME}, boa tarde!',
          'A Romatec tem um imovel exclusivo:\n\nMod_Vaz-03\n{ENDERECO}\n\nValor: R$ 210.000\n\nPosso te enviar mais detalhes?',
        ],
      },
      'Condomínio de Chácaras Giuliano': {
        valor: 'R$ 160.000',
        messages: [
          'Ola, {NOME}! Tudo bem?\n\nA Romatec Imoveis tem uma oportunidade especial para você!\n\nCondomínio de Chácaras Giuliano\n{ENDERECO}\n\nValor: R$ 160.000\n\nQuer saber mais? Responda SIM!Ola, {NOME}!',
          'Você esta procurando seu imovel dos sonhos? Temos o Condomínio de Chácaras Giuliano disponivel!\n\n{ENDERECO}\nValor: R$ 160.000\n\nResponda SIM para mais informacoes!,Oi {NOME}, boa tarde!',
          'A Romatec tem um imovel exclusivo:\n\nCondomínio de Chácaras Giuliano\n{ENDERECO}\n\nValor: R$ 160.000\n\nPosso te enviar mais detalhes?',
        ],
      },
    };

    let updated = 0;

    for (const [campaignName, data] of Object.entries(campaignUpdates)) {
      const result = await (db as any).execute(
        `UPDATE campaigns SET messageVariations = ? WHERE name = ? OR name LIKE ?`,
        [JSON.stringify(data.messages), campaignName, `%${campaignName}%`]
      );

      const affectedRows = (result as any)?.affectedRows || 0;
      if (affectedRows > 0) {
        console.log(`[Migration] ✅ ${campaignName}: ${data.valor}`);
        updated++;
      }
    }

    if (updated > 0) {
      console.log(`[Migration] ✅ Atualizado ${updated} campanhas com valores corretos!`);
    } else {
      console.log(`[Migration] ⚠️  Nenhuma campanha foi atualizada`);
    }
  } catch (error) {
    console.error('[Migration] ❌ Erro ao atualizar valores:', error);
  }
}
