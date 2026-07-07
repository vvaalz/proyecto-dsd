const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp005_carga_dashboard() {
  console.log('🔄 Ejecutando CP-005: Verificar carga del dashboard...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');

    const inicioDashboard = Date.now();
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });
    const tiempoCarga = Date.now() - inicioDashboard;

    if (tiempoCarga > 8000) console.log(`❌ PERFORMANCE FAILED: dashboard tardó ${tiempoCarga}ms`);
    else if (tiempoCarga > 3000) console.log(`⚠️ LENTO: dashboard tardó ${tiempoCarga}ms`);
    else console.log(`⏱ Carga dashboard: ${tiempoCarga}ms`);

    const url = page.url();
    const title = await page.title();

    if (url.includes('dashboard')) {
      console.log('✅ CP-005 PASSED: Dashboard cargó correctamente');
      console.log('   URL: ' + url);
      console.log('   Título: ' + title);
    } else {
      throw new Error('El dashboard no cargó correctamente');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `cp005-fallo-${Date.now()}.png`) });
    console.log('❌ CP-005 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp005_carga_dashboard();
