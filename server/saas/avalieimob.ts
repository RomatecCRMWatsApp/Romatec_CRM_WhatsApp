/**
 * Camada SaaS — acesso ao AvalieImob incluído no plano (Corretor Pro). O CRM é a fonte da verdade:
 * - Provisionamento: POST assinado (HMAC-SHA256 de "timestamp.corpo") em /api/integracoes/romatec/provisionar com
 *   ativar | reativar | suspender. A rotina compara o acesso devido com o último informado (saasAssinaturas.avalieimobEstado)
 *   e repete o que falhou; o AvalieImob nunca encurta um plano próprio do usuário nem suspende o que não veio do CRM.
 * - SSO: JWT HS256 de 60 s (iss romatec-crm, aud avalieimob, jti de uso único) aberto em /sso#token=… (no fragmento,
 *   fora dos logs dos servidores). O AvalieImob devolve a sessão dele.
 * Desligado enquanto AVALIEIMOB_INTEGRACAO_SECRET não existir (o mesmo valor vai no AvalieImob como ROMATEC_CRM_INTEGRACAO_SECRET).
 */
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { getDb } from '../db';
import { saasAssinaturas, saasPlanos, users } from '../../drizzle/schema';
import { licencaLiberada } from '../../shared/saas';
import * as S from './servico';

export class AvalieimobErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'AvalieimobErro'; } }

const segredo = () => (process.env.AVALIEIMOB_INTEGRACAO_SECRET ?? '').trim();
export const integracaoConfigurada = () => segredo().length >= 32;
export const urlAvalieimob = () => (process.env.AVALIEIMOB_URL || 'https://www.romatecavalieimob.com.br').replace(/\/+$/, '');
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export type EventoProvisionamento = 'ativar' | 'reativar' | 'suspender';

export function assinarCorpo(ts: string, corpo: string, chave = segredo()): string {
  return crypto.createHmac('sha256', chave).update(`${ts}.${corpo}`).digest('hex');
}

