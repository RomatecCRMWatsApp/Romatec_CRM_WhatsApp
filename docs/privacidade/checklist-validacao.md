# Checklist de validação — CRM da Romatec

Status: **implementado e testado** · **implementado sem teste** · **pendente** · **bloqueado** · **não aplicável**. Testes: `server/privacidade.test.ts` (14), `server/rastreamento.test.ts` (+1). Resultados dos comandos no fim.

| # | Item do roteiro | Status | Evidência / pendência |
|---|---|---|---|
| 1 | Projeto correto, ambientes e modelo de negócio identificados | implementado sem teste | `inventario-dados.md` (CRM interno + páginas públicas + cobrança Asaas + licença SaaS). Ambiente de produção não acessado (fora da autorização). |
| 2 | Inventário, finalidades, bases candidatas e responsáveis | implementado sem teste | `inventario-dados.md`; bases "a validar"; responsável PENDENTE |
| 3 | Dados públicos × privados × próprios × de terceiros | implementado sem teste | `inventario-dados.md`; consultas públicas sem PII testadas (`consultarPedido`) |
| 4 | Termos/aviso e identificação real; publicação condicionada | implementado e testado (mecanismo) / pendente (texto aprovado, dados da empresa) | `minutas/*.md` marcadas MINUTA; `server/privacidade/config.ts` (identificação só por variável, desligado em produção — teste "desligado") |
| 5 | Aceite versionado e consentimentos opcionais independentes | implementado e testado | `server/privacidade/aceites.ts`, `privacidadeAceites`; teste "aceite versionado…" (pendente por padrão, versão+hash, termos ≠ aviso ≠ marketing, revogação com histórico) |
| 6 | Cookies/pixels opcionais controlados; rejeição e revogação | implementado e testado (unidade, simulando o navegador) | `client/src/lib/rastreamento.ts`, `AvisoCookies.tsx`, `ImovelLanding.tsx`; teste "revogação…" falhava antes da correção. Verificação em navegador real (aba Rede): pendente na homologação |
| 7 | Canal de titulares sem conta, verificação proporcional | implementado e testado | `server/privacidade/pedidos.ts`, `/privacidade`; testes do canal (código, tentativas, limite, sem enumeração); envio real do código desligado por padrão |
| 8 | Exportação com escopo, proteção e link temporário | implementado e testado | `server/privacidade/titular.ts`, rota `/api/privacidade/exportacao/:token`; testes (sem vazamento do vizinho, CSV anti-fórmula, link vencido/adulterado). Rota HTTP sem teste próprio |
| 9 | Exclusão de conta, contato, titular e empresa separadas | implementado sem teste (documentação) / testado (anonimização) | `retencao-e-direitos.md` §1; exclusão de empresa não existe (não aplicável à rotina) |
| 10 | Retenção, descarte, backups e reaplicação | implementado e testado (anonimização idempotente) / pendente (prazos, backups, automação de reaplicação) | teste "anonimização…"; `retencao-e-direitos.md` §5–6. Backups do Railway: **bloqueado** (sem acesso) |
| 11 | Autorização no servidor e acesso cruzado | parcialmente implementado e testado | correções `contacts.list`, `zapi.sendMessage`, `bot.processMessage`, gestão de privacidade só admin (testes "escopo…", "gestão… só do administrador"); revisão completa de todos os routers **pendente** |
| 12 | Contas administrativas, sessões, recuperação de conta | implementado sem teste (revisão) | step-up por senha reaproveitado na anonimização (testado); MFA, validade de sessão de 1 ano: pendentes (`auditoria-e-plano.md` 10–11). Não há "esqueci a senha" por e-mail (primeiro acesso por link de convite) |
| 13 | Banco, arquivos e uploads protegidos | implementado e testado (helper) | `shared/uploadSeguro.ts` (teste com SVG/HTML/HEIC); rotas `/api/upload` e arquivos de empreendimento sem teste HTTP. Criptografia em repouso do banco: **bloqueado** (sem acesso ao Railway) |
| 14 | Secrets e logs revisados; plano de rotação | implementado e testado (logs) / sem rotação necessária identificada | `server/privacidade/redacao.ts` (testes); busca de segredos no código atual sem achados reais; histórico do git: pendente |
| 15 | Fornecedores e IA | implementado sem teste (documentação) | `fornecedores-e-ia.md`; contas não verificadas (bloqueado) |
| 16 | Roteiro de incidentes | implementado sem teste | `resposta-incidentes.md`; responsáveis PENDENTES; sem disparo automático |
| 17 | Cobrança, cancelamento, arrependimento, webhooks | pendente (avaliação jurídica) | `pendencias-juridicas-e-negocio.md` "Cobrança"; nada alterado; testes existentes de webhook/Asaas continuam passando |
| 18 | Typecheck, testes e build com resultados reais | implementado e testado | abaixo |
| 19 | Documentação, pendências e implantação/rollback | implementado | esta pasta |
| 20 | Relatório independente; produção não alterada | implementado | trabalho só na branch `seguranca/privacidade-lgpd`; nenhum push na `main` |

## Testes mínimos do roteiro (§9)
| Teste | Status |
|---|---|
| (a) acesso entre usuários/perfis | testado (contatos, WhatsApp/robô, gestão de privacidade, anonimização por corretor) |
| (b) tracking antes da escolha, rejeição e revogação | testado (`rastreamento.test.ts`) |
| (c) versão/data de termos e consentimentos separados | testado |
| (d) exportação sem vazamento e link expirado | testado |
| (e) pedido sem conta e prevenção de fraude | testado |
| (f) exclusão sintética preservando terceiros e retenção | testado |
| (g) documentos privados e uploads inválidos | testado (helper de bytes); documentos de usuário já tinham teste (`credenciais`) |
| (h) logs sem secrets/PII | testado |
| (i) cancelamento/webhooks duplicados | não alterado; testes existentes do repositório |
| (j) restauração e reaplicação de exclusões | pendente (procedimento documentado, sem ambiente para testar) |

## Comandos executados (20/11/2026, máquina de desenvolvimento, SQLite em memória)
- `npx tsc --noEmit -p .` → sem erros.
- `npx vitest run` → 198 arquivos / 1350 testes passando (rodada anterior teve 1 falha intermitente em `server/assinatura.test.ts`, que passa isolado tanto com quanto sem estas mudanças).
- `npx vite build` → concluído.
