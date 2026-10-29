/**
 * Condomínio de Chácaras Bom Jardims — captação de leads.
 * Regras do README do pacote (§0): sem preço, CRECI e os dois contatos sempre,
 * consentimento LGPD registrado com data/hora/origem.
 */

import type { Express } from 'express';
import { z } from 'zod';
import { ingestLead, origemFromUtm, origemVisitaSchema } from './lead-intake';
import { boasVindasListaExclusiva } from './leads/listaComunicacao';

export const BOM_JARDIMS_SLUG = 'bom-jardims';
export const BOM_JARDIMS_NOME = 'Condomínio de Chácaras Bom Jardims';

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

/** Resposta automática ao novo lead (§7.1): boas-vindas padrão com a confirmação da lista exclusiva */
export function bomJardimsWelcome(nome: string): string {
  return boasVindasListaExclusiva(nome, BOM_JARDIMS_NOME);
}

// ─── Meta Lead Ads (formulário instantâneo) ──────────────────────────────────
/** Formulário/anúncio/campanha do Bom Jardims? ("Bom Jardims - Mapa de vendas (C3)", "bomjardims_c3"...) */
export function isBomJardimsName(name?: string | null): boolean {
  return !!name && /bom\s*jardi/.test(normalize(name).replace(/[_-]/g, ' '));
}

/**
 * Respostas de múltipla escolha do formulário da Meta. A Meta devolve a opção
 * escolhida como texto ("Lazer de fim de semana" ou "lazer_de_fim_de_semana"),
 * então a classificação é pelo valor; cidade vem de pergunta aberta.
 */
export function parseMetaAnswers(extras: Record<string, string>): {
  finalidade?: typeof FINALIDADES[number];
  prazo?: typeof PRAZOS[number];
  pagamento?: typeof PAGAMENTOS[number];
  cidade?: string;
} {
  const out: ReturnType<typeof parseMetaAnswers> = {};
  for (const [key, raw] of Object.entries(extras)) {
    const k = normalize(key).replace(/_/g, ' ');
    const v = normalize(raw).replace(/_/g, ' ');
    if (/cidade|onde (voce )?mora/.test(k)) { out.cidade ??= raw.trim(); continue; }
    if (!out.finalidade) {
      if (/\bmorar\b/.test(v)) { out.finalidade = 'morar'; continue; }
      if (/lazer|fim de semana/.test(v)) { out.finalidade = 'lazer'; continue; }
      if (/invest/.test(v)) { out.finalidade = 'investimento'; continue; }
    }
    if (!out.prazo) {
      if (/imediat/.test(v)) { out.prazo = 'imediato'; continue; }
      if (/\b3 meses|tres meses/.test(v)) { out.prazo = '3m'; continue; }
      if (/\b12 meses|doze meses|1 ano/.test(v)) { out.prazo = '12m'; continue; }
      if (/pesquis/.test(v)) { out.prazo = 'pesquisando'; continue; }
    }
    if (!out.pagamento) {
      if (/a vista|avista/.test(v)) { out.pagamento = 'avista'; continue; }
      if (/parcel|financ/.test(v)) { out.pagamento = 'parcelado'; continue; }
    }
  }
  return out;
}

