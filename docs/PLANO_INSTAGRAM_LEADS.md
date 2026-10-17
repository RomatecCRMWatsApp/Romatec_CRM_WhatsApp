# Plano — Captação de Leads pelo Instagram (Loteamento / Chacreamento)

**Branch:** `feat/instagram-leads`
**Objetivo:** fechar o funil **Instagram → CRM → WhatsApp (Z-API) → Bot qualifica → Corretor fecha**, reaproveitando o que o CRM já tem.

---

## 1. O que já existe (não precisa refazer)

| Peça | Onde está |
|---|---|
| Webhook WhatsApp (Z-API) com HMAC | `server/_core/index.ts` → `POST /api/webhook/zapi` |
| Envio de mensagem WhatsApp | `server/zapi-integration.ts` → `sendMessageViaZAPI()` |
| Bot de qualificação + persistência | `server/bot-ai.ts` → `processBotMessage()`, `server/lead-persistence.ts` |
| Reengajamento de lead parado (45 min) | `getStaleLeads()` + scheduler |
| Tabela de leads | `drizzle/schema.ts` → `leadQualifications` (tem `campanhaOrigem`, `score`) |
| Contatos | `drizzle/schema.ts` → `contacts` (phone único) |
| Página pública do imóvel com botão WhatsApp | `client/src/pages/PropertyPublic.tsx` |
| Tela de Leads | `client/src/pages/Leads.tsx` + router `leads` em `server/routers.ts` |
| Alerta pro corretor | `server/_core/telegramNotification.ts` |

**Falta:** entrada de leads vindos do Instagram e adaptação da qualificação para lote/chácara.

---

## 2. Três portas de entrada do Instagram

### Porta A — Anúncio de Cadastro (Meta Lead Ads) ⭐ prioridade 1
Pessoa vê o anúncio do loteamento no Instagram/Facebook, preenche formulário (nome, WhatsApp, interesse) **sem sair do app**.

Fluxo:
1. Meta dispara webhook `leadgen` → `POST /api/webhook/meta`
2. Servidor busca os dados do lead na Graph API (`GET /{leadgen_id}`)
3. Cria/atualiza `contacts` + `leadQualifications` com `origem = instagram_ads`, `campanhaOrigem = nome do anúncio/formulário`
4. **Em até 1 minuto** o bot manda a 1ª mensagem no WhatsApp via Z-API (speed-to-lead)
5. Telegram avisa o corretor: "🔥 Novo lead do Instagram — Loteamento X"

> Por que é a prioridade: é onde está o volume de lead pago e já vem com telefone.

### Porta B — Direct do Instagram (Instagram Messaging API) — prioridade 2
Pessoa comenta/manda DM "quero saber o preço".

Fluxo:
1. Meta dispara webhook `messages` → mesmo `POST /api/webhook/meta`
2. Bot responde no Direct pedindo o WhatsApp (ou já qualificando ali)
3. Ao receber o número, migra a conversa para WhatsApp e segue o fluxo normal
4. (Opcional) Comentário com palavra-chave ("LOTE") → resposta automática no Direct

### Porta C — Link na bio / Landing do loteamento — prioridade 3
Já quase pronta: `PropertyPublic.tsx`. Ajustes:
- Formulário curto (nome + WhatsApp) que grava lead com `origem = instagram_bio`
- Capturar `utm_source/utm_campaign` da URL para saber de qual post veio
- Botão WhatsApp com texto pré-preenchido incluindo o código do lote

---

## 3. Mudanças no banco (migration `0007`)

```ts
// leadQualifications — novos campos
origem: varchar("origem", { length: 30 }).default("whatsapp"),
// valores: whatsapp | instagram_ads | instagram_dm | instagram_bio | site | indicacao
instagramUserId: varchar("instagramUserId", { length: 64 }),   // IGSID do Direct
metaLeadId: varchar("metaLeadId", { length: 64 }),             // id do leadgen (dedupe)
propertyId: int("propertyId"),                                  // lote/loteamento de interesse
utm: json("utm").$type<{ source?: string; campaign?: string; content?: string }>(),
```

- `uniqueIndex` em `metaLeadId` → a Meta reenvia webhooks; evita lead duplicado.
- `properties.propertyType`: padronizar valores `lote`, `chacara`, `loteamento`, `casa`, `apartamento`.

---

## 4. Backend — arquivos novos

