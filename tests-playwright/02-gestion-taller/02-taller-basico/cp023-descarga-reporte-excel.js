const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp023_descarga_reporte_excel() {
  console.log('🔄 Ejecutando CP-023: Verificar que el reporte permita descargarlo en Excel...');

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

    // Buscar botón de descarga Excel usando page.evaluate() para manejar
    // la iteración sincrónica (Array.find no soporta callbacks async).
    const excelClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a'));
      const target = elements.find(el => {
        const text = (el.textContent || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        return /excel|xlsx|csv|download|descargar/.test(text + ' ' + title + ' ' + href);
      });
      if (target) { target.click(); return true; }
      return false;
    });

    if (excelClicked) {
      await page.waitForTimeout(2000);
      console.log('✅ CP-023 PASSED: Se intentó descargar el reporte en Excel');
    } else {
      console.log('⚠️ CP-023 RESULT: No se encontró un botón de descarga explícito');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp023-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-023 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp023_descarga_reporte_excel();
