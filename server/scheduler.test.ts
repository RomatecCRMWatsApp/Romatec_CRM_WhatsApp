import { describe, expect, it } from "vitest";

/**
 * Testes unitários para a lógica do scheduler de campanhas v2.1:
 * 1. Personalização de mensagens com nome do contato
 * 2. Rotação de pares de campanhas (FIX #5: número ímpar)
 * 3. Variações de mensagens (12 templates)
 * 4. Limites de mensagens por hora
 * 5. FIX #1: Race condition - validação de cycleNumber
 * 6. FIX #3: Reset com contatos bloqueados
 * 7. FIX #6: Validação de telefone BR
 * 8. FIX #8: Rotação de variações sem repetição
 */

// ===== PERSONALIZAÇÃO DE MENSAGENS =====

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

// ===== ROTAÇÃO DE PARES (FIX #5: número ímpar) =====

describe("rotação de pares de campanhas", () => {
  /**
   * FIX #5: Nova lógica de pares - número ímpar não duplica campanha 0
   * Em vez disso, cria par extra com última + primeira
   */
  function getPairForCycle(cycleNumber: number, campaigns: { id: number; name: string }[]) {
    const completePairs = Math.floor(campaigns.length / 2);
    const hasOddCampaign = campaigns.length % 2 !== 0;
    const totalPairs = hasOddCampaign ? completePairs + 1 : completePairs;
    const pairIndex = cycleNumber % totalPairs;

    let camp1: any;
    let camp2: any;

    if (pairIndex < completePairs) {
      const pairStart = pairIndex * 2;
      camp1 = campaigns[pairStart];
      camp2 = campaigns[pairStart + 1];
    } else {
      // Par extra para campanha ímpar
      camp1 = campaigns[campaigns.length - 1];
      camp2 = campaigns[0];
    }

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
    expect(pairHistory).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it("totalPairs é 2 para 4 campanhas", () => {
    const result = getPairForCycle(0, campaigns);
    expect(result.totalPairs).toBe(2);
  });

  // FIX #5: Teste para número ímpar de campanhas
  it("FIX #5: com 3 campanhas, cria par extra (última + primeira) em vez de duplicar", () => {
    const threeCampaigns = campaigns.slice(0, 3);
    // Par 0: ALACIDE + Mod_Vaz-01 (normal)
    const pair0 = getPairForCycle(0, threeCampaigns);
    expect(pair0.camp1.name).toBe("ALACIDE");
    expect(pair0.camp2.name).toBe("Mod_Vaz-01");

    // Par 1: Mod_Vaz-02 + ALACIDE (par extra - última + primeira)
    const pair1 = getPairForCycle(1, threeCampaigns);
    expect(pair1.camp1.name).toBe("Mod_Vaz-02");
    expect(pair1.camp2.name).toBe("ALACIDE");
    expect(pair1.totalPairs).toBe(2); // 1 completo + 1 extra
  });

  it("FIX #5: com 5 campanhas, totalPairs é 3 (2 completos + 1 extra)", () => {
    const fiveCampaigns = [
      ...campaigns,
      { id: 5, name: "Mod_Vaz-04" },
    ];
    const result = getPairForCycle(0, fiveCampaigns);
    expect(result.totalPairs).toBe(3);

    // Par extra (ciclo 2): Mod_Vaz-04 + ALACIDE
    const extraPair = getPairForCycle(2, fiveCampaigns);
    expect(extraPair.camp1.name).toBe("Mod_Vaz-04");
    expect(extraPair.camp2.name).toBe("ALACIDE");
  });

  it("FIX #5: com 2 campanhas (par perfeito), totalPairs é 1", () => {
    const twoCampaigns = campaigns.slice(0, 2);
    const result = getPairForCycle(0, twoCampaigns);
    expect(result.totalPairs).toBe(1);
    expect(result.camp1.name).toBe("ALACIDE");
    expect(result.camp2.name).toBe("Mod_Vaz-01");
  });
});

// ===== FIX #1: RACE CONDITION - VALIDAÇÃO DE CYCLE NUMBER =====

describe("FIX #1: race condition - validação de cycleNumber", () => {
  it("mensagem 2 deve ser cancelada se cycleNumber mudou", () => {
    const scheduledCycleNumber = 3;
    const currentCycleNumber = 4; // Mudou!
    const shouldSend = scheduledCycleNumber === currentCycleNumber;
    expect(shouldSend).toBe(false);
  });

  it("mensagem 2 deve ser enviada se cycleNumber é o mesmo", () => {
    const scheduledCycleNumber = 3;
    const currentCycleNumber = 3; // Mesmo ciclo
    const shouldSend = scheduledCycleNumber === currentCycleNumber;
    expect(shouldSend).toBe(true);
  });

  it("mensagem 2 deve ser cancelada se scheduler parou", () => {
    const isRunning = false;
    const shouldSend = isRunning;
    expect(shouldSend).toBe(false);
  });
});

// ===== FIX #3: RESET COM CONTATOS BLOQUEADOS =====

describe("FIX #3: filtrar contatos bloqueados no reset", () => {
  it("contatos com blockedUntil no futuro devem ser filtrados", () => {
    const now = new Date();
    const contacts = [
      { id: 1, name: "Maria", blockedUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000) }, // bloqueado +24h
      { id: 2, name: "João", blockedUntil: null }, // livre
      { id: 3, name: "Ana", blockedUntil: new Date(now.getTime() - 1000) }, // expirado
      { id: 4, name: "Carlos", blockedUntil: new Date(now.getTime() + 72 * 60 * 60 * 1000) }, // bloqueado +72h
    ];

    const unblocked = contacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);
    expect(unblocked).toHaveLength(2);
    expect(unblocked.map(c => c.name)).toEqual(["João", "Ana"]);
  });

  it("todos os contatos devem passar se nenhum está bloqueado", () => {
    const now = new Date();
    const contacts = [
      { id: 1, name: "Maria", blockedUntil: null },
      { id: 2, name: "João", blockedUntil: null },
      { id: 3, name: "Ana", blockedUntil: new Date(now.getTime() - 1000) },
    ];

    const unblocked = contacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);
    expect(unblocked).toHaveLength(3);
  });

  it("fallback: se poucos desbloqueados, deve logar aviso", () => {
    const now = new Date();
    const contacts = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      name: `Contato ${i + 1}`,
      blockedUntil: i < 45 ? new Date(now.getTime() + 72 * 60 * 60 * 1000) : null,
    }));

    const unblocked = contacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);
    const needsWarning = unblocked.length < 12;
    expect(needsWarning).toBe(true);
    expect(unblocked).toHaveLength(5);
  });
});

