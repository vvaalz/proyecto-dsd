const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp046_movimientos_caja() {
  console.log('🔄 Ejecutando CP-046: Verificar que (F9) Movimientos de caja cargue la pantalla de movimientos...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const t0 = Date.now();
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    console.log('⏱ Carga POS: ' + (Date.now() - t0) + 'ms');

    await page.evaluate(() => document.getElementById('menu_cash').click());
    await page.waitForTimeout(1000);

    const clicked = await page.evaluate(() => {
      const isVis = (el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /caja/i.test(m.textContent||''));
      if (!menu) return false;
      const li = Array.from(menu.querySelectorAll('li')).find(el => /movimientos de caja/i.test(el.textContent||''));
      if (!li) return false;
      li.click(); return true;
    });
    if (!clicked) throw new Error('No se encontró la opción "(F9) Movimientos de caja" en el menú de Caja');
    await page.waitForTimeout(2000);

    const modalOpen = await page.evaluate(() => {
      const isVis = (el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const m = document.getElementById('dialog_cash_movement');
      return m ? isVis(m) : false;
    });

    if (modalOpen) {
      console.log('✅ CP-046 PASSED: Se cargó la pantalla de "Movimientos de caja"');
    } else {
      throw new Error('No se cargó la pantalla de movimientos de caja');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp046-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-046 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp046_movimientos_caja();
