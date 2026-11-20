# Auditoria técnica e plano — CRM da Romatec

> Inspeção de código em 20/11/2026, base `origin/main` @ `c615ef7`, branch `seguranca/privacidade-lgpd`. Sem acesso a produção nem a dados reais.
> Não é parecer jurídico nem certificação. Severidade: P0 exposição ativa crítica · P1 alto · P2 médio · P3 melhoria.

## 1. Escopo e método
Leitura de `server/_core/*` (trpc, contexto, cookies, CSRF, cabeçalhos, rotas Express), `server/routers.ts` e amostragem dirigida de `server/routers/*.router.ts` (procedimentos que recebem `id`/`usuarioId`/`corretorId`), rotas públicas e de arquivos, busca de segredos no repositório (padrões de chave, `.env*` versionados, variáveis `VITE_*` no cliente), logs com dados pessoais, rastreamento no navegador. **Limite:** os ~40 routers não foram lidos linha a linha; a revisão completa procedimento a procedimento fica como pendência (seção 5).

## 2. Controles já existentes (reaproveitados, não refeitos)
- Sessão em cookie `HttpOnly`/`Secure`/`SameSite` (`server/_core/cookies.ts`); JWT HS256 que **falha sem segredo** (jose recusa chave vazia).
- CSRF por origem para escrita com sessão (`server/_core/origem.ts`); cabeçalhos de segurança e limite global por IP (`server/_core/protecoes.ts`).
- Perfis e módulos no servidor (`shared/equipe.ts` `podeChamar`, `shared/permissoes.ts`); escopo de leads (`leadsVisiveis`/`exigirLead`) e contatos individuais (`exigirContato`).
- Login sem enumeração e com limite por IP; scrypt; senha provisória com validade; "sair dos outros aparelhos" (`sessaoVersao`).
- Step-up com senha para ações destrutivas de admin (`exigirAdminComSenha`) e auditoria financeira.
- Segredos de configuração mascarados ao navegador (`publicCompanyConfig`); webhooks com verificação (`zapiWebhookGuard`, Meta verify token).
- Documentos de usuário só para o dono/admin, com tipo conferido pelos bytes (`shared/cadastro.ts detectarMime`).
- Rastreio da landing `/i` e GA4/Ads só após aceite (`client/src/lib/rastreio.ts`, `rastreamento.ts`).

## 3. Achados
| # | Sev. | Achado | Evidência (antes) | Situação |
|---|---|---|---|---|
| 1 | **P1** | `contacts.list` devolvia **todos** os contatos (nome, telefone, e-mail) a qualquer corretor com o módulo Contatos (padrão ligado), embora `getById` já restringisse ao corretor responsável — vazamento da carteira entre corretores. | `server/routers.ts:276` | **Corrigido e testado** (`contatosVisiveis`; teste falha antes e passa depois) |
| 2 | P2 | `zapi.sendMessage` aceitava qualquer usuário logado da equipe: mensagem livre pelo WhatsApp da empresa para qualquer número (uso indevido da identidade da empresa/spam). `bot.processMessage` idem (simula o robô, pode disparar mensagens e alterar leads); nenhuma tela da equipe usa. | `server/routers.ts:928`, `:908` | **Corrigido e testado** (adminProcedure) |
| 3 | P2 | `/api/upload` confiava no `X-File-Type` (`startsWith('image/')`): SVG/HTML disfarçado subia ao Cloudinary. | `server/_core/index.ts:831` | **Corrigido**: tipo conferido pelos bytes (`shared/uploadSeguro.ts`); helper testado, rota sem teste HTTP |
| 4 | P2 | Arquivos de empreendimento eram servidos **inline** com o MIME declarado no upload; `image/svg+xml` com script executaria no domínio do CRM (XSS armazenado por usuário da equipe). | `server/_core/index.ts:1231` | **Corrigido**: inline só para PDF/imagem pelos bytes; resto vira download `octet-stream` (helper testado) |
| 5 | P2 | Revogação de cookies incompleta: após "Recusar", eventos GA/Ads continuavam saindo na mesma página; não havia como mudar a escolha depois. | `client/src/lib/rastreamento.ts:54`; `AvisoCookies.tsx` | **Corrigido e testado** (teste falha antes e passa depois) |
| 6 | P2 | Logs do servidor gravam telefone, nomes e trechos de mensagens de leads (ex.: webhook). | `server/_core/index.ts:135`, `server/lead-intake.ts:294`, `server/bot-ai.ts:512` e ~800 chamadas de console | **Mitigado e testado**: redação global de console (`server/privacidade/redacao.ts`). Trechos de mensagem continuam (sem os identificadores) — revisar |
| 7 | P2 | Não havia canal de titular, exportação nem rotina de anonimização. | — | **Implementado e testado** (ver checklist) |
| 8 | P3 | `GET /api/usuarios/:id/foto` serve a foto de qualquer usuário a qualquer pessoa logada (inclui empreendedor/jurídico). Provavelmente intencional (equipe). | `server/_core/index.ts:1161` | Pendente (decisão de negócio) |
| 9 | P3 | `properties.list/getById/getBySlug` públicos devolvem também imóveis `inactive` (sem dados pessoais, mas expõe cadastro interno). | `server/routers.ts:371` | Pendente |
| 10 | P3 | Cookie de sessão com validade de 1 ano. | `server/routers.ts` login (`ONE_YEAR_MS`) | Pendente (decisão: reduzir/renovar deslizante) |
| 11 | P3 | Sem MFA para administrador (há step-up por senha em ações críticas). | — | Pendente |
| 12 | Info | `.env.example` traz o token de **exemplo da documentação do Telegram** (não é segredo real). Nenhuma chave real encontrada no código versionado; chaves `$aact_…` nos testes são fictícias. Histórico do git **não** foi varrido. | `.env.example:56` | Sem rotação necessária pelo que foi visto; varredura do histórico pendente |

## 4. O que foi alterado (resumo)
Ver `checklist-validacao.md` (status por item com arquivos e testes) e `implantacao-e-rollback.md`.

## 5. Plano (próximos passos priorizados)
1. **P1/P2 — revisão completa de autorização** de todos os procedimentos de `server/routers/*.ts` com testes de acesso cruzado por perfil (corretor × corretor, empreendedor × outro empreendimento, jurídico). Hoje há testes para leads, contatos, contratos, jurídico e privacidade.
2. P2 — retirar o texto de mensagens dos logs do webhook/bot (manter só id do lead).
3. P2 — Teste HTTP das rotas Express alteradas (`/api/upload`, `/api/empreendimentos/arquivos/:id`, `/api/privacidade/exportacao/:token`).
4. P3 — itens 8–11 conforme decisão do responsável.
5. Varredura do histórico do git por segredos (com autorização) e definição de rotação se algo aparecer.
