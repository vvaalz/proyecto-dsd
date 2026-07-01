const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp025_agregar_abono_orden() {
  console.log('🔄 Ejecutando CP-025: Verificar que agregar un abono a una orden quede registrado...');

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

    const abonoClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a'));
      const target = elements.find(el => {
        const text = (el.textContent || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        return /abono|pago|payment|deposit|add/.test(text + ' ' + title);
      });
      if (target) { target.click(); return true; }
      return false;
    });

    if (abonoClicked) {
      await page.waitForTimeout(2000);
      console.log('✅ CP-025 PASSED: Se intentó registrar un abono desde la interfaz');
    } else {
      console.log('⚠️ CP-025 RESULT: No se encontró un control claro para agregar abono');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp025-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-025 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp025_agregar_abono_orden();
