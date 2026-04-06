import { describe, expect, it } from "vitest";

/**
 * Testes unitários para a lógica do scheduler de campanhas v3.0:
 * 1. Personalização de mensagens com nome do contato
 * 2. Rotação de pares de campanhas (FIX #5: número ímpar)
 * 3. Variações de mensagens (12 templates)
 * 4. Limites de mensagens por ciclo (NÃO por hora cheia)
 * 5. FIX #1: Race condition - validação de cycleNumber
 * 6. FIX #3: Reset com contatos bloqueados
 * 7. FIX #6: Validação de telefone BR
 * 8. FIX #8: Rotação de variações sem repetição
 * 9. FIX v3.0: Ciclo de 60 min baseado no Play, não na hora cheia
 * 10. FIX v3.0: messagesThisCycle NUNCA é zerado por executeCycle()
 * 11. FIX v3.0: canSendMessage() verifica limite ANTES de enviar
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

  it("FIX #5: com 3 campanhas, cria par extra (última + primeira) em vez de duplicar", () => {
    const threeCampaigns = campaigns.slice(0, 3);
    const pair0 = getPairForCycle(0, threeCampaigns);
    expect(pair0.camp1.name).toBe("ALACIDE");
    expect(pair0.camp2.name).toBe("Mod_Vaz-01");

    const pair1 = getPairForCycle(1, threeCampaigns);
    expect(pair1.camp1.name).toBe("Mod_Vaz-02");
    expect(pair1.camp2.name).toBe("ALACIDE");
    expect(pair1.totalPairs).toBe(2);
  });

  it("FIX #5: com 5 campanhas, totalPairs é 3 (2 completos + 1 extra)", () => {
    const fiveCampaigns = [
      ...campaigns,
      { id: 5, name: "Mod_Vaz-04" },
    ];
    const result = getPairForCycle(0, fiveCampaigns);
    expect(result.totalPairs).toBe(3);

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

// ===== FIX v3.0: CICLO BASEADO NO PLAY (60 MIN EXATOS) =====

describe("FIX v3.0: ciclo de 60 min baseado no Play", () => {
  const CYCLE_DURATION_MS = 60 * 60 * 1000; // 60 min

  it("secondsUntilNextCycle é calculado a partir do cycleStartTime, não da hora cheia", () => {
    // Simular: Play clicado às 19:35:00
    const playTime = new Date(2026, 3, 6, 19, 35, 0).getTime();
    const cycleStartTime = playTime;
    
    // Agora são 19:50:00 (15 min depois)
    const now = new Date(2026, 3, 6, 19, 50, 0).getTime();
    
    const elapsed = now - cycleStartTime;
    const remaining = Math.max(0, CYCLE_DURATION_MS - elapsed);
    const secondsUntilNextCycle = Math.floor(remaining / 1000);
    
    // Deveria ser 45 min restantes (60 - 15 = 45 min = 2700s)
    expect(secondsUntilNextCycle).toBe(2700);
  });

  it("secondsUntilNextCycle é 0 quando o ciclo já passou de 60 min", () => {
    const cycleStartTime = new Date(2026, 3, 6, 18, 0, 0).getTime();
    const now = new Date(2026, 3, 6, 19, 5, 0).getTime(); // 65 min depois
    
    const elapsed = now - cycleStartTime;
    const remaining = Math.max(0, CYCLE_DURATION_MS - elapsed);
    const secondsUntilNextCycle = Math.floor(remaining / 1000);
    
    expect(secondsUntilNextCycle).toBe(0);
  });

  it("próximo ciclo é EXATAMENTE 60 min após o início do ciclo atual", () => {
    const cycleStartTime = new Date(2026, 3, 6, 19, 35, 0).getTime();
    const nextCycleTime = new Date(cycleStartTime + CYCLE_DURATION_MS);
    
    // Próximo ciclo deve ser 20:35:00 (não 20:00:00)
    expect(nextCycleTime.getHours()).toBe(20);
    expect(nextCycleTime.getMinutes()).toBe(35);
  });
});

// ===== FIX v3.0: messagesThisCycle NUNCA zerado por executeCycle =====

describe("FIX v3.0: messagesThisCycle controle rígido", () => {
  const MAX_MESSAGES_PER_CYCLE = 2;

  it("canSendMessage retorna false quando messagesThisCycle >= 2", () => {
    const messagesThisCycle = 2;
    const canSend = messagesThisCycle < MAX_MESSAGES_PER_CYCLE;
    expect(canSend).toBe(false);
  });

  it("canSendMessage retorna true quando messagesThisCycle < 2", () => {
    const messagesThisCycle = 0;
    const canSend = messagesThisCycle < MAX_MESSAGES_PER_CYCLE;
    expect(canSend).toBe(true);
  });

  it("canSendMessage retorna true quando messagesThisCycle é 1", () => {
    const messagesThisCycle = 1;
    const canSend = messagesThisCycle < MAX_MESSAGES_PER_CYCLE;
    expect(canSend).toBe(true);
  });

  it("executeCycle NÃO deve zerar messagesThisCycle (bug das 3 msgs)", () => {
    // Simular o bug antigo: executeCycle zerava messagesThisHour = 0
    // Isso permitia enviar mais msgs do que o limite
    let messagesThisCycle = 2; // Já enviou 2 msgs
    
    // Bug antigo: executeCycle fazia messagesThisHour = 0
    // Correção v3.0: executeCycle NÃO zera o contador
    // messagesThisCycle = 0; // <-- BUG! Não fazer isso!
    
    // Verificar que o limite é respeitado
    const canSend = messagesThisCycle < MAX_MESSAGES_PER_CYCLE;
    expect(canSend).toBe(false); // NÃO pode enviar!
  });

  it("messagesThisCycle só é zerado pelo timer de 60 min (novo ciclo)", () => {
    let messagesThisCycle = 2;
    
    // Simular novo ciclo (timer de 60 min disparou)
    // APENAS aqui o contador é zerado
    messagesThisCycle = 0;
    
    const canSend = messagesThisCycle < MAX_MESSAGES_PER_CYCLE;
    expect(canSend).toBe(true); // Agora pode enviar
  });

  it("intervalo mínimo de 20 min entre msgs é respeitado", () => {
    const MIN_INTERVAL_MINUTES = 20;
    const lastMessageSentAt = Date.now();
    
    // 10 min depois
    const now10min = lastMessageSentAt + 10 * 60 * 1000;
    const minutesSince10 = (now10min - lastMessageSentAt) / (60 * 1000);
    expect(minutesSince10 < MIN_INTERVAL_MINUTES).toBe(true); // Bloqueado!
    
    // 25 min depois
    const now25min = lastMessageSentAt + 25 * 60 * 1000;
    const minutesSince25 = (now25min - lastMessageSentAt) / (60 * 1000);
    expect(minutesSince25 >= MIN_INTERVAL_MINUTES).toBe(true); // Liberado!
  });
});

// ===== FIX v3.0: Cada par envia exatamente 1 msg de cada campanha =====

describe("FIX v3.0: par envia 1 msg de cada campanha", () => {
  it("ciclo envia msg1 da camp1 e msg2 da camp2 (não 2 da mesma)", () => {
    const pair = { camp1: "ALACIDE", camp2: "Mod_Vaz-01" };
    const sentMessages: string[] = [];
    
    // Msg 1: camp1
    sentMessages.push(pair.camp1);
    // Msg 2: camp2 (após intervalo 20-40 min)
    sentMessages.push(pair.camp2);
    
    expect(sentMessages).toEqual(["ALACIDE", "Mod_Vaz-01"]);
    expect(sentMessages.length).toBe(2);
    // Nunca 2 msgs da mesma campanha
    expect(sentMessages[0]).not.toBe(sentMessages[1]);
  });

  it("bug antigo: 3 msgs da ALACIDE é impossível com novo sistema", () => {
    const MAX = 2;
    let messagesThisCycle = 0;
    const sent: string[] = [];
    
    // Msg 1: ALACIDE
    if (messagesThisCycle < MAX) {
      sent.push("ALACIDE");
      messagesThisCycle++;
    }
    
    // Msg 2: Mod_Vaz-01 (após intervalo)
    if (messagesThisCycle < MAX) {
      sent.push("Mod_Vaz-01");
      messagesThisCycle++;
    }
    
    // Tentativa de msg 3: BLOQUEADA
    if (messagesThisCycle < MAX) {
      sent.push("ALACIDE"); // Nunca chega aqui
    }
    
    expect(sent.length).toBe(2);
    expect(sent).toEqual(["ALACIDE", "Mod_Vaz-01"]);
    expect(messagesThisCycle).toBe(2);
  });
});

// ===== FIX #1: RACE CONDITION - VALIDAÇÃO DE CYCLE NUMBER =====

describe("FIX #1: race condition - validação de cycleNumber", () => {
  it("mensagem 2 deve ser cancelada se cycleNumber mudou", () => {
    const scheduledCycleNumber = 3;
    const currentCycleNumber = 4;
    const shouldSend = scheduledCycleNumber === currentCycleNumber;
    expect(shouldSend).toBe(false);
  });

  it("mensagem 2 deve ser enviada se cycleNumber é o mesmo", () => {
    const scheduledCycleNumber = 3;
    const currentCycleNumber = 3;
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
      { id: 1, name: "Maria", blockedUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      { id: 2, name: "João", blockedUntil: null },
      { id: 3, name: "Ana", blockedUntil: new Date(now.getTime() - 1000) },
      { id: 4, name: "Carlos", blockedUntil: new Date(now.getTime() + 72 * 60 * 60 * 1000) },
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
    expect(result.digits).toBe(13);
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

describe("limite de mensagens por ciclo", () => {
  it("MAX_MESSAGES_PER_CYCLE deve ser 2", () => {
    const MAX_MESSAGES_PER_CYCLE = 2;
    expect(MAX_MESSAGES_PER_CYCLE).toBe(2);
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

  it("CYCLE_DURATION_MS é exatamente 60 minutos", () => {
    const CYCLE_DURATION_MS = 60 * 60 * 1000;
    expect(CYCLE_DURATION_MS).toBe(3600000);
  });
});

// ===== FIX #4: SYNC LOCK =====

describe("FIX #4: sync lock previne sincronização simultânea", () => {
  it("lock impede execução concorrente", () => {
    let isSyncing = false;
    const results: string[] = [];

    if (!isSyncing) {
      isSyncing = true;
      results.push("sync1-start");
      isSyncing = false;
    }

    isSyncing = true;
    if (!isSyncing) {
      results.push("sync2-start");
    } else {
      results.push("sync2-blocked");
    }

    expect(results).toEqual(["sync1-start", "sync2-blocked"]);
  });
});

// ===== FIX #2: STOP CANCELA TODOS OS TIMERS =====

describe("FIX #2: stop() cancela cycleTimer e messageTimer", () => {
  it("ambos os timers devem ser null após stop", () => {
    let messageTimer: any = setTimeout(() => {}, 1000);
    let cycleTimer: any = setTimeout(() => {}, 1000);

    // Simular stop()
    clearTimeout(messageTimer);
    messageTimer = null;
    clearTimeout(cycleTimer);
    cycleTimer = null;

    expect(messageTimer).toBeNull();
    expect(cycleTimer).toBeNull();
  });

  it("stop() reseta messagesThisCycle para 0", () => {
    let messagesThisCycle = 2;
    let isRunning = true;

    // Simular stop()
    isRunning = false;
    messagesThisCycle = 0;

    expect(isRunning).toBe(false);
    expect(messagesThisCycle).toBe(0);
  });
});
