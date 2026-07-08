const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp021_carga_modulo_reporte_ordenes() {
  console.log('🔄 Ejecutando CP-021: Verificar que el módulo de Reporte de Órdenes cargue sin errores...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const inicio = Date.now();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/reports/order_report');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    const tiempoCarga = Date.now() - inicio;
    if (tiempoCarga > 8000) console.log('❌ PERFORMANCE FAILED: reporte órdenes tardó ' + tiempoCarga + 'ms');
    else if (tiempoCarga > 3000) console.log('⚠️ LENTO: reporte órdenes tardó ' + tiempoCarga + 'ms');
    else console.log('⏱ Carga reporte órdenes: ' + tiempoCarga + 'ms');

    const currentUrl = page.url();
    const bodyText = await page.locator('body').innerText();
    const loaded = currentUrl.includes('order_report') &&
      (bodyText.includes('Reporte') || bodyText.includes('órden') || bodyText.includes('Orden'));

    if (loaded) {
      console.log('✅ CP-021 PASSED: El módulo de Reporte de Órdenes cargó correctamente');
    } else {
      throw new Error('El módulo no cargó como se esperaba (url=' + currentUrl + ')');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp021-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-021 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp021_carga_modulo_reporte_ordenes();
