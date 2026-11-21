# Fase 0 — Descoberta: CRM Romatec × Calculadoras da Receita (CBS/IBS/IS/DANFSe)

Data: 21/11/2026. Especificação de origem: "Especificação para o Coddy: integração das Calculadoras Oficiais da
Receita Federal" (enviada pelo solicitante). Esta fase **não altera código**: só levanta fatos, riscos e perguntas.

> Aviso que valerá para as telas: a simulação é uma conferência baseada nas calculadoras oficiais e não substitui
> o sistema emissor nem a validação do contador. A classificação (CST, cClassTrib, NBS/NCM) é de quem emite.

## 1. Stack real

| Item | CRM Romatec |
|---|---|
| Linguagem | TypeScript (Node 22) |
| Back-end | Express 4 + tRPC 11 (`server/routers/*.router.ts`, 50 routers) |
| Front-end | React 19 + Vite, roteador `wouter`, Tailwind + componentes próprios (`client/src`) |
| ORM / banco | Drizzle ORM 0.44 → **MySQL** em produção (Railway); **SQLite** em desenvolvimento/testes |
| Migrações | Funções idempotentes em `server/_core/migrations/*.ts`, chamadas no boot (`server/_core/index.ts`); só adicionam tabelas/colunas (`CREATE TABLE IF NOT EXISTS`) |
| Autenticação | Sessão por cookie (JWT próprio) |
| Perfis | `admin`, `secretario`, `corretor`, `empreendedor`, `juridico` (`shared/equipe.ts`), com permissões por pessoa |
| Testes | Vitest (≈200 arquivos, 1.357 testes) + Playwright manual para telas |
| Pacotes | npm |
| Release | `RELEASE_NOTES.md` + `npm run release`; push na `main` = deploy automático em produção |
| Erros / logs | `TRPCError` com mensagem em português; logs `console` com prefixo do módulo |

## 2. Onde estão as entidades de negócio

O CRM é de **venda de lotes e imóveis** (loteamentos, ex.: Bom Jardims). Não existe uma tabela genérica "proposta".

| Conceito da especificação | No CRM |
|---|---|
| Cliente | `leadQualifications` (lead/cliente) e `contratoPessoas` (partes do contrato) |
| Proposta / simulação comercial | `simulacoes` + `condicoesPagamento` (simulador de financiamento do lote, `server/routers/simulador.router.ts`) |
| Venda | `contratos` (+ `contratoVersoes`, `contratoAnexos`, `cobrancas`, `contratoAditivos`) |
| Produto | `empreendimentos` / `lotes`; `properties` (imóveis avulsos) |
| Serviço / honorário | Comissão de corretagem (`contratoAditivos` "proposta da comissão", boletos Asaas) |
| NFS-e | `saasNfse`: fila de NFS-e das **assinaturas do próprio SaaS**, emitidas pela Spedy (`server/saas/spedy.ts`), com `xmlUrl`/`pdfUrl` |

Candidatos naturais ao botão "Simular CBS/IBS": **simulação do lote** e **contrato de venda**; e a **comissão**
(prestação de serviço de corretagem). Confirmar com o negócio (pergunta 4).

## 3. Implantação

- Railway, build por `Dockerfile` (`node:22-slim`), serviço web + MySQL no mesmo projeto.
- **Não há bloqueio**: o Railway roda containers arbitrários, então as calculadoras Java 25 (imagem `eclipse-temurin:25`)
  e Go podem ser **serviços separados no mesmo projeto**, acessados pela **rede privada** do Railway
  (`<servico>.railway.internal`), sem domínio público — atende o item 2.3 (nunca expor).
- Condição: a rede privada do Railway é **por projeto**. Se o CRM e o AvalieImob estiverem em projetos diferentes,
  é preciso decidir onde as calculadoras ficam (pergunta 6).
- Alternativa já discutida com o solicitante: servidor próprio (PC do escritório ou VPS) junto com Jitsi/Nextcloud.

## 4. Repositórios oficiais (verificados em 21/11/2026)

| Repositório | Versão a fixar | Runtime | Observação |
|---|---|---|---|
| calculadora-rtc-regime-regular | tag **1.7.2** (HEAD f1eebd7, 19/11/2026) | Java 25, Spring Boot 4.1 | perfil `offline`, `context-path: /api`; exemplos em `docs/exemplos.md` |
| calculadora-rtc-simples-nacional | tag **1.0.2** (HEAD a926d5a, 19/11/2026) | Java 25 | reaproveita o SQLite do regime regular |
| calculadora-rtc-gerador-danfse | tag **1.0.0** (HEAD 8d79e6b, 22/10/2026) | Go 1.27 (Dockerfile `golang:1.27.1`) | porta 8080 por padrão → usar `SERVER_PORT=8081` |

Os três têm `LICENSE` (MIT). Os Java **não** têm Dockerfile (precisamos escrever, como a especificação prevê).

## 5. Regime tributário

- A Romatec (prestadora de serviços) **não é optante do Simples Nacional**: a NFS-e real nº 59 (SpeedGov,
  Açailândia/MA) traz `OptanteSimplesNacional = 2`. Isso sugere usar a calculadora do **regime regular** para a
  Romatec — **a confirmar com o contador** (Lucro Presumido ou Real).
- O CRM atende também **empreendedores parceiros** (donos dos loteamentos), que podem ter outro regime →
  o regime deve ser **configurável por empresa/empreendimento**.

## 6. Riscos e pontos de atenção

1. **Venda de imóvel/lote não é mercadoria nem serviço comum.** A LC 214/2025 tem regime específico para operações
   com bens imóveis (redutores, base própria). Imóvel não tem NCM, e a classificação (cClassTrib) depende do caso.
   **Não sabemos ainda se a calculadora cobre bem essas operações**: precisa testar com o exemplo oficial e confirmar
   com o contador antes de colocar o botão na venda do lote.
2. **Data do fato gerador:** a transição começa em 2026–2027; a calculadora exige `dhFatoGerador`. A tela não pode
   assumir "hoje" sem confirmação (regra de ouro 4).
3. **Valores monetários:** o CRM usa `decimal` no MySQL e números em JS. No módulo novo, guardar a resposta bruta
   (JSON) e totais como string decimal, sem recalcular.
4. **Ambiente desta sessão de desenvolvimento:** sem Docker, com Java 21 e Go 1.24 → a Fase 1 (subir as 3
   calculadoras) **não pode ser validada aqui**; precisa do Railway ou de um servidor (ver PENDENCIAS.md).

## 7. Perguntas abertas para o solicitante

1. As calculadoras devem rodar no **Railway** (serviços privados no mesmo projeto) ou no **servidor próprio** que
   será montado?
2. O CRM e o AvalieImob estão no **mesmo projeto do Railway**? (define se compartilham as calculadoras pela rede privada)
3. Regime tributário da Romatec: **Lucro Presumido ou Lucro Real**? E dos empreendedores parceiros?
4. Onde o botão "Simular CBS/IBS" entra no CRM: **simulação do lote**, **contrato de venda**, **comissão** — ou só
   numa tela de simulador avulso, para começar?
5. Quem usa: só **admin** (e o financeiro/secretaria)? Corretor e empreendedor ficam de fora?
6. O contador pode indicar a **classificação (CST/cClassTrib)** das vendas de lote e da comissão de corretagem?
