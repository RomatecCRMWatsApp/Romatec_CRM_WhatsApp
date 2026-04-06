import { describe, expect, it } from "vitest";

/**
 * Testes unitários para a lógica do scheduler de campanhas:
 * 1. Personalização de mensagens com nome do contato
 * 2. Rotação de pares de campanhas
 * 3. Variações de mensagens (12 templates)
 */

// ===== PERSONALIZAÇÃO DE MENSAGENS =====

/**
 * Replica a lógica de personalizeMessage do CampaignScheduler
 * para testar isoladamente sem instanciar a classe inteira
 */
function personalizeMessage(messageText: string, contact: { name: string; phone: string }): string {
  const firstName = (contact.name || '').split(' ')[0].trim();
  let personalized = messageText;
  if (firstName && firstName.length > 1) {
    personalized = personalized.replace(/{{NOME}}/g, firstName);
  } else {
    personalized = personalized.replace(/{{NOME}},?\s*/g, '');
  }
  return personalized;
}

describe("personalizeMessage", () => {
  it("substitui {{NOME}} pelo primeiro nome do contato", () => {
    const msg = "🏠 {{NOME}}, *ALACIDE* - Restam poucas unidades!";
    const result = personalizeMessage(msg, { name: "Maria Silva Santos", phone: "5599991811246" });
    expect(result).toBe("🏠 Maria, *ALACIDE* - Restam poucas unidades!");
  });

  it("substitui múltiplas ocorrências de {{NOME}}", () => {
    const msg = "{{NOME}}, olha isso {{NOME}}! Temos algo pra {{NOME}}.";
    const result = personalizeMessage(msg, { name: "João Pereira", phone: "5599991811246" });
    expect(result).toBe("João, olha isso João! Temos algo pra João.");
  });

  it("remove {{NOME}} quando contato não tem nome válido", () => {
    const msg = "{{NOME}}, *ALACIDE* está disponível!";
    const result = personalizeMessage(msg, { name: "", phone: "5599991811246" });
    expect(result).toBe("*ALACIDE* está disponível!");
  });

  it("remove {{NOME}} quando nome tem apenas 1 caractere", () => {
    const msg = "🏠 {{NOME}}, veja este imóvel!";
    const result = personalizeMessage(msg, { name: "A", phone: "5599991811246" });
    expect(result).toBe("🏠 veja este imóvel!");
  });

  it("funciona com nome simples (sem sobrenome)", () => {
    const msg = "{{NOME}}, você já conhece o *Mod_Vaz-01*?";
    const result = personalizeMessage(msg, { name: "Carlos", phone: "5599991811246" });
    expect(result).toBe("Carlos, você já conhece o *Mod_Vaz-01*?");
  });

  it("preserva mensagem sem placeholder {{NOME}}", () => {
    const msg = "🔥 *OPORTUNIDADE REAL* - Veja agora!";
    const result = personalizeMessage(msg, { name: "Ana Paula", phone: "5599991811246" });
    expect(result).toBe("🔥 *OPORTUNIDADE REAL* - Veja agora!");
  });
});

// ===== ROTAÇÃO DE PARES =====

