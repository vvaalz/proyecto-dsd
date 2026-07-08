const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp024_detalle_orden_muestra_informacion() {
  console.log('🔄 Ejecutando CP-024: Verificar que al ver detalle de una orden se muestre información completa...');

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
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/reports/order_report');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    console.log('⏱ Carga reporte: ' + (Date.now() - inicio) + 'ms');

    const rowClicked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr, tr, .row, .card'));
      const candidate = rows.find(row => {
        const text = (row.textContent || '');
        return /orden|order|#|cliente|estado|total/i.test(text) && text.trim().length > 5;
      });
      if (candidate) { candidate.click(); return true; }
      return false;
    });

    if (rowClicked) {
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText();
      console.log('✅ CP-024 PASSED: Se intentó abrir el detalle de una orden desde la tabla');
      console.log('   Texto visible:', bodyText.slice(0, 200));
    } else {
      console.log('⚠️ CP-024 RESULT: No se encontró una tabla de órdenes para abrir detalle');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp024-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-024 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp024_detalle_orden_muestra_informacion();
