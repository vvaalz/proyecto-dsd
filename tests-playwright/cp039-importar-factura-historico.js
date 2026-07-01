const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp039_importar_factura_historico() {
  console.log('🔄 Ejecutando CP-039: Verificar que el tab (F5) Importar factura cargue el historial de facturas...');

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
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    console.log('⏱ Carga POS: ' + (Date.now() - inicio) + 'ms');

    const inicioTab = Date.now();
    await page.evaluate(() => document.getElementById('btn_import_invoice_option').click());
    await page.waitForTimeout(3000);
    console.log('⏱ Cargar tab Importar factura: ' + (Date.now() - inicioTab) + 'ms');

    const importPanelInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const matches = bodyText.match(/No\.\s*\d+\s*-/g) || [];
      return { invoiceRecordCount: matches.length };
    });
    console.log('📋 Estado del panel:', JSON.stringify(importPanelInfo));

    if (importPanelInfo.invoiceRecordCount === 0) {
      const bodyNow = await page.locator('body').innerText();
      console.log('\n📄 body (primeros 2000 caracteres) para diagnóstico:');
      console.log(bodyNow.slice(0, 2000));
    }

    if (importPanelInfo.invoiceRecordCount > 0) {
      console.log('✅ CP-039 PASSED: El historial de facturas cargó con ' + importPanelInfo.invoiceRecordCount + ' registro(s) visibles');
    } else {
      throw new Error('No se encontraron registros visibles en el historial de facturas tras abrir el tab');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp039-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-039 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp039_importar_factura_historico();
