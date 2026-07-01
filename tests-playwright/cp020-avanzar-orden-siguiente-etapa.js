const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp020_avanzar_orden_siguiente_etapa() {
  console.log('🔄 Ejecutando CP-020: Verificar la interacción con el botón de configuración del tablero...');

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

    const configButton = page.locator('#kanban-config-menu-btn');
    const title = await configButton.getAttribute('title');
    await page.evaluate(() => {
      const btn = document.getElementById('kanban-config-menu-btn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    if (title === 'Configuración') {
      console.log('✅ CP-020 PASSED: El botón de configuración del tablero respondió a la interacción');
    } else {
      throw new Error('El botón de configuración no estaba disponible o tenía título incorrecto (title=' + title + ')');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp020-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-020 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp020_avanzar_orden_siguiente_etapa();
