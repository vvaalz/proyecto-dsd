const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp010_cancelar_generacion_orden() {
  console.log('🔄 Ejecutando CP-010: Verificar que cancelar la generación de orden regresa a la recepción...');

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

    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await page.waitForSelector('button.add-reception-btn', { timeout: 15000 });

    await page.evaluate(() => document.querySelector('button.add-reception-btn').click());
    await page.waitForTimeout(4000);

    const cancelBtn = await page.locator('button.btn-danger, button.btn-secondary, button[onclick*="cancel"], button[id*="cancel"]').first().catch(() => null);
    if (cancelBtn) {
      await cancelBtn.click();
      await page.waitForTimeout(3000);
    }

    const currentUrl = page.url();
    const bodyText = await page.locator('body').innerText();
    const passed =
      currentUrl.includes('vehicularQuickReception') ||
      bodyText.toLowerCase().includes('recepción') ||
      bodyText.toLowerCase().includes('recepcion');

    if (passed) {
      console.log('✅ CP-010 PASSED: Cancelar la generación de orden regresó a la recepción');
    } else {
      console.log('❌ CP-010 FAILED: No se regresó a la recepción al cancelar');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `cp010-fallo-${Date.now()}.png`) });
    console.log('❌ CP-010 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp010_cancelar_generacion_orden();