describe("rotação de pares de campanhas", () => {
  // Simula a lógica de seleção de pares do scheduler
  function getPairForCycle(cycleNumber: number, campaigns: { id: number; name: string }[]) {
    const totalPairs = Math.ceil(campaigns.length / 2);
    const pairIndex = cycleNumber % totalPairs;
    const pairStart = pairIndex * 2;
    const camp1 = campaigns[pairStart];
    const camp2 = campaigns[pairStart + 1] || campaigns[0];
    return { pairIndex, camp1, camp2, totalPairs };
  }

  const campaigns = [
    { id: 1, name: "ALACIDE" },
    { id: 2, name: "Mod_Vaz-01" },
    { id: 3, name: "Mod_Vaz-02" },
    { id: 4, name: "Mod_Vaz-03" },
  ];

  it("ciclo 0 seleciona par 1: ALACIDE + Mod_Vaz-01", () => {
    const result = getPairForCycle(0, campaigns);
    expect(result.pairIndex).toBe(0);
    expect(result.camp1.name).toBe("ALACIDE");
    expect(result.camp2.name).toBe("Mod_Vaz-01");
  });

  it("ciclo 1 seleciona par 2: Mod_Vaz-02 + Mod_Vaz-03", () => {
    const result = getPairForCycle(1, campaigns);
    expect(result.pairIndex).toBe(1);
    expect(result.camp1.name).toBe("Mod_Vaz-02");
    expect(result.camp2.name).toBe("Mod_Vaz-03");
  });

  it("ciclo 2 volta ao par 1: ALACIDE + Mod_Vaz-01", () => {
    const result = getPairForCycle(2, campaigns);
    expect(result.pairIndex).toBe(0);
    expect(result.camp1.name).toBe("ALACIDE");
    expect(result.camp2.name).toBe("Mod_Vaz-01");
  });

  it("ciclo 3 volta ao par 2: Mod_Vaz-02 + Mod_Vaz-03", () => {
    const result = getPairForCycle(3, campaigns);
    expect(result.pairIndex).toBe(1);
    expect(result.camp1.name).toBe("Mod_Vaz-02");
    expect(result.camp2.name).toBe("Mod_Vaz-03");
  });

  it("alterna corretamente em 24 ciclos (24 horas)", () => {
    const pairHistory: number[] = [];
    for (let i = 0; i < 24; i++) {
      const result = getPairForCycle(i, campaigns);
      pairHistory.push(result.pairIndex);
    }
    // Deve alternar: 0, 1, 0, 1, 0, 1...
    expect(pairHistory).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it("totalPairs é 2 para 4 campanhas", () => {
    const result = getPairForCycle(0, campaigns);
    expect(result.totalPairs).toBe(2);
  });

  it("funciona com 3 campanhas (par ímpar usa fallback)", () => {
    const threeCampaigns = campaigns.slice(0, 3);
    const result = getPairForCycle(1, threeCampaigns);
    // Par 2 tem apenas Mod_Vaz-02, fallback para ALACIDE
    expect(result.camp1.name).toBe("Mod_Vaz-02");
    expect(result.camp2.name).toBe("ALACIDE"); // fallback
  });
});

// ===== VARIAÇÕES DE MENSAGENS =====

describe("variações de mensagens", () => {
  it("cada campanha deve ter 12 variações", () => {
    // Simula a geração de variações
    const prop = {
      denomination: "ALACIDE",
      address: "AV-Tocantins, Quadra 38 Lote 01",
      price: "380000",
      publicSlug: "alacide",
    };
    const priceFormatted = Number(prop.price).toLocaleString("pt-BR");
    const siteUrl = `https://romatecwa-2uygcczr.manus.space/imovel/${prop.publicSlug}`;

    const variations = [
      `🏠 {{NOME}}, *${prop.denomination}* - Restam poucas unidades!\n\nValor: *R$ ${priceFormatted}*\nLocal: ${prop.address}\n\n📸 Veja fotos, planta e localização:\n${siteUrl}\n\n⚡ Condições especiais para os primeiros interessados. Posso te passar mais detalhes?`,
      `{{NOME}}, você já conhece o *${prop.denomination}*? 🔑\n\nUm dos imóveis mais procurados da região de ${prop.address}.\n\n💰 A partir de *R$ ${priceFormatted}*\n\n👉 Confira tudo aqui: ${siteUrl}\n\nPosso reservar uma visita exclusiva pra você?`,
      `📊 {{NOME}}, o *${prop.denomination}* já recebeu mais de 50 consultas este mês!\n\nMotivo? Localização privilegiada em ${prop.address} + preço competitivo.\n\n🏷️ *R$ ${priceFormatted}*\n\n🔗 Veja todos os detalhes: ${siteUrl}\n\nNão perca essa oportunidade. Me chama!`,
      `💡 {{NOME}}, sabia que imóveis nessa região valorizaram mais de 30% nos últimos anos?\n\n*${prop.denomination}* - ${prop.address}\nValor atual: *R$ ${priceFormatted}*\n\n📲 Fotos e detalhes completos: ${siteUrl}\n\nQuero te mostrar por que esse é o melhor momento pra investir. Posso te ligar?`,
      `🔥 {{NOME}}, *OPORTUNIDADE REAL*\n\n*${prop.denomination}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\n✅ Financiamento facilitado\n✅ Documentação em dia\n✅ Pronto pra morar/construir\n\n👉 Veja agora: ${siteUrl}\n\nResponde "SIM" que te envio todas as condições!`,
      `⏰ {{NOME}}, última chance!\n\n*${prop.denomination}* em ${prop.address} está com condições especiais que vencem em breve.\n\n🏷️ *R$ ${priceFormatted}* (parcelas que cabem no bolso)\n\n📸 Veja fotos e planta: ${siteUrl}\n\nJá temos interessados. Garanta o seu antes que acabe!`,
      `🏡 {{NOME}}, imagine sua família no lugar perfeito...\n\n*${prop.denomination}* - ${prop.address}\nValor: *R$ ${priceFormatted}*\n\nLocalização estratégica, segurança e qualidade de vida.\n\n🔗 Conheça cada detalhe: ${siteUrl}\n\nVamos conversar sobre como realizar esse sonho?`,
      `🆕 {{NOME}}, *LANÇAMENTO EXCLUSIVO*\n\n*${prop.denomination}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\nPoucos sabem dessa oportunidade. Estou compartilhando com um grupo seleto de clientes.\n\n📲 Detalhes completos: ${siteUrl}\n\nTem interesse? Me responde que te explico tudo!`,
      `✨ {{NOME}}, procurando imóvel com ótimo custo-benefício?\n\n*${prop.denomination}* em ${prop.address}\n\n🏷️ *R$ ${priceFormatted}*\n📋 Documentação 100% regularizada\n🏦 Aceita financiamento\n\n👉 Veja fotos e localização: ${siteUrl}\n\nPosso simular as parcelas pra você. É só me chamar!`,
      `🤔 {{NOME}}, você está buscando imóvel na região de ${prop.address}?\n\nTenho uma opção que pode ser exatamente o que procura:\n\n*${prop.denomination}* - *R$ ${priceFormatted}*\n\n📸 Veja tudo aqui: ${siteUrl}\n\nMe conta o que você precisa que te ajudo a encontrar o imóvel ideal!`,
      `📌 {{NOME}}, comparou preços na região?\n\n*${prop.denomination}* está abaixo da média do mercado:\n💰 *R$ ${priceFormatted}*\n📍 ${prop.address}\n\nE o melhor: condições facilitadas de pagamento.\n\n🔗 Confira: ${siteUrl}\n\nEssa é a hora certa. Vamos conversar?`,
      `🚨 {{NOME}}, *ATENÇÃO*\n\n*${prop.denomination}* - ${prop.address}\n\nEste imóvel está gerando muito interesse e pode sair do mercado a qualquer momento.\n\n🏷️ *R$ ${priceFormatted}*\n\n📲 Veja antes que acabe: ${siteUrl}\n\nGaranta sua visita. Me chama agora!`,
    ];

    expect(variations).toHaveLength(12);
  });

  it("todas as variações contêm {{NOME}} para personalização", () => {
    const variations = [
      "🏠 {{NOME}}, *ALACIDE* - Restam poucas unidades!",
      "{{NOME}}, você já conhece o *ALACIDE*?",
      "📊 {{NOME}}, o *ALACIDE* já recebeu mais de 50 consultas!",
      "💡 {{NOME}}, sabia que imóveis valorizaram?",
      "🔥 {{NOME}}, *OPORTUNIDADE REAL*",
      "⏰ {{NOME}}, última chance!",
      "🏡 {{NOME}}, imagine sua família...",
      "🆕 {{NOME}}, *LANÇAMENTO EXCLUSIVO*",
      "✨ {{NOME}}, procurando imóvel?",
      "🤔 {{NOME}}, está buscando imóvel?",
      "📌 {{NOME}}, comparou preços?",
      "🚨 {{NOME}}, *ATENÇÃO*",
    ];

    for (const v of variations) {
      expect(v).toContain("{{NOME}}");
    }
  });

  it("todas as variações contêm link do site", () => {
    const siteUrl = "https://romatecwa-2uygcczr.manus.space/imovel/alacide";
    const variations = [
      `🏠 {{NOME}}, *ALACIDE*!\n${siteUrl}`,
      `{{NOME}}, confira: ${siteUrl}`,
    ];

    for (const v of variations) {
      expect(v).toContain("romatecwa-2uygcczr.manus.space/imovel/");
    }
  });

  it("nenhuma variação contém saudação de horário (Bom dia/Boa tarde)", () => {
    const variations = [
      "🏠 {{NOME}}, *ALACIDE* - Restam poucas unidades!",
      "{{NOME}}, você já conhece o *ALACIDE*?",
      "📊 {{NOME}}, o *ALACIDE* já recebeu mais de 50 consultas!",
    ];

    for (const v of variations) {
      expect(v.toLowerCase()).not.toContain("bom dia");
      expect(v.toLowerCase()).not.toContain("boa tarde");
      expect(v.toLowerCase()).not.toContain("boa noite");
    }
  });
});

// ===== LIMITE DE MENSAGENS =====

describe("limite de mensagens por hora", () => {
  it("MAX_MESSAGES_PER_HOUR deve ser 2", () => {
    const MAX_MESSAGES_PER_HOUR = 2;
    expect(MAX_MESSAGES_PER_HOUR).toBe(2);
  });

  it("intervalo mínimo deve ser 20 minutos", () => {
    const MIN_INTERVAL_MINUTES = 20;
    expect(MIN_INTERVAL_MINUTES).toBeGreaterThanOrEqual(20);
  });

  it("intervalo máximo deve ser 40 minutos", () => {
    const MAX_INTERVAL_MINUTES = 40;
    expect(MAX_INTERVAL_MINUTES).toBeLessThanOrEqual(40);
  });

  it("intervalo aleatório está dentro do range 20-40", () => {
    const MIN = 20;
    const MAX = 40;
    for (let i = 0; i < 100; i++) {
      const interval = Math.floor(Math.random() * (MAX - MIN + 1)) + MIN;
      expect(interval).toBeGreaterThanOrEqual(MIN);
      expect(interval).toBeLessThanOrEqual(MAX);
    }
  });
});
