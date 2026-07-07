const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp054_tab_taller_pos() {
  console.log('🔄 Ejecutando CP-054: Verificar que el tab (F3) Taller cargue la vista de selección de vehículo...');
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

    const t0 = Date.now();
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    console.log('⏱ Carga POS: ' + (Date.now() - t0) + 'ms');

    if (!(await page.evaluate(() => !!document.getElementById('btn_taller_option')))) {
      throw new Error('No se encontró el tab "(F3) Taller"');
    }
    const t1 = Date.now();
    await page.evaluate(() => document.getElementById('btn_taller_option').click());
    await page.waitForTimeout(2500);
    console.log('⏱ Cargar tab Taller: ' + (Date.now() - t1) + 'ms');

    const bodyText = await page.locator('body').innerText();
    const showsVehicle = /placa:/i.test(bodyText) && /marca:/i.test(bodyText);
    const showsStage = /etapa:/i.test(bodyText) || /seleccionar servicios/i.test(bodyText);

    if (showsVehicle && showsStage) {
      console.log('✅ CP-054 PASSED: El tab "(F3) Taller" cargó la vista de selección de vehículo con su etapa/servicios');
    } else {
      throw new Error('El tab "(F3) Taller" no mostró la vista esperada (showsVehicle=' + showsVehicle + ', showsStage=' + showsStage + ')');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp054-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-054 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp054_tab_taller_pos();
