/**
 * Certificado digital A1 (ICP-Brasil) do usuário — administrador, advogados (corpo jurídico) e empreendedor:
 * - o .pfx é guardado CIFRADO (AES-256-GCM, chave do servidor: CERTIFICADOS_CHAVE ou derivada do JWT_SECRET);
 * - a SENHA NUNCA é guardada: é pedida a cada assinatura, abre o .pfx em memória e o buffer é zerado;
 * - só aceita certificado ICP-Brasil, dentro da validade, cujo CPF seja o do cadastro do usuário.
 * A assinatura é incremental (server/assinatura/icp.ts): várias pessoas assinam o mesmo PDF sem invalidar as anteriores.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { certificadosUsuario, users } from '../../drizzle/schema';
import { assinarICP, CertificadoInvalidoError, lerCertificado, type InfoCertificado } from '../assinatura/icp';

export class CertificadoErro extends Error { constructor(m: string, public status = 400) { super(m); this.name = 'CertificadoErro'; } }

const MAX_PFX = 200_000;

const derivar = (base: string) => createHash('sha256').update(`romatec:certificados:v1:${base}`).digest();
const deVar = (v: string) => /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : v.length >= 16 ? derivar(v) : null;
/** Impressão digital curta da chave (não revela a chave): vai junto da etiqueta para diagnosticar troca de chave */
const digital = (k: Buffer) => createHash('sha256').update(k).digest('hex').slice(0, 6);

