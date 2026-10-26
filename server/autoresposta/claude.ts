/**
 * Reserva da classificação (respostas automáticas): só quando as regras por palavra-chave não casam. O Claude escolhe
 * UMA intenção da lista — nunca escreve texto com valores. Sem chave da Anthropic, devolve "outra" (vai para o corretor).
 */
const OPCOES = ['primeiro_contato', 'valores', 'a_vista', 'mapa', 'visita', 'juros', 'documentacao', 'fechar', 'optout', 'outra'] as const;

const SCHEMA = {
  type: 'object',
  properties: { intencao: { type: 'string', enum: [...OPCOES] } },
  required: ['intencao'],
  additionalProperties: false,
};

const SYSTEM = 'Você classifica mensagens de WhatsApp de interessados em chácaras de um condomínio. Responda só com o JSON pedido.';

export function modeloClassificacao(): string {
  return process.env.ANTHROPIC_MODEL_CLASSIFICACAO || 'claude-haiku-5-5';
}

export async function intencaoPeloClaude(texto: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return 'outra';
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ maxRetries: 0, timeout: 5000 });
  const response = await client.beta.messages.create({
    model: modeloClassificacao(),
    max_tokens: 200,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Classifique a mensagem em UMA destas intenções: ${OPCOES.join(', ')}.\n` +
        `primeiro_contato = saudação ou interesse geral; valores = preço/parcelas/entrada/financiamento; a_vista = pagar à vista/desconto; ` +
        `mapa = localização/disponíveis/quadras; visita = conhecer/agendar; juros = objeção sobre juros/preço alto; documentacao = escritura/registro/contrato; ` +
        `fechar = quer reservar/comprar; optout = não quer mais mensagens; outra = qualquer outra coisa.\n\nMensagem: """${texto.slice(0, 500)}"""`,
    }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA as any } },
  } as any);
  if (response.stop_reason === 'refusal') return 'outra';
  const bloco = response.content.find((b: any) => b.type === 'text') as { text?: string } | undefined;
  try {
    const r = JSON.parse(bloco?.text ?? '{}');
    return (OPCOES as readonly string[]).includes(r.intencao) ? r.intencao : 'outra';
  } catch { return 'outra'; }
}
