const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp006_acceso_recepcion_vehiculo() {
  console.log('🔄 Ejecutando CP-006: Verificar acceso al módulo de Recepción de Vehículo...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 20000 });

    // Navegar directamente al módulo de Recepción Vehicular
    const inicioCarga = Date.now();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await page.waitForLoadState('domcontentloaded');
    const tiempoCarga = Date.now() - inicioCarga;
    if (tiempoCarga > 8000) console.log(`❌ PERFORMANCE FAILED: módulo recepción tardó ${tiempoCarga}ms`);
    else if (tiempoCarga > 3000) console.log(`⚠️ LENTO: módulo recepción tardó ${tiempoCarga}ms`);
    else console.log(`⏱ Carga módulo recepción: ${tiempoCarga}ms`);

    const currentUrl = page.url();
    const bodyText = await page.locator('body').innerText();
    const isAccessible =
      currentUrl.includes('reception') ||
      currentUrl.includes('vehiculo') ||
      currentUrl.includes('vehicular') ||
      bodyText.toLowerCase().includes('recepción') ||
      bodyText.toLowerCase().includes('recepcion');

    if (isAccessible) {
      console.log('✅ CP-006 PASSED: Se pudo acceder al módulo de Recepción de Vehículo');
      console.log('   URL actual: ' + currentUrl);
    } else {
      throw new Error('No se pudo acceder al módulo de Recepción de Vehículo');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `cp006-fallo-${Date.now()}.png`) });
    console.log('❌ CP-006 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp006_acceso_recepcion_vehiculo();
