# Romatec CRM — instruções para o Claude Code

CRM imobiliário (Node 22 + TypeScript, Express + tRPC, Drizzle com MySQL em produção e SQLite em teste/local,
React + Vite + wouter no `client/`). O dono é corretor (CRECI/MA 4.705; empresa Romatec Consultoria Total, CRECI J-1234).
Comunicação em PT-BR simples: diga o que muda na tela e o que ele precisa fazer.

## Mapa rápido
- `server/routers/*.router.ts` — tRPC (registrar em `server/routers.ts`). Perfis: `ctx.permissoes?.perfil` (admin, secretario, corretor, atendente, empreendedor, juridico).
- `server/<domínio>/` — regras de negócio; `shared/` — funções puras usadas no servidor e no cliente.
- `drizzle/schema.ts` + `server/_core/migrations/` + `server/_core/migrations/initSqlite.ts` — banco (ver skill **romatec-migracao**).
- `server/_core/index.ts` — boot: migrations e jobs (`iniciar...`).
- `client/src/pages`, `client/src/components/<área>` — telas; `AppShell` tem o menu.

## Fluxos com skill (use em vez de improvisar)
- Lançar versão / "sobe" / deploy → **romatec-release**
- Campo ou tabela nova → **romatec-migracao**
- Tela nova ou ajuste no celular → **romatec-conferir-tela** (390 px e 1280 px, e desligar o servidor no fim)

## Regras
- Tela nova ou alterada só é entregue depois de conferida em 390 px de largura.
- Testes que usam banco: defina `process.env.DATABASE_DRIVER = 'sqlite'` e `process.env.SQLITE_PATH = ':memory:'` ANTES de qualquer import do banco e importe os módulos com `await import(...)` (import estático carrega o banco sem ambiente → `db` nulo).
- Envio externo em teste: use os dublês existentes (`definirEnviador`, `definirEnviadorPdf`, `definirAvisoRepasse`, `definirAvisoEscritorio`, `definirMontador`), nunca WhatsApp/Cloudinary real.
- PDF com o `escritor` de `server/contratos/docsComissao.ts` usa fonte WinAnsi: sem emoji e sem setas (→); troque por texto ou `›`.
- TypeScript do projeto: não use flag `u` em regex literal (use `new RegExp(..., 'gu')`) nem `for...of` em `Map`/iteradores (use `forEach` ou `Array.from`).
- Edite arquivos com a ferramenta de edição; scripts de busca-e-troca só para mudanças mecânicas repetidas, e sempre conferindo que o trecho existe.
- Build (`vite build`) leva ~1 min: rode em segundo plano com `timeout 280`.
- Rede da sessão na nuvem: se um site der 403/ENOTFOUND uma vez, não insista; avise e siga.
- Nunca invente dado de empresa, CRECI, CNPJ, preço ou condição comercial; pergunte. Preço nas peças de anúncio só com as condições confirmadas pelo dono.
- Dados de clientes (CSV, contatos, contratos com CPF) ficam no ambiente: nunca em repositório público nem em serviço externo.
- Mensagens a clientes: individuais e com controle humano; nada de disparo em massa. Campanhas/anúncios na Meta sempre criados pausados e só ativados com aprovação.
- Não ler nem imprimir segredos do `.env`.

## Aprendizados (self-improve)
- 2026-11-25: regras acima vieram do diagnóstico do histórico (relatório em `~/.claude/self-improve/relatorio-2026-11-25.md`): falta de CLAUDE.md, ~100 edições por script, 22 builds estourando tempo, 26 bloqueios de rede e 2 reclamações de telas no celular.
