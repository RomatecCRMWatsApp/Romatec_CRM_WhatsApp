/**
 * Configuração da privacidade. Nada de dados da empresa no código: identificação do controlador e do encarregado
 * vêm de variáveis de ambiente e ficam PENDENTES enquanto não forem preenchidas (docs/privacidade/pendencias-juridicas-e-negocio.md).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DOCUMENTOS_PRIVACIDADE, type DocumentoPrivacidade } from '../../shared/privacidade';

type Env = Record<string, string | undefined>;

/** on/off explícito; sem valor: ligado fora de produção e DESLIGADO em produção (publicação depende de aprovação) */
function flag(env: Env, nome: string): boolean {
  const v = String(env[nome] ?? '').trim().toLowerCase();
  if (v === 'on' || v === '1' || v === 'true') return true;
  if (v === 'off' || v === '0' || v === 'false') return false;
  return env.NODE_ENV !== 'production';
}

/** Formulário público de pedidos de titular (/privacidade) */
export const canalAtivo = (env: Env = process.env) => flag(env, 'PRIVACIDADE_CANAL_ATIVO');
/** Minutas de Termos/Aviso visíveis e aceite versionado (só depois da aprovação jurídica em produção) */
export const minutasAtivas = (env: Env = process.env) => flag(env, 'PRIVACIDADE_MINUTAS_ATIVAS');

/** Prazo interno de resposta (dias corridos). Configurável: o prazo legal por tipo de pedido depende de validação jurídica */
export function prazoDias(env: Env = process.env): number {
  const n = Number(env.PRIVACIDADE_PRAZO_DIAS);
  return Number.isInteger(n) && n > 0 && n <= 90 ? n : 15;
}

export interface Controlador {
  razaoSocial: string | null;
  cnpj: string | null;
  endereco: string | null;
  emailPrivacidade: string | null;
  encarregado: string | null;
}

/** Identificação do controlador; campo vazio = PENDENTE (a tela mostra "a definir", nunca um dado inventado) */
export function controlador(env: Env = process.env): Controlador & { pendentes: string[] } {
  const v = (k: string) => (String(env[k] ?? '').trim() || null);
  const c: Controlador = {
    razaoSocial: v('PRIVACIDADE_CONTROLADOR_RAZAO_SOCIAL'),
    cnpj: v('PRIVACIDADE_CONTROLADOR_CNPJ'),
    endereco: v('PRIVACIDADE_CONTROLADOR_ENDERECO'),
    emailPrivacidade: v('PRIVACIDADE_EMAIL'),
    encarregado: v('PRIVACIDADE_ENCARREGADO'),
  };
  return { ...c, pendentes: Object.entries(c).filter(([, x]) => !x).map(([k]) => k) };
}

/** Texto da minuta (docs/privacidade/minutas) e o hash SHA-256 dele — o aceite grava versão + hash */
export function documento(doc: DocumentoPrivacidade, raiz = process.cwd()): { titulo: string; versao: string; texto: string; hash: string } {
  const d = DOCUMENTOS_PRIVACIDADE[doc];
  const texto = readFileSync(path.join(raiz, 'docs', 'privacidade', 'minutas', d.arquivo), 'utf8');
  return { titulo: d.titulo, versao: d.versao, texto, hash: createHash('sha256').update(texto).digest('hex') };
}

/** Segredo dos códigos e links assinados (mesmo padrão do resto do sistema: falha em produção sem JWT_SECRET) */
export function segredo(env: Env = process.env): string {
  const s = env.PRIVACIDADE_LINK_SECRET || env.JWT_SECRET;
  if (s) return s;
  if (env.NODE_ENV === 'production') throw new Error('Defina JWT_SECRET: sem ele os links e códigos de privacidade poderiam ser forjados');
  return 'romatec-privacidade-dev';
}