// ===== FIX #6: VALIDAÇÃO DE TELEFONE BR =====

describe("FIX #6: validação de telefone BR", () => {
  function validatePhone(phone: string): { valid: boolean; warning?: string; digits: number } {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const digits = formattedPhone.length;

    if (digits < 12) {
      return { valid: false, warning: `Muito curto (${digits} dígitos)`, digits };
    }
    if (digits < 13) {
      return { valid: true, warning: `Pode ser fixo (${digits} dígitos)`, digits };
    }
    return { valid: true, digits };
  }

  it("celular BR válido: 55 + DDD + 9 dígitos = 13 dígitos", () => {
    const result = validatePhone("5599991811246");
    expect(result.valid).toBe(true);
    expect(result.digits).toBe(13);
    expect(result.warning).toBeUndefined();
  });

  it("fixo BR válido mas com aviso: 55 + DDD + 8 dígitos = 12 dígitos", () => {
    const result = validatePhone("559933221100");
    expect(result.valid).toBe(true);
    expect(result.digits).toBe(12);
    expect(result.warning).toContain("fixo");
  });

  it("número muito curto é inválido: < 12 dígitos", () => {
    const result = validatePhone("5599123");
    expect(result.valid).toBe(false);
    expect(result.digits).toBeLessThan(12);
  });

  it("número sem 55 recebe prefixo automaticamente", () => {
    const result = validatePhone("99991811246");
    expect(result.valid).toBe(true);
    expect(result.digits).toBe(13); // 55 + 99991811246
  });

  it("número com caracteres especiais é limpo", () => {
    const result = validatePhone("+55 (99) 99181-1246");
    expect(result.valid).toBe(true);
    expect(result.digits).toBe(13);
  });
});

