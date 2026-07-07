const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp056_tab_ruteo() {
  console.log('🔄 Ejecutando CP-056: Verificar que el tab "Ruteo" cargue correctamente...');
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

    if (!(await page.evaluate(() => !!document.getElementById('btn_routing_option')))) {
      throw new Error('No se encontró el tab "Ruteo"');
    }
    const t1 = Date.now();
    await page.evaluate(() => document.getElementById('btn_routing_option').click());
    await page.waitForTimeout(2500);
    console.log('⏱ Cargar tab Ruteo: ' + (Date.now() - t1) + 'ms');

    const bodyText = await page.locator('body').innerText();
    const loaded = /seleccionar ruta/i.test(bodyText) && /seleccionar repartidor/i.test(bodyText);

    if (loaded) {
      console.log('✅ CP-056 PASSED: El tab "Ruteo" cargó correctamente');
    } else {
      throw new Error('El tab "Ruteo" no mostró contenido reconocible');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp056-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-056 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp056_tab_ruteo();
