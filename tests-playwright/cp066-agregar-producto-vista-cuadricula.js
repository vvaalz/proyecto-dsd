const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp066_agregar_producto_vista_cuadricula() {
  console.log('🔄 Ejecutando CP-066: Verificar que se pueda agregar un producto al carrito en formato cuadrícula...');
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
    await page.waitForSelector('.product_box', { timeout: 15000 });
    console.log('⏱ Carga POS: ' + (Date.now() - t0) + 'ms');

    if (!(await page.evaluate(() => !!document.getElementById('style_box')))) throw new Error('No se encontró el botón de vista cuadrícula (style_box)');

    // Forzar lista → cuadrícula para verificar el cambio real de formato
    await page.evaluate(() => document.getElementById('style_list').click());
    await page.waitForTimeout(1000);
    const t1 = Date.now();
    await page.evaluate(() => document.getElementById('style_box').click());
    await page.waitForTimeout(1200);
    console.log('⏱ Cambiar a vista cuadrícula: ' + (Date.now() - t1) + 'ms');

    const added = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find(b => /aaa-bombillos/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if (!target) return false;
      (target.querySelector('.product_box_quantity_content')||target).click();
      return true;
    });
    if (!added) throw new Error('No se encontró el producto de prueba en la vista cuadrícula');

    const productInCart = await page.waitForFunction(() => /aaa-bombillos/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 10000 }).then(()=>true).catch(()=>false);
    if (productInCart) {
      console.log('✅ CP-066 PASSED: Se agregó el producto al carrito correctamente desde la vista cuadrícula');
    } else {
      throw new Error('El producto no se reflejó en el carrito tras agregarlo desde la vista cuadrícula');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp066-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-066 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp066_agregar_producto_vista_cuadricula();