| Arquivo | Responsabilidade |
|---|---|
| `server/meta-integration.ts` | Validar assinatura `X-Hub-Signature-256`, buscar lead na Graph API, enviar DM |
| `server/lead-intake.ts` | **Função única** `ingestLead({ nome, phone, origem, campanha, propertyId, utm })` usada por todas as portas: dedupe, grava contato+lead, dispara 1ª mensagem WhatsApp, notifica Telegram |
| `POST /api/webhook/meta` + `GET /api/webhook/meta` | GET = verificação do webhook (hub.challenge); POST = eventos `leadgen` e `messages` |
| `POST /api/public/lead` | Recebe formulário da landing (Porta C), com rate-limit e honeypot anti-spam |

Variáveis novas em `server/_core/env.ts` / Railway:
```
META_APP_SECRET=         # valida assinatura do webhook
META_VERIFY_TOKEN=       # string sua, usada na verificação
META_PAGE_ACCESS_TOKEN=  # token de longa duração da Página
META_IG_ACCOUNT_ID=      # conta profissional do Instagram
```

---

## 5. Qualificação adaptada para lote / chácara

As 10 perguntas atuais são de **financiamento habitacional** (renda, FGTS, banco). Para loteamento/chacreamento o que decide a venda é outro:

1. Nome
2. Interesse: lote urbano ou chácara?
3. Para quê: morar, construir depois, lazer/fim de semana ou investimento?
4. Tamanho desejado (m² / hectares)
5. Forma de pagamento: à vista, entrada + parcelas direto com o loteador, ou financiamento?
6. Valor de entrada disponível
7. Parcela mensal que cabe no bolso
8. Já conhece a região / quer agendar visita ao loteamento?
9. Prazo para decidir
10. Melhor dia/horário para visita

**Implementação:** criar um segundo roteiro em `qualification-flow.ts` (`roteiro: "loteamento"`) escolhido automaticamente pelo `propertyType` do imóvel de interesse — sem quebrar o roteiro atual de casas.

Também: simulação de **parcelamento direto** (ex.: 120x com correção IPCA/IGP-M) além da simulação bancária que já existe em `bank-simulation.ts`.

Score: **quente** = quer visita em até 15 dias e tem entrada; **morno** = interesse claro, prazo > 30 dias; **frio** = só curiosidade.

---

## 6. Frontend

- **Leads.tsx**: filtro e etiqueta por origem (📸 Instagram Ads, 💬 Direct, 🔗 Bio, 📱 WhatsApp) e por loteamento
- **Performance.tsx**: funil por origem (leads → qualificados → visitas → vendas) e custo por lead se informado
- **Settings.tsx**: seção "Instagram / Meta" com status da conexão e campos das credenciais
- **PropertyPublic.tsx**: formulário curto + UTM

---

## 7. Configuração na Meta (feita por você, uma vez)

1. Instagram em **conta profissional**, ligada a uma **Página do Facebook**
2. Criar app em developers.facebook.com (tipo "Empresa")
3. Produtos: **Webhooks**, **Instagram Graph API**, **Messenger** (para DM do Instagram)
4. Permissões: `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`, `instagram_basic`, `instagram_manage_messages`
5. Webhook: URL `https://romateccrm.com/api/webhook/meta` + `META_VERIFY_TOKEN`
6. Assinar a Página nos campos `leadgen` e `messages`
7. Passar pela **Análise do App** da Meta (necessária para receber leads de terceiros em produção; em modo desenvolvimento funciona com contas de teste)
8. Testar com a **Lead Ads Testing Tool** da Meta

---

## 8. Ordem de execução

| Fase | Entrega | Esforço |
|---|---|---|
| 1 | Migration + `lead-intake.ts` + `POST /api/public/lead` (Porta C) | pequeno — já dá para testar ponta a ponta sem Meta |
| 2 | Webhook Meta + Lead Ads (Porta A) + Telegram | médio |
| 3 | Roteiro de qualificação loteamento/chácara + parcelamento direto | médio |
| 4 | Telas: origem nos Leads, funil no Performance, config no Settings | médio |
| 5 | Direct do Instagram (Porta B) | médio/grande — depende da aprovação da Meta |

Cada fase com testes `vitest` no padrão dos existentes (`webhook.test.ts`, `zapi-integration.test.ts`).

---

## 9. Cuidados

- **LGPD:** formulário com aviso de uso dos dados + opção de sair ("PARAR") — o bloqueio já existe em `isLeadBlocked()`.
- **Z-API é API não oficial do WhatsApp:** risco de banimento do número com volume alto. Manter o limite atual (1 msg/contato/hora) e considerar migrar para a **WhatsApp Cloud API oficial** se o volume crescer.
- Nunca commitar tokens da Meta; só variáveis de ambiente no Railway.
