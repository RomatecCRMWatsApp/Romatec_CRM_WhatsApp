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

/** Regime da Quadra F antes do CPCV v3.1 (área pública doada): a migração troca pelo atual só onde ainda estiver este texto */
export const QUADRA_F_REGIME_ANTIGO = 'área pública integrante dos 25% doados ao Município, juntamente com o sistema viário, com uso, conservação e gestão concedidos à ASSOCIAÇÃO por ato do Poder Executivo Municipal (Lei n.º 6.766/1979, art. 2º, § 8º), mantida a destinação de lazer e recreação coletiva; a APP do córrego permanece protegida e não é computada como área institucional';
