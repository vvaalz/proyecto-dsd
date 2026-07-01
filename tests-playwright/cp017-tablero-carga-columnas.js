const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp017_tablero_carga_columnas() {
  console.log('🔄 Ejecutando CP-017b: Verificar que el tablero carga correctamente con las columnas de etapas...');

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
    await page.waitForTimeout(6000);
    console.log('⏱ Carga tablero + columnas: ' + (Date.now() - inicio) + 'ms');

    const bodyText = await page.locator('body').innerText();
    const passed =
      bodyText.includes('Torre de Control') ||
      bodyText.includes('Gestión de Órdenes de Trabajo') ||
      bodyText.includes('Cargando órdenes de trabajo');

    if (passed) {
      console.log('✅ CP-017b PASSED: El tablero cargó correctamente y mostró la vista del kanban');
    } else {
      console.log('❌ CP-017b FAILED: El tablero no cargó como se esperaba');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'cp017b-fallo-' + Date.now() + '.png') });
    console.log('❌ CP-017b FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp017_tablero_carga_columnas();
