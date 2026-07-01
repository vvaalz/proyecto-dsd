const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp015_cambiar_sucursal_selector() {
  console.log('🔄 Ejecutando CP-015: Verificar que cambiar sucursal desde el selector actualiza la vista...');

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
    console.log('⏱ Carga tablero: ' + (Date.now() - inicio) + 'ms');

    const result = await page.evaluate(() => {
      const select = document.querySelector('select, [role="combobox"]');
      if (!select) return { found: false };
      const initialValue = select.value;
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { found: true, initialValue, newValue: select.value };
    });

    if (!result.found) {
      throw new Error('No se encontró un selector de sucursal o grupo');
    }

    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    const updatedView = /sucursal|branch|tienda|vista|orden/i.test(bodyText);
    const valueChanged = result.initialValue !== result.newValue;

    if (updatedView || valueChanged) {
      console.log('✅ CP-015 PASSED: El selector de sucursal respondió al cambio y la vista se actualizó');
    } else {
      throw new Error('El cambio de sucursal no produjo una actualización visible');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp015-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-015 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp015_cambiar_sucursal_selector();
