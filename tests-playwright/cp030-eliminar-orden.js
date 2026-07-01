const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp030_eliminar_orden() {
  console.log('🔄 Ejecutando CP-030: Verificar que "Eliminar orden" haga desaparecer la orden de la lista...');

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

    const targetCard = await page.evaluate(() => {
      const markerRegex = /cliente prueba tarea|asterisco|pololeo|ertyu|6qqyq/i;
      const cards = Array.from(document.querySelectorAll('.repair-order-list-item'));
      const match = cards.find(c => markerRegex.test(c.textContent || ''));
      if (!match) return null;
      const btn = match.querySelector('.options-menu-button');
      if (!btn) return null;
      match.setAttribute('data-cp030-target', 'true');
      return { snippet: (match.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 150) };
    });

    if (!targetCard) {
      console.log('❌ CP-030 FAILED: No se encontró ninguna orden con datos de prueba reconocibles para eliminar');
      process.exit(1);
    }
    console.log('🎯 Orden de prueba localizada:', targetCard.snippet);

    await page.locator('[data-cp030-target="true"] .options-menu-button').evaluate(el => el.click());
    await page.waitForTimeout(1800);

    const menuOpened = await page.evaluate(() => {
      const card = document.querySelector('[data-cp030-target="true"]');
      const dd = card.querySelector('[id^="myDropdownListOrders_"]') || document.querySelector('[id^="myDropdownListOrders_"]');
      return dd ? window.getComputedStyle(dd).display !== 'none' : false;
    });
    if (!menuOpened) throw new Error('El menú de tres puntos no se desplegó para la orden de prueba');

    const deleteFound = await page.evaluate(() => {
      const card = document.querySelector('[data-cp030-target="true"]');
      const dd = card.querySelector('[id^="myDropdownListOrders_"]') || document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find(s => /opciones avanzadas/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find(a => /eliminar orden/i.test(a.textContent || ''));
      if (link) link.click();
      return !!link;
    });
    if (!deleteFound) throw new Error('No se encontró la opción "Eliminar orden" dentro de Opciones avanzadas');
    await page.waitForTimeout(1000);

    const confirmClicked = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVisible).find(b => /^eliminar$/i.test((b.textContent || '').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!confirmClicked) throw new Error('No apareció el diálogo de confirmación para eliminar la orden');
    await page.waitForTimeout(2500);

    const bodyAfter = await page.locator('body').innerText();
    console.log('\n📄 Estado de la página tras confirmar la eliminación (primeros 1500 caracteres):');
    console.log(bodyAfter.slice(0, 1500));

    const stillVisible = bodyAfter.includes(targetCard.snippet.slice(0, 40));
    if (!stillVisible) {
      console.log('✅ CP-030 PASSED: La orden de prueba desapareció del listado tras confirmar la eliminación');
    } else {
      throw new Error('La orden de prueba sigue apareciendo en el listado tras confirmar la eliminación');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp030-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-030 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp030_eliminar_orden();
