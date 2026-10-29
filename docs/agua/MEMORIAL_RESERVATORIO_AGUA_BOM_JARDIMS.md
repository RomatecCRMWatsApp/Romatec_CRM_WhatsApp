---
title: "Memorial de Cálculo — Reservação e Bombeamento de Água"
subtitle: "Condomínio de Chácaras Bom Jardims · Açailândia/MA · Estudo preliminar · 29/10/2026"
---

# 1. Identificação

| Item | Dado |
|---|---|
| Empreendimento | Condomínio de Chácaras Bom Jardims — 82 chácaras de 3.025 m² |
| Local | Açailândia/MA |
| Sistema | Poço tubular profundo → bomba submersa → reservatório elevado → rede de distribuição com ponto e hidrômetro em cada chácara |
| Elaboração | Romatec Consultoria Total — José Romário, Técnico em Agrimensura e em Edificações (CFT/MA 01209185369) |

# 2. Objeto

Dimensionar a demanda de água do empreendimento e verificar se um **reservatório elevado de 10.000 litros (10 m³)**, alimentado por **bombeamento automático contínuo** (a bomba repõe a água conforme o nível baixa), atende ao consumo na ocupação plena, em substituição ao volume de 50 m³ previsto anteriormente.

# 3. Normas e referências

- ABNT NBR 12211 — Estudos de concepção de sistemas públicos de abastecimento de água (consumo per capita e coeficientes K1 e K2);
- ABNT NBR 12217 — Projeto de reservatório de distribuição de água para abastecimento público;
- ABNT NBR 12218 — Projeto de rede de distribuição de água para abastecimento público (pressões estática e dinâmica);
- ABNT NBR 12244 — Poço tubular: construção e teste de vazão para captação de água subterrânea;
- Portaria GM/MS n.º 888/2021 — padrão de potabilidade da água para consumo humano.

# 4. Metodologia

## 4.1 Parâmetros adotados

| Parâmetro | Valor | Justificativa |
|---|---|---|
| Unidades | 82 chácaras | projeto aprovado |
| Ocupação por chácara | 5 habitantes | média usual para residência unifamiliar |
| População de saturação (P) | **410 hab** | 82 × 5 |
| Consumo per capita (q) | **200 L/hab·dia** | uso doméstico + rega moderada de jardim (chácara de lazer) |
| Coeficiente do dia de maior consumo (K1) | 1,2 | NBR 12211 |
| Coeficiente da hora de maior consumo (K2) | 1,5 | NBR 12211 |

## 4.2 Vazões de demanda (ocupação plena)

| Grandeza | Cálculo | Resultado |
|---|---|---|
| Consumo médio diário | 410 × 200 | **82,0 m³/dia** (0,95 L/s) |
| Consumo do dia de maior consumo | 82,0 × 1,2 | **98,4 m³/dia** (4,10 m³/h; 1,14 L/s) |
| Vazão da hora de maior consumo | 4,10 × 1,5 | **6,15 m³/h** (1,71 L/s) |

## 4.3 Critério convencional (bombeamento por horário)

Pela NBR 12217, quando a adução não acompanha a demanda, o volume de reservação usual é de **1/3 do volume do dia de maior consumo**:

> V = 98,4 ÷ 3 = **32,8 m³** → origem do reservatório de 50 m³ previsto antes.

Esse critério pressupõe que a bomba funciona por horário (algumas horas por dia) e que o reservatório guarda a água do dia.

## 4.4 Critério adotado: bombeamento automático contínuo

Com a bomba comandada pelo nível do reservatório (liga quando o nível baixa, desliga quando enche), o reservatório deixa de guardar a água do dia e passa a apenas **regular** a diferença entre a vazão da bomba e o consumo instantâneo. A condição para isso funcionar é:

> **Vazão da bomba (Qb) ≥ vazão da hora de maior consumo = 6,15 m³/h**

Atendida essa condição, nem no horário de pico o nível cai de forma contínua. O volume mínimo para o ciclo liga-desliga da bomba (no máximo 6 partidas por hora, ciclo de 10 min) é:

> V ciclo = Qb × T ÷ 4 = 6,15 × (10/60) ÷ 4 = **0,26 m³**

Os 10 m³ ficam, portanto, quase todos como **reserva de autonomia** para parada da bomba ou falta de energia:

