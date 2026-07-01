const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp045_abrir_cerrar_caja() {
  console.log('🔄 Ejecutando CP-045: Verificar que (F12) Abrir/Cerrar Caja abra el modal de gestión de caja...');
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
      const li = Array.from(menu.querySelectorAll('li')).find(el => /abrir\/cerrar caja/i.test(el.textContent||''));
      if (!li) return false;
      li.click(); return true;
    });
    if (!clicked) throw new Error('No se encontró la opción "(F12) Abrir/Cerrar Caja" en el menú de Caja');
    await page.waitForTimeout(2000);

    const modalOpen = await page.evaluate(() => {
      const isVis = (el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const o = document.getElementById('dialog_cash_opening');
      const c = document.getElementById('dialog_cash_closing');
      return (o&&isVis(o))||(c&&isVis(c));
    });

    if (modalOpen) {
      console.log('✅ CP-045 PASSED: Se abrió el modal de gestión de caja (apertura o cierre, según el estado actual)');
    } else {
      throw new Error('No se abrió ningún modal de gestión de caja');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp045-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-045 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp045_abrir_cerrar_caja();