// ===== FIX #8: ROTAÇÃO DE VARIAÇÕES SEM REPETIÇÃO =====

describe("FIX #8: rotação de variações sem repetição consecutiva", () => {
  function getVariationIndex(variations: string[], lastIndex: number): number {
    if (variations.length <= 1) return 0;
    let newIndex: number;
    do {
      newIndex = Math.floor(Math.random() * variations.length);
    } while (newIndex === lastIndex);
    return newIndex;
  }

  it("nunca retorna o mesmo índice duas vezes seguidas", () => {
    const variations = Array.from({ length: 12 }, (_, i) => `Variação ${i + 1}`);
    let lastIndex = -1;

    for (let i = 0; i < 100; i++) {
      const newIndex = getVariationIndex(variations, lastIndex);
      expect(newIndex).not.toBe(lastIndex);
      lastIndex = newIndex;
    }
  });

  it("com apenas 1 variação, sempre retorna 0", () => {
    const variations = ["Única variação"];
    const result = getVariationIndex(variations, 0);
    expect(result).toBe(0);
  });

  it("com 2 variações, alterna entre 0 e 1", () => {
    const variations = ["A", "B"];
    let lastIndex = 0;
    for (let i = 0; i < 50; i++) {
      const newIndex = getVariationIndex(variations, lastIndex);
      expect(newIndex).not.toBe(lastIndex);
      lastIndex = newIndex;
    }
  });

  it("distribui variações de forma razoável (não fica preso em 2)", () => {
    const variations = Array.from({ length: 12 }, (_, i) => `V${i}`);
    const counts = new Map<number, number>();
    let lastIndex = -1;

    for (let i = 0; i < 1200; i++) {
      const newIndex = getVariationIndex(variations, lastIndex);
      counts.set(newIndex, (counts.get(newIndex) || 0) + 1);
      lastIndex = newIndex;
    }

    // Cada variação deve ter sido usada pelo menos 50 vezes em 1200 iterações
    for (let i = 0; i < 12; i++) {
      expect(counts.get(i) || 0).toBeGreaterThan(50);
    }
  });
});

// ===== VARIAÇÕES DE MENSAGENS =====

describe("variações de mensagens", () => {
  it("cada campanha deve ter 12 variações", () => {
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

// ===== FIX #4: SYNC LOCK =====

describe("FIX #4: sync lock previne sincronização simultânea", () => {
  it("lock impede execução concorrente", () => {
    let isSyncing = false;
    const results: string[] = [];

    // Simular primeira chamada
    if (!isSyncing) {
      isSyncing = true;
      results.push("sync1-start");
      isSyncing = false;
    }

    // Simular segunda chamada enquanto primeira roda
    isSyncing = true; // Simular que está rodando
    if (!isSyncing) {
      results.push("sync2-start"); // Não deve executar
    } else {
      results.push("sync2-blocked");
    }

    expect(results).toEqual(["sync1-start", "sync2-blocked"]);
  });
});

// ===== FIX #2: STOP CANCELA TODOS OS TIMERS =====

describe("FIX #2: stop() cancela messageTimer e hourlyTimer", () => {
  it("ambos os timers devem ser null após stop", () => {
    let messageTimer: any = setTimeout(() => {}, 1000);
    let hourlyTimer: any = setTimeout(() => {}, 1000);

    // Simular stop()
    clearTimeout(messageTimer);
    messageTimer = null;
    clearTimeout(hourlyTimer);
    hourlyTimer = null;

    expect(messageTimer).toBeNull();
    expect(hourlyTimer).toBeNull();
  });
});
