/**
 * Condomínio de Chácaras Bom Jardims — captação de leads.
 * Regras do README do pacote (§0): sem preço, CRECI e os dois contatos sempre,
 * consentimento LGPD registrado com data/hora/origem.
 */

import type { Express } from 'express';
import { z } from 'zod';
import { ingestLead, origemFromUtm } from './lead-intake';

export const BOM_JARDIMS_SLUG = 'bom-jardims';

/** Texto de consentimento (§8.3) — registrado junto com o lead */
export const BOM_JARDIMS_CONSENT_TEXT =
  'Autorizo a Romatec Consultoria Total e o Condomínio de Chácaras Bom Jardims a usar meus dados para contato por WhatsApp, telefone e e-mail sobre este empreendimento, nos termos da Lei n.º 13.709/2018. Posso cancelar a qualquer momento.';

/** Cidades da segmentação geográfica (§3) — "mora a até 60 km" */
const CIDADES_PROXIMAS = [
  'acailandia', 'imperatriz', 'cidelandia', 'sao francisco do brejao', 'itinga do maranhao', 'bom jesus das selvas',
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

export function moraPerto(cidade?: string): boolean {
  if (!cidade) return false;
  const c = normalize(cidade);
  return CIDADES_PROXIMAS.some(p => c === p || c.startsWith(`${p} `) || c.startsWith(`${p}-`) || c.startsWith(`${p}/`));
}

const FINALIDADES = ['morar', 'lazer', 'investimento'] as const;
const PRAZOS = ['imediato', '3m', '12m', 'pesquisando'] as const;
const PAGAMENTOS = ['avista', 'parcelado'] as const;

export const FINALIDADE_LABEL: Record<typeof FINALIDADES[number], string> = { morar: 'Morar', lazer: 'Lazer de fim de semana', investimento: 'Investimento' };
export const PRAZO_LABEL: Record<typeof PRAZOS[number], string> = { imediato: 'Imediato', '3m': 'Até 3 meses', '12m': 'Até 12 meses', pesquisando: 'Só pesquisando' };
export const PAGAMENTO_LABEL: Record<typeof PAGAMENTOS[number], string> = { avista: 'À vista', parcelado: 'Parcelado direto' };

/**
 * Pontuação do lead (§8.2), parte que dá para calcular no cadastro.
 * Vídeo assistido e tempo de resposta entram depois, no atendimento.
 */
export function scoreBomJardims(input: { prazo?: string; pagamento?: string; cidade?: string; loteCodigo?: string }): number {
  let score = 0;
  if (input.prazo === 'imediato') score += 30;
  else if (input.prazo === '3m') score += 20;
  else if (input.prazo === '12m') score += 5;
  if (input.pagamento === 'avista') score += 15;
  if (moraPerto(input.cidade)) score += 15;
  if (input.loteCodigo) score += 10;
  return Math.min(100, score);
}

/** Resposta automática ao novo lead (§7.1) */
export function bomJardimsWelcome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] || '';
  const fn = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : '';
  return [
    `Olá${fn ? `, ${fn}` : ''}! 👋 Aqui é do *Condomínio de Chácaras Bom Jardims*, em Açailândia/MA. Obrigado pelo interesse!`,
    ``,
    `Em instantes o corretor *José Romário (CRECI/MA 4.705)* vai falar com você. Enquanto isso, me conta: você procura a chácara para *morar*, para *lazer de fim de semana* ou como *investimento*?`,
  ].join('\n');
}

const opt = (max: number) => z.string().trim().max(max).optional().transform(v => v || undefined);
const utmField = opt(100);

export const bomJardimsLeadSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  phone: z.string().trim().min(8, 'Informe um celular válido com DDD').max(25),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido').max(160)]).optional().transform(v => v || undefined),
  cidade: opt(80),
  finalidade: z.enum(FINALIDADES).optional(),
  prazo: z.enum(PRAZOS).optional(),
  pagamento: z.enum(PAGAMENTOS).optional(),
  loteCodigo: z.string().trim().regex(/^[A-D]\d{2}$/, 'Chácara inválida').optional(),
  consent: z.literal(true, { message: 'É preciso aceitar o contato' }),
  utm: z.object({ source: utmField, medium: utmField, campaign: utmField, content: utmField }).optional(),
  website: z.string().max(500).optional(), // honeypot
});

export type BomJardimsLeadInput = z.infer<typeof bomJardimsLeadSchema>;

export function registerBomJardimsRoutes(app: Express, allow: (key: string) => boolean) {
  app.post('/api/public/lead/bom-jardims', async (req, res) => {
    try {
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const ip = fwd[fwd.length - 1] || req.socket.remoteAddress || 'unknown';
      if (!allow(ip)) {
        return res.status(429).json({ ok: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      }

      const parsed = bomJardimsLeadSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' });
      }
      const d = parsed.data;
      if (d.website) return res.json({ ok: true }); // robô

      let loteCodigo = d.loteCodigo;
      if (loteCodigo) {
        const { loteComercializavel } = await import('./empreendimentos');
        if (!(await loteComercializavel(BOM_JARDIMS_SLUG, loteCodigo))) loteCodigo = undefined;
      }

      const utm = d.utm ?? { source: 'organico', medium: 'landing', campaign: 'bomjardims' };
      const answers: Record<string, string> = {};
      if (d.email) answers.email = d.email;
      if (d.cidade) answers.cidade = d.cidade;
      if (d.finalidade) answers.finalidade = FINALIDADE_LABEL[d.finalidade];
      if (d.prazo) answers.prazo = PRAZO_LABEL[d.prazo];
      if (d.pagamento) answers.pagamento = PAGAMENTO_LABEL[d.pagamento];
      if (loteCodigo) answers.chacara = loteCodigo;

      const leadScore = scoreBomJardims({ prazo: d.prazo, pagamento: d.pagamento, cidade: d.cidade, loteCodigo });

      const result = await ingestLead({
        nome: d.nome,
        phone: d.phone,
        origem: origemFromUtm(utm),
        campanha: utm.campaign || 'bomjardims',
        utm,
        empreendimentoSlug: BOM_JARDIMS_SLUG,
        loteCodigo,
        leadScore,
        answers,
        consentimento: {
          at: new Date().toISOString(),
          texto: BOM_JARDIMS_CONSENT_TEXT,
          origem: `landing /bom-jardims${utm.source ? ` (utm_source=${utm.source})` : ''}`,
          ip,
        },
        welcomeMessage: bomJardimsWelcome(d.nome),
      });

      if (!result.ok) {
        if (result.reason === 'invalid_phone') return res.status(400).json({ ok: false, error: 'Informe um celular válido com DDD' });
        if (result.reason === 'db_unavailable') return res.status(503).json({ ok: false, error: 'Sistema indisponível no momento. Fale pelo WhatsApp.' });
        return res.json({ ok: true });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('[BomJardims] Erro no cadastro:', error);
      res.status(500).json({ ok: false, error: 'Erro ao enviar. Fale pelo WhatsApp.' });
    }
  });
}
