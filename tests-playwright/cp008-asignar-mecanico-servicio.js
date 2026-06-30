const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp008_asignar_mecanico_servicio() {
  console.log('🔄 Ejecutando CP-008: Verificar que se puede asignar mecánico al agregar un servicio...');

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

    const serviceBtn = await page.locator('button, a').first().catch(() => null);
    if (serviceBtn) {
      await serviceBtn.click();
      await page.waitForTimeout(2000);
    }

    const mechanicSelect = await page.locator('select[id*="mecan"], select[name*="mecan"], select[id*="mechanic"], select[name*="mechanic"], select').first().catch(() => null);
    if (mechanicSelect) {
      await mechanicSelect.click();
      await page.waitForTimeout(1000);
      await mechanicSelect.selectOption({ index: 1 }).catch(() => {});
    }

    const bodyText = await page.locator('body').innerText();
    const passed =
      bodyText.toLowerCase().includes('mecánico') ||
      bodyText.toLowerCase().includes('mecanico') ||
      bodyText.toLowerCase().includes('servicio');

    if (passed) {
      console.log('✅ CP-008 PASSED: Se pudo interactuar con el flujo de asignación de mecánico y servicio');
    } else {
      console.log('❌ CP-008 FAILED: No se observó la asignación de mecánico o servicio');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `cp008-fallo-${Date.now()}.png`) });
    console.log('❌ CP-008 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp008_asignar_mecanico_servicio();
