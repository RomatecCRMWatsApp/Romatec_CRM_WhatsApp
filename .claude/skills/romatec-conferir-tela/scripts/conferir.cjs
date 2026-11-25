// Faz login no CRM local e tira captura de cada rota em 390 px (celular) e 1280 px (computador),
// apontando elementos que passam da largura da tela (o usuário precisa "arrastar para o lado").
// Uso: node conferir.cjs <pasta-saida> /rota1 /rota2 ...
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const [out, ...rotas] = process.argv.slice(2);
if (!out || !rotas.length) { console.error('uso: node conferir.cjs <pasta-saida> /rota ...'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3999';
const TELAS = [{ nome: 'celular', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { nome: 'computador', viewport: { width: 1280, height: 800 } }];
(async () => {
  const b = await chromium.launch();
  let falhas = 0;
  for (const t of TELAS) {
    const ctx = await b.newContext({ viewport: t.viewport, isMobile: !!t.isMobile, hasTouch: !!t.hasTouch, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', e => erros.push(e.message));
    await p.goto(BASE + '/login');
    await p.fill('input[type=text], input[type=email]', 'admin@teste.local');
    await p.fill('input[type=password]', 'Teste@12345');
    await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
    // Fecha o aviso de novidades da versão (aparece no 1º acesso do usuário de teste)
    const lidas = p.getByText('Marcar todas como lidas');
    if (await lidas.count()) { await lidas.first().click(); await p.waitForTimeout(800); }
    if (p.url().includes('/login')) { console.error('Login falhou: confira se o servidor subiu com subir.sh'); process.exit(1); }
    for (const r of rotas) {
      await p.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 30000 }); await p.waitForTimeout(2500);
      const largos = await p.evaluate(() => {
        const W = document.documentElement.clientWidth, ruins = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.position === 'fixed') continue;
          const rc = el.getBoundingClientRect(); if (!rc.width) continue;
          let pai = el.parentElement, rola = false;
          while (pai) { const o = getComputedStyle(pai).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') { rola = true; break; } pai = pai.parentElement; }
          if (!rola && rc.right > W + 2) ruins.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} (${Math.round(rc.right)}px)`);
        }
        return { W, rolaPagina: document.documentElement.scrollWidth > W + 2, ruins: ruins.slice(0, 5) };
      });
      const arq = path.join(out, `${t.nome}${r.replace(/[^\w]+/g, '_')}.png`);
      await p.screenshot({ path: arq, fullPage: true });
      const ok = !largos.rolaPagina && !erros.length;
      if (!ok) falhas++;
      console.log(`${ok ? 'OK ' : 'ERRO'} ${t.nome} ${r} -> ${arq}${largos.rolaPagina ? ` | passa da largura: ${largos.ruins.join('; ')}` : ''}${erros.length ? ` | erro na página: ${erros.join(' / ')}` : ''}`);
      erros.length = 0;
    }
    await ctx.close();
  }
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
