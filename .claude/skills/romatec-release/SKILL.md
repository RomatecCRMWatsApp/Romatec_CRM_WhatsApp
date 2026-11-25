---
name: romatec-release
description: Lança uma versão nova do Romatec CRM do início ao push — nota no RELEASE_NOTES.md, npm run release, tipos, testes, build e commit. Usar quando o usuário disser "sobe", "faz o deploy", "publica", "lança a versão", "release", "manda pro ar" ou ao terminar uma feature do CRM.
---
# Lançar versão do Romatec CRM

## Quando usar
Sempre que uma mudança do CRM (Romatec_CRM_WhatsApp) estiver pronta para ir ao ar. O push na `main` publica: o servidor grava a versão e mostra "Novidades da versão" para todo mundo.

## Passo a passo
1. **Nota de versão no TOPO do `RELEASE_NOTES.md`**, logo acima da última `## x.y.z`:
   ```
   ## 1.207.0 — AAAA-MM-DD
   tipo: minor            # major | minor | patch
   obrigatoria: nao
   titulo: <frase curta do que o usuário ganha>
   publico: admin         # admin | todos (quem vê o aviso)

   ### Novo
   - <o que a pessoa consegue fazer agora, na tela X › Y>
   ### Correções
   - <...>
   ```
   Escreva para o dono do negócio, não para programador: tela, botão e efeito.
2. `npm run release` — valida a nota e atualiza o `package.json`.
3. `npx tsc --noEmit -p .` — tem que sair vazio.
4. `npx vitest run 2>&1 | grep -E "Test Files|Tests  |FAIL"` — tudo passando.
5. Build em segundo plano (passa de 120 s quando roda junto com os testes):
   `timeout 280 npx vite build` com `run_in_background`, e espere o `built in`.
6. `git add -A && git commit -m "<tipo>: <resumo> (vX.Y.Z)"` com o rodapé de sessão pedido.
7. `git push origin refs/heads/main:refs/heads/main` (até 4 tentativas com espera crescente se a rede falhar).

## Regras e armadilhas conhecidas
- O bot de CI pode mexer no build depois; nunca force push.
- Nada de `console.log` novo; erros com `console.warn('[Módulo] ...')`.
- Se `npm run release` reclamar da nota, corrija o cabeçalho (data, tipo, título) em vez de editar o `package.json` à mão.
- Tela nova ou alterada: antes do commit, rode a skill **romatec-conferir-tela** (celular 390 px).

## Verificação antes de entregar
- [ ] tsc vazio, todos os testes passando, build com `built in`
- [ ] push aceito (`main -> main`)
- [ ] resposta ao usuário diz a versão, o que mudou na tela e o que ele precisa fazer (ex.: ligar algo, subir arquivo)
