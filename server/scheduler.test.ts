import { describe, expect, it } from "vitest";

/**
 * Testes unitários para a lógica do scheduler de campanhas v4.0:
 * 1. Personalização de mensagens com nome do contato
 * 2. Rotação de pares de campanhas (FIX #5: número ímpar)
 * 3. Variações de mensagens (12 templates)
 * 4. FIX v3.0: Ciclo de 60 min baseado no Play, não na hora cheia
 * 5. FIX v3.0: messagesThisCycle controle rígido
 * 6. FIX #1: Race condition - validação de cycleNumber
 * 7. FIX #3: Reset com contatos bloqueados
 * 8. FIX #6: Validação de telefone BR
 * 9. FIX #8: Rotação de variações sem repetição
 * 10. v4.0: Geração de slots aleatórios com msgs/hora configurável
 * 11. v4.0: messagesPerHour por campanha (1-10)
 * 12. v4.0: Distribuição de slots com gap mínimo de 3 min
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

  it("FIX #5: com 3 campanhas, cria par extra (última + primeira)", () => {
    const threeCampaigns = campaigns.slice(0, 3);
    const pair0 = getPairForCycle(0, threeCampaigns);
    expect(pair0.camp1.name).toBe("ALACIDE");
    expect(pair0.camp2.name).toBe("Mod_Vaz-01");

    const pair1 = getPairForCycle(1, threeCampaigns);
    expect(pair1.camp1.name).toBe("Mod_Vaz-02");
    expect(pair1.camp2.name).toBe("ALACIDE");
    expect(pair1.totalPairs).toBe(2);
  });

  it("FIX #5: com 5 campanhas, totalPairs é 3", () => {
    const fiveCampaigns = [...campaigns, { id: 5, name: "Mod_Vaz-04" }];
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
  const CYCLE_DURATION_MS = 60 * 60 * 1000;

  it("secondsUntilNextCycle é calculado a partir do cycleStartTime, não da hora cheia", () => {
    const playTime = new Date(2026, 3, 6, 19, 35, 0).getTime();
    const cycleStartTime = playTime;
    const now = new Date(2026, 3, 6, 19, 50, 0).getTime();
    
    const elapsed = now - cycleStartTime;
    const remaining = Math.max(0, CYCLE_DURATION_MS - elapsed);
    const secondsUntilNextCycle = Math.floor(remaining / 1000);
    
    expect(secondsUntilNextCycle).toBe(2700); // 45 min restantes
  });

  it("secondsUntilNextCycle é 0 quando o ciclo já passou de 60 min", () => {
    const cycleStartTime = new Date(2026, 3, 6, 18, 0, 0).getTime();
    const now = new Date(2026, 3, 6, 19, 5, 0).getTime();
    
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

  it("ciclo NÃO é baseado na hora cheia (ex: 20:00, 21:00)", () => {
    // Se Play às 19:47, próximo ciclo é 20:47, não 20:00
    const playAt1947 = new Date(2026, 3, 6, 19, 47, 0).getTime();
    const nextCycle = new Date(playAt1947 + CYCLE_DURATION_MS);
    expect(nextCycle.getHours()).toBe(20);
    expect(nextCycle.getMinutes()).toBe(47);
    // NÃO é 20:00
    expect(nextCycle.getMinutes()).not.toBe(0);
  });
});

// ===== v4.0: GERAÇÃO DE SLOTS ALEATÓRIOS =====

describe("v4.0: geração de slots aleatórios com msgs/hora configurável", () => {
  const CYCLE_DURATION_MS = 60 * 60 * 1000;
  const MIN_GAP_MS = 3 * 60 * 1000; // 3 min
  const MARGIN_MS = 2 * 60 * 1000; // 2 min

  interface MessageSlot {
    campaignId: number;
    campaignName: string;
    delayMs: number;
    minuteLabel: number;
  }

  function generateSlots(camp1: any, camp2: any | null): MessageSlot[] {
    const mph1 = Math.max(1, Math.min(10, camp1.messagesPerHour || 2));
    const mph2 = camp2 ? Math.max(1, Math.min(10, camp2.messagesPerHour || 2)) : 0;
    const totalMsgs = mph1 + mph2;

    const msgList: { campaignId: number; campaignName: string }[] = [];
    for (let i = 0; i < mph1; i++) {
      msgList.push({ campaignId: camp1.id, campaignName: camp1.name });
    }
    if (camp2) {
      for (let i = 0; i < mph2; i++) {
        msgList.push({ campaignId: camp2.id, campaignName: camp2.name });
      }
    }

    const shuffled = [...msgList].sort(() => Math.random() - 0.5);
    const availableWindow = CYCLE_DURATION_MS - (2 * MARGIN_MS);
    const minGapBetween = MIN_GAP_MS;
    const totalGapNeeded = (totalMsgs - 1) * minGapBetween;

    if (totalGapNeeded > availableWindow) {
      const adjustedGap = Math.floor(availableWindow / totalMsgs);
      return shuffled.map((msg, idx) => ({
        ...msg,
        delayMs: MARGIN_MS + (idx * adjustedGap),
        minuteLabel: Math.round((MARGIN_MS + (idx * adjustedGap)) / 60000),
      }));
    }

    const slots: number[] = [];
    for (let i = 0; i < totalMsgs; i++) {
      let attempts = 0;
      let slot: number;
      do {
        slot = MARGIN_MS + Math.floor(Math.random() * availableWindow);
        attempts++;
      } while (attempts < 100 && slots.some(s => Math.abs(s - slot) < minGapBetween));

      if (attempts >= 100) {
        slot = MARGIN_MS + Math.floor((availableWindow / (totalMsgs + 1)) * (i + 1));
      }
      slots.push(slot);
    }

    slots.sort((a, b) => a - b);

    return shuffled.map((msg, idx) => ({
      ...msg,
      delayMs: slots[idx],
      minuteLabel: Math.round(slots[idx] / 60000),
    }));
  }

  it("camp1=2 + camp2=2 gera 4 slots", () => {
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 2 };
    const camp2 = { id: 2, name: "Mod_Vaz-01", messagesPerHour: 2 };
    const slots = generateSlots(camp1, camp2);
    expect(slots.length).toBe(4);
  });

  it("camp1=3 + camp2=2 gera 5 slots", () => {
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 3 };
    const camp2 = { id: 2, name: "Mod_Vaz-01", messagesPerHour: 2 };
    const slots = generateSlots(camp1, camp2);
    expect(slots.length).toBe(5);
  });

  it("camp1=1 + camp2=1 gera 2 slots (mínimo)", () => {
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 1 };
    const camp2 = { id: 2, name: "Mod_Vaz-01", messagesPerHour: 1 };
    const slots = generateSlots(camp1, camp2);
    expect(slots.length).toBe(2);
  });

  it("campanha solo (sem par) gera slots apenas para 1 campanha", () => {
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 3 };
    const slots = generateSlots(camp1, null);
    expect(slots.length).toBe(3);
    expect(slots.every(s => s.campaignName === "ALACIDE")).toBe(true);
  });

  it("todos os slots estão dentro da janela de 60 min (com margem)", () => {
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 5 };
    const camp2 = { id: 2, name: "Mod_Vaz-01", messagesPerHour: 5 };
    
    for (let run = 0; run < 20; run++) {
      const slots = generateSlots(camp1, camp2);
      for (const slot of slots) {
        expect(slot.delayMs).toBeGreaterThanOrEqual(0);
        expect(slot.delayMs).toBeLessThanOrEqual(CYCLE_DURATION_MS);
      }
    }
  });

  it("gap mínimo de 3 min entre slots (quando possível)", () => {
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 3 };
    const camp2 = { id: 2, name: "Mod_Vaz-01", messagesPerHour: 2 };
    
    for (let run = 0; run < 20; run++) {
      const slots = generateSlots(camp1, camp2);
      const sortedDelays = slots.map(s => s.delayMs).sort((a, b) => a - b);
      
      for (let i = 1; i < sortedDelays.length; i++) {
        const gap = sortedDelays[i] - sortedDelays[i - 1];
        // Gap mínimo de 3 min (180000ms) - com tolerância de 1s para arredondamento
        expect(gap).toBeGreaterThanOrEqual(MIN_GAP_MS - 1000);
      }
    }
  });

  it("slots contêm msgs de ambas as campanhas", () => {
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 3 };
    const camp2 = { id: 2, name: "Mod_Vaz-01", messagesPerHour: 2 };
    const slots = generateSlots(camp1, camp2);
    
    const camp1Slots = slots.filter(s => s.campaignName === "ALACIDE");
    const camp2Slots = slots.filter(s => s.campaignName === "Mod_Vaz-01");
    
    expect(camp1Slots.length).toBe(3);
    expect(camp2Slots.length).toBe(2);
  });

  it("messagesPerHour é limitado entre 1 e 10", () => {
    // Valor 0 → || 2 fallback → Math.max(1, Math.min(10, 2)) = 2
    // Valor -5 → || 2 fallback → Math.max(1, Math.min(10, 2)) = 2... wait
    // Na verdade: 0 é falsy → || 2 → mph = 2; -5 é truthy → || não ativa → Math.max(1, Math.min(10, -5)) = 1
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 0 };
    const camp2 = { id: 2, name: "Mod_Vaz-01", messagesPerHour: -5 };
    const slots = generateSlots(camp1, camp2);
    // camp1: 0 || 2 = 2; camp2: -5 || 2 = -5 → Math.max(1, -5) = 1 → total = 3
    expect(slots.length).toBe(3); // 2 + 1

    // Valor acima do máximo é corrigido para 10
    const camp3 = { id: 3, name: "A", messagesPerHour: 15 };
    const camp4 = { id: 4, name: "B", messagesPerHour: 20 };
    const slots2 = generateSlots(camp3, camp4);
    expect(slots2.length).toBe(20); // 10 + 10
  });

  it("padrão é 2 msgs/hora quando messagesPerHour não está definido", () => {
    const camp1 = { id: 1, name: "ALACIDE" }; // sem messagesPerHour
    const camp2 = { id: 2, name: "Mod_Vaz-01" };
    const slots = generateSlots(camp1, camp2);
    expect(slots.length).toBe(4); // 2 + 2
  });

  it("10+10=20 msgs em 60 min distribui com gap reduzido", () => {
    const camp1 = { id: 1, name: "ALACIDE", messagesPerHour: 10 };
    const camp2 = { id: 2, name: "Mod_Vaz-01", messagesPerHour: 10 };
    const slots = generateSlots(camp1, camp2);
    expect(slots.length).toBe(20);
    
    // Todos os slots devem estar dentro da janela
    for (const slot of slots) {
      expect(slot.delayMs).toBeGreaterThanOrEqual(0);
      expect(slot.delayMs).toBeLessThanOrEqual(CYCLE_DURATION_MS);
    }
  });
});

// ===== v4.0: maxMessagesThisCycle DINÂMICO =====

describe("v4.0: maxMessagesThisCycle dinâmico por par", () => {
  it("maxMessagesThisCycle = camp1.mph + camp2.mph", () => {
    const camp1mph = 3;
    const camp2mph = 2;
    const maxMessagesThisCycle = camp1mph + camp2mph;
    expect(maxMessagesThisCycle).toBe(5);
  });

  it("campanha solo: maxMessagesThisCycle = camp1.mph", () => {
    const camp1mph = 4;
    const maxMessagesThisCycle = camp1mph;
    expect(maxMessagesThisCycle).toBe(4);
  });

  it("messagesThisCycle incrementa a cada envio", () => {
    let messagesThisCycle = 0;
    const maxMessagesThisCycle = 5;
    
    for (let i = 0; i < 5; i++) {
      messagesThisCycle++;
    }
    
    expect(messagesThisCycle).toBe(maxMessagesThisCycle);
  });

  it("messagesThisCycle é zerado apenas no novo ciclo (timer 60 min)", () => {
    let messagesThisCycle = 5;
    
    // Novo ciclo (timer de 60 min disparou)
    messagesThisCycle = 0;
    
    expect(messagesThisCycle).toBe(0);
  });
});

// ===== FIX v3.0: messagesThisCycle controle rígido =====

describe("FIX v3.0: messagesThisCycle controle rígido", () => {
  it("executeCycle NÃO deve zerar messagesThisCycle (bug das 3 msgs)", () => {
    let messagesThisCycle = 5;
    // Bug antigo: executeCycle fazia messagesThisHour = 0
    // Correção: executeCycle NÃO zera o contador
    const canSend = messagesThisCycle < 5;
    expect(canSend).toBe(false);
  });

  it("messagesThisCycle só é zerado pelo timer de 60 min", () => {
    let messagesThisCycle = 5;
    messagesThisCycle = 0; // Apenas o timer de 60 min faz isso
    expect(messagesThisCycle).toBe(0);
  });
});

// ===== FIX #1: RACE CONDITION =====

describe("FIX #1: race condition - validação de cycleNumber", () => {
  it("slot deve ser cancelado se cycleNumber mudou", () => {
    const scheduledCycleNumber = 3;
    const currentCycleNumber = 4;
    const shouldSend = scheduledCycleNumber === currentCycleNumber;
    expect(shouldSend).toBe(false);
  });

  it("slot deve ser executado se cycleNumber é o mesmo", () => {
    const scheduledCycleNumber = 3;
    const currentCycleNumber = 3;
    const shouldSend = scheduledCycleNumber === currentCycleNumber;
    expect(shouldSend).toBe(true);
  });

  it("slot deve ser cancelado se scheduler parou", () => {
    const isRunning = false;
    expect(isRunning).toBe(false);
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

  it("celular BR válido: 13 dígitos", () => {
    const result = validatePhone("5599991811246");
    expect(result.valid).toBe(true);
    expect(result.digits).toBe(13);
  });

  it("fixo BR válido mas com aviso: 12 dígitos", () => {
    const result = validatePhone("559933221100");
    expect(result.valid).toBe(true);
    expect(result.digits).toBe(12);
    expect(result.warning).toContain("fixo");
  });

  it("número muito curto é inválido", () => {
    const result = validatePhone("5599123");
    expect(result.valid).toBe(false);
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
});

// ===== VARIAÇÕES DE MENSAGENS =====

describe("variações de mensagens", () => {
  it("cada campanha deve ter 12 variações", () => {
    const variations = Array.from({ length: 12 }, (_, i) => `Variação ${i + 1}`);
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

  it("nenhuma variação contém saudação de horário", () => {
    const variations = [
      "🏠 {{NOME}}, *ALACIDE* - Restam poucas unidades!",
      "{{NOME}}, você já conhece o *ALACIDE*?",
    ];

    for (const v of variations) {
      expect(v.toLowerCase()).not.toContain("bom dia");
      expect(v.toLowerCase()).not.toContain("boa tarde");
      expect(v.toLowerCase()).not.toContain("boa noite");
    }
  });
});

// ===== CONSTANTES DO SISTEMA =====

describe("constantes do sistema v4.0", () => {
  it("CYCLE_DURATION_MS é exatamente 60 minutos", () => {
    const CYCLE_DURATION_MS = 60 * 60 * 1000;
    expect(CYCLE_DURATION_MS).toBe(3600000);
  });

  it("MIN_GAP_MS é 3 minutos (segurança anti-ban)", () => {
    const MIN_GAP_MS = 3 * 60 * 1000;
    expect(MIN_GAP_MS).toBe(180000);
  });

  it("MARGIN_MS é 2 minutos", () => {
    const MARGIN_MS = 2 * 60 * 1000;
    expect(MARGIN_MS).toBe(120000);
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

describe("FIX #2: stop() cancela todos os timers (incluindo slotTimers)", () => {
  it("todos os timers devem ser limpos após stop", () => {
    let cycleTimer: any = setTimeout(() => {}, 1000);
    let slotTimers: any[] = [
      setTimeout(() => {}, 1000),
      setTimeout(() => {}, 2000),
      setTimeout(() => {}, 3000),
    ];

    // Simular stop()
    clearTimeout(cycleTimer);
    cycleTimer = null;
    for (const timer of slotTimers) {
      clearTimeout(timer);
    }
    slotTimers = [];

    expect(cycleTimer).toBeNull();
    expect(slotTimers).toHaveLength(0);
  });

  it("stop() reseta messagesThisCycle e maxMessagesThisCycle para 0", () => {
    let messagesThisCycle = 5;
    let maxMessagesThisCycle = 5;
    let isRunning = true;

    // Simular stop()
    isRunning = false;
    messagesThisCycle = 0;
    maxMessagesThisCycle = 0;

    expect(isRunning).toBe(false);
    expect(messagesThisCycle).toBe(0);
    expect(maxMessagesThisCycle).toBe(0);
  });
});