| Situação | Autonomia dos 10 m³ |
|---|---|
| Consumo médio do dia de maior consumo (4,10 m³/h) | **≈ 2 h 25 min** |
| Hora de maior consumo (6,15 m³/h) | **≈ 1 h 35 min** |
| Ocupação de 50% no dia de maior consumo (2,05 m³/h) | **≈ 4 h 50 min** |

# 5. Resultado

## 5.1 Funcionamento da bomba por fase de ocupação (Qb = 6,15 m³/h)

| Ocupação | Chácaras ocupadas | População | Dia de maior consumo | Bomba ligada por dia |
|---|---|---|---|---|
| 25% | 21 | 105 hab | 25,2 m³ | ≈ 4 h |
| 50% | 41 | 205 hab | 49,2 m³ | ≈ 8 h |
| 75% | 62 | 310 hab | 74,4 m³ | ≈ 12 h |
| 100% | 82 | 410 hab | 98,4 m³ | ≈ 16 h |

Na ocupação plena a bomba trabalha cerca de 16 h por dia, ainda com folga de 8 h. Isso confirma que o sistema contínuo com 10 m³ atende.

## 5.2 Condições obrigatórias para os 10 m³ atenderem

1. **Poço:** teste de vazão (NBR 12244) com vazão de exploração **≥ 6,2 m³/h**, sem rebaixamento que deixe a bomba trabalhar a seco. Verificar o enquadramento da outorga, ou da dispensa, de uso de água subterrânea na SEMA/MA.
2. **Bomba submersa** com **Qb ≥ 6,2 m³/h** na altura manométrica do projeto (desnível poço → topo do reservatório + perdas).
3. **Automação:** sensor ou boia de nível no reservatório, ligando a bomba em ~50% e desligando em ~95%; relé de nível no poço (eletrodos) contra funcionamento a seco; proteção do motor (falta de fase, sobrecorrente).
4. **Altura do reservatório elevado:** pressão dinâmica mínima de 10 mca no ponto mais desfavorável da rede e estática máxima de 40 mca (NBR 12218).
5. **Hidrômetro geral** na saída do poço, para comparar com a soma dos hidrômetros das chácaras e controlar as perdas.
6. **Potabilidade:** clorador na entrada do reservatório e análises periódicas (Portaria GM/MS 888/2021).
7. **Previsão de ampliação (definida):** a torre/base do reservatório elevado é executada desde já para **dois módulos de 10 m³** (carga de projeto de no mínimo 2 × 10 t de água, mais o peso das caixas e a ação do vento), com o espaço do segundo módulo livre no topo. A tubulação de recalque e a de saída para a rede recebem **tê com registro e ponta tamponada (flange cego ou cap)** para a ligação do segundo módulo, que trabalhará em paralelo (vasos comunicantes), com a mesma boia/sensor de nível.

# 6. Conclusão

O **reservatório elevado de 10.000 litros com bombeamento automático contínuo atende à demanda das 82 chácaras** na ocupação plena (98,4 m³ no dia de maior consumo), desde que o poço e a bomba forneçam pelo menos **6,2 m³/h** e que haja automação por nível. O volume de 32,8 a 50 m³ só é necessário quando a bomba funciona por horário.

Ponto de atenção: com 10 m³, a autonomia sem bomba é de cerca de 2 horas na ocupação plena. Por isso fica **definido que a base e as conexões do segundo módulo de 10 m³ serão executadas já na implantação** (item 5.2-7). O segundo reservatório será instalado quando as quedas de energia forem frequentes ou quando a ocupação passar de ~60%, levando a reservação a **20 m³** e a autonomia a **≈ 4 h 50 min** na ocupação plena, sem obra civil nova.

Este é um estudo preliminar de concepção. O projeto executivo da captação, da adução, da reservação e da rede deve ser elaborado por profissional habilitado, com a respectiva ART/TRT, e submetido à anuência do SAAE de Açailândia.

<div style="page-break-inside: avoid; margin-top: 18px; text-align: center;">
<p>Açailândia/MA, 29 de outubro de 2026.</p>
<p style="margin-top: 36px;">______________________________________________<br><strong>José Romário</strong><br>Técnico em Agrimensura — CFT/MA 01209185369 · Técnico em Edificações<br>Romatec Consultoria Total</p>
</div>
