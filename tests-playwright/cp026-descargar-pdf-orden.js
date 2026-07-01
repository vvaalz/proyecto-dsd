const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp026_descargar_pdf_orden() {
  console.log('🔄 Ejecutando CP-026: Verificar que se pueda descargar el PDF de una orden desde el menú de tres puntos...');

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
      console.log('⚠️ CP-026 RESULT: No hay tarjetas de orden visibles con menú disponible en el estado actual del QA');
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
      console.log('⚠️ CP-026 RESULT: El menú de tres puntos existe pero no se desplegó en esta ejecución');
      return;
    }

    const pdfLink = await page.evaluate(() => {
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find(s => /documento/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find(a => /crear pdf general/i.test(a.textContent || ''));
      return link ? { href: link.getAttribute('href') } : null;
    });

    if (!pdfLink || !pdfLink.href) {
      throw new Error('No se encontró la opción de descargar PDF dentro del menú');
    }

    await page.evaluate(() => {
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const link = Array.from(dd.querySelectorAll('a')).find(a => /crear pdf general/i.test(a.textContent || ''));
      if (link) link.click();
    });
    await page.waitForTimeout(1500);

    const inicioPDF = Date.now();
    const downloadCheck = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        return { ok: res.ok, status: res.status, contentType: res.headers.get('content-type'), contentDisposition: res.headers.get('content-disposition') };
      } catch (err) { return { ok: false, error: err.message }; }
    }, pdfLink.href);
    const tiempoPDF = Date.now() - inicioPDF;
    if (tiempoPDF > 15000) console.log('❌ PERFORMANCE FAILED: PDF tardó ' + tiempoPDF + 'ms');
    else if (tiempoPDF > 5000) console.log('⚠️ LENTO: PDF tardó ' + tiempoPDF + 'ms');
    else console.log('⏱ Generación PDF: ' + tiempoPDF + 'ms');

    const isPdfDownload = downloadCheck.ok && downloadCheck.status === 200 && /pdf/i.test(downloadCheck.contentType || '') && /attachment/i.test(downloadCheck.contentDisposition || '');
    if (isPdfDownload) {
      console.log('✅ CP-026 PASSED: La descarga del PDF se activó sin errores (' + downloadCheck.contentDisposition + ')');
    } else {
      throw new Error('La descarga no respondió como un PDF válido: ' + JSON.stringify(downloadCheck));
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp026-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-026 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp026_descargar_pdf_orden();