/** Transporte (injetável nos testes) */
export const avalieimob = {
  async provisionar(corpo: Record<string, unknown>): Promise<{ ok: boolean; acao?: string; erro?: string }> {
    const txt = JSON.stringify(corpo);
    const ts = String(Math.floor(Date.now() / 1000));
    try {
      const r = await fetch(`${urlAvalieimob()}/api/integracoes/romatec/provisionar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Romatec-Timestamp': ts, 'X-Romatec-Signature': assinarCorpo(ts, txt) },
        body: txt, signal: AbortSignal.timeout(15_000),
      });
      const j: any = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, acao: j?.acao } : { ok: false, erro: `HTTP ${r.status}${j?.detail ? ` — ${String(j.detail).slice(0, 200)}` : ''}` };
    } catch (e: any) { return { ok: false, erro: e?.message ?? 'falha de rede' }; }
  },
};

/** Acesso devido: assinatura liberada de plano que inclui o AvalieImob (vale também com o licenciamento desligado, p/ cortesias) */
export function acessoDevido(as: any[], planos: Map<number, any>, agora = Date.now()): boolean {
  return as.some(a => !!planos.get(a.planoId)?.incluiAvalieimob && licencaLiberada(a, agora));
}

const banco = async () => {
  const d = await getDb();
  if (!d) throw new AvalieimobErro('Banco indisponível', 503);
  return d as any;
};

async function enviar(evento: EventoProvisionamento, u: any, planoNome: string, ids: number[], d: any): Promise<boolean> {
  const r = await avalieimob.provisionar({
    evento, crm_usuario_id: u.id, email: String(u.email ?? '').toLowerCase(), nome: u.name ?? '', cpf: soDig(u.cpf) || null, telefone: u.telefone ?? null, plano: planoNome, ate: null,
  });
  const estado = evento === 'suspender' ? 'SUSPENSO' : 'ATIVO';
  await d.update(saasAssinaturas).set(r.ok ? { avalieimobEstado: estado, avalieimobErro: null } as any : { avalieimobErro: `${evento}: ${r.erro}`.slice(0, 300) } as any)
    .where(inArray(saasAssinaturas.id, ids));
  if (r.ok) await S.auditar(u.id, evento === 'suspender' ? 'AVALIEIMOB_SUSPENSO' : 'AVALIEIMOB_ATIVADO', { acao: r.acao ?? null });
  else console.warn(`[AvalieImob] ${evento} usuário ${u.id}:`, r.erro);
  return r.ok;
}

/** Rotina: ativa quem passou a ter direito e suspende quem perdeu (por pessoa: basta uma assinatura com direito) */
export async function sincronizarAvalieimob(agora = Date.now()): Promise<{ ativados: number; suspensos: number; falhas: number }> {
  const res = { ativados: 0, suspensos: 0, falhas: 0 };
  if (!integracaoConfigurada()) return res;
  const d = await banco();
  const as: any[] = await d.select().from(saasAssinaturas);
  if (!as.length) return res;
  const P = new Map<number, any>((await d.select().from(saasPlanos)).map((p: any) => [p.id, p]));
  const porUsuario = new Map<number, any[]>();
  for (const a of as) porUsuario.set(a.usuarioId, [...(porUsuario.get(a.usuarioId) ?? []), a]);
  const us: any[] = await d.select().from(users).where(inArray(users.id, Array.from(porUsuario.keys())));
  const U = new Map(us.map(u => [u.id, u]));
  for (const [uid, lista] of Array.from(porUsuario)) {
    const u = U.get(uid);
    if (!u?.email) continue;
    const devido = acessoDevido(lista, P, agora);
    const ativo = lista.some(a => a.avalieimobEstado === 'ATIVO');
    const informado = lista.some(a => a.avalieimobEstado);
    let evento: EventoProvisionamento | null = null;
    if (devido && !ativo) evento = informado ? 'reativar' : 'ativar';
    else if (!devido && ativo) evento = 'suspender';
    if (!evento) continue;
    const plano = lista.map(a => P.get(a.planoId)).find(p => p?.incluiAvalieimob)?.nome ?? 'Romatec CRM';
    if (await enviar(evento, u, plano, lista.map(a => a.id), d)) evento === 'suspender' ? res.suspensos++ : res.ativados++;
    else res.falhas++;
  }
  return res;
}

/** Situação do botão "Abrir AvalieImob" para quem está logado */
export async function acessoDoUsuario(u: any, agora = Date.now()) {
  if (!integracaoConfigurada()) return { configurado: false as const, liberado: false, url: urlAvalieimob() };
  const d = await banco();
  const as: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.usuarioId, u.id));
  const P = new Map<number, any>((await d.select().from(saasPlanos)).map((p: any) => [p.id, p]));
  return { configurado: true as const, liberado: acessoDevido(as, P, agora), url: urlAvalieimob() };
}

/** Link de entrada única: garante o provisionamento (na hora, se a rotina ainda não passou) e assina o JWT de 60 s */
export async function linkSso(u: any, agora = Date.now()): Promise<{ url: string }> {
  if (!integracaoConfigurada()) throw new AvalieimobErro('A integração com o AvalieImob ainda não foi configurada.', 412);
  const d = await banco();
  const as: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.usuarioId, u.id));
  const P = new Map<number, any>((await d.select().from(saasPlanos)).map((p: any) => [p.id, p]));
  if (!acessoDevido(as, P, agora)) throw new AvalieimobErro('O AvalieImob está incluído no plano Corretor Pro. Faça o upgrade em Assinatura.', 403);
  if (!u.email) throw new AvalieimobErro('Cadastre seu e-mail no perfil para acessar o AvalieImob.', 400);
  if (!as.some(a => a.avalieimobEstado === 'ATIVO')) {
    const plano = as.map(a => P.get(a.planoId)).find(p => p?.incluiAvalieimob)?.nome ?? 'Romatec CRM';
    const ok = await enviar(as.some(a => a.avalieimobEstado) ? 'reativar' : 'ativar', u, plano, as.map(a => a.id), d);
    if (!ok) throw new AvalieimobErro('Não foi possível liberar seu acesso no AvalieImob agora. Tente de novo em alguns minutos.', 502);
  }
  const iat = Math.floor(agora / 1000);
  const token = await new SignJWT({ email: String(u.email).toLowerCase(), nome: u.name ?? '' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(u.id)).setIssuer('romatec-crm').setAudience('avalieimob').setJti(crypto.randomUUID())
    .setIssuedAt(iat).setExpirationTime(iat + 60)
    .sign(new TextEncoder().encode(segredo()));
  await S.auditar(u.id, 'AVALIEIMOB_SSO', null);
  return { url: `${urlAvalieimob()}/sso#token=${token}` };
}
