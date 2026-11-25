---
name: romatec-conferir-tela
description: Sobe o Romatec CRM local com banco SQLite de teste, faz login e tira capturas das telas no celular (390 px) e no computador (1280 px), acusando o que passa da largura; depois desliga o servidor. Usar antes de entregar tela nova ou alterada, ou quando o usuário disser "no celular está quebrado", "tem que arrastar para o lado", "ajusta para o mobile", "confere a tela".
---
# Conferir tela do Romatec CRM (celular e computador)

## Quando usar
Toda tela nova ou mudada, antes do commit. O usuário usa o CRM no celular e já reclamou de página "grandona" que precisa arrastar.

## Passo a passo
1. Subir (porta 3999, banco descartável, admin de teste e configuração inicial já feita):
   `bash .claude/skills/romatec-conferir-tela/scripts/subir.sh <pasta-no-scratchpad>`
   Login: `admin@teste.local` / `Teste@12345`.
2. Se a tela precisar de dados, insira no `<pasta>/local.db` com `better-sqlite3` (node -e) ou pelo próprio CRM.
3. Conferir as rotas:
   `node .claude/skills/romatec-conferir-tela/scripts/conferir.cjs <pasta>/capturas /rota1 /rota2`
   Saída `OK`/`ERRO` por tela; `ERRO` diz qual elemento passou da largura ou o erro de JavaScript da página.
4. **Abra as capturas do celular** (Read no `.png`) e olhe de verdade: texto cortado, botão fora, tabela espremida.
5. Corrija (ex.: `flex-wrap`, `min-w-0`, `grid md:grid-cols-2`, tabela dentro de `overflow-x-auto`) e repita o passo 3.
6. **Sempre** desligue no fim: `bash .claude/skills/romatec-conferir-tela/scripts/parar.sh`.

## Regras e armadilhas conhecidas
- Banco novo cai em `/setup` se não houver `companyConfig`; o `subir.sh` já cria uma.
- O aviso "Novidades da versão" aparece no 1º acesso; o `conferir.cjs` clica em "Marcar todas como lidas".
- Aba dentro da página (ex.: Fábrica de criativos) não tem rota própria: para conferir, adapte o script para clicar na aba antes da captura.
- Tabela larga dentro de `overflow-x-auto` é aceitável; a página inteira rolar para o lado não é.
- Para mostrar ao usuário, use captura com `deviceScaleFactor: 2`.

## Verificação antes de entregar
- [ ] todas as rotas `OK` nos dois tamanhos
- [ ] capturas do celular olhadas
- [ ] servidor desligado (`parar.sh`)