/** Chave atual: CERTIFICADOS_CHAVE (64 hex ou frase longa) ou, na falta, derivada do JWT_SECRET */
function chave(): Buffer {
  const env = String(process.env.CERTIFICADOS_CHAVE ?? '').trim().replace(/^["']|["']$/g, '');
  const jwt = String(process.env.JWT_SECRET ?? '').trim();
  const k = env ? deVar(env) : jwt.length >= 16 ? derivar(jwt) : null;
  if (!k) throw new CertificadoErro('Guarda de certificados indisponível no servidor (falta a chave de cifra CERTIFICADOS_CHAVE)', 503);
  return k;
}

/** Chaves aceitas para ABRIR: a atual, a anterior (CERTIFICADOS_CHAVE_ANTERIOR) e a reserva do JWT_SECRET */
function chavesParaAbrir(): Buffer[] {
  const lista: Buffer[] = [chave()];
  const ant = String(process.env.CERTIFICADOS_CHAVE_ANTERIOR ?? '').trim().replace(/^["']|["']$/g, '');
  const jwt = String(process.env.JWT_SECRET ?? '').trim();
  for (const k of [ant ? deVar(ant) : null, jwt.length >= 16 ? derivar(jwt) : null]) if (k && !lista.some(x => x.equals(k))) lista.push(k);
  return lista;
}

export function cifrar(pfx: Buffer) {
  const k = chave();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const dados = Buffer.concat([c.update(pfx), c.final()]);
  return { pfxCifrado: dados.toString('base64'), iv: iv.toString('hex'), tag: `${c.getAuthTag().toString('hex')}.${digital(k)}` };
}

/** Abre o .pfx guardado; diz se foi preciso uma chave antiga (então convém recifrar com a atual) */
export function abrirGuardado(r: { pfxCifrado: string; iv: string; tag: string }): { pfx: Buffer; chaveAntiga: boolean } {
  const [tagHex, dig] = String(r.tag).split('.');
  const chaves = chavesParaAbrir();
  for (let i = 0; i < chaves.length; i++) {
    const k = chaves[i];
    try {
      const d = createDecipheriv('aes-256-gcm', k, Buffer.from(r.iv, 'hex'));
      d.setAuthTag(Buffer.from(tagHex, 'hex'));
      return { pfx: Buffer.concat([d.update(Buffer.from(r.pfxCifrado, 'base64')), d.final()]), chaveAntiga: i > 0 };
    } catch { /* tenta a próxima chave */ }
  }
  const atual = digital(chaves[0]);
  throw new CertificadoErro(dig && dig !== atual
    ? 'O certificado foi guardado com outra chave de cifra do servidor (a CERTIFICADOS_CHAVE mudou). Guarde o certificado de novo em Certificado digital, ou assine agora escolhendo o arquivo .pfx em "Outro certificado".'
    : 'Não foi possível abrir o certificado guardado: guarde-o de novo em Certificado digital, ou assine agora escolhendo o arquivo .pfx em "Outro certificado".', 409);
}

export function decifrar(r: { pfxCifrado: string; iv: string; tag: string }): Buffer {
  return abrirGuardado(r).pfx;
}

const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new CertificadoErro('Banco indisponível', 503);
  return d;
}

/** Abre o .pfx com a senha e confere ICP-Brasil, validade e o CPF do usuário (sem guardar nada) */
async function conferir(usuarioId: number, pfx: Buffer, senha: string): Promise<InfoCertificado> {
  if (!pfx?.length || pfx.length > MAX_PFX) throw new CertificadoErro('Envie o arquivo do certificado (.pfx ou .p12)');
  if (!senha) throw new CertificadoErro('Informe a senha do certificado');
  let info: InfoCertificado;
  try { info = lerCertificado(pfx, senha); } catch (e: any) {
    throw new CertificadoErro(e instanceof CertificadoInvalidoError ? e.message : 'Certificado inválido');
  }
  const d = await banco();
  const [u]: any[] = await d.select({ cpf: users.cpf }).from(users).where(eq(users.id, usuarioId)).limit(1);
  const cpfUsuario = soDig(u?.cpf);
  if (cpfUsuario.length === 11 && info.cpf && info.cpf !== cpfUsuario) throw new CertificadoErro('O certificado é de outra pessoa (o CPF não confere com o seu cadastro)', 403);
  return info;
}

const resumo = (r: any) => r ? {
  titular: String(r.titular), cpf: r.cpf ? String(r.cpf).replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2') : null, emissor: String(r.emissor),
  validade: new Date(r.validade).toISOString(), vencido: new Date(r.validade).getTime() < Date.now(), guardadoEm: r.criadoEm ? new Date(r.criadoEm).toISOString() : null,
} : null;

/** Certificado guardado do usuário (só os dados públicos) */
export async function meuCertificado(usuarioId: number) {
  const d = await banco();
  const [r]: any[] = await d.select().from(certificadosUsuario).where(eq(certificadosUsuario.usuarioId, usuarioId)).limit(1);
  if (!r) return null;
  let legivel = true;
  try { abrirGuardado(r).pfx.fill(0); } catch { legivel = false; }
  return { ...resumo(r)!, legivel };
}

/** Guarda (ou troca) o certificado: confere com a senha e guarda só o .pfx cifrado */
export async function guardarCertificado(usuarioId: number, pfx: Buffer, senha: string) {
  try {
    const info = await conferir(usuarioId, pfx, senha);
    const c = cifrar(pfx);
    const d = await banco();
    await d.delete(certificadosUsuario).where(eq(certificadosUsuario.usuarioId, usuarioId));
    await d.insert(certificadosUsuario).values({ usuarioId, ...c, titular: info.nome.slice(0, 200), cpf: info.cpf, emissor: info.emissor.slice(0, 200), validade: info.validade, criadoEm: new Date() } as any);
    return { ...resumo({ titular: info.nome, cpf: info.cpf, emissor: info.emissor, validade: info.validade, criadoEm: new Date() })!, legivel: true };
  } finally { pfx.fill(0); }
}

export async function removerCertificado(usuarioId: number) {
  const d = await banco();
  await d.delete(certificadosUsuario).where(eq(certificadosUsuario.usuarioId, usuarioId));
  return { ok: true as const };
}

/**
 * Assina o PDF com o certificado do usuário: o guardado (só a senha) ou um .pfx enviado agora (não é guardado).
 * Devolve o PDF assinado e os dados do certificado usado.
 */
export async function assinarComMeuCertificado(usuarioId: number, pdf: Buffer, senha: string, o: { motivo: string; pfxAgora?: Buffer | null }): Promise<{ pdf: Buffer; info: InfoCertificado }> {
  let pfx: Buffer;
  if (o.pfxAgora?.length) pfx = o.pfxAgora;
  else {
    const d = await banco();
    const [r]: any[] = await d.select().from(certificadosUsuario).where(eq(certificadosUsuario.usuarioId, usuarioId)).limit(1);
    if (!r) throw new CertificadoErro('Você ainda não guardou o seu certificado digital: guarde em Meu cadastro › Certificado digital, ou envie o .pfx agora', 412);
    const aberto = abrirGuardado(r);
    pfx = aberto.pfx;
    if (aberto.chaveAntiga) {
      // Guardado com a chave anterior: recifra com a atual, sem pedir o arquivo de novo
      try { await d.update(certificadosUsuario).set(cifrar(Buffer.from(pfx)) as any).where(eq(certificadosUsuario.usuarioId, usuarioId)); } catch { /* segue: assina mesmo assim */ }
    }
  }
  try {
    const info = await conferir(usuarioId, pfx, senha);
    let assinado: Buffer;
    try { assinado = await assinarICP(pdf, Buffer.from(pfx), senha, { motivo: o.motivo, nome: info.nome }); }
    catch (e: any) { throw new CertificadoErro(`Não foi possível assinar: ${String(e?.message ?? e).slice(0, 200)}`, 422); }
    return { pdf: assinado, info };
  } finally { pfx.fill(0); }
}
