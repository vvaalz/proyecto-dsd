const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp017_carga_tablero_ordenes() {
  console.log('🔄 Ejecutando CP-017: Verificar que el tablero de órdenes se cargue correctamente...');

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
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard');
    await page.waitForSelector('#repair_order_search', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const tiempoCarga = Date.now() - inicio;
    if (tiempoCarga > 8000) console.log('❌ PERFORMANCE FAILED: tablero tardó ' + tiempoCarga + 'ms');
    else if (tiempoCarga > 3000) console.log('⚠️ LENTO: tablero tardó ' + tiempoCarga + 'ms');
    else console.log('⏱ Carga tablero: ' + tiempoCarga + 'ms');

    const searchInput = page.locator('#repair_order_search');
    const visible = await searchInput.isVisible();
    const placeholder = await searchInput.getAttribute('placeholder');
    const url = page.url();

    if (visible && placeholder === 'Buscar órdenes...' && url.includes('workOrderBoard')) {
      console.log('✅ CP-017 PASSED: El tablero se cargó y el buscador está disponible');
    } else {
      throw new Error('El tablero no cargó como se esperaba (visible=' + visible + ', placeholder=' + placeholder + ')');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp017-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-017 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp017_carga_tablero_ordenes();
