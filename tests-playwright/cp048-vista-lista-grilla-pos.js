const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp048_vista_lista_grilla_pos() {
  console.log('🔄 Ejecutando CP-048: Verificar que los botones de vista lista/grilla cambien la visualización de productos...');
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

    const buttonsExist = await page.evaluate(() => !!(document.getElementById('style_list') && document.getElementById('style_box')));
    if (!buttonsExist) throw new Error('No se encontraron los botones de vista lista/grilla (style_list / style_box)');

    const dimsBefore = await page.evaluate(() => { const b=document.querySelector('.product_box'); const r=b.getBoundingClientRect(); return { width:Math.round(r.width), height:Math.round(r.height) }; });
    console.log('📐 Dimensiones de la tarjeta de producto (vista inicial):', JSON.stringify(dimsBefore));

    const t1 = Date.now();
    await page.evaluate(() => document.getElementById('style_list').click());
    await page.waitForTimeout(1200);
    console.log('⏱ Cambiar a vista lista: ' + (Date.now() - t1) + 'ms');
    const dimsListView = await page.evaluate(() => { const b=document.querySelector('.product_box'); const r=b.getBoundingClientRect(); return { width:Math.round(r.width), height:Math.round(r.height) }; });
    console.log('📐 Dimensiones tras clic en vista lista:', JSON.stringify(dimsListView));

    const t2 = Date.now();
    await page.evaluate(() => document.getElementById('style_box').click());
    await page.waitForTimeout(1200);
    console.log('⏱ Cambiar a vista grilla: ' + (Date.now() - t2) + 'ms');
    const dimsBoxView = await page.evaluate(() => { const b=document.querySelector('.product_box'); const r=b.getBoundingClientRect(); return { width:Math.round(r.width), height:Math.round(r.height) }; });
    console.log('📐 Dimensiones tras clic en vista grilla:', JSON.stringify(dimsBoxView));

    const changedToList = dimsListView.width !== dimsBefore.width || dimsListView.height !== dimsBefore.height;
    const changedBackToGrid = dimsBoxView.width !== dimsListView.width || dimsBoxView.height !== dimsListView.height;

    if (changedToList && changedBackToGrid) {
      console.log('✅ CP-048 PASSED: La visualización de productos cambió correctamente entre lista y grilla');
    } else {
      throw new Error('La visualización de productos no cambió al alternar entre lista y grilla');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp048-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-048 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp048_vista_lista_grilla_pos();
