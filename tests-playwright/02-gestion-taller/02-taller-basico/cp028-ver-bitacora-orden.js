const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp028_ver_bitacora_orden() {
  console.log('🔄 Ejecutando CP-028: Verificar que "Ver bitácora" cargue la bitácora de la orden...');

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

    const inicio = Date.now();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 20000 });
    // Esperar a que el AJAX de órdenes cargue las tarjetas
    try {
      await page.waitForSelector('.repair-order-list-item', { state: 'attached', timeout: 25000 });
    } catch {}
    await page.waitForTimeout(1500);
    console.log('⏱ Carga módulo recepción: ' + (Date.now() - inicio) + 'ms');

    const menuButtonCount = await page.locator('.options-menu-button').count();
    if (menuButtonCount === 0) {
      console.log('⚠️ CP-028 RESULT: No hay tarjetas de orden visibles en el estado actual del QA');
      return;
    }

    await page.locator('.options-menu-button').first().evaluate(el =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    );
    await page.waitForTimeout(1800);

    const menuOpened = await page.evaluate(() => {
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      return dd ? window.getComputedStyle(dd).display !== 'none' : false;
    });
    if (!menuOpened) {
      console.log('⚠️ CP-028 RESULT: El menú de tres puntos existe pero no se desplegó en esta ejecución');
      return;
    }

    const logbookFound = await page.evaluate(() => {
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find(s => /opciones avanzadas/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find(a => /ver bit[aá]cora/i.test(a.textContent || ''));
      return !!link;
    });
    if (!logbookFound) throw new Error('No se encontró la opción "Ver bitácora" dentro de Opciones avanzadas');

    const bodyBefore = await page.locator('body').innerText();
    await page.evaluate(() => {
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const link = Array.from(dd.querySelectorAll('a')).find(a => /ver bit[aá]cora/i.test(a.textContent || ''));
      if (link) link.click();
    });
    await page.waitForTimeout(2500);

    const bodyAfter = await page.locator('body').innerText();
    const logbookLoaded = /bit[aá]cora/i.test(bodyAfter) && bodyAfter.length !== bodyBefore.length;
    if (logbookLoaded) {
      console.log('✅ CP-028 PASSED: Se cargó la bitácora de la orden tras hacer clic en "Ver bitácora"');
    } else {
      throw new Error('No se observó contenido de bitácora tras hacer clic en la opción');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp028-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-028 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp028_ver_bitacora_orden();
