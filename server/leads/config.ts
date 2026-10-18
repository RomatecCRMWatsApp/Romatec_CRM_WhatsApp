/** Configuração do módulo de captação (lida a cada uso, para valer sem reiniciar em teste) */

export type CanalNotificacao = 'telegram' | 'whatsapp';

export function assistenteNome(): string {
  return (process.env.ASSISTENTE_NOME || '').trim() || 'Assistente Romatec';
}

/** NOTIFY_CANAIS=telegram (padrão) | whatsapp | telegram,whatsapp */
export function canaisNotificacao(): CanalNotificacao[] {
  const raw = (process.env.NOTIFY_CANAIS || 'telegram').toLowerCase();
  const canais = raw.split(',').map(s => s.trim()).filter((c): c is CanalNotificacao => c === 'telegram' || c === 'whatsapp');
  return canais.length ? Array.from(new Set(canais)) : ['telegram'];
}

/** NOTIFY_PHONES=+5599991811246,+55... (WhatsApp do José) */
export function telefonesNotificacao(): string[] {
  return (process.env.NOTIFY_PHONES || '+5599991811246')
    .split(',').map(s => s.replace(/\D/g, '')).filter(s => s.length >= 12);
}

/** Número de WhatsApp que recebe os leads (destino dos links wa.me) */
export function numeroWhatsAppLeads(): string {
  return (process.env.ZAPI_NUMERO_E164 || process.env.COMPANY_WHATSAPP || '5599991811246').replace(/\D/g, '');
}

/** WhatsApp pessoal do corretor, como aparece nas mensagens ("vai te chamar pelo número pessoal dele, …") */
export function corretorWhatsApp(): string {
  return (process.env.CORRETOR_WHATSAPP_EXIBICAO || '').trim() || '(99) 9 9181-1246';
}

/** Frase padrão: o lead fala primeiro com o CRM e o José assume pelo número pessoal */
export function fraseCorretorChama(): string {
  return `O corretor *José Romário (CRECI/MA 4.705)* vai te chamar pelo número pessoal dele, *${corretorWhatsApp()}*.`;
}

export function appUrl(): string {
  return (process.env.APP_URL || process.env.RAILWAY_PRODUCTION_URL || 'https://romateccrm.com').replace(/\/$/, '');
}
