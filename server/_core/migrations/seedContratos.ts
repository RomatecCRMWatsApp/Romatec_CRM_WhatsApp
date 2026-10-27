import defaultsBomJardims from '../../../templates/defaults_empreendimento.json';

/** Configuração jurídica inicial do Bom Jardims: só entra se ainda não houver (nunca sobrescreve o que foi editado) */
export const SEED_EMP_JURIDICO = {
  slug: 'bom-jardims',
  defaults: {
    ...defaultsBomJardims.empreendimento_defaults,
    // Portaria (spec §14.1)
    limite_dependentes: 6,
    limite_veiculos: 3, // Diretrizes de Uso marcadas pela proprietária (out/2026)
    limite_convidados_evento: { chacara: 30, area_vivencia: 15, quadra_e: 50 },
    antecedencia_evento_horas: 48,
    validade_carteira_meses: 24,
  } as Record<string, unknown>,
  vendedora: defaultsBomJardims.vendedora_pf_default as Record<string, unknown>,
};
