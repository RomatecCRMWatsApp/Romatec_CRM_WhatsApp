# Implantação e rollback — branch `seguranca/privacidade-lgpd`

> **Não publicado.** `main` faz deploy automático no Railway (`.github/workflows/deploy-railway.yml`); este trabalho está só na branch. Merge = deploy em produção → exige aprovação.

## O que muda ao fazer merge (com as variáveis padrão)
| Item | Efeito em produção | Flag |
|---|---|---|
| Migration `addPrivacidade` | cria 3 tabelas novas (`privacidadePedidos`, `privacidadePedidoEventos`, `privacidadeAceites`); **não altera tabelas existentes**; idempotente | — |
| `contacts.list` com escopo | corretor passa a ver só contatos dos leads dele (antes via todos) | — |
| `zapi.sendMessage` / `bot.processMessage` | só administrador | — |
| `/api/upload` | recusa arquivo cujo conteúdo não bate com o tipo (inclui SVG) | — |
| Arquivos de empreendimento | SVG/HTML/outros viram download em vez de abrir no navegador | — |
| Redação de logs | telefone/CPF/e-mail/tokens aparecem redigidos nos logs do Railway | `LOG_REDACAO=off` desliga |
| Cookies | evento GA/Ads para após "Recusar"; botão "Cookies" nas páginas públicas | — |
| `/privacidade` (canal) | mostra "em preparação" | `PRIVACIDADE_CANAL_ATIVO=on` liga |
| Minutas, `/minha-privacidade`, aceites | indisponíveis (404) | `PRIVACIDADE_MINUTAS_ATIVAS=on` liga, **após aprovação jurídica** |
| `/privacidade/pedidos` | tela do admin (lista vazia enquanto o canal estiver desligado) | — |

## Homologação (passo a passo)
1. Criar ambiente de homologação no Railway com banco **cópia sem dados reais** ou sintético; apontar a branch.
2. Variáveis: `PRIVACIDADE_CANAL_ATIVO=on`, `PRIVACIDADE_MINUTAS_ATIVAS=on`, `JWT_SECRET` próprio, **sem** `PRIVACIDADE_ENVIO_CODIGO` (nenhum envio externo).
3. Conferir nos logs: `[Migration] ✅ addPrivacidade`.
4. Roteiro: (a) `/privacidade` → criar pedido → protocolo; (b) admin `/privacidade/pedidos` → confirmar identidade com justificativa → exportar JSON/CSV (abrir o CSV no Excel: células com `=` não executam) → link após 15 min dá 410; (c) simular anonimização com titular sintético, executar com senha, conferir que contrato sintético fica retido; (d) login de corretor: lista de Contatos só com os dele; (e) página `/bom-jardims` com GA de teste: aceitar → recusar → aba Rede sem novas chamadas `collect`; (f) subir um SVG em Imóveis → recusado; (g) logs sem telefones completos.
5. Rodar `npx tsc --noEmit -p .`, `npx vitest run`, `npx vite build`.

## Produção (após aprovação)
1. Merge do PR na `main` (deploy automático). Deixar `PRIVACIDADE_CANAL_ATIVO` e `PRIVACIDADE_MINUTAS_ATIVAS` **sem valor** (desligados).
2. Avisar corretores sobre a mudança na lista de Contatos.
3. Ligar o canal só depois de definir responsável e prazo; ligar minutas só depois da aprovação jurídica e do preenchimento de `PRIVACIDADE_CONTROLADOR_*`.

## Rollback
- **Rápido (sem deploy):** `PRIVACIDADE_CANAL_ATIVO=off`, `PRIVACIDADE_MINUTAS_ATIVAS=off`, `LOG_REDACAO=off` (só se a redação atrapalhar diagnóstico, por tempo limitado).
- **Código:** reverter os commits da branch na `main` (`git revert`), novo deploy. As tabelas novas podem ficar (não são lidas por nada mais); removê-las só com aprovação e após exportar a trilha de pedidos (registro de atendimento a titulares).
- **Anonimização executada não tem rollback** (por desenho). Por isso: simulação, senha, confirmação digitada e pedido verificado.
