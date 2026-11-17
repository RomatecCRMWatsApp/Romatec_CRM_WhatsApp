/**
 * Endereço público do CRM (links de boleto, Pix, carnê e recibo). Lê APP_PUBLIC_URL a cada chamada;
 * ausente ou vazia, usa https://romateccrm.com. Só tira as barras do fim.
 * Fica em _core, sem importar nada do financeiro, para dados.ts e emissao.ts não dependerem de servico.ts.
 */
export const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
