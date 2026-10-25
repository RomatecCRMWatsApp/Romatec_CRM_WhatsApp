/**
 * Reuniões com clientes: gravação no navegador (ou áudio importado), transcrição em português e resumo com os
 * próximos passos, ligada ao lead. O áudio não fica guardado: só a transcrição e o resumo (LGPD — o mínimo).
 * A gravação sobe em partes de alguns minutos enquanto acontece, então fechar a aba não perde o que já foi.
 */
export const TIPOS_REUNIAO = [['presencial', 'Presencial'], ['ligacao', 'Ligação'], ['video', 'Videochamada']] as const;
export type TipoReuniao = typeof TIPOS_REUNIAO[number][0];
export const rotuloTipoReuniao = (t: string) => TIPOS_REUNIAO.find(x => x[0] === t)?.[1] ?? t;

export const STATUS_REUNIAO: Record<string, string> = {
  gravando: 'Gravando', processando: 'Transcrevendo e resumindo', pronta: 'Pronta', erro: 'Com erro',
};

/** Duração de cada parte da gravação (cada uma é transcrita assim que sobe) */
export const PARTE_SEGUNDOS = 5 * 60;
/** Limite do serviço de transcrição por arquivo */
export const LIMITE_PARTE_MB = 24;

export interface ResumoReuniao {
  resumo: string;
  pontosPrincipais: string[];
  interesse: string;
  objecoes: string[];
  proximosPassos: string[];
  dadosCliente: string[];
}

/** JSON Schema do resumo (saída estruturada da IA) */
export const SCHEMA_RESUMO = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'pontosPrincipais', 'interesse', 'objecoes', 'proximosPassos', 'dadosCliente'],
  properties: {
    resumo: { type: 'string', description: 'Resumo da reunião em 3 a 6 frases, em português' },
    pontosPrincipais: { type: 'array', items: { type: 'string' }, description: 'O que foi tratado, em tópicos curtos' },
    interesse: { type: 'string', description: 'Interesse do cliente: unidade/chácara, forma de pagamento, prazo, temperatura (quente/morno/frio) — ou "não ficou claro"' },
    objecoes: { type: 'array', items: { type: 'string' }, description: 'Dúvidas e objeções do cliente' },
    proximosPassos: { type: 'array', items: { type: 'string' }, description: 'Próximos passos combinados, com responsável e data quando ditos' },
    dadosCliente: { type: 'array', items: { type: 'string' }, description: 'Dados que o cliente informou (cidade, família, renda, profissão…) — só o que foi dito' },
  },
} as const;

/** Texto do resumo para copiar (WhatsApp, e-mail, ficha do lead) */
export function resumoEmTexto(titulo: string, r: ResumoReuniao): string {
  const lista = (rotulo: string, xs: string[]) => (xs.length ? [`*${rotulo}*`, ...xs.map(x => `• ${x}`), ''] : []);
  return [
    `📝 ${titulo}`, '', r.resumo, '',
    ...lista('Pontos principais', r.pontosPrincipais),
    ...(r.interesse ? ['*Interesse*', r.interesse, ''] : []),
    ...lista('Dúvidas e objeções', r.objecoes),
    ...lista('Próximos passos', r.proximosPassos),
    ...lista('Dados do cliente', r.dadosCliente),
  ].join('\n').trim();
}

export const duracaoTexto = (seg: number | null | undefined) => {
  const s = Math.max(0, Math.round(Number(seg) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
