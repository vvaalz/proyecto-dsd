const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp040_ver_apartados_pos() {
  console.log('🔄 Ejecutando CP-040: Verificar que el tab (F7) Apartados cargue la lista de apartados...');

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
    await page.evaluate(() => document.getElementById('btn_layaway_option').click());
    await page.waitForTimeout(3000);
    console.log('⏱ Cargar tab Apartados: ' + (Date.now() - inicioTab) + 'ms');

    const layawayPanelInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const matches = bodyText.match(/Apartado No:?\s*\d+/gi) || [];
      return { layawayRecordCount: matches.length };
    });
    console.log('📦 Estado del panel:', JSON.stringify(layawayPanelInfo));

    if (layawayPanelInfo.layawayRecordCount === 0) {
      const bodyNow = await page.locator('body').innerText();
      console.log('\n📄 body (primeros 2000 caracteres) para diagnóstico:');
      console.log(bodyNow.slice(0, 2000));
    }

    if (layawayPanelInfo.layawayRecordCount > 0) {
      console.log('✅ CP-040 PASSED: La lista de apartados cargó con ' + layawayPanelInfo.layawayRecordCount + ' registro(s) visibles');
    } else {
      throw new Error('No se encontraron registros visibles en la lista de apartados tras abrir el tab');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp040-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-040 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp040_ver_apartados_pos();
