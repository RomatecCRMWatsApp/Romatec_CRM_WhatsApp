/**
 * Recrutamento de corretores, secretárias e empreendedores.
 * 1) O administrador cria o convite (nome + WhatsApp) e manda pelo WhatsApp: texto com o link do formulário,
 *    o formulário em PDF e em DOC (para quem prefere preencher fora e mandar de volta).
 * 2) O candidato preenche tudo no link e anexa os documentos (CRECI, certidão, documento com foto, selfie).
 * 3) O administrador confere e aprova: o sistema cria o acesso com senha provisória e manda pelo WhatsApp;
 *    no 1º login a pessoa troca a senha. Empreendedor: sem formulário — os dados vêm do proprietário do empreendimento.
 */
import { ROTULO_DOCUMENTO } from './cadastro';

export const PERFIS_RECRUTAMENTO = ['corretor', 'secretario', 'empreendedor'] as const;
export type PerfilRecrutamento = typeof PERFIS_RECRUTAMENTO[number];
export const ROTULO_PERFIL_RECRUTAMENTO: Record<PerfilRecrutamento, string> = { corretor: 'Corretor(a)', secretario: 'Secretária(o)', empreendedor: 'Empreendedor(a)' };

/** Quem usa a aba Recrutamento: o administrador e a secretária */
export const podeRecrutar = (perfil: string | null | undefined) => perfil === 'admin' || perfil === 'secretario';

export const STATUS_RECRUTAMENTO: Record<string, string> = {
  convidado: 'Aguardando o formulário', preenchido: 'Formulário recebido — conferir', aprovado: 'Acesso criado', recusado: 'Recusado', cancelado: 'Cancelado',
};

/** Validade do link do formulário e da senha provisória */
export const DIAS_LINK_FORMULARIO = 15;
export const DIAS_SENHA_PROVISORIA = 7;

export interface DocRecrutamento { tipo: string; rotulo: string; obrigatorio: boolean; dica?: string }

/** Documentos pedidos a cada perfil ("foto" = selfie do cadastro e da carteirinha do corretor) */
export function documentosDoPerfil(perfil: PerfilRecrutamento): DocRecrutamento[] {
  const foto: DocRecrutamento = { tipo: 'foto', rotulo: 'Foto do rosto (selfie)', obrigatorio: true, dica: 'De frente, com boa luz — vai na ficha de credenciamento' };
  const identidade: DocRecrutamento = { tipo: 'cnh', rotulo: 'Documento com foto (CNH, RG ou CIN)', obrigatorio: true, dica: 'Frente e verso, foto ou PDF' };
  const residencia: DocRecrutamento = { tipo: 'comprovante_residencia', rotulo: ROTULO_DOCUMENTO.comprovante_residencia, obrigatorio: false };
  if (perfil === 'corretor') {
    return [
      foto, identidade,
      { tipo: 'cartao_creci', rotulo: ROTULO_DOCUMENTO.cartao_creci, obrigatorio: true, dica: 'Carteirinha do CRECI' },
      { tipo: 'certidao_creci', rotulo: ROTULO_DOCUMENTO.certidao_creci, obrigatorio: true, dica: 'Certidão válida — emita no site do CRECI da sua região' },
      { tipo: 'certificado_cnai', rotulo: ROTULO_DOCUMENTO.certificado_cnai, obrigatorio: false },
      residencia,
    ];
  }
  return [foto, identidade, residencia];
}

/** Página pública do formulário (fora do menu do CRM) */
export const linkFormulario = (base: string, token: string) => `${base.replace(/\/+$/, '')}/formulario/${token}`;

const primeiro = (nome: string) => String(nome || '').trim().split(/\s+/)[0] || '';

/** Texto do convite no WhatsApp (vai junto com o PDF e o DOC do formulário) */
export function mensagemConvite(nome: string, perfil: PerfilRecrutamento, link: string, empreendimento?: string | null, diasValidade = DIAS_LINK_FORMULARIO): string {
  const docs = documentosDoPerfil(perfil).filter(d => d.obrigatorio).map(d => `• ${d.rotulo}`);
  return [
    `Olá, ${primeiro(nome)}! 👋 Aqui é da *Romatec Consultoria Total* — consultoria imobiliária.`,
    '',
    ...(empreendimento ? [`Você foi convidado(a) para atuar com a Romatec no empreendimento *${empreendimento}*. 🤝`, ''] : []),
    `Para o seu cadastro como *${ROTULO_PERFIL_RECRUTAMENTO[perfil]}* no Romatec CRM, preencha o formulário pelo link abaixo (leva uns 10 minutos):`,
    link,
    '',
    '📎 Tenha em mãos para anexar:',
    ...docs,
    '',
    `O link vale por ${diasValidade} dias. Se preferir, preencha o formulário em PDF ou DOC que segue nesta conversa e devolva por aqui com os documentos.`,
    'Assim que conferirmos, você recebe o seu login e uma senha provisória pelo WhatsApp.',
  ].join('\n');
}

/** Acesso criado: login + senha provisória (troca obrigatória no 1º acesso) */
export function mensagemAcesso(nome: string, login: string, senha: string, url: string, diasValidade = DIAS_SENHA_PROVISORIA): string {
  return [
    `Olá, ${primeiro(nome)}! ✅ Seu acesso ao CRM da Romatec está pronto.`,
    '',
    `🔗 ${url.replace(/\/+$/, '')}/login`,
    `👤 Login: ${login}`,
    `🔑 Senha provisória: ${senha}`,
    '',
    `No primeiro acesso o sistema pede para você criar a sua senha. A senha provisória vale por ${diasValidade} dias.`,
    'Não compartilhe esta senha com ninguém.',
  ].join('\n');
}

/** Aviso ao administrador quando o candidato envia o formulário */
export function mensagemFormularioRecebido(nome: string, perfil: PerfilRecrutamento, url: string): string {
  return `📋 Recrutamento: ${nome} (${ROTULO_PERFIL_RECRUTAMENTO[perfil]}) enviou o formulário com os documentos.\nConfira e aprove em ${url.replace(/\/+$/, '')}/recrutamento`;
}

/** Senha provisória legível (sem 0/O/1/l), com letras e números: ex. "Rmt-7hk4p2" */
export function gerarSenhaProvisoria(aleatorio: (n: number) => number): string {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alfabeto[aleatorio(alfabeto.length)];
  if (!/\d/.test(s)) s = s.slice(0, 5) + String(2 + aleatorio(8));
  return `Rmt-${s}`;
}