/** created_time da Meta vem como "2026-10-17T22:00:00+0000"; inválido → agora */
function toIso(t?: string): string {
  const d = t ? new Date(t.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export interface MetaDisclaimerResponse { checkbox_key?: string; is_checked?: boolean | string | number }

/**
 * Lead do Meta Lead Ads → campos extras do ingestLead para o Bom Jardims:
 * roteiro §7.1, respostas, pontuação §8.2 e consentimento §8.3 (checkbox do formulário).
 */
export function bomJardimsFromMeta(params: {
  nome: string;
  extras: Record<string, string>;
  email?: string;
  disclaimers?: MetaDisclaimerResponse[];
  createdTime?: string;
  formLabel: string;
}) {
  const a = parseMetaAnswers(params.extras);
  const answers: Record<string, string> = {};
  if (params.email) answers.email = params.email;
  if (a.cidade) answers.cidade = a.cidade;
  if (a.finalidade) answers.finalidade = FINALIDADE_LABEL[a.finalidade];
  if (a.prazo) answers.prazo = PRAZO_LABEL[a.prazo];
  if (a.pagamento) answers.pagamento = PAGAMENTO_LABEL[a.pagamento];

  const checked = (params.disclaimers ?? []).some(d => d.is_checked === true || d.is_checked === 1 || d.is_checked === '1' || d.is_checked === 'true');
  if (!checked) {
    console.warn(`[BomJardims] Lead da Meta sem checkbox de consentimento marcado (${params.formLabel}) — confira o formulário (§8.3)`);
  }

  return {
    empreendimentoSlug: BOM_JARDIMS_SLUG,
    leadScore: scoreBomJardims({ prazo: a.prazo, pagamento: a.pagamento, cidade: a.cidade }),
    answers,
    welcomeMessage: bomJardimsWelcome(params.nome),
    ...(checked ? {
      consentimento: {
        at: toIso(params.createdTime),
        texto: BOM_JARDIMS_CONSENT_TEXT,
        origem: `Meta Lead Ads — ${params.formLabel}`,
      },
    } : {}),
  };
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
  origemVisita: origemVisitaSchema,
  /** ?c= de quem compartilhou o link: o lead vai para esse corretor */
  ref: z.string().max(20).optional(),
  website: z.string().max(500).optional(), // honeypot
});

export type BomJardimsLeadInput = z.infer<typeof bomJardimsLeadSchema>;

// ─── KML (Google Earth) ──────────────────────────────────────────────────────
let geometriaCache: import('../shared/kmlBomJardims').GeometriaPublica | null = null;

/** Geometria pública (mapa.json): dist/public em produção, client/public em desenvolvimento */
export async function geometriaBomJardims(): Promise<import('../shared/kmlBomJardims').GeometriaPublica | null> {
  if (geometriaCache) return geometriaCache;
  const fs = await import('fs');
  const path = await import('path');
  const candidatos = [
    path.resolve(import.meta.dirname, 'public', BOM_JARDIMS_SLUG, 'mapa.json'),
    path.resolve(process.cwd(), 'dist', 'public', BOM_JARDIMS_SLUG, 'mapa.json'),
    path.resolve(process.cwd(), 'client', 'public', BOM_JARDIMS_SLUG, 'mapa.json'),
  ];
  const arq = candidatos.find(c => fs.existsSync(c));
  if (!arq) return null;
  geometriaCache = JSON.parse(await fs.promises.readFile(arq, 'utf8'));
  return geometriaCache;
}

/** /bom-jardims.kml (empreendimento) e /bom-jardims/chacara/C05.kml (chácara) — públicos, sem login */
export function registrarKmlBomJardims(app: Express, base: () => string) {
  const enviar = (res: any, kml: string, arquivo: string) => {
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(kml);
  };
  app.get(`/${BOM_JARDIMS_SLUG}.kml`, async (_req, res) => {
    const g = await geometriaBomJardims();
    if (!g) return res.status(503).type('text/plain').send('Mapa indisponível');
    const { kmlEmpreendimento, nomeArquivoKml } = await import('../shared/kmlBomJardims');
    enviar(res, kmlEmpreendimento(g, { link: `${base()}/${BOM_JARDIMS_SLUG}` }), nomeArquivoKml());
  });
  app.get(`/${BOM_JARDIMS_SLUG}/chacara/:arquivo`, async (req, res, next) => {
    const m = /^([A-Da-d]\d{2})\.kml$/.exec(req.params.arquivo);
    if (!m) return next();                                   // /bom-jardims/chacara/C05 → página (SPA)
    const g = await geometriaBomJardims();
    if (!g) return res.status(503).type('text/plain').send('Mapa indisponível');
    const { kmlChacara, nomeArquivoKml } = await import('../shared/kmlBomJardims');
    const { linkChacara } = await import('../shared/chacaraLink');
    const codigo = m[1].toUpperCase();
    const kml = kmlChacara(g, codigo, { link: linkChacara(base(), codigo) });
    if (!kml) return res.status(404).type('text/plain').send('Chácara não encontrada');
    enviar(res, kml, nomeArquivoKml(codigo));
  });
}

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

      const utm: { source?: string; medium?: string; campaign?: string; content?: string } = d.utm ?? {};
      const answers: Record<string, string> = {};
      if (d.email) answers.email = d.email;
      if (d.cidade) answers.cidade = d.cidade;
      if (d.finalidade) answers.finalidade = FINALIDADE_LABEL[d.finalidade];
      if (d.prazo) answers.prazo = PRAZO_LABEL[d.prazo];
      if (d.pagamento) answers.pagamento = PAGAMENTO_LABEL[d.pagamento];
      if (loteCodigo) answers.chacara = loteCodigo;

      const leadScore = scoreBomJardims({ prazo: d.prazo, pagamento: d.pagamento, cidade: d.cidade, loteCodigo });

      // Link de corretor (?c=): o lead é dele; sem link, o rodízio decide
      const { corretorDoLink } = await import('./obrasBomJardim');
      const dono = await corretorDoLink(d.ref).catch(() => null);

      const result = await ingestLead({
        responsavelId: dono?.id ?? null,
        nome: d.nome,
        phone: d.phone,
        origem: origemFromUtm(utm),
        campanha: utm.campaign || 'bomjardims',
        utm: d.utm,
        origemVisita: d.origemVisita,
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
