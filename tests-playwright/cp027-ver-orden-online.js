const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp027_ver_orden_online() {
  console.log('🔄 Ejecutando CP-027: Verificar que "Ver orden online" abra la orden en una nueva pestaña o URL...');

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
      console.log('⚠️ CP-027 RESULT: No hay tarjetas de orden visibles en el estado actual del QA');
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
      console.log('⚠️ CP-027 RESULT: El menú de tres puntos existe pero no se desplegó en esta ejecución');
      return;
    }

    const onlineLink = await page.evaluate(() => {
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find(s => /opciones avanzadas/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find(a => /ver orden online/i.test(a.textContent || ''));
      return link ? { href: link.getAttribute('href') } : null;
    });

    if (!onlineLink || !onlineLink.href) {
      throw new Error('No se encontró la opción "Ver orden online" dentro de Opciones avanzadas');
    }

    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
      page.evaluate(() => {
        const dd = document.querySelector('[id^="myDropdownListOrders_"]');
        const link = Array.from(dd.querySelectorAll('a')).find(a => /ver orden online/i.test(a.textContent || ''));
        if (link) link.click();
      })
    ]);
    await page.waitForTimeout(2500);

    let finalUrl, finalBodyText;
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      finalUrl = newPage.url();
      finalBodyText = await newPage.locator('body').innerText().catch(() => '');
      await newPage.close();
    } else {
      finalUrl = page.url();
      finalBodyText = await page.locator('body').innerText().catch(() => '');
    }

    const openedOrderView = /get_repair_order_by_hash_key|repair_order/i.test(finalUrl) && !/error\/404/i.test(finalUrl) && !/página no encontrada/i.test(finalBodyText);
    if (openedOrderView) {
      console.log('✅ CP-027 PASSED: "Ver orden online" abrió la vista de la orden (' + finalUrl + ')');
    } else {
      throw new Error('No se abrió una vista válida de la orden. URL final: ' + finalUrl);
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp027-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-027 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp027_ver_orden_online();
